/**
 * @module specification/page-model
 * @owner specification
 * Orchestration for SpecificationPage (mutations, generate options).
 * Query/session identity lives in useSpecificationQuerySession.
 */
import { useEffect, useMemo } from 'react';
import { message } from 'antd';
import { useMutation } from '@tanstack/react-query';

import {
  generateSpecification,
  updateSpecificationSettings,
} from '@/api/specifications';
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
  buildExcludedGroupsToast,
  buildPreflightSummaryText,
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
  mode: 'basic' | 'full';
  options?: Parameters<typeof generateSpecification>[4];
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
  /** Блок настроек (параметры генерации) — Drawer, как «Настройки» в макете. */
  const { settingsOpen, toggleSettings } = useSpecParamsPanelState();

  // PDL-ER-07: load project defaults first; snapshot from last generation only
  // for the currently viewed ER (does not rewrite project defaults).
  // Must re-run when generation_options content changes (same spec id after regenerate).
  useEffect(() => {
    const opts = (spec?.generation_options as Record<string, unknown> | null | undefined)
      ?? (projectSettings?.settings as Record<string, unknown> | undefined);
    if (!opts) return;
    const snapshot = buildSpecSettingsFormSnapshot(opts);
    form.setExZone(snapshot.exZone);
    form.setReserveCoeff(snapshot.reserveCoeff);
    form.setIndicationOnBoxes(snapshot.indicationOnBoxes);
    form.setEndSectionIndication(snapshot.endSectionIndication);
    form.setTopIndication(snapshot.topIndication);
    form.setMinLengthK2i(snapshot.minLengthK2i);
    form.setConnectorKitSectionsPerKit(snapshot.connectorKitSectionsPerKit);
    if (typeof snapshot.mergeIdentical === 'boolean') {
      form.setMergeIdentical(snapshot.mergeIdentical);
    }
    if (snapshot.groupBy) {
      form.setGroupBy(snapshot.groupBy);
    }
    // form setters are stable (useState); omit form object to avoid effect loops
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.* setters only
  }, [
    spec?.id,
    spec?.generation_mode,
    spec?.generation_options,
    projectSettings?.version,
    projectSettings?.settings,
  ]);

  // PDL-ER-29: product generation is always full for guest and employee.
  const effectiveMode = 'full' as const;
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
      electricalVariantId,
      legacyVariantNumber,
      mode,
      options,
      generateVariantIds,
      confirmPartial = false,
    }: GenerateSpecificationVariables & {
      generateVariantIds: string[];
      confirmPartial?: boolean;
    }) => {
      if (!canMutateProject) {
        throw new Error('Недостаточно прав для изменения спецификации');
      }
      return generateSpecification(
        projectId,
        legacyVariantNumber,
        electricalVariantId,
        mode,
        options,
        generateVariantIds,
        confirmPartial,
      );
    },
    onSuccess: (result, variables) => {
      form.setPreflightOpen(false);
      form.setPendingGenerate(null);
      const generatedCount = result.results?.length ?? 1;
      const toast = buildSpecificationGeneratedToast({
        partial: !!result.partial,
        generatedCount,
        electricalVariantName: variables.electricalVariantName,
      });
      if (result.partial) message.warning(toast);
      else message.success(toast);
      if (result.mode === 'full' && result.skipped_objects > 0) {
        message.warning(
          `Объектов без успешного электрорасчёта: ${result.skipped_objects} — они не вошли в спецификацию`,
        );
      }
      const excludedToast = result.partial
        ? buildExcludedGroupsToast(result.excluded_groups)
        : null;
      if (excludedToast) message.warning(excludedToast);
      for (const id of variables.generateVariantIds) {
        qc.invalidateQueries({
          queryKey: ['spec', variables.projectId, id],
          exact: false,
        });
      }
    },
    onError: (e: Error & { code?: string; detail?: { preflight?: {
      total_skipped_objects?: number;
      variants?: Array<{
        electrical_variant_name?: string | null;
        skipped_objects?: number;
      }>;
    } } }) => {
      if (e.code === 'SPECIFICATION_PREFLIGHT_CONFIRMATION_REQUIRED') {
        form.setPreflightSummary(buildPreflightSummaryText(e.detail?.preflight));
        form.setPreflightOpen(true);
        return;
      }
      message.error(e.message);
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
    connectorKitSectionsPerKit: form.connectorKitSectionsPerKit,
    groupBy: form.groupBy,
    mergeIdentical: form.mergeIdentical,
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
      qc.invalidateQueries({ queryKey: ['spec-settings', project?.id] });
      qc.invalidateQueries({ queryKey: ['spec', project?.id], exact: false });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const runGenerate = (confirmPartial = false) => {
    const scope = snapshotMutationScope();
    const generateVariantIds = resolveGenerateVariantIds(
      form.selectedGenerateErIds,
      scope.electricalVariantId,
    );
    const options = buildGenerateOptions();
    if (!confirmPartial) {
      form.setPendingGenerate({ generateVariantIds, options });
    }
    mut.mutate({
      ...scope,
      generateVariantIds,
      mode: effectiveMode,
      options,
      confirmPartial,
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
      mode: effectiveMode,
      options: form.pendingGenerate.options,
      confirmPartial: true,
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
  const fullModeActive = true;
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
    connectorKitSectionsPerKit: form.connectorKitSectionsPerKit,
    setConnectorKitSectionsPerKit: form.setConnectorKitSectionsPerKit,
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
    effectiveMode,
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
    fullModeActive,
    formedAt,
    generateButtonLabel,
    scopeSwitchDisabled,
    erTabItems,
  };
}
