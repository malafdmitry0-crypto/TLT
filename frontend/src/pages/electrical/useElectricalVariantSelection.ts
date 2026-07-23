/**
 * @module electrical/variant-selection
 * @owner electrical
 * Route/store/query reconciliation for UUID-first ER selection.
 * Mutation commands live in useElectricalVariantCommandsController (VAR2).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  electricalVariantQueryKeys,
  getElectricalVariantReadiness,
  listElectricalVariants,
} from '@/api/electricalVariants';
import {
  ELECTRICAL_VARIANT_URL_PARAM,
  findVariant,
  normalizedVariantId,
  routeElectricalVariantSignature,
  sortVariants,
} from '@/domain/electricalVariantSelectionModel';
import {
  normalizeElectricalVariantId,
  useCalculationVariantStore,
} from '@/store/calculationVariantStore';
import type {
  ElectricalReadinessResponse,
  ElectricalVariant,
} from '@/types/electricalVariant';
import {
  useElectricalVariantCommandsController,
  type ElectricalVariantPendingOperation,
} from '@/pages/electrical/useElectricalVariantCommandsController';

export type { ElectricalVariantPendingOperation };

export interface UseElectricalVariantSelectionOptions {
  projectId: string | null | undefined;
  enabled?: boolean;
}

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

export function useElectricalVariantSelection({
  projectId,
  enabled = true,
}: UseElectricalVariantSelectionOptions): ElectricalVariantSelectionController {
  const normalizedProjectId = projectId || null;
  const queryEnabled = enabled && normalizedProjectId !== null;
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
  const routeSelectionSignature = useMemo(
    () => routeElectricalVariantSignature(location.search),
    [location.search],
  );
  const [validatedRouteSelectionSignature, setValidatedRouteSelectionSignature] = useState(
    routeSelectionSignature,
  );
  const trustedPendingRouteSignatureRef = useRef<string | null>(null);

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

  const commands = useElectricalVariantCommandsController({
    projectId: normalizedProjectId,
    variants,
    selectedVariantId,
    commitSelection,
  });

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
    mutationError: commands.mutationError,
    mutationNotice: commands.mutationNotice,
    isMutating: commands.isMutating,
    pendingOperation: commands.pendingOperation,
    selectVariant,
    selectAndActivateVariant: commands.selectAndActivateVariant,
    retryList,
    retryReadiness,
    initializeVariant: commands.initializeVariant,
    createVariant: commands.createVariant,
    copySelectedVariant: commands.copySelectedVariant,
    renameVariant: commands.renameVariant,
    activateVariant: commands.activateVariant,
    deleteVariant: commands.deleteVariant,
    clearMutationError: commands.clearMutationError,
  };
}

export default useElectricalVariantSelection;
