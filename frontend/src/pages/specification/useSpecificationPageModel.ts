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
  getSpecificationErrorDetail,
  updateSpecificationSettings,
} from '@/api/specifications';
import type { SpecificationOptions } from '@/api/specifications';
import {
  resumeCalculationWorkflow,
  startCalculationWorkflow,
} from '@/api/calculationWorkflows';
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
import {
  calculationWorkflowDetailQueryKey,
  projectCalculationWorkflowQueryKey,
  useProjectCalculationWorkflow,
} from '@/hooks/useProjectCalculationWorkflow';

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
  const projectWorkflow = useProjectCalculationWorkflow(project?.id);
  const canMutateProject = projectCanMutate && !projectWorkflow.isCalculationLocked;
  const canRespondToWorkflow = projectCanMutate
    && projectWorkflow.workflow?.status === 'waiting_input';
  const form = useSpecPageFormState();
  const { settingsOpen, toggleSettings } = useSpecParamsPanelState();
  useSpecSettingsFormHydration(spec, projectSettings, form);
  const availableGenerateVariants = useMemo(
    () => variantContext.variants ?? [],
    [variantContext.variants],
  );
  useEffect(() => {
    if (!selectedElectricalVariant?.id) return;
    const availableIds = new Set(availableGenerateVariants.map((item) => item.id));
    form.setSelectedGenerateErIds((prev) => filterValidGenerateErIds(
      prev,
      availableIds,
      selectedElectricalVariant.id,
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.setSelectedGenerateErIds stable
  }, [selectedElectricalVariant?.id, availableGenerateVariants]);
  const snapshotMutationScope = (): SpecificationMutationScope => (
    buildSpecificationMutationScope(project, selectedElectricalVariant)
  );
  const workflowVariablesRef = useRef<GenerateSpecificationVariables | null>(null);
  const handledWorkflowStateRef = useRef<string | null>(null);
  const startWorkflowMut = useMutation({
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
      if (excludeUnassignedConfirmed || Object.keys(catalogSelections).length > 0) {
        throw new Error('Ответ выбора допустим только для ожидающего workflow');
      }
      workflowVariablesRef.current = variables;
      return startCalculationWorkflow(projectId, {
        variant_ids: generateVariantIds,
        options,
      });
    },
    onSuccess: (workflow, variables) => {
      qc.setQueryData(
        projectCalculationWorkflowQueryKey(variables.projectId),
        workflow,
      );
      qc.setQueryData(calculationWorkflowDetailQueryKey(workflow.id), workflow);
      message.info('Полный расчёт поставлен в очередь');
    },
    onError: (error) => {
      form.setPendingGenerate(null);
      form.setPreflightOpen(false);
      form.setCandidateGroups([]);
      form.setDraftCatalogSelections({});
      message.error(error instanceof Error ? error.message : 'Не удалось запустить полный расчёт');
    },
  });
  const resumeWorkflowMut = useMutation({
    mutationFn: ({
      excludeUnassignedConfirmed,
      catalogSelections,
    }: {
      excludeUnassignedConfirmed: boolean;
      catalogSelections: Record<string, string>;
    }) => {
      const workflow = projectWorkflow.workflow;
      if (!workflow || workflow.status !== 'waiting_input') {
        throw new Error('Workflow больше не ожидает ответ; обновите состояние');
      }
      return resumeCalculationWorkflow(workflow.id, {
        expected_workflow_version: workflow.workflow_version,
        exclude_unassigned_confirmed: excludeUnassignedConfirmed,
        catalog_selections: catalogSelections,
      });
    },
    onSuccess: (workflow) => {
      qc.setQueryData(projectCalculationWorkflowQueryKey(project?.id), workflow);
      qc.setQueryData(calculationWorkflowDetailQueryKey(workflow.id), workflow);
      form.setPreflightOpen(false);
      form.setDraftCatalogSelections({});
      message.info('Ответ принят, расчёт продолжен');
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Не удалось продолжить workflow');
    },
  });
  const workflowOperationPending = startWorkflowMut.isPending
    || resumeWorkflowMut.isPending
    || ['queued', 'enqueued', 'running'].includes(projectWorkflow.workflow?.status ?? '');
  const mut = {
    isPending: workflowOperationPending,
    isError: startWorkflowMut.isError
      || resumeWorkflowMut.isError
      || projectWorkflow.workflow?.status === 'failed'
      || projectWorkflow.workflow?.status === 'timed_out',
  };

  useEffect(() => {
    const workflow = projectWorkflow.workflow;
    if (!workflow) return;
    const stateKey = `${workflow.id}:${workflow.status}:${workflow.workflow_version}`;
    if (handledWorkflowStateRef.current === stateKey) return;
    handledWorkflowStateRef.current = stateKey;

    if (workflow.status === 'waiting_input') {
      const diagnostics = deduplicateSpecificationDiagnostics(
        workflow.waiting_results.flatMap((item) => item.diagnostics),
      );
      const groups = workflow.waiting_results.flatMap((item) => item.candidate_groups ?? []);
      form.setGenerationDiagnostics(diagnostics);
      form.setCandidateGroups(groups);
      form.setPreflightSummary(formatPreflightSummary(diagnostics));
      form.setPendingGenerate({
        generateVariantIds: workflow.variant_ids,
        options: workflowVariablesRef.current?.options ?? buildGenerateOptions(),
      });
      const selectionRequired = workflow.waiting_results.some(
        (item) => item.status === 'selection_required',
      );
      form.setPreflightOpen(!selectionRequired);
      if (selectionRequired) {
        form.setDraftCatalogSelections({});
        message.warning('Требуется выбор комплектующих из каталога');
      }
      return;
    }
    if (workflow.status === 'succeeded') {
      form.setPendingGenerate(null);
      form.setCandidateGroups([]);
      form.setDraftCatalogSelections({});
      form.setCatalogSelections({});
      toggleSettings(false);
      for (const id of workflow.variant_ids) {
        qc.invalidateQueries({ queryKey: ['spec', workflow.project_id, id], exact: false });
      }
      qc.invalidateQueries({
        queryKey: ['spec-readiness', workflow.project_id],
        exact: false,
      });
      const generatedCount = workflow.result?.results.filter(
        (item) => item.status === 'generated',
      ).length ?? 0;
      message.success(buildSpecificationGeneratedToast({
        hasUnresolved: false,
        generatedCount,
        electricalVariantName: workflowVariablesRef.current?.electricalVariantName ?? '',
      }));
      return;
    }
    if (workflow.status === 'failed' || workflow.status === 'timed_out') {
      form.setPendingGenerate(null);
      message.error(workflow.error_message || 'Полный расчёт не завершён');
    }
    // form setters and query client are stable; stateKey is the transition identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectWorkflow.workflow]);

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
      scope.electricalVariantId,
    );
    const options = buildGenerateOptions();
    const catalogSelections = nextCatalogSelections ?? form.catalogSelections;
    if (!excludeUnassignedConfirmed) {
      form.setPendingGenerate({ generateVariantIds, options });
    }
    startWorkflowMut.mutate({
      ...scope,
      generateVariantIds,
      options,
      excludeUnassignedConfirmed,
      catalogSelections,
    });
  };

  const confirmPartialGenerate = () => {
    resumeWorkflowMut.mutate({
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
    const requiredGroups = form.candidateGroups.filter(
      (group) => group.candidates.length > 1 && !group.selected_catalog_item_id,
    );
    if (requiredGroups.some((group) => !form.draftCatalogSelections[group.group_key])) {
      message.warning('Выберите позицию для каждой группы с несколькими кандидатами');
      return;
    }
    resumeWorkflowMut.mutate({
      excludeUnassignedConfirmed: false,
      catalogSelections: form.draftCatalogSelections,
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
