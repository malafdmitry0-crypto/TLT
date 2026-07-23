/**
 * @module specification/page-model
 * @owner specification
 * Orchestration for SpecificationPage (queries, mutations, generate options).
 */
import { useEffect, useMemo } from 'react';
import { message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  generateSpecification,
  getSpecification,
  getSpecificationSettings,
  listAccessoriesExtended,
  saveSpecificationItems,
  updateSpecificationSettings,
} from '@/api/specifications';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useLegacyElectricalVariantContext } from '@/hooks/useLegacyElectricalVariantContext';
import type { SpecificationItem } from '@/types/specification';
import { formatSpecTimestamp } from '@/pages/specification/specFormatModel';
import { useSpecParamsPanelState } from '@/pages/specification/useSpecParamsPanelState';
import { useSpecPageFormState } from '@/pages/specification/useSpecPageFormState';
import {
  buildSpecGenerateOptions,
  isSpecificationPartial,
  resolveSpecificationExcludedGroups,
} from '@/pages/specification/specGenerateOptionsModel';
import { buildSpecSettingsFormSnapshot } from '@/pages/specification/specGenerationOptionsSyncModel';

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

type SaveSpecificationVariables = SpecificationMutationScope & {
  items: SpecificationItem[];
};

export function useSpecificationPageModel() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const sessionId = useAuthStore((s) => s.sessionId);
  const isEmployee = role === 'employee' || role === 'admin';
  const canMutateProject = Boolean(project && (
    role === 'admin'
    || (role === 'employee' && project.user_id === userId)
    || (role === 'guest' && project.session_id === sessionId)
  ));
  const canManuallyEdit = canMutateProject && isEmployee;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const variantContext = useLegacyElectricalVariantContext(project?.id);
  const selectedElectricalVariant = variantContext.selectedVariant;
  const variant = variantContext.legacyVariantNumber ?? 1;
  const legacyDataPlaneEnabled = Boolean(
    project && selectedElectricalVariant && variantContext.legacyVariantNumber != null,
  );
  const specificationQueryKey = [
    'spec',
    project?.id,
    selectedElectricalVariant?.id,
    variant,
  ] as const;

  const form = useSpecPageFormState();
  /** Блок настроек (параметры генерации) — Drawer, как «Настройки» в макете. */
  const { settingsOpen, toggleSettings } = useSpecParamsPanelState();

  const {
    data: spec,
    refetch,
    isLoading: specLoading,
    isError: specError,
    error: specErrorObj,
    isFetching: specFetching,
  } = useQuery({
    queryKey: specificationQueryKey,
    queryFn: () => getSpecification(
      project!.id,
      variant,
      selectedElectricalVariant!.id,
    ),
    enabled: legacyDataPlaneEnabled,
  });

  const { data: projectSettings } = useQuery({
    queryKey: ['spec-settings', project?.id],
    queryFn: () => getSpecificationSettings(project!.id),
    enabled: Boolean(project?.id),
  });

  const { data: accessories = [] } = useQuery({
    queryKey: referenceQueryKeys.accessoriesExtended,
    queryFn: listAccessoriesExtended,
    enabled: canManuallyEdit,
    ...referenceQueryOptions,
  });

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
    form.setSelectedGenerateErIds((prev) => {
      if (prev.length === 0) return [selectedElectricalVariant.id];
      const stillValid = prev.filter((id) =>
        availableGenerateVariants.some((item) => item.id === id),
      );
      if (stillValid.length > 0) return stillValid;
      return selectedElectricalVariant.legacy_variant_number != null
        ? [selectedElectricalVariant.id]
        : [];
    });
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
      if (result.partial) {
        message.warning(
          generatedCount > 1
            ? `Сформирована неполная спецификация для ${generatedCount} ЭР — не использовать как полный закупочный комплект`
            : `Сформирована неполная спецификация для «${variables.electricalVariantName}» — не использовать как полный закупочный комплект`,
        );
      } else {
        message.success(
          generatedCount > 1
            ? `Спецификация сформирована для ${generatedCount} ЭР`
            : `Спецификация для «${variables.electricalVariantName}» сформирована`,
        );
      }
      if (result.mode === 'full' && result.skipped_objects > 0) {
        message.warning(
          `Объектов без успешного электрорасчёта: ${result.skipped_objects} — они не вошли в спецификацию`,
        );
      }
      if (result.partial && (result.excluded_groups?.length ?? 0) > 0) {
        const codes = (result.excluded_groups ?? [])
          .map((g) => g.error_code)
          .filter(Boolean)
          .join(', ');
        message.warning(
          `Исключённые группы: ${codes || 'см. диагностику на экране'}`,
        );
      }
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
        const pf = e.detail?.preflight;
        const lines = (pf?.variants ?? [])
          .filter((v) => (v.skipped_objects ?? 0) > 0)
          .map(
            (v) =>
              `«${v.electrical_variant_name || 'ЭР'}»: исключено объектов ${v.skipped_objects}`,
          );
        form.setPreflightSummary(
          [
            `Всего исключений: ${pf?.total_skipped_objects ?? 0}.`,
            'После подтверждения partial generation выполнится атомарно (PDL-ER-36).',
            ...lines,
          ].join('\n'),
        );
        form.setPreflightOpen(true);
        return;
      }
      message.error(e.message);
    },
  });

  const saveMut = useMutation({
    mutationFn: ({
      projectId,
      electricalVariantId,
      legacyVariantNumber,
      items,
    }: SaveSpecificationVariables) => {
      if (!canManuallyEdit) {
        throw new Error('Недостаточно прав для ручного изменения спецификации');
      }
      return saveSpecificationItems(
        projectId,
        items,
        legacyVariantNumber,
        electricalVariantId,
      );
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: variables.queryKey, exact: true });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const items: SpecificationItem[] = useMemo(
    () => (spec?.items as SpecificationItem[]) ?? [],
    [spec]
  );
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
    const generateVariantIds = form.selectedGenerateErIds.length > 0
      ? form.selectedGenerateErIds
      : [scope.electricalVariantId];
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

  const hasItems = items.length > 0;

  const handleAdd = () => {
    if (!canManuallyEdit) return;
    const acc = accessories.find((a) => a.id === form.selectedAccessoryId);
    if (!acc || !form.qty || form.qty <= 0) return;
    const newItem: SpecificationItem = {
      category: acc.category,
      name: acc.name,
      article: acc.article,
      unit: 'шт.',
      quantity: form.qty,
      params: { source_id: acc.id },
      source: 'manual',
    };
    saveMut.mutate({
      ...snapshotMutationScope(),
      items: [...items, newItem],
    }, {
      onSuccess: () => {
        message.success('Позиция добавлена');
        form.setAddOpen(false);
        form.setSelectedAccessoryId(null);
        form.setQty(1);
      },
    });
  };

  const handleDelete = (index: number) => {
    if (!canManuallyEdit) return;
    const next = items.filter((_, i) => i !== index);
    saveMut.mutate({
      ...snapshotMutationScope(),
      items: next,
    }, {
      onSuccess: () => message.success('Позиция удалена'),
    });
  };

  const categoriesCount = new Set(items.map((i) => i.category)).size;
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
