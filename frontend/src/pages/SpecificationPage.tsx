import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Drawer,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tabs,
  Typography,
  message,
} from 'antd';
import {
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  generateSpecification,
  getSpecification,
  getSpecificationSettings,
  listAccessoriesExtended,
  saveSpecificationItems,
  updateSpecificationSettings,
  type AccessoryExtendedInfo,
} from '@/api/specifications';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useLegacyElectricalVariantContext } from '@/pages/electrical/useLegacyElectricalVariantContext';
import SpecTable from '@/components/specification/SpecTable';
import QueryError from '@/components/common/QueryError';
import EmptyProjectState from '@/components/common/EmptyProjectState';
import { ROUTES } from '@/routes/routes';
import { readStorageJson } from '@/utils/storage';
import type { SpecificationItem } from '@/types/specification';

const { Text } = Typography;

const SPEC_PARAMS_PANEL_STORAGE_KEY = 'tlt-spec-params-panel';

type GroupBy = 'none' | 'category' | 'unit' | 'object_section';

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

function formatSpecTimestamp(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SpecificationPage() {
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

  const [groupBy, setGroupBy] = useState<GroupBy>('object_section');
  const [mergeIdentical, setMergeIdentical] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedAccessoryId, setSelectedAccessoryId] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);
  // PDL-ER-29: canonical product mode is always full data-driven BOM.
  // Manual item CRUD remains employee/admin only (PDL-ER-04).
  // PDL-ER-01: explicit multi-ЭР selection for generation; never implicit all-on-open.
  const [selectedGenerateErIds, setSelectedGenerateErIds] = useState<string[]>([]);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightSummary, setPreflightSummary] = useState<string>('');
  const [pendingGenerate, setPendingGenerate] = useState<{
    generateVariantIds: string[];
    options?: Parameters<typeof generateSpecification>[4];
  } | null>(null);
  const [exZone, setExZone] = useState(false);
  const [reserveCoeff, setReserveCoeff] = useState<number>(1);
  // Опции индикации ТНП: К1i / К2i / Кiu / L,К2i
  const [indicationOnBoxes, setIndicationOnBoxes] = useState(false);
  const [endSectionIndication, setEndSectionIndication] = useState(false);
  const [topIndication, setTopIndication] = useState(false);
  const [minLengthK2i, setMinLengthK2i] = useState<number>(0);
  /** PDL-ER-44: PDF §7.10 sections per connector kit (1→КСН-1, 2→КСН-2). */
  const [connectorKitSectionsPerKit, setConnectorKitSectionsPerKit] = useState<1 | 2>(1);
  /** Блок настроек (параметры генерации) — Drawer, как «Настройки» в макете. */
  const [settingsOpen, setSettingsOpen] = useState<boolean>(
    () => readStorageJson(SPEC_PARAMS_PANEL_STORAGE_KEY) === true,
  );
  const toggleSettings = (visible: boolean) => {
    setSettingsOpen(visible);
    try {
      localStorage.setItem(SPEC_PARAMS_PANEL_STORAGE_KEY, JSON.stringify(visible));
    } catch {
      // localStorage может быть недоступен — настройка останется на сессию
    }
  };

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
  useEffect(() => {
    const opts = (spec?.generation_options as Record<string, unknown> | null | undefined)
      ?? (projectSettings?.settings as Record<string, unknown> | undefined);
    if (!opts) return;
    setExZone(Boolean(opts.ex_zone));
    setReserveCoeff(Number(opts.reserve_coefficient ?? 1));
    setIndicationOnBoxes(Boolean(opts.indication_on_boxes));
    setEndSectionIndication(Boolean(opts.end_section_indication));
    setTopIndication(Boolean(opts.top_indication));
    setMinLengthK2i(Number(opts.min_length_for_end_indication ?? 0));
    {
      const cap = Number(opts.connector_kit_sections_per_kit ?? 1);
      setConnectorKitSectionsPerKit(cap === 2 ? 2 : 1);
    }
    if (typeof opts.merge_identical === 'boolean') {
      setMergeIdentical(opts.merge_identical);
    }
    if (typeof opts.group_by === 'string') {
      setGroupBy(opts.group_by as GroupBy);
    }
  }, [spec?.id, spec?.generation_mode, projectSettings?.version, projectSettings?.settings]);

  // PDL-ER-29: product generation is always full for guest and employee.
  const effectiveMode = 'full' as const;
  const availableGenerateVariants = useMemo(
    () => (variantContext.variants ?? []).filter((item) => item.legacy_variant_number != null),
    [variantContext.variants],
  );
  useEffect(() => {
    if (!selectedElectricalVariant?.id) return;
    setSelectedGenerateErIds((prev) => {
      if (prev.length === 0) return [selectedElectricalVariant.id];
      const stillValid = prev.filter((id) =>
        availableGenerateVariants.some((item) => item.id === id),
      );
      if (stillValid.length > 0) return stillValid;
      return selectedElectricalVariant.legacy_variant_number != null
        ? [selectedElectricalVariant.id]
        : [];
    });
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
      setPreflightOpen(false);
      setPendingGenerate(null);
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
        setPreflightSummary(
          [
            `Всего исключений: ${pf?.total_skipped_objects ?? 0}.`,
            'После подтверждения partial generation выполнится атомарно (PDL-ER-36).',
            ...lines,
          ].join('\n'),
        );
        setPreflightOpen(true);
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
  const isSpecPartial = Boolean(
    spec?.is_partial
    || (spec?.generation_options as { is_partial?: boolean } | null | undefined)?.is_partial,
  );
  const excludedGroups = (
    spec?.excluded_groups
    ?? (spec?.generation_options as { excluded_groups?: Array<{ error_code?: string; message?: string; group?: string }> } | null | undefined)
      ?.excluded_groups
    ?? []
  );
  const buildGenerateOptions = () => ({
    ex_zone: exZone,
    reserve_coefficient: reserveCoeff,
    indication_on_boxes: indicationOnBoxes,
    end_section_indication: endSectionIndication,
    top_indication: topIndication,
    min_length_for_end_indication: minLengthK2i,
    connector_kit_sections_per_kit: connectorKitSectionsPerKit,
    group_by: groupBy,
    merge_identical: mergeIdentical,
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
    const generateVariantIds = selectedGenerateErIds.length > 0
      ? selectedGenerateErIds
      : [scope.electricalVariantId];
    const options = buildGenerateOptions();
    if (!confirmPartial) {
      setPendingGenerate({ generateVariantIds, options });
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
    if (!pendingGenerate) {
      runGenerate(true);
      return;
    }
    const scope = snapshotMutationScope();
    mut.mutate({
      ...scope,
      generateVariantIds: pendingGenerate.generateVariantIds,
      mode: effectiveMode,
      options: pendingGenerate.options,
      confirmPartial: true,
    });
  };

  if (!project) {
    return (
      <EmptyProjectState
        icon={<UnorderedListOutlined style={{ marginRight: 8 }} />}
        title="Спецификация"
        description="Шаг 3 из 4. Автоматическое формирование перечня оборудования и материалов на основе расчётов."
      />
    );
  }

  if (variantContext.isLoading) {
    return (
      <Card size="small" aria-busy="true" aria-label="Загрузка списка ЭР">
        <Skeleton active title paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  if (variantContext.isError) {
    return (
      <QueryError
        error={variantContext.error}
        title="Не удалось загрузить список ЭР"
        onRetry={() => variantContext.refetch()}
        retrying={variantContext.isFetching}
      />
    );
  }

  if (!selectedElectricalVariant) {
    return (
      <Alert
        type="warning"
        showIcon
        message="ЭР ещё не создан"
        description="Завершите теплорасчёт и создайте первый ЭР на шаге 2."
        action={<Button onClick={() => navigate(ROUTES.elecCalc)}>К электрорасчёту</Button>}
      />
    );
  }

  if (variantContext.legacyVariantNumber == null) {
    return (
      <Alert
        type="warning"
        showIcon
        message={`«${selectedElectricalVariant.name}»: спецификация временно недоступна`}
        description="UUID-версия спецификации относится к Phase 5. Данные другого ЭР не подставляются."
        action={<Button onClick={() => navigate(ROUTES.elecCalc)}>Выбрать другой ЭР</Button>}
      />
    );
  }

  const hasItems = items.length > 0;

  const handleAdd = () => {
    if (!canManuallyEdit) return;
    const acc = accessories.find((a) => a.id === selectedAccessoryId);
    if (!acc || !qty || qty <= 0) return;
    const newItem: SpecificationItem = {
      category: acc.category,
      name: acc.name,
      article: acc.article,
      unit: 'шт.',
      quantity: qty,
      params: { source_id: acc.id },
      source: 'manual',
    };
    saveMut.mutate({
      ...snapshotMutationScope(),
      items: [...items, newItem],
    }, {
      onSuccess: () => {
        message.success('Позиция добавлена');
        setAddOpen(false);
        setSelectedAccessoryId(null);
        setQty(1);
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

  return (
    <div className="specification-page" data-testid="specification-page">
      {!canMutateProject && (
        <Alert
          type="info"
          showIcon
          message="Режим просмотра"
          description="Изменять или пересчитывать спецификацию может только владелец проекта или администратор."
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Toolbar: ER tabs + Обновить + Настройки */}
      <div className="specification-toolbar">
        <Tabs
          className="specification-er-tabs"
          type="card"
          size="small"
          activeKey={selectedElectricalVariant.id}
          onChange={(id) => {
            if (!scopeSwitchDisabled) variantContext.selectVariant(id);
          }}
          items={erTabItems}
          tabBarExtraContent={(
            <Space size={8} className="specification-toolbar-actions">
              <Button
                icon={<ReloadOutlined />}
                loading={mut.isPending}
                disabled={!canMutateProject}
                onClick={() => runGenerate(false)}
                aria-label={generateButtonLabel}
              >
                {generateButtonLabel}
              </Button>
              <Button
                icon={<SettingOutlined />}
                onClick={() => toggleSettings(true)}
                aria-label="Настройки"
              >
                Настройки
              </Button>
            </Space>
          )}
        />
      </div>

      {/* Compact status strip */}
      {canMutateProject && (
        <div className="specification-status-strip">
          <Text type="secondary" style={{ fontSize: 12 }}>
            {selectedElectricalVariant.name}
            {' · '}
            {isSpecStale
              ? 'устарела'
              : isSpecPartial
                ? 'НЕПОЛНАЯ'
                : hasItems
                  ? 'полная'
                  : 'не сформирована'}
            {' · '}
            позиций: {items.length}
            {isEmployee && hasItems && (
              <>
                {' · '}
                ручных: {items.filter((i) => i.source === 'manual').length}
              </>
            )}
          </Text>
        </div>
      )}

      {isSpecStale && (
        <Alert
          className="specification-empty-alert specification-stale-banner"
          type="error"
          showIcon
          message="Спецификация устарела — не для закупки / печати / отчёта"
          description="Snapshot только для просмотра. Итоги, печать, отчёт и export не используют эти количества. Сформируйте спецификацию заново."
          style={{ marginBottom: 12 }}
          action={
            <Button
              size="small"
              type="primary"
              icon={<ReloadOutlined />}
              loading={mut.isPending}
              disabled={!canMutateProject}
              onClick={() => runGenerate(false)}
            >
              Сформировать заново
            </Button>
          }
        />
      )}

      {!isSpecStale && isSpecPartial && hasItems && (
        <Alert
          className="specification-partial-banner"
          type="warning"
          showIcon
          message="Неполная спецификация — не использовать как полный закупочный комплект"
          description={
            excludedGroups.length
              ? (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {excludedGroups.map((g) => (
                      <li key={String(g.error_code || g.group || g.message)}>
                        <strong>{g.error_code || g.group}</strong>
                        {g.message ? ` — ${g.message}` : ''}
                      </li>
                    ))}
                  </ul>
                )
              : 'Часть групп BOM исключена (секции, коробки или недоказанные методики).'
          }
          style={{ marginBottom: 12 }}
        />
      )}

      {specError && !spec ? (
        <QueryError
          error={specErrorObj}
          title="Не удалось загрузить спецификацию"
          onRetry={() => refetch()}
          retrying={specFetching}
        />
      ) : specLoading ? (
        <div aria-busy="true" aria-label="Загрузка спецификации">
          <Skeleton active title={false} paragraph={{ rows: 6 }} />
        </div>
      ) : (
        <>
          {!hasItems && (
            <Alert
              className="specification-empty-alert"
              type="warning"
              showIcon
              message="Спецификация не сформирована"
              description="Убедитесь, что для всех объектов выполнен электрорасчёт (шаг 2), затем нажмите «Сформировать»."
              style={{ marginBottom: 12 }}
              action={
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    icon={<ReloadOutlined />}
                    loading={mut.isPending}
                    disabled={!canMutateProject}
                    onClick={() => runGenerate(false)}
                  >
                    Сформировать
                  </Button>
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    onClick={() => navigate(ROUTES.elecCalc)}
                  >
                    К электрорасчёту
                  </Button>
                </Space>
              }
            />
          )}

          <div className={isSpecStale ? 'spec-table-print-exclude' : undefined}>
            <SpecTable
              items={items}
              groupBy={groupBy}
              mergeIdentical={mergeIdentical}
              canDelete={canManuallyEdit && hasItems && !isSpecStale}
              isStale={isSpecStale}
              onDelete={handleDelete}
            />
          </div>
        </>
      )}

      {/* Footer: timestamp + report */}
      <div className="specification-footer">
        <Text type="secondary" className="specification-footer-meta">
          {hasItems && formedAt
            ? `Спецификация сформирована: ${formedAt}`
            : hasItems
              ? 'Спецификация сформирована'
              : 'Спецификация ещё не сформирована'}
        </Text>
        <Button
          icon={<DownloadOutlined />}
          onClick={() => navigate(ROUTES.report)}
          disabled={!hasItems || isSpecStale}
        >
          Сформировать отчёт
        </Button>
      </div>

      {/* Settings drawer — параметры генерации и группировки */}
      <Drawer
        title="Настройки спецификации"
        placement="right"
        width={400}
        open={settingsOpen}
        onClose={() => toggleSettings(false)}
        destroyOnClose={false}
        className="specification-settings-drawer"
      >
        <div className="specification-settings-body" data-testid="spec-params-panel">
          <section className="specification-settings-section">
            <Text strong>ЭР и резерв R,гр</Text>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, margin: '6px 0 10px' }}>
              Канонический режим: полный data-driven BOM (PDL-ER-29).
            </Text>
            <div className="workflow-params-row">
              <Text className="workflow-params-label">ЭР для генерации</Text>
              <Select
                mode="multiple"
                size="small"
                allowClear
                style={{ minWidth: 220, width: '100%' }}
                placeholder="Выберите ЭР"
                value={selectedGenerateErIds}
                onChange={(ids: string[]) => setSelectedGenerateErIds(ids)}
                options={availableGenerateVariants.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                aria-label="Выбор ЭР для генерации спецификации"
              />
            </div>
            <div className="workflow-params-row" style={{ marginTop: 8 }}>
              <Button
                size="small"
                onClick={() => setSelectedGenerateErIds(availableGenerateVariants.map((item) => item.id))}
                disabled={availableGenerateVariants.length === 0}
              >
                Выбрать все
              </Button>
            </div>
            <div className="workflow-params-row" style={{ marginTop: 12 }}>
              <Text className="workflow-params-label">Коэффициент горячего резервирования R,гр (1–3)</Text>
              <InputNumber
                aria-label="Резерв R,гр"
                min={1}
                max={3}
                step={0.1}
                size="small"
                disabled={!canMutateProject || !fullModeActive}
                value={reserveCoeff}
                onChange={(v) => setReserveCoeff(Number(v ?? 1))}
                style={{ width: '100%' }}
              />
            </div>
            <div className="workflow-params-row" style={{ marginTop: 12 }}>
              <Text className="workflow-params-label">
                Соединительный комплект: секций на 1 шт. (PDF §7.10)
              </Text>
              <Select
                size="small"
                style={{ width: '100%' }}
                disabled={!canMutateProject || !fullModeActive}
                value={connectorKitSectionsPerKit}
                onChange={(v: 1 | 2) => setConnectorKitSectionsPerKit(v)}
                options={[
                  { value: 1, label: '1 — КСН-1 / КСВ-1 (по умолчанию)' },
                  { value: 2, label: '2 — КСН-2 / КСВ-2' },
                ]}
                aria-label="Секций на соединительный комплект"
              />
            </div>
          </section>

          <section className="specification-settings-section">
            <Text strong>Требования ТНП (Ex и индикация)</Text>
            <Space direction="vertical" size={6} style={{ marginTop: 10, width: '100%' }}>
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={exZone}
                onChange={(e) => setExZone(e.target.checked)}
              >
                Взрывоопасная зона (Ex)
              </Checkbox>
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={indicationOnBoxes}
                onChange={(e) => setIndicationOnBoxes(e.target.checked)}
              >
                Индикация питания на коробках (К1i)
              </Checkbox>
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={endSectionIndication}
                onChange={(e) => setEndSectionIndication(e.target.checked)}
              >
                Индикация в конце нагревательной секции (К2i)
              </Checkbox>
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={topIndication}
                onChange={(e) => setTopIndication(e.target.checked)}
              >
                Индикация сверху коробки (Кiu)
              </Checkbox>
              {fullModeActive && endSectionIndication && (
                <div>
                  <Text className="workflow-params-label">
                    Мин. длина секции для К2i (L,К2i), м
                  </Text>
                  <InputNumber
                    aria-label="Мин. длина секции для К2i"
                    min={0}
                    step={10}
                    size="small"
                    disabled={!canMutateProject}
                    value={minLengthK2i}
                    onChange={(v) => setMinLengthK2i(Number(v ?? 0))}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </div>
              )}
            </Space>
          </section>

          <section className="specification-settings-section">
            <Text strong>Отображение</Text>
            <div style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: '#888' }}>Группировка</Text>
              <Segmented<GroupBy>
                block
                size="small"
                value={groupBy}
                onChange={setGroupBy}
                options={[
                  { label: 'Тип', value: 'object_section' },
                  { label: 'Кат.', value: 'category' },
                  { label: 'Ед.', value: 'unit' },
                  { label: 'Нет', value: 'none' },
                ]}
                style={{ marginTop: 4 }}
              />
              <Checkbox
                checked={mergeIdentical}
                onChange={(e) => setMergeIdentical(e.target.checked)}
                style={{ fontSize: 12, marginTop: 10 }}
              >
                Объединить одинаковые (base+код)
              </Checkbox>
            </div>
            <div
              style={{
                marginTop: 12,
                padding: '8px 10px',
                background: '#f6f8fa',
                borderRadius: 6,
                border: '1px solid #e8e8e8',
              }}
            >
              <Text style={{ fontSize: 12, display: 'block' }}>
                Позиций: <strong>{items.length}</strong>
                {' · '}
                категорий: <strong>{categoriesCount}</strong>
              </Text>
              {projectSettings?.version != null && (
                <Text style={{ fontSize: 11, color: '#888', display: 'block', marginTop: 4 }}>
                  Project defaults v{projectSettings.version}
                  {typeof spec?.generation_options?.settings_version === 'number'
                    ? ` · snapshot v${spec.generation_options.settings_version as number}`
                    : ''}
                </Text>
              )}
            </div>
          </section>

          <section className="specification-settings-section">
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                block
                loading={mut.isPending}
                disabled={!canMutateProject}
                onClick={() => {
                  runGenerate(false);
                  toggleSettings(false);
                }}
              >
                {hasItems ? 'Пересчитать' : 'Сформировать'}
              </Button>
              <Button
                block
                loading={saveDefaultsMut.isPending}
                disabled={!canMutateProject}
                onClick={() => saveDefaultsMut.mutate()}
                aria-label="Сохранить defaults спецификации"
              >
                Сохранить defaults
              </Button>
              {canManuallyEdit && (
                <Button
                  icon={<PlusOutlined />}
                  block
                  disabled={!hasItems || isSpecStale}
                  onClick={() => {
                    toggleSettings(false);
                    setAddOpen(true);
                  }}
                >
                  Добавить из БД
                </Button>
              )}
            </Space>
          </section>
        </div>
      </Drawer>

      <Modal
        title="Добавить позицию из расширенной БД"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleAdd}
        confirmLoading={saveMut.isPending}
        okText="Добавить"
        cancelText="Отмена"
        okButtonProps={{ disabled: !selectedAccessoryId || qty <= 0 }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select<string>
            showSearch
            placeholder="Выберите аксессуар"
            value={selectedAccessoryId ?? undefined}
            onChange={setSelectedAccessoryId}
            style={{ width: '100%' }}
            optionFilterProp="label"
            options={accessories.map((a: AccessoryExtendedInfo) => ({
              value: a.id,
              label: `${a.category} · ${a.name}${a.article ? ` (${a.article})` : ''}`,
            }))}
          />
          <InputNumber
            min={0.1}
            step={1}
            value={qty}
            onChange={(v) => setQty(Number(v ?? 1))}
            style={{ width: '100%' }}
            placeholder="Количество"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Ручные позиции помечены тегом «ручная». При пересчёте они удаляются — добавьте
            заново после генерации.
          </Text>
        </Space>
      </Modal>
      <Modal
        title="Подтверждение partial-генерации"
        open={preflightOpen}
        onCancel={() => {
          setPreflightOpen(false);
          setPendingGenerate(null);
        }}
        onOk={confirmPartialGenerate}
        okText="Подтвердить и сформировать"
        cancelText="Отмена"
        confirmLoading={mut.isPending}
      >
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
          {preflightSummary}
        </pre>
      </Modal>
    </div>
  );
}
