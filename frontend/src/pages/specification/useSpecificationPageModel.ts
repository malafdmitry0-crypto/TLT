/**
 * @module specification/page-model
 * @owner specification
 * Orchestration for SpecificationPage (mutations, generate options).
 * Query/session identity lives in useSpecificationQuerySession.
 */
import { useEffect, useMemo, useRef } from 'react';
import { appMessage as message } from '@/feedback/appFeedback';
import { useMutation } from '@tanstack/react-query';
import {
  generateSpecification,
  getSpecificationErrorDetail,
} from '@/api/specifications';
import type { SpecificationGenerateResult } from '@/api/specifications';
import { formatSpecTimestamp } from '@/pages/specification/specFormatModel';
import { useSpecParamsPanelState } from '@/pages/specification/useSpecParamsPanelState';
import { useSpecPageFormState } from '@/pages/specification/useSpecPageFormState';
import { buildSpecGenerateOptions } from '@/pages/specification/specGenerateOptionsModel';
import { useSpecificationQuerySession } from '@/pages/specification/useSpecificationQuerySession';
import { useSpecificationManualItemsController } from '@/pages/specification/useSpecificationManualItemsController';
import {
  buildFixUnassignedNavigation,
  buildSpecificationMutationScope,
  buildSpecificationGeneratedToast,
  filterValidGenerateErIds,
  resolveGenerateVariantIds,
  type SpecificationMutationScope,
} from '@/pages/specification/specificationPageModelHelpers';
import { buildSpecGenerationHydrate } from '@/pages/specification/specGenerationHydrateModel';
import { selectSpecificationGenerationOutcome } from '@/pages/specification/specificationGenerationOutcomeModel';
import {
  formatSpecificationConfirmationSummary,
  presentSpecificationDiagnostic,
} from '@/pages/specification/specificationDiagnosticPresentationModel';
import { useSpecificationReadiness } from '@/pages/specification/useSpecificationReadiness';
import { useSpecSettingsFormHydration } from '@/pages/specification/useSpecSettingsFormHydration';
import {
  createBrowserPendingGenerationContextStore,
  hydratePendingGenerationContext,
  rememberPendingGenerationContext,
  resetPendingGenerationContext,
  resumePendingGenerationVariables,
  settlePendingGenerationContext,
  type GenerateSpecificationVariables,
} from '@/pages/specification/specPendingGenerationContext';

export function useSpecificationPageModel() {
  const {
    project,
    isEmployee,
    canMutateProject: projectCanMutate,
    canManuallyEdit,
    navigate,
    qc,
    variantContext,
    selectedElectricalVariant,
    spec,
    refetch,
    specLoading,
    specError,
    specErrorObj,
    specFetching,
    accessories,
  } = useSpecificationQuerySession();
  const canMutateProject = projectCanMutate;
  const canRespondToWorkflow = false;
  const form = useSpecPageFormState();
  const { settingsOpen, toggleSettings } = useSpecParamsPanelState();
  const pendingContextStore = useMemo(() => createBrowserPendingGenerationContextStore(), []);
  const setPendingGenerate = (value: typeof form.pendingGenerate) => {
    if (value == null) resetPendingGenerationContext(
      pendingContextStore, project?.id, selectedElectricalVariant?.id,
    );
    form.setPendingGenerate(value);
  };
  useSpecSettingsFormHydration(spec, form);
  const availableGenerateVariants = useMemo(
    () => variantContext.variants ?? [],
    [variantContext.variants],
  );
  useEffect(() => {
    const availableIds = new Set(availableGenerateVariants.map((item) => item.id));
    form.setSelectedGenerateErIds((prev) => filterValidGenerateErIds(
      prev,
      availableIds,
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.setSelectedGenerateErIds stable
  }, [availableGenerateVariants]);
  const snapshotMutationScope = (): SpecificationMutationScope => (
    buildSpecificationMutationScope(project, selectedElectricalVariant)
  );
  const handleGenerateResult = (
    result: SpecificationGenerateResult,
    variables: GenerateSpecificationVariables,
  ) => {
    settlePendingGenerationContext(pendingContextStore, variables, result.results.map((item) => item.status));
    const outcome = selectSpecificationGenerationOutcome(result.results);
    form.setGenerationDiagnostics(outcome.blockingDiagnostics);
    form.setCandidateGroups(outcome.candidateGroups);
    form.setPreflightSummary(outcome.openConfirmation
      ? formatSpecificationConfirmationSummary(outcome.confirmationDiagnostics)
      : '');
    form.setPreflightOpen(outcome.openConfirmation);
    if (outcome.clearDraftSelections) form.setDraftCatalogSelections({});
    for (const id of outcome.generatedVariantIds) {
      qc.invalidateQueries({ queryKey: ['spec', variables.projectId, id], exact: false });
    }
    if (outcome.generatedCount > 0) {
      qc.invalidateQueries({ queryKey: ['spec-readiness', variables.projectId], exact: false });
    }
    if (outcome.pendingTransition === 'retain') {
      form.setPendingGenerate({
        generateVariantIds: [...variables.generateVariantIds],
        options: variables.options,
      });
      if (outcome.openSelection) {
        message.warning('Требуется выбор комплектующих из каталога');
      }
      return;
    }
    form.setPendingGenerate(null);
    if (outcome.clearCatalogSelections) form.setCatalogSelections({});
    if (outcome.closeSettings) toggleSettings(false);
    if (outcome.generatedCount > 0 || outcome.closeSettings) {
      message.success(buildSpecificationGeneratedToast({
        hasUnresolved: outcome.hasUnresolved,
        generatedCount: outcome.generatedCount,
        electricalVariantName: variables.electricalVariantName,
      }));
    }
  };
  const generateMut = useMutation({
    mutationFn: (variables: GenerateSpecificationVariables) => {
      const {
        projectId,
        options,
        generateVariantIds,
        excludeUnassignedConfirmed,
        catalogSelections,
      } = variables;
      if (!canMutateProject) {
        throw new Error('Недостаточно прав для изменения спецификации');
      }
      return generateSpecification(projectId, {
        variant_ids: generateVariantIds,
        options,
        exclude_unassigned_confirmed: excludeUnassignedConfirmed,
        catalog_selections: catalogSelections,
      });
    },
    onSuccess: handleGenerateResult,
    onError: (error) => {
      form.setPendingGenerate(null);
      const detail = getSpecificationErrorDetail(error);
      if (detail) {
        form.setGenerationDiagnostics([{
          ...detail,
          kind: 'blocking',
        }]);
      }
      message.error(presentSpecificationDiagnostic(detail ?? { code: 'UNKNOWN' }).message);
    },
  });
  const mut = {
    isPending: generateMut.isPending,
    isError: generateMut.isError,
  };
  const buildGenerateOptions = () => buildSpecGenerateOptions({
    exZone: form.exZone,
    reserveCoeff: form.reserveCoeff,
    indicationOnBoxes: form.indicationOnBoxes,
    endSectionIndication: form.endSectionIndication,
    topIndication: form.topIndication,
    minLengthK2i: form.minLengthK2i,
    groupingMode: form.groupingMode,
  });
  const hydratedErRef = useRef<string | null>(null);
  useEffect(() => {
    if (mut.isPending) return;
    const erId = selectedElectricalVariant?.id ?? null;
    const erChanged = hydratedErRef.current !== erId;
    hydratedErRef.current = erId;

    const hydrate = buildSpecGenerationHydrate(spec, erId, buildGenerateOptions());

    if (!hydrate.hasOutcome) {
      // Clear only on ER switch without a GET outcome. Do not wipe in-memory
      // selection UI when invalidate/refetch still returns null after generate.
      if (erChanged && spec == null) {
        form.setCandidateGroups([]);
        form.setGenerationDiagnostics([]);
        form.setPreflightOpen(false);
        form.setPendingGenerate(null);
        form.setDraftCatalogSelections({});
      }
      return;
    }

    form.setGenerationDiagnostics(hydrate.generationDiagnostics);
    form.setCandidateGroups(hydrate.candidateGroups);
    form.setPreflightOpen(hydrate.preflightOpen);
    form.setPendingGenerate(hydratePendingGenerationContext(
      pendingContextStore,
      project?.id,
      erId,
      hydrate.generationStatus,
    ));
    if (hydrate.clearDraftSelections) {
      form.setDraftCatalogSelections({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form setters stable; only rehydrate on GET outcome
  }, [
    spec?.id,
    spec?.generation_status,
    spec?.generation_at,
    project?.id,
    selectedElectricalVariant?.id,
  ]);

  const isSpecStale = spec?.is_stale === true;
  const runGenerate = (
    excludeUnassignedConfirmed = false,
    nextCatalogSelections?: Record<string, string>,
  ) => {
    form.setGenerationDiagnostics([]);
    const scope = snapshotMutationScope();
    const generateVariantIds = resolveGenerateVariantIds(
      form.selectedGenerateErIds,
    );
    const options = buildGenerateOptions();
    const catalogSelections = nextCatalogSelections ?? form.catalogSelections;
    const variables = {
      ...scope,
      generateVariantIds,
      options,
      excludeUnassignedConfirmed,
      catalogSelections,
    };
    rememberPendingGenerationContext(pendingContextStore, variables);
    if (!excludeUnassignedConfirmed) {
      form.setPendingGenerate({ generateVariantIds, options });
    }
    generateMut.mutate(variables);
  };

  const confirmPartialGenerate = () => {
    const variables = resumePendingGenerationVariables(
      pendingContextStore, snapshotMutationScope(), selectedElectricalVariant?.id, true,
    );
    if (!variables) {
      toggleSettings(true);
      return;
    }
    generateMut.mutate(variables);
  };

  /** Case §7.3: leave preflight and open first problem ER on unassigned tab. */
  const fixUnassignedAssignments = () => {
    const erId = form.pendingGenerate?.generateVariantIds?.[0]
      ?? selectedElectricalVariant?.id
      ?? null;
    form.setPreflightOpen(false);
    setPendingGenerate(null);
    const target = buildFixUnassignedNavigation(erId);
    navigate(target.to, { state: target.state });
  };

  const selectCandidate = (groupKey: string, catalogItemId: string) => {
    form.setDraftCatalogSelections((prev) => ({ ...prev, [groupKey]: catalogItemId }));
  };

  const confirmCatalogSelections = async () => {
    if (mut.isPending || !project) return;
    const catalogSelections = form.getDraftCatalogSelections();
    const requiredGroups = form.candidateGroups.filter(
      (group) => group.candidates.length > 1 && !group.selected_catalog_item_id,
    );
    if (requiredGroups.some((group) => !catalogSelections[group.group_key])) {
      message.warning('Выберите позицию для каждой группы с несколькими кандидатами');
      return;
    }
    const variables = resumePendingGenerationVariables(
      pendingContextStore,
      snapshotMutationScope(), selectedElectricalVariant?.id, false, catalogSelections,
    );
    if (!variables) {
      toggleSettings(true);
      return;
    }
    generateMut.mutate(variables);
  };

  const {
    saveMut,
    items,
    handleAdd,
    handleDelete,
    hasItems,
  } = useSpecificationManualItemsController({
    canManuallyEdit,
    accessories,
    specItems: spec?.items,
    form,
    snapshotMutationScope,
  });
  const formedAt = formatSpecTimestamp(spec?.updated_at ?? spec?.created_at);
  const generateButtonLabel = hasItems ? 'Обновить' : 'Сформировать';
  const scopeSwitchDisabled = mut.isPending || saveMut.isPending;

  const erTabItems = variantContext.variants.map((item) => ({
    key: item.id,
    label: `Спецификация ${item.name}`,
    disabled: scopeSwitchDisabled,
  }));
  const { readiness, retryReadiness, handleReadinessRecovery } = useSpecificationReadiness({
    projectId: project?.id,
    variantIds: form.selectedGenerateErIds,
    generationPending: mut.isPending,
    generationFailed: mut.isError,
    navigate,
    openSettings: () => toggleSettings(true),
  });

  return {
    project,
    isEmployee,
    canMutateProject,
    canRespondToWorkflow,
    canManuallyEdit,
    navigate,
    qc,
    variantContext,
    selectedElectricalVariant,
    addOpen: form.addOpen,
    setAddOpen: form.setAddOpen,
    selectedAccessoryId: form.selectedAccessoryId,
    setSelectedAccessoryId: form.setSelectedAccessoryId,
    qty: form.qty,
    setQty: form.setQty,
    selectedGenerateErIds: form.selectedGenerateErIds,
    setSelectedGenerateErIds: form.setSelectedGenerateErIds,
    preflightOpen: form.preflightOpen,
    setPreflightOpen: form.setPreflightOpen,
    preflightSummary: form.preflightSummary,
    generationWorkflowPending: form.pendingGenerate != null,
    setPendingGenerate,
    exZone: form.exZone,
    setExZone: form.setExZone,
    reserveCoeff: form.reserveCoeff,
    setReserveCoeff: form.setReserveCoeff,
    indicationOnBoxes: form.indicationOnBoxes,
    setIndicationOnBoxes: form.setIndicationOnBoxes,
    endSectionIndication: form.endSectionIndication,
    setEndSectionIndication: form.setEndSectionIndication,
    topIndication: form.topIndication,
    setTopIndication: form.setTopIndication,
    minLengthK2i: form.minLengthK2i,
    setMinLengthK2i: form.setMinLengthK2i,
    groupingMode: form.groupingMode,
    setGroupingMode: form.setGroupingMode,
    generationDiagnostics: form.generationDiagnostics,
    candidateGroups: form.candidateGroups,
    draftCatalogSelections: form.draftCatalogSelections,
    selectCandidate,
    confirmCatalogSelections,
    fixUnassignedAssignments,
    settingsOpen,
    toggleSettings,
    spec,
    refetch,
    specLoading,
    specError,
    specErrorObj,
    specFetching,
    accessories,
    availableGenerateVariants,
    mut,
    saveMut,
    items,
    isSpecStale,
    runGenerate,
    confirmPartialGenerate,
    hasItems,
    handleAdd,
    handleDelete,
    formedAt,
    generateButtonLabel,
    scopeSwitchDisabled,
    erTabItems,
    readiness,
    retryReadiness,
    handleReadinessRecovery,
  };
}
