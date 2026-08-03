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
  isSpecificationPartial,
  resolveSpecificationExcludedGroups,
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
  legacyVariantNumber: number;
  queryKey: readonly unknown[];
};

type GenerateSpecificationVariables = SpecificationMutationScope & {
  options: SpecificationOptions;
  generateVariantIds: string[];
  excludeUnassignedConfirmed: boolean;
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

  // PDL-ER-07: load project defaults first; snapshot from last generation only
  // for the currently viewed ER (does not rewrite project defaults).
  // Must re-run when generation_options content changes (same spec id after regenerate).
  useEffect(() => {
    const opts = (spec?.generation_options as Record<string, unknown> | null | undefined)
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
    spec?.generation_mode,
    spec?.generation_options,
    projectSettings?.version,
    projectSettings?.settings,
  ]);

  const availableGenerateVariants = useMemo(
    () => (variantContext.variants ?? []).filter((item) => item.legacy_variant_number != null),
    [variantContext.variants],
  );
  useEffect(() => {
    if (!selectedElectricalVariant?.id) return;
    const availableIds = new Set(availableGenerateVariants.map((item) => item.id));
    form.setSelectedGenerateErIds((prev) => filterValidGenerateErIds(
      prev,
      availableIds,
      selectedElectricalVariant.id,
      selectedElectricalVariant.legacy_variant_number != null,
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.setSelectedGenerateErIds stable
  }, [selectedElectricalVariant?.id, selectedElectricalVariant?.legacy_variant_number, availableGenerateVariants]);
  const snapshotMutationScope = (): SpecificationMutationScope => {
    if (!project || !selectedElectricalVariant || variantContext.legacyVariantNumber == null) {
      throw new Error('Выбранный ЭР недоступен для спецификации');
    }
    return {
      projectId: project.id,
      electricalVariantId: selectedElectricalVariant.id,
      electricalVariantName: selectedElectricalVariant.name,
      legacyVariantNumber: variantContext.legacyVariantNumber,
      queryKey: [
        'spec',
        project.id,
        selectedElectricalVariant.id,
        variantContext.legacyVariantNumber,
      ],
    };
  };
  const mut = useMutation({
    mutationFn: ({
      projectId,
      options,
      generateVariantIds,
      excludeUnassignedConfirmed,
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
          catalog_selections: {},
        },
      );
    },
    onSuccess: (result, variables) => {
      const generated = result.results.filter((item) => item.status === 'generated');
      const unresolved = result.results.filter((item) => item.status !== 'generated');
      const diagnostics = unresolved.flatMap((item) => item.diagnostics);
      form.setGenerationDiagnostics(diagnostics);
      form.setPreflightSummary(
        diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join('\n'),
      );
      const confirmationRequired = unresolved.some(
        (item) => item.status === 'confirmation_required',
      );
      form.setPreflightOpen(confirmationRequired);
      if (!confirmationRequired) form.setPendingGenerate(null);
      if (unresolved.length === 0 && generated.length > 0) toggleSettings(false);
      const generatedCount = generated.length;
      const toast = buildSpecificationGeneratedToast({
        partial: unresolved.length > 0,
        generatedCount,
        electricalVariantName: variables.electricalVariantName,
      });
      if (unresolved.length > 0) message.warning(toast);
      else message.success(toast);
      for (const id of generated.map((item) => item.electrical_variant_id)) {
        qc.invalidateQueries({
          queryKey: ['spec', variables.projectId, id],
          exact: false,
        });
      }
    },
    onError: (error) => {
      const detail = getSpecificationErrorDetail(error);
      message.error(detail ? `${detail.code}: ${detail.message}` : 'Не удалось сформировать спецификацию');
    },
  });

  const isSpecStale = spec?.is_stale === true;
  const isSpecPartial = isSpecificationPartial(spec);
  const excludedGroups = resolveSpecificationExcludedGroups(spec);
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

  const runGenerate = (excludeUnassignedConfirmed = false) => {
    form.setGenerationDiagnostics([]);
    const scope = snapshotMutationScope();
    const generateVariantIds = resolveGenerateVariantIds(
      form.selectedGenerateErIds,
      scope.electricalVariantId,
    );
    const options = buildGenerateOptions();
    if (!excludeUnassignedConfirmed) {
      form.setPendingGenerate({ generateVariantIds, options });
    }
    mut.mutate({
      ...scope,
      generateVariantIds,
      options,
      excludeUnassignedConfirmed,
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
    label: item.legacy_variant_number != null
      ? `Спецификация ${item.name}`
      : item.name,
    disabled: item.legacy_variant_number == null || scopeSwitchDisabled,
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
    isSpecPartial,
    excludedGroups,
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
