import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  activateElectricalVariant,
  copyElectricalVariant,
  createEmptyElectricalVariant,
  deleteElectricalVariant,
  electricalVariantQueryKeys,
  getElectricalVariantReadiness,
  initializeElectricalVariants,
  listElectricalVariants,
  renameElectricalVariant,
} from '@/api/electricalVariants';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import { createIdempotencyKey, type ApiError } from '@/api/client';
import {
  normalizeElectricalVariantId,
  useCalculationVariantStore,
} from '@/store/calculationVariantStore';
import type {
  ElectricalReadinessResponse,
  ElectricalVariant,
} from '@/types/electricalVariant';

const ELECTRICAL_VARIANT_URL_PARAM = 'er';

function routeElectricalVariantSignature(search: string): string {
  const params = new URLSearchParams(search);
  return params.has(ELECTRICAL_VARIANT_URL_PARAM)
    ? `er:${params.get(ELECTRICAL_VARIANT_URL_PARAM) ?? ''}`
    : 'er:none';
}

export interface UseElectricalVariantSelectionOptions {
  projectId: string | null | undefined;
  enabled?: boolean;
}

export type ElectricalVariantPendingOperation =
  | 'initialize'
  | 'create'
  | 'copy'
  | 'rename'
  | 'activate'
  | 'delete'
  | 'reconcile'
  | null;

export interface ElectricalVariantSelectionController {
  projectId: string | null;
  variants: ElectricalVariant[];
  selectedVariantId: string | null;
  selectedVariant: ElectricalVariant | null;
  activeVariant: ElectricalVariant | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  listError: unknown;
  isEmpty: boolean;
  readiness: ElectricalReadinessResponse | null;
  isReadinessLoading: boolean;
  isReadinessFetching: boolean;
  readinessError: unknown;
  mutationError: unknown;
  mutationNotice?: string | null;
  isMutating: boolean;
  pendingOperation: ElectricalVariantPendingOperation;
  selectVariant: (variantId: string) => void;
  /** Select tab and sync backend is_active (current tab = working ER). */
  selectAndActivateVariant: (variantId: string) => Promise<ElectricalVariant | void>;
  retryList: () => Promise<void>;
  retryReadiness: () => Promise<void>;
  initializeVariant: () => Promise<ElectricalVariant>;
  createVariant: (name?: string) => Promise<ElectricalVariant>;
  copySelectedVariant: (name?: string) => Promise<ElectricalVariant>;
  renameVariant: (variantId: string, name: string) => Promise<ElectricalVariant>;
  activateVariant: (
    variantId: string,
    options?: { silent?: boolean },
  ) => Promise<ElectricalVariant>;
  deleteVariant: (variantId: string) => Promise<void>;
  clearMutationError: () => void;
}

function sortVariants(variants: readonly ElectricalVariant[]): ElectricalVariant[] {
  return [...variants].sort((left, right) => {
    if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
    return left.id.localeCompare(right.id);
  });
}

function normalizedVariantId(variant: ElectricalVariant): string | null {
  return normalizeElectricalVariantId(variant.id);
}

function findVariant(
  variants: readonly ElectricalVariant[],
  variantId: unknown,
): ElectricalVariant | null {
  const normalizedId = normalizeElectricalVariantId(variantId);
  if (!normalizedId) return null;
  return variants.find((variant) => normalizedVariantId(variant) === normalizedId) ?? null;
}

function mergeVariant(
  variants: readonly ElectricalVariant[] | undefined,
  nextVariant: ElectricalVariant,
): ElectricalVariant[] {
  const current = variants ?? [];
  const exists = current.some((variant) => variant.id === nextVariant.id);
  return sortVariants(
    exists
      ? current.map((variant) => variant.id === nextVariant.id ? nextVariant : variant)
      : [...current, nextVariant],
  );
}

function shouldReplayIdempotentIdentityMutation(error: unknown): boolean {
  if (!(error instanceof Error) || !('status' in error)) return false;
  const status = (error as ApiError).status;
  return status == null || status >= 500;
}

export function useElectricalVariantSelection({
  projectId,
  enabled = true,
}: UseElectricalVariantSelectionOptions): ElectricalVariantSelectionController {
  const normalizedProjectId = projectId || null;
  const queryEnabled = enabled && normalizedProjectId !== null;
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const persistedSelectedId = useCalculationVariantStore((state) =>
    normalizedProjectId ? state.selectedVariantIdByProject[normalizedProjectId] ?? null : null,
  );
  const setPersistedSelectedId = useCalculationVariantStore(
    (state) => state.setSelectedVariantId,
  );
  const clearPersistedSelectedId = useCalculationVariantStore(
    (state) => state.clearSelectedVariantId,
  );
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [mutationNotice, setMutationNotice] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const routeSelectionSignature = useMemo(
    () => routeElectricalVariantSignature(location.search),
    [location.search],
  );
  const [validatedRouteSelectionSignature, setValidatedRouteSelectionSignature] = useState(
    routeSelectionSignature,
  );
  const trustedPendingRouteSignatureRef = useRef<string | null>(null);
  const copyIntentRef = useRef<{
    sourceId: string;
    name: string | undefined;
    idempotencyKey: string;
  } | null>(null);
  const createIntentRef = useRef<{
    name: string | undefined;
    idempotencyKey: string;
  } | null>(null);

  const listQuery = useQuery({
    queryKey: electricalVariantQueryKeys.list(normalizedProjectId ?? ''),
    queryFn: () => listElectricalVariants(normalizedProjectId as string),
    enabled: queryEnabled,
    // A numeric legacy slot may be reused after delete/create. Never mount a
    // UUID-scoped data plane from a merely fresh lifecycle cache.
    refetchOnMount: 'always',
  });
  const refetchVariantList = listQuery.refetch;

  const variants = useMemo(
    () => sortVariants(listQuery.data ?? []),
    [listQuery.data],
  );
  const routeSelectionNeedsValidation = queryEnabled
    && listQuery.isFetchedAfterMount
    && !listQuery.isError
    && routeSelectionSignature !== validatedRouteSelectionSignature
    && routeSelectionSignature !== trustedPendingRouteSignatureRef.current;
  const isAwaitingAuthoritativeList = queryEnabled
    && (!listQuery.isFetchedAfterMount || routeSelectionNeedsValidation)
    && !listQuery.isError;
  const isEmpty = listQuery.isSuccess
    && listQuery.isFetchedAfterMount
    && variants.length === 0;

  const readinessQuery = useQuery({
    queryKey: electricalVariantQueryKeys.readiness(normalizedProjectId ?? ''),
    queryFn: () => getElectricalVariantReadiness(normalizedProjectId as string),
    enabled: queryEnabled && isEmpty,
    // Heat-loss state can become ready on another route while a previous
    // negative readiness result is still fresh in the global query cache.
    refetchOnMount: 'always',
    staleTime: 0,
  });

  useEffect(() => {
    if (!routeSelectionNeedsValidation) return;
    let cancelled = false;
    void refetchVariantList().then((result) => {
      if (!cancelled && !result.isError) {
        setValidatedRouteSelectionSignature(routeSelectionSignature);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refetchVariantList, routeSelectionNeedsValidation, routeSelectionSignature]);

  useEffect(() => {
    if (trustedPendingRouteSignatureRef.current !== routeSelectionSignature) return;
    trustedPendingRouteSignatureRef.current = null;
    setValidatedRouteSelectionSignature(routeSelectionSignature);
  }, [routeSelectionSignature]);

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const urlHasElectricalVariant = searchParams.has(ELECTRICAL_VARIANT_URL_PARAM);
  const urlSelectedId = searchParams.get(ELECTRICAL_VARIANT_URL_PARAM);
  const normalizedUrlSelectedId = normalizeElectricalVariantId(urlSelectedId);
  const urlSelectedVariant = findVariant(variants, normalizedUrlSelectedId);
  const activeVariant = variants.find((variant) => variant.is_active) ?? null;

  const selectedVariant = useMemo(() => {
    if (isAwaitingAuthoritativeList) return null;
    if (!listQuery.isSuccess || variants.length === 0) return null;

    if (urlHasElectricalVariant) {
      return (
        urlSelectedVariant ??
        activeVariant ??
        variants[0]
      );
    }

    return (
      findVariant(variants, persistedSelectedId) ??
      activeVariant ??
      variants[0]
    );
  }, [
    activeVariant,
    isAwaitingAuthoritativeList,
    listQuery.isSuccess,
    persistedSelectedId,
    urlHasElectricalVariant,
    urlSelectedVariant,
    variants,
  ]);
  const selectedVariantId = selectedVariant ? normalizedVariantId(selectedVariant) : null;

  const replaceRouteSelection = useCallback((variantId: string | null) => {
    const nextRouteSignature = variantId ? `er:${variantId}` : 'er:none';
    const params = new URLSearchParams(location.search);
    const currentValue = params.get(ELECTRICAL_VARIANT_URL_PARAM);
    if (variantId) {
      if (currentValue === variantId) {
        setValidatedRouteSelectionSignature(nextRouteSignature);
        return;
      }
      params.set(ELECTRICAL_VARIANT_URL_PARAM, variantId);
    } else {
      if (!params.has(ELECTRICAL_VARIANT_URL_PARAM)) {
        setValidatedRouteSelectionSignature(nextRouteSignature);
        return;
      }
      params.delete(ELECTRICAL_VARIANT_URL_PARAM);
    }
    trustedPendingRouteSignatureRef.current = nextRouteSignature;
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, navigate]);

  const commitSelection = useCallback((variantId: string | null) => {
    if (!normalizedProjectId) return;
    const normalizedId = normalizeElectricalVariantId(variantId);
    if (normalizedId) {
      setPersistedSelectedId(normalizedProjectId, normalizedId);
      replaceRouteSelection(normalizedId);
      return;
    }
    clearPersistedSelectedId(normalizedProjectId);
    replaceRouteSelection(null);
  }, [
    clearPersistedSelectedId,
    normalizedProjectId,
    replaceRouteSelection,
    setPersistedSelectedId,
  ]);

  useEffect(() => {
    if (!queryEnabled || !listQuery.isSuccess || isAwaitingAuthoritativeList) return;
    commitSelection(selectedVariantId);
  }, [
    commitSelection,
    isAwaitingAuthoritativeList,
    listQuery.isSuccess,
    queryEnabled,
    selectedVariantId,
  ]);

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

  const initializeMutation = useMutation({
    mutationFn: () => initializeElectricalVariants(normalizedProjectId as string),
    onSuccess: (response) => {
      updateVariantList((current) => mergeVariant(current, response.variant));
      commitSelection(response.variant.id);
      if (normalizedProjectId) {
        void queryClient.invalidateQueries({
          queryKey: electricalVariantQueryKeys.readiness(normalizedProjectId),
          exact: true,
        });
      }
      refreshVariantList();
    },
    onError: () => {
      if (!normalizedProjectId) return;
      void queryClient.invalidateQueries({
        queryKey: electricalVariantQueryKeys.readiness(normalizedProjectId),
        exact: true,
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: ({
      name,
      idempotencyKey,
    }: {
      name?: string;
      idempotencyKey: string;
    }) => {
      const request = () => createEmptyElectricalVariant(
        normalizedProjectId as string,
        name === undefined ? {} : { name },
        idempotencyKey,
      );
      return request().catch((error) => {
        if (!shouldReplayIdempotentIdentityMutation(error)) throw error;
        return request();
      });
    },
    onSuccess: (created) => {
      updateVariantList((current) => mergeVariant(current, created));
      commitSelection(created.id);
      createIntentRef.current = null;
      refreshVariantList();
    },
  });

  const copyMutation = useMutation({
    mutationFn: ({
      sourceId,
      name,
      idempotencyKey,
    }: {
      sourceId: string;
      name?: string;
      idempotencyKey: string;
    }) => {
      const request = () => copyElectricalVariant(
        normalizedProjectId as string,
        sourceId,
        name === undefined ? {} : { name },
        idempotencyKey,
      );
      return request().catch((error) => {
        if (!shouldReplayIdempotentIdentityMutation(error)) throw error;
        return request();
      });
    },
    onSuccess: (created) => {
      updateVariantList((current) => mergeVariant(current, created));
      commitSelection(created.id);
      copyIntentRef.current = null;
      refreshVariantList();
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ variantId, name }: { variantId: string; name: string }) =>
      renameElectricalVariant(normalizedProjectId as string, variantId, { name }),
    onSuccess: (renamed) => {
      updateVariantList((current) => mergeVariant(current, renamed));
      refreshVariantList();
    },
  });

  const activateMutation = useMutation({
    mutationFn: (variantId: string) =>
      activateElectricalVariant(normalizedProjectId as string, variantId),
    onSuccess: (activated) => {
      if (!activated?.id) return;
      updateVariantList((current = []) => sortVariants(current.map((variant) =>
        variant.id === activated.id
          ? activated
          : { ...variant, is_active: false },
      )));
      refreshVariantList();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (variantId: string) =>
      deleteElectricalVariant(normalizedProjectId as string, variantId),
    onSuccess: (response, deletedVariantId) => {
      if (normalizedProjectId) {
        queryClient.removeQueries({
          queryKey: electricalDataQueryKeys.variant(normalizedProjectId, deletedVariantId),
        });
      }
      updateVariantList((current = []) => sortVariants(current
        .filter((variant) => variant.id !== deletedVariantId)
        .map((variant) => ({
          ...variant,
          is_active: variant.id === response.active_variant_id,
        }))));
      if (selectedVariantId === normalizeElectricalVariantId(deletedVariantId)) {
        commitSelection(response.active_variant_id);
      }
      refreshVariantList();
    },
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
    recoveryNotice: string,
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
            setMutationNotice(recoveryNotice);
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

  const selectVariant = useCallback((variantId: string) => {
    const target = findVariant(variants, variantId);
    if (!target) return;
    commitSelection(target.id);
  }, [commitSelection, variants]);

  const retryList = useCallback(async () => {
    await refetchVariantList();
  }, [refetchVariantList]);

  const retryReadiness = useCallback(async () => {
    await readinessQuery.refetch();
  }, [readinessQuery]);

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
    commitSelection(initialized.id);
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
    commitSelection(created.id);
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
    commitSelection(created.id);
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
    commitSelection(target.id);
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
    projectId: normalizedProjectId,
    variants,
    selectedVariantId,
    selectedVariant,
    activeVariant,
    isLoading: queryEnabled && (
      listQuery.isLoading
      || isAwaitingAuthoritativeList
    ),
    isFetching: listQuery.isFetching,
    isError: listQuery.isError,
    listError: listQuery.error,
    isEmpty,
    readiness: readinessQuery.data ?? null,
    isReadinessLoading: isEmpty && readinessQuery.isLoading,
    isReadinessFetching: readinessQuery.isFetching,
    readinessError: readinessQuery.error,
    mutationError,
    mutationNotice,
    isMutating: pendingOperation !== null,
    pendingOperation,
    selectVariant,
    selectAndActivateVariant,
    retryList,
    retryReadiness,
    initializeVariant,
    createVariant,
    copySelectedVariant,
    renameVariant,
    activateVariant,
    deleteVariant,
    clearMutationError,
  };
}

export default useElectricalVariantSelection;
