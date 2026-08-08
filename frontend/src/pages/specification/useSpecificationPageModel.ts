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
  updateSpecificationSettings,
} from '@/api/specifications';
import type { SpecificationGenerateResult, SpecificationOptions } from '@/api/specifications';
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
import { formatPreflightSummary } from '@/domain/specification/specTableSectionModel';
import { deduplicateSpecificationDiagnostics } from '@/pages/specification/specificationReadinessModel';
import { useSpecificationReadiness } from '@/pages/specification/useSpecificationReadiness';
import { useSpecSettingsFormHydration } from '@/pages/specification/useSpecSettingsFormHydration';

type GenerateSpecificationVariables = SpecificationMutationScope & {
  options: SpecificationOptions;
  generateVariantIds: string[];
  excludeUnassignedConfirmed: boolean;
  catalogSelections: Record<string, string>;
};

export function useSpecificationPageModel() {
  const {
    project,
    role,
    userId,
    sessionId,
    isEmployee,
    canMutateProject: projectCanMutate,
    canManuallyEdit,
    navigate,
    qc,
    variantContext,
    selectedElectricalVariant,
    variant,
    legacyDataPlaneEnabled,
    specificationQueryKey,
    spec,
    refetch,
    specLoading,
    specError,
    specErrorObj,
    specFetching,
    projectSettings,
    accessories,
  } = useSpecificationQuerySession();
  const canMutateProject = projectCanMutate;
  const canRespondToWorkflow = false;
  const form = useSpecPageFormState();
  const { settingsOpen, toggleSettings } = useSpecParamsPanelState();
  useSpecSettingsFormHydration(spec, projectSettings, form);
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
    const diagnostics = deduplicateSpecificationDiagnostics(
      result.results.flatMap((item) => item.diagnostics),
    );
    const groups = result.results.flatMap((item) => item.candidate_groups ?? []);
    const unresolved = result.results.filter((item) => item.status !== 'generated');
    form.setGenerationDiagnostics(diagnostics);
    form.setCandidateGroups(groups);
    form.setPreflightSummary(formatPreflightSummary(diagnostics));
    if (unresolved.length > 0) {
      form.setPendingGenerate({
        generateVariantIds: [...variables.generateVariantIds],
        options: variables.options,
      });
      const selectionRequired = unresolved.some((item) => item.status === 'selection_required');
      form.setPreflightOpen(!selectionRequired);
      if (selectionRequired) {
        form.setDraftCatalogSelections({});
        message.warning('Требуется выбор комплектующих из каталога');
      }
      return;
    }
    form.setPendingGenerate(null);
    form.setPreflightOpen(false);
    form.setCandidateGroups([]);
    form.setDraftCatalogSelections({});
    form.setCatalogSelections({});
    toggleSettings(false);
    for (const id of variables.generateVariantIds) {
      qc.invalidateQueries({ queryKey: ['spec', variables.projectId, id], exact: false });
    }
    qc.invalidateQueries({ queryKey: ['spec-readiness', variables.projectId], exact: false });
    message.success(buildSpecificationGeneratedToast({
      hasUnresolved: false,
      generatedCount: result.results.length,
      electricalVariantName: variables.electricalVariantName,
    }));
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
      message.error(error instanceof Error ? error.message : 'Не удалось сформировать спецификацию');
    },
  });
  const mut = {
    isPending: generateMut.isPending,
    isError: generateMut.isError,
  };

  const hydratedErRef = useRef<string | null>(null);
  useEffect(() => {
    if (mut.isPending) return;
    const erId = selectedElectricalVariant?.id ?? null;
    const erChanged = hydratedErRef.current !== erId;
    hydratedErRef.current = erId;

    const options = buildSpecGenerateOptions({
      exZone: form.exZone,
      reserveCoeff: form.reserveCoeff,
      indicationOnBoxes: form.indicationOnBoxes,
      endSectionIndication: form.endSectionIndication,
      topIndication: form.topIndication,
      minLengthK2i: form.minLengthK2i,
      groupingMode: form.groupingMode,
    });
    const hydrate = buildSpecGenerationHydrate(spec, erId, options);

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
    form.setPendingGenerate(hydrate.pendingGenerate);
    if (hydrate.clearDraftSelections) {
      form.setDraftCatalogSelections({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form setters stable; only rehydrate on GET outcome
  }, [
    spec?.id,
    spec?.generation_status,
    spec?.generation_at,
    selectedElectricalVariant?.id,
    mut.isPending,
  ]);

  const isSpecStale = spec?.is_stale === true;
  const buildGenerateOptions = () => buildSpecGenerateOptions({
    exZone: form.exZone,
    reserveCoeff: form.reserveCoeff,
    indicationOnBoxes: form.indicationOnBoxes,
    endSectionIndication: form.endSectionIndication,
    topIndication: form.topIndication,
    minLengthK2i: form.minLengthK2i,
    groupingMode: form.groupingMode,
  });

  const saveDefaultsMut = useMutation({
    mutationFn: () => {
      if (!project || !canMutateProject) {
        throw new Error('Недостаточно прав для сохранения defaults');
      }
      return updateSpecificationSettings(project.id, buildGenerateOptions());
    },
    onSuccess: (result) => {
      message.success(
        `Defaults сохранены (v${result.version}). Спецификации с другим snapshot помечены stale — перегенерируйте выбранные ЭР.`,
      );
      qc.invalidateQueries({ queryKey: ['spec-settings', project?.id], exact: true });
      qc.invalidateQueries({ queryKey: ['spec', project?.id], exact: false });
      qc.invalidateQueries({ queryKey: ['spec-readiness', project?.id], exact: false });
    },
    onError: (error) => {
      const detail = getSpecificationErrorDetail(error);
      message.error(detail ? `${detail.code}: ${detail.message}` : 'Не удалось сохранить настройки спецификации');
    },
  });

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
    if (!excludeUnassignedConfirmed) {
      form.setPendingGenerate({ generateVariantIds, options });
    }
    generateMut.mutate({
      ...scope,
      generateVariantIds,
      options,
      excludeUnassignedConfirmed,
      catalogSelections,
    });
  };

  const confirmPartialGenerate = () => {
    const pending = form.pendingGenerate;
    if (!pending) return;
    generateMut.mutate({
      ...snapshotMutationScope(),
      generateVariantIds: [...pending.generateVariantIds],
      options: pending.options,
      excludeUnassignedConfirmed: true,
      catalogSelections: {},
    });
  };

  /** Case §7.3: leave preflight and open first problem ER on unassigned tab. */
  const fixUnassignedAssignments = () => {
    const erId = form.pendingGenerate?.generateVariantIds?.[0]
      ?? selectedElectricalVariant?.id
      ?? null;
    form.setPreflightOpen(false);
    form.setPendingGenerate(null);
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
    const pending = form.pendingGenerate;
    if (!pending) return;
    generateMut.mutate({
      ...snapshotMutationScope(),
      generateVariantIds: [...pending.generateVariantIds],
      options: pending.options,
      excludeUnassignedConfirmed: false,
      catalogSelections: { ...catalogSelections },
    });
  };

  const {
    saveMut,
    items,
    handleAdd,
    handleDelete,
    hasItems,
    categoriesCount,
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
    role,
    userId,
    sessionId,
    isEmployee,
    canMutateProject,
    canRespondToWorkflow,
    canManuallyEdit,
    navigate,
    qc,
    variantContext,
    selectedElectricalVariant,
    variant,
    legacyDataPlaneEnabled,
    specificationQueryKey,
    groupBy: form.groupBy,
    setGroupBy: form.setGroupBy,
    mergeIdentical: form.mergeIdentical,
    setMergeIdentical: form.setMergeIdentical,
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
    setPreflightSummary: form.setPreflightSummary,
    pendingGenerate: form.pendingGenerate,
    generationWorkflowPending: form.pendingGenerate != null,
    setPendingGenerate: form.setPendingGenerate,
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
    projectSettings,
    accessories,
    availableGenerateVariants,
    snapshotMutationScope,
    mut,
    saveMut,
    items,
    isSpecStale,
    buildGenerateOptions,
    saveDefaultsMut,
    runGenerate,
    confirmPartialGenerate,
    hasItems,
    handleAdd,
    handleDelete,
    categoriesCount,
    formedAt,
    generateButtonLabel,
    scopeSwitchDisabled,
    erTabItems,
    readiness,
    retryReadiness,
    handleReadinessRecovery,
  };
}
