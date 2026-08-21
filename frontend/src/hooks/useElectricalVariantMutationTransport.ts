/**
 * Mutation transport/reconciliation for electrical variant commands.
 * User-facing command orchestration stays in useElectricalVariantCommandsController.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  activateElectricalVariant,
  copyElectricalVariant,
  createEmptyElectricalVariant,
  deleteElectricalVariant,
  electricalVariantQueryKeys,
  initializeElectricalVariants,
  renameElectricalVariant,
} from '@/api/electricalVariants';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import {
  mergeVariant,
  shouldReplayIdempotentIdentityMutation,
  sortVariants,
} from '@/domain/electricalVariantSelectionModel';
import { normalizeElectricalVariantId } from '@/store/calculationVariantStore';
import type { ElectricalVariant } from '@/types/electricalVariant';
import type { MutableRefObject } from 'react';

export type ElectricalVariantMutationTransportArgs = {
  normalizedProjectId: string | null;
  selectedVariantId: string | null;
  commitSelection: (variantId: string | null) => void;
  updateVariantList: (
    updater: (current: ElectricalVariant[] | undefined) => ElectricalVariant[],
  ) => void;
  refreshVariantList: () => void;
  createIntentRef: MutableRefObject<{
    name: string | undefined;
    idempotencyKey: string;
  } | null>;
  copyIntentRef: MutableRefObject<{
    sourceId: string;
    name: string | undefined;
    idempotencyKey: string;
  } | null>;
};

export function useElectricalVariantMutationTransport({
  normalizedProjectId,
  selectedVariantId,
  commitSelection,
  updateVariantList,
  refreshVariantList,
  createIntentRef,
  copyIntentRef,
}: ElectricalVariantMutationTransportArgs) {
  const queryClient = useQueryClient();

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


  return {
    initializeMutation,
    createMutation,
    copyMutation,
    renameMutation,
    activateMutation,
    deleteMutation,
  };
}
