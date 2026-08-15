/**
 * @module electrical/variant-commands-controller
 * @owner electrical
 * @depends electricalVariants API, electricalVariantSelectionModel pure helpers
 * @does-not route/store reconciliation, readiness queries, list selection resolution
 *
 * VAR2: create/copy/rename/activate/delete (and initialize) mutation commands.
 * Selection/reconciliation stays in useElectricalVariantSelection.
 */
import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  electricalVariantQueryKeys,
  listElectricalVariants,
  createIdempotencyKey,
} from '@/api/electricalVariants';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import { findVariant, sortVariants } from '@/domain/electricalVariantSelectionModel';
import type { ElectricalVariant } from '@/types/electricalVariant';
import { useElectricalVariantMutationTransport } from '@/hooks/useElectricalVariantMutationTransport';

export type ElectricalVariantPendingOperation =
  | 'initialize'
  | 'create'
  | 'copy'
  | 'rename'
  | 'activate'
  | 'delete'
  | 'reconcile'
  | null;

export type UseElectricalVariantCommandsControllerArgs = {
  projectId: string | null;
  variants: ElectricalVariant[];
  selectedVariantId: string | null;
  commitSelection: (variantId: string | null, projectId: string) => void;
};

export type ElectricalVariantCommandsController = {
  mutationError: unknown;
  mutationNotice: string | null;
  isMutating: boolean;
  pendingOperation: ElectricalVariantPendingOperation;
  initializeVariant: () => Promise<ElectricalVariant>;
  createVariant: (name?: string) => Promise<ElectricalVariant>;
  copySelectedVariant: (name?: string) => Promise<ElectricalVariant>;
  renameVariant: (variantId: string, name: string) => Promise<ElectricalVariant>;
  activateVariant: (
    variantId: string,
    options?: { silent?: boolean },
  ) => Promise<ElectricalVariant>;
  selectAndActivateVariant: (variantId: string) => Promise<ElectricalVariant | void>;
  deleteVariant: (variantId: string) => Promise<void>;
  clearMutationError: () => void;
};

export function useElectricalVariantCommandsController({
  projectId: normalizedProjectId,
  variants,
  selectedVariantId,
  commitSelection,
}: UseElectricalVariantCommandsControllerArgs): ElectricalVariantCommandsController {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [mutationNotice, setMutationNotice] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const copyIntentRef = useRef<{
    sourceId: string;
    name: string | undefined;
    idempotencyKey: string;
  } | null>(null);
  const createIntentRef = useRef<{
    name: string | undefined;
    idempotencyKey: string;
  } | null>(null);

  const updateVariantList = useCallback((
    updater: (current: ElectricalVariant[] | undefined) => ElectricalVariant[],
  ) => {
    if (!normalizedProjectId) return;
    queryClient.setQueryData<ElectricalVariant[]>(
      electricalVariantQueryKeys.list(normalizedProjectId),
      updater,
    );
  }, [normalizedProjectId, queryClient]);

  const refreshVariantList = useCallback(() => {
    if (!normalizedProjectId) return;
    void queryClient.invalidateQueries({
      queryKey: electricalVariantQueryKeys.list(normalizedProjectId),
      exact: true,
    });
  }, [normalizedProjectId, queryClient]);

  const {
    initializeMutation,
    createMutation,
    copyMutation,
    renameMutation,
    activateMutation,
    deleteMutation,
  } = useElectricalVariantMutationTransport({
    normalizedProjectId,
    selectedVariantId,
    commitSelection,
    updateVariantList,
    refreshVariantList,
    createIntentRef,
    copyIntentRef,
  });

  const ensureProject = useCallback(() => {
    if (!normalizedProjectId) throw new Error('Проект не выбран');
  }, [normalizedProjectId]);

  const runMutation = useCallback(async <T,>(
    operation: () => Promise<T>,
    recover: ((authoritative: ElectricalVariant[]) => {
      recovered: boolean;
      value: T;
    }) | null,
    /** Null = silent recovery (no mutation notice). */
    recoveryNotice: string | null,
  ): Promise<T> => {
    setMutationError(null);
    setMutationNotice(null);
    try {
      return await operation();
    } catch (error) {
      if (normalizedProjectId) {
        setIsReconciling(true);
        try {
          await queryClient.invalidateQueries({
            queryKey: electricalVariantQueryKeys.list(normalizedProjectId),
            exact: true,
            refetchType: 'none',
          });
          const authoritative = sortVariants(await queryClient.fetchQuery({
            queryKey: electricalVariantQueryKeys.list(normalizedProjectId),
            queryFn: () => listElectricalVariants(normalizedProjectId),
          }));
          const recovered = recover?.(authoritative);
          if (recovered?.recovered) {
            if (recoveryNotice) {
              setMutationNotice(recoveryNotice);
            }
            return recovered.value;
          }
        } catch {
          // Keep the original mutation error: it is the actionable cause. The
          // list query retains its own retryable error state if reconciliation failed.
        } finally {
          setIsReconciling(false);
        }
      }
      setMutationError(error);
      throw error;
    }
  }, [normalizedProjectId, queryClient]);

  const initializeVariant = useCallback(async () => {
    ensureProject();
    const initialized = await runMutation(
      async () => {
        const response = await initializeMutation.mutateAsync();
        return response.variant;
      },
      (authoritative) => ({
        recovered: authoritative.length > 0,
        value: authoritative.find((variant) => variant.is_active) ?? authoritative[0],
      }),
      'Первый ЭР создан; результат подтверждён после сверки с сервером.',
    );
    commitSelection(initialized.id, initialized.project_id);
    return initialized;
  }, [commitSelection, ensureProject, initializeMutation, runMutation]);

  const createVariant = useCallback(async (name?: string) => {
    ensureProject();
    const normalizedName = name?.trim() || undefined;
    const previousIntent = createIntentRef.current;
    const intent = previousIntent && previousIntent.name === normalizedName
      ? previousIntent
      : {
          name: normalizedName,
          idempotencyKey: createIdempotencyKey(),
        };
    createIntentRef.current = intent;
    const created = await runMutation(
      () => createMutation.mutateAsync(intent),
      null,
      'Пустой ЭР создан; результат подтверждён после сверки с сервером.',
    );
    createIntentRef.current = null;
    commitSelection(created.id, created.project_id);
    // Opened ER is the working ER — keep is_active aligned with selection.
    if (!created.is_active) {
      await runMutation(
        () => activateMutation.mutateAsync(created.id),
        (authoritative) => {
          const recovered = authoritative.find((variant) => (
            variant.id === created.id && variant.is_active
          ));
          return { recovered: recovered !== undefined, value: recovered! };
        },
        null,
      );
    }
    return created;
  }, [activateMutation, commitSelection, createMutation, ensureProject, runMutation]);

  const copySelectedVariant = useCallback(async (name?: string) => {
    ensureProject();
    if (!selectedVariantId) throw new Error('Выберите ЭР для копирования');
    const normalizedName = name?.trim() || undefined;
    const previousIntent = copyIntentRef.current;
    const intent = previousIntent
      && previousIntent.sourceId === selectedVariantId
      && previousIntent.name === normalizedName
      ? previousIntent
      : {
          sourceId: selectedVariantId,
          name: normalizedName,
          idempotencyKey: createIdempotencyKey(),
        };
    copyIntentRef.current = intent;
    const created = await runMutation(
      () => copyMutation.mutateAsync(intent),
      null,
      'Копия ЭР создана; результат подтверждён после сверки с сервером.',
    );
    copyIntentRef.current = null;
    commitSelection(created.id, created.project_id);
    if (!created.is_active) {
      await runMutation(
        () => activateMutation.mutateAsync(created.id),
        (authoritative) => {
          const recovered = authoritative.find((variant) => (
            variant.id === created.id && variant.is_active
          ));
          return { recovered: recovered !== undefined, value: recovered! };
        },
        null,
      );
    }
    return created;
  }, [activateMutation, commitSelection, copyMutation, ensureProject, runMutation, selectedVariantId]);

  const renameVariant = useCallback(async (variantId: string, name: string) => {
    ensureProject();
    const target = findVariant(variants, variantId);
    if (!target) throw new Error('ЭР не найден');
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Название ЭР не может быть пустым');
    return runMutation(
      () => renameMutation.mutateAsync({ variantId: target.id, name: trimmedName }),
      (authoritative) => {
        const recovered = authoritative.find((variant) => (
          variant.id === target.id && variant.name === trimmedName
        ));
        return { recovered: recovered !== undefined, value: recovered! };
      },
      'Название ЭР сохранено; результат подтверждён после сверки с сервером.',
    );
  }, [ensureProject, renameMutation, runMutation, variants]);

  const activateVariant = useCallback(async (
    variantId: string,
    options?: { silent?: boolean },
  ) => {
    ensureProject();
    const target = findVariant(variants, variantId);
    if (!target) throw new Error('ЭР не найден');
    if (target.is_active) return target;
    return runMutation(
      () => activateMutation.mutateAsync(target.id),
      (authoritative) => {
        const recovered = authoritative.find((variant) => (
          variant.id === target.id && variant.is_active
        ));
        return { recovered: recovered !== undefined, value: recovered! };
      },
      options?.silent
        ? null
        : 'Текущий ЭР обновлён.',
    );
  }, [activateMutation, ensureProject, runMutation, variants]);

  /**
   * Product rule: opened tab = working ER. Selection + backend is_active stay
   * the same — no separate "★ make active" UX.
   */
  const selectAndActivateVariant = useCallback(async (variantId: string) => {
    const target = findVariant(variants, variantId);
    if (!target) return;
    commitSelection(target.id, target.project_id);
    if (target.is_active) return target;
    return activateVariant(target.id, { silent: true });
  }, [activateVariant, commitSelection, variants]);

  const deleteVariant = useCallback(async (variantId: string) => {
    ensureProject();
    const target = findVariant(variants, variantId);
    if (!target) throw new Error('ЭР не найден');
    await runMutation(
      async () => {
        await deleteMutation.mutateAsync(target.id);
      },
      (authoritative) => ({
        recovered: !authoritative.some((variant) => variant.id === target.id),
        value: undefined,
      }),
      'ЭР удалён; результат подтверждён после сверки с сервером.',
    );
    if (normalizedProjectId) {
      queryClient.removeQueries({
        queryKey: electricalDataQueryKeys.variant(normalizedProjectId, target.id),
      });
    }
  }, [deleteMutation, ensureProject, normalizedProjectId, queryClient, runMutation, variants]);

  const clearMutationError = useCallback(() => {
    setMutationError(null);
    setMutationNotice(null);
  }, []);

  const pendingOperation: ElectricalVariantPendingOperation =
    initializeMutation.isPending ? 'initialize'
      : createMutation.isPending ? 'create'
        : copyMutation.isPending ? 'copy'
          : renameMutation.isPending ? 'rename'
            : activateMutation.isPending ? 'activate'
              : deleteMutation.isPending ? 'delete'
                : isReconciling ? 'reconcile'
                  : null;
  return {
    mutationError,
    mutationNotice,
    isMutating: pendingOperation !== null,
    pendingOperation,
    initializeVariant,
    createVariant,
    copySelectedVariant,
    renameVariant,
    activateVariant,
    selectAndActivateVariant,
    deleteVariant,
    clearMutationError,
  };
}
