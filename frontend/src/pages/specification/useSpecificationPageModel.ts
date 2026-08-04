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
import type { SpecificationOptions } from '@/api/specifications';
import { formatSpecTimestamp } from '@/pages/specification/specFormatModel';
import { useSpecParamsPanelState } from '@/pages/specification/useSpecParamsPanelState';
import { useSpecPageFormState } from '@/pages/specification/useSpecPageFormState';
import { buildSpecGenerateOptions } from '@/pages/specification/specGenerateOptionsModel';
import { buildSpecSettingsFormSnapshot } from '@/pages/specification/specGenerationOptionsSyncModel';
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
import { persistSpecificationCatalogSelections } from '@/pages/specification/specificationCatalogSelectionPersistence';
import { formatPreflightSummary } from '@/domain/specification/specTableSectionModel';

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
    canMutateProject,
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

  const form = useSpecPageFormState();
  /** Единое modal-окно настроек формирования. */
  const { settingsOpen, toggleSettings } = useSpecParamsPanelState();

  // PDL-ER-07: load project defaults first; canonical snapshot from last generation only
  // for the currently viewed ER (does not rewrite project defaults).
  // Must re-run when snapshot content changes (same spec id after regenerate).
  useEffect(() => {
    const opts = spec?.snapshot?.resolved_options
      ?? (projectSettings?.settings as Record<string, unknown> | undefined)
      ?? {};
    const snapshot = buildSpecSettingsFormSnapshot(opts);
    form.setExZone(snapshot.exZone);
    form.setReserveCoeff(snapshot.reserveCoeff);
    form.setIndicationOnBoxes(snapshot.indicationOnBoxes);
    form.setEndSectionIndication(snapshot.endSectionIndication);
    form.setTopIndication(snapshot.topIndication);
    form.setMinLengthK2i(snapshot.minLengthK2i);
    form.setGroupingMode(snapshot.groupingMode);
    // form setters are stable (useState); omit form object to avoid effect loops
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.* setters only
  }, [
    spec?.id,
    spec?.snapshot?.resolved_options,
    projectSettings?.version,
    projectSettings?.settings,
  ]);

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
  const mut = useMutation({
    mutationFn: ({
      projectId,
      options,
      generateVariantIds,
      excludeUnassignedConfirmed,
      catalogSelections,
    }: GenerateSpecificationVariables) => {
      if (!canMutateProject) {
        throw new Error('Недостаточно прав для изменения спецификации');
      }
      return generateSpecification(
        projectId,
        {
          variant_ids: generateVariantIds,
          options,
          exclude_unassigned_confirmed: excludeUnassignedConfirmed,
          catalog_selections: catalogSelections,
        },
      );
    },
    onSuccess: (result, variables) => {
      const generated = result.results.filter((item) => item.status === 'generated');
      const unresolved = result.results.filter((item) => item.status !== 'generated');
      const diagnostics = unresolved.flatMap((item) => item.diagnostics);
      const groups = unresolved.flatMap((item) => item.candidate_groups ?? []);
      form.setGenerationDiagnostics(diagnostics);
      form.setCandidateGroups(groups);
      form.setPreflightSummary(formatPreflightSummary(diagnostics));
      const confirmationRequired = unresolved.some(
        (item) => item.status === 'confirmation_required',
      );
      const selectionRequired = unresolved.some(
        (item) => item.status === 'selection_required',
      );
      const blocked = unresolved.some((item) => item.status === 'blocked');
      form.setPreflightOpen(confirmationRequired && !selectionRequired);
      if (!confirmationRequired && !selectionRequired) form.setPendingGenerate(null);
      if (selectionRequired) {
        // Keep draft empty — never preselect first candidate.
        // Keep settings open so diagnostics remain visible (SPEC-P0-a WP4).
        form.setDraftCatalogSelections({});
        message.warning('Требуется выбор комплектующих из каталога');
      } else if (confirmationRequired) {
        // Keep settings open while preflight modal is shown.
      } else if (blocked) {
        const firstBlocking = diagnostics.find((item) => item.kind === 'blocking');
        message.warning(
          firstBlocking
            ? (firstBlocking.message || firstBlocking.code)
            : 'Формирование заблокировано',
        );
      } else if (unresolved.length === 0 && generated.length > 0) {
        form.setCandidateGroups([]);
        form.setDraftCatalogSelections({});
        form.setCatalogSelections({});
        toggleSettings(false);
      }
      const generatedCount = generated.length;
      const toast = buildSpecificationGeneratedToast({
        hasUnresolved: unresolved.length > 0,
        generatedCount,
        electricalVariantName: variables.electricalVariantName,
      });
      if (!selectionRequired && !blocked) {
        if (unresolved.length > 0) message.warning(toast);
        else message.success(toast);
      }
      // Invalidate every attempted ER so GET carries last generation_status (F5 / ER switch).
      for (const id of result.results.map((item) => item.electrical_variant_id)) {
        qc.invalidateQueries({
          queryKey: ['spec', variables.projectId, id],
          exact: false,
        });
      }
    },
    onError: (error) => {
      form.setPendingGenerate(null);
      form.setPreflightOpen(false);
      form.setCandidateGroups([]);
      form.setDraftCatalogSelections({});
      const detail = getSpecificationErrorDetail(error);
      message.error(detail ? `${detail.code}: ${detail.message}` : 'Не удалось сформировать спецификацию');
    },
  });

  // SPEC-REM-05: restore last generation status/candidates from GET after F5 / ER switch.
  // Deps are outcome identity only — do not re-clear drafts when the user edits form options.
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
    mut.mutate({
      ...scope,
      generateVariantIds,
      options,
      excludeUnassignedConfirmed,
      catalogSelections,
    });
  };

  const confirmPartialGenerate = () => {
    if (!form.pendingGenerate) {
      runGenerate(true);
      return;
    }
    const scope = snapshotMutationScope();
    // Selections already on server after PUT; do not re-send from client cache.
    mut.mutate({
      ...scope,
      generateVariantIds: form.pendingGenerate.generateVariantIds,
      options: form.pendingGenerate.options,
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

  /**
   * Persist multi-candidate choices on the server (PUT), then generate without
   * relying on long-lived client selection state. Backend merges stored choices.
   */
  const confirmCatalogSelections = async () => {
    if (mut.isPending || !project) return;
    const scope = snapshotMutationScope();
    // After F5, pendingGenerate is restored from GET hydrate; otherwise from last generate.
    const generateVariantIds = form.pendingGenerate?.generateVariantIds
      ?? (selectedElectricalVariant?.id ? [selectedElectricalVariant.id] : []);
    const options = form.pendingGenerate?.options ?? buildGenerateOptions();
    if (generateVariantIds.length === 0) return;

    try {
      const persistence = await persistSpecificationCatalogSelections({
        projectId: project.id,
        groups: form.candidateGroups,
        draftSelections: form.draftCatalogSelections,
      });
      if (persistence === 'invalid_fingerprint') {
        message.error(
          'SPEC_REQUEST_INVALID: backend не вернул candidate_set_fingerprint для группы',
        );
        return;
      }
      if (persistence === 'no_selection') {
        message.warning('Выберите позицию для каждой группы с несколькими кандидатами');
        return;
      }
    } catch (error) {
      const detail = getSpecificationErrorDetail(error);
      message.error(
        detail
          ? `${detail.code}: ${detail.message}`
          : 'Не удалось сохранить выбор комплектующих на сервере',
      );
      return;
    }

    // Client cache is not the long-term store; generate relies on server merge.
    form.setCatalogSelections({});
    form.setDraftCatalogSelections({});
    if (!form.pendingGenerate) {
      form.setPendingGenerate({ generateVariantIds, options });
    }
    mut.mutate({
      ...scope,
      generateVariantIds,
      options,
      excludeUnassignedConfirmed: false,
      catalogSelections: {},
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
  const scopeSwitchDisabled = mut.isPending || saveMut.isPending || form.pendingGenerate != null;

  const erTabItems = variantContext.variants.map((item) => ({
    key: item.id,
    label: `Спецификация ${item.name}`,
    disabled: scopeSwitchDisabled,
  }));

  return {
    project,
    role,
    userId,
    sessionId,
    isEmployee,
    canMutateProject,
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
  };
}
