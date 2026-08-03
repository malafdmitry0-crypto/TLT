/**
 * @module specification/page-model
 * @owner specification
 * Orchestration for SpecificationPage (mutations, generate options).
 * Query/session identity lives in useSpecificationQuerySession.
 */
import { useEffect, useMemo } from 'react';
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
import {
  buildSpecGenerateOptions,
} from '@/pages/specification/specGenerateOptionsModel';
import { buildSpecSettingsFormSnapshot } from '@/pages/specification/specGenerationOptionsSyncModel';
import { useSpecificationQuerySession } from '@/pages/specification/useSpecificationQuerySession';
import { useSpecificationManualItemsController } from '@/pages/specification/useSpecificationManualItemsController';
import {
  buildSpecificationGeneratedToast,
  filterValidGenerateErIds,
  resolveGenerateVariantIds,
} from '@/pages/specification/specificationPageModelHelpers';

type SpecificationMutationScope = {
  projectId: string;
  electricalVariantId: string;
  electricalVariantName: string;
  queryKey: readonly unknown[];
};

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
  const snapshotMutationScope = (): SpecificationMutationScope => {
    if (!project || !selectedElectricalVariant?.id) {
      throw new Error('Выбранный ЭР недоступен для спецификации');
    }
    return {
      projectId: project.id,
      electricalVariantId: selectedElectricalVariant.id,
      electricalVariantName: selectedElectricalVariant.name,
      queryKey: [
        'spec',
        project.id,
        selectedElectricalVariant.id,
      ],
    };
  };
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
      form.setPreflightSummary(
        diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join('\n'),
      );
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
        form.setDraftCatalogSelections({});
        toggleSettings(false);
        message.warning('Требуется выбор комплектующих из каталога');
      } else if (confirmationRequired) {
        toggleSettings(false);
      } else if (blocked) {
        const firstBlocking = diagnostics.find((item) => item.kind === 'blocking');
        message.warning(
          firstBlocking
            ? `${firstBlocking.code}: ${firstBlocking.message}`
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
      for (const id of generated.map((item) => item.electrical_variant_id)) {
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
    mut.mutate({
      ...scope,
      generateVariantIds: form.pendingGenerate.generateVariantIds,
      options: form.pendingGenerate.options,
      excludeUnassignedConfirmed: true,
      catalogSelections: form.catalogSelections,
    });
  };

  const selectCandidate = (groupKey: string, catalogItemId: string) => {
    form.setDraftCatalogSelections((prev) => ({ ...prev, [groupKey]: catalogItemId }));
  };

  const confirmCatalogSelections = () => {
    if (!form.pendingGenerate || mut.isPending) return;
    const merged: Record<string, string> = { ...form.catalogSelections };
    for (const group of form.candidateGroups) {
      if (group.selected_catalog_item_id) {
        merged[group.group_key] = group.selected_catalog_item_id;
      }
    }
    for (const [key, value] of Object.entries(form.draftCatalogSelections)) {
      merged[key] = value;
    }
    form.setCatalogSelections(merged);
    const scope = snapshotMutationScope();
    mut.mutate({
      ...scope,
      generateVariantIds: form.pendingGenerate.generateVariantIds,
      options: form.pendingGenerate.options,
      excludeUnassignedConfirmed: false,
      catalogSelections: merged,
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
