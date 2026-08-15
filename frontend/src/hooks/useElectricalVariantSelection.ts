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
import { isElectricalVariantRoutePath } from '@/domain/electricalVariantRouteModel';
import { isBrowserRouteCommitPending } from '@/hooks/electricalVariantBrowserRouteModel';
import {
  normalizeElectricalVariantId,
  useCalculationVariantStore,
} from '@/store/calculationVariantStore';
import { useElectricalVariantCommandsController } from '@/hooks/useElectricalVariantCommandsController';
import type {
  ElectricalVariantSelectionController,
  UseElectricalVariantSelectionOptions,
} from '@/hooks/useElectricalVariantSelection.types';

export type { ElectricalVariantPendingOperation } from '@/hooks/useElectricalVariantCommandsController';
export type {
  ElectricalVariantSelectionController,
  UseElectricalVariantSelectionOptions,
} from '@/hooks/useElectricalVariantSelection.types';

export function useElectricalVariantSelection({
  projectId,
  enabled = true,
  syncRouteSelection = true,
}: UseElectricalVariantSelectionOptions): ElectricalVariantSelectionController {
  const normalizedProjectId = projectId || null;
  const queryEnabled = enabled && normalizedProjectId !== null;
  const location = useLocation();
  const navigate = useNavigate();
  const routeSelectionSupported = isElectricalVariantRoutePath(location.pathname);
  const canWriteRouteSelection = routeSelectionSupported && syncRouteSelection;
  const routeRuntimeRef = useRef({
    projectId: normalizedProjectId,
    location,
    canWriteRouteSelection,
  });
  routeRuntimeRef.current = {
    projectId: normalizedProjectId,
    location,
    canWriteRouteSelection,
  };
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
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
    () => routeSelectionSupported
      ? routeElectricalVariantSignature(location.search)
      : 'er:none',
    [location.search, routeSelectionSupported],
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
    && routeSelectionSupported
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
  const urlHasElectricalVariant = routeSelectionSupported
    && searchParams.has(ELECTRICAL_VARIANT_URL_PARAM);
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

  const replaceRouteSelection = useCallback((
    variantId: string | null,
    expectedProjectId: string,
  ) => {
    const runtime = routeRuntimeRef.current;
    if (
      !mountedRef.current
      || runtime.projectId !== expectedProjectId
      || !runtime.canWriteRouteSelection
    ) return;

    // BrowserRouter changes window.history before React commits a suspended
    // route. A controller still rendered for the old location must not cancel
    // that transition with a late replace() call.
    if (isBrowserRouteCommitPending(runtime.location)) return;

    const nextRouteSignature = variantId ? `er:${variantId}` : 'er:none';
    const params = new URLSearchParams(runtime.location.search);
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
        pathname: runtime.location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
        hash: runtime.location.hash,
      },
      { replace: true },
    );
  }, [navigate]);

  const commitSelection = useCallback((variantId: string | null, expectedProjectId: string) => {
    if (
      !expectedProjectId
      || !mountedRef.current
      || routeRuntimeRef.current.projectId !== expectedProjectId
    ) return;
    const normalizedId = normalizeElectricalVariantId(variantId);
    if (normalizedId) {
      setPersistedSelectedId(expectedProjectId, normalizedId);
      replaceRouteSelection(normalizedId, expectedProjectId);
      return;
    }
    clearPersistedSelectedId(expectedProjectId);
    replaceRouteSelection(null, expectedProjectId);
  }, [
    clearPersistedSelectedId,
    replaceRouteSelection,
    setPersistedSelectedId,
  ]);

  useEffect(() => {
    if (!queryEnabled || !listQuery.isSuccess || isAwaitingAuthoritativeList) return;
    commitSelection(selectedVariantId, normalizedProjectId);
  }, [
    commitSelection,
    isAwaitingAuthoritativeList,
    listQuery.isSuccess,
    normalizedProjectId,
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
    commitSelection(target.id, target.project_id);
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
