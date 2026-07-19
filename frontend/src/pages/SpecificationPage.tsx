import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  generateSpecification,
  getSpecification,
  listAccessoriesExtended,
  saveSpecificationItems,
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

type GroupBy = 'none' | 'category' | 'unit';

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

  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [addOpen, setAddOpen] = useState(false);
  const [selectedAccessoryId, setSelectedAccessoryId] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);
  // Режим спецификации: базовая или полная (PDL-ER-04 — full auto BOM доступен гостю).
  // Ручное редактирование позиций по-прежнему только employee/admin.
  const [specMode, setSpecMode] = useState<'basic' | 'full'>('basic');
  // PDL-ER-01: explicit multi-ЭР selection for generation; never implicit all-on-open.
  const [selectedGenerateErIds, setSelectedGenerateErIds] = useState<string[]>([]);
  const [exZone, setExZone] = useState(false);
  const [reserveCoeff, setReserveCoeff] = useState<number>(1);
  // Опции индикации ТНП: К1i / К2i / Кiu / L,К2i
  const [indicationOnBoxes, setIndicationOnBoxes] = useState(false);
  const [endSectionIndication, setEndSectionIndication] = useState(false);
  const [topIndication, setTopIndication] = useState(false);
  const [minLengthK2i, setMinLengthK2i] = useState<number>(0);
  // Блок заполнения параметров (аналог SC-03) — только для сотрудника
  const [paramsPanelVisible, setParamsPanelVisible] = useState<boolean>(
    () => readStorageJson(SPEC_PARAMS_PANEL_STORAGE_KEY) !== false,
  );
  const toggleParamsPanel = (visible: boolean) => {
    setParamsPanelVisible(visible);
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

  const { data: accessories = [] } = useQuery({
    queryKey: referenceQueryKeys.accessoriesExtended,
    queryFn: listAccessoriesExtended,
    enabled: canManuallyEdit,
    ...referenceQueryOptions,
  });

  // Восстанавливаем режим и опции последней генерации после reload/смены CO,
  // чтобы «Пересчитать» не подменял полный BOM базовым.
  useEffect(() => {
    if (!spec) return;
    if (spec.generation_mode === 'full' || spec.generation_mode === 'basic') {
      setSpecMode(spec.generation_mode);
    }
    const opts = spec.generation_options;
    if (opts) {
      setExZone(Boolean(opts.ex_zone));
      setReserveCoeff(Number(opts.reserve_coefficient ?? 1));
      setIndicationOnBoxes(Boolean(opts.indication_on_boxes));
      setEndSectionIndication(Boolean(opts.end_section_indication));
      setTopIndication(Boolean(opts.top_indication));
      setMinLengthK2i(Number(opts.min_length_for_end_indication ?? 0));
    }
    // Перезапускаем только при смене сохранённого режима/записи, не при каждом refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.id, spec?.generation_mode]);

  // PDL-ER-04: guest may generate full automatic BOM; only manual item CRUD is employee-only.
  const effectiveMode = canMutateProject ? specMode : 'basic';
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
    }: GenerateSpecificationVariables & { generateVariantIds: string[] }) => {
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
      );
    },
    onSuccess: (result, variables) => {
      const generatedCount = result.results?.length ?? 1;
      message.success(
        generatedCount > 1
          ? `Спецификация (${result.mode === 'full' ? 'полная' : 'базовая'}) сформирована для ${generatedCount} ЭР`
          : `Спецификация (${result.mode === 'full' ? 'полная' : 'базовая'}) для «${variables.electricalVariantName}» сгенерирована`
      );
      if (result.mode === 'full' && result.skipped_objects > 0) {
        message.warning(
          `Объектов без успешного электрорасчёта: ${result.skipped_objects} — они не вошли в полную спецификацию`
        );
      }
      // Invalidate all selected ER specs after multi-generate.
      for (const id of variables.generateVariantIds) {
        qc.invalidateQueries({
          queryKey: ['spec', variables.projectId, id],
          exact: false,
        });
      }
    },
    onError: (e: Error) => message.error(e.message),
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
  const runGenerate = () => {
    const scope = snapshotMutationScope();
    const generateVariantIds = selectedGenerateErIds.length > 0
      ? selectedGenerateErIds
      : [scope.electricalVariantId];
    mut.mutate({
      ...scope,
      generateVariantIds,
      mode: effectiveMode,
      options: effectiveMode === 'full'
        ? {
            ex_zone: exZone,
            reserve_coefficient: reserveCoeff,
            indication_on_boxes: indicationOnBoxes,
            end_section_indication: endSectionIndication,
            top_indication: topIndication,
            min_length_for_end_indication: minLengthK2i,
          }
        : undefined,
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

  const fullModeActive = specMode === 'full';

  return (
    <>
      {!canMutateProject && (
        <Alert
          type="info"
          showIcon
          message="Режим просмотра"
          description="Изменять или пересчитывать спецификацию может только владелец проекта или администратор."
          style={{ marginBottom: 8 }}
        />
      )}

      {canMutateProject && (
        <div
          className="common-data-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 5,
          }}
        >
          <span>
            <span className="label">
              {selectedElectricalVariant.name} · спецификация: {fullModeActive ? 'полная (BOM ТНП)' : 'базовая'} ·{' '}
            </span>
            позиций: {items.length}
          </span>
          <Checkbox
            className="actionbar-form-toggle"
            checked={paramsPanelVisible}
            onChange={(event) => toggleParamsPanel(event.target.checked)}
          >
            Показать блок заполнения параметров
          </Checkbox>
        </div>
      )}

      {canMutateProject && paramsPanelVisible && (
        <div
          className="form-grid-srs workflow-params-panel"
          data-testid="spec-params-panel"
          style={{ marginBottom: 5 }}
        >
          <div className="form-col-srs">
            <h4 data-step={1}><span>Режим и резерв</span></h4>
            <div className="workflow-params-row">
              <Text className="workflow-params-label">Режим спецификации</Text>
              <Segmented<'basic' | 'full'>
                size="small"
                value={specMode}
                disabled={!canMutateProject}
                onChange={setSpecMode}
                options={[
                  { label: 'Базовая', value: 'basic' },
                  { label: 'Полная', value: 'full' },
                ]}
              />
            </div>
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
            <div className="workflow-params-row">
              <Button
                size="small"
                onClick={() => setSelectedGenerateErIds(availableGenerateVariants.map((item) => item.id))}
                disabled={availableGenerateVariants.length === 0}
              >
                Выбрать все
              </Button>
            </div>
            <div className="workflow-params-row">
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
                className="workflow-params-input"
              />
            </div>
            {!fullModeActive && (
              <Text className="workflow-params-hint">
                Базовая: кабель + минимум аксессуаров. Полная — условный BOM по
                ТНП (коробки СКВ, комплекты КСН/КСВ/КСР, вводы, крепёж, ленты).
              </Text>
            )}
          </div>
          <div className="form-col-srs">
            <h4 data-step={2}><span>Требования ТНП (Ex и индикация)</span></h4>
            <div className="workflow-params-row">
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={exZone}
                onChange={(e) => setExZone(e.target.checked)}
              >
                <span style={{ fontSize: 12 }}>Взрывоопасная зона (Ex)</span>
              </Checkbox>
            </div>
            <div className="workflow-params-row">
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={indicationOnBoxes}
                onChange={(e) => setIndicationOnBoxes(e.target.checked)}
              >
                <span style={{ fontSize: 12 }}>Индикация питания на коробках (К1i)</span>
              </Checkbox>
            </div>
            <div className="workflow-params-row">
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={endSectionIndication}
                onChange={(e) => setEndSectionIndication(e.target.checked)}
              >
                <span style={{ fontSize: 12 }}>Индикация в конце нагревательной секции (К2i)</span>
              </Checkbox>
            </div>
            <div className="workflow-params-row">
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={topIndication}
                onChange={(e) => setTopIndication(e.target.checked)}
              >
                <span style={{ fontSize: 12 }}>Индикация сверху коробки (Кiu)</span>
              </Checkbox>
            </div>
            {fullModeActive && endSectionIndication && (
              <div className="workflow-params-row">
                <Text className="workflow-params-label">Минимальная длина нагревательной секции для К2i (L,К2i), м</Text>
                <InputNumber
                  aria-label="Мин. длина секции для К2i"
                  min={0}
                  step={10}
                  size="small"
                  disabled={!canMutateProject}
                  value={minLengthK2i}
                  onChange={(v) => setMinLengthK2i(Number(v ?? 0))}
                  className="workflow-params-input"
                />
              </div>
            )}
            {!fullModeActive && (
              <Text className="workflow-params-hint">
                Требования применяются в режиме «Полная».
              </Text>
            )}
          </div>
        </div>
      )}

      <Row className="specification-page-layout" gutter={12} align="top">
        <Col className="specification-page-sidebar" flex="0 0 240px">
          <Card size="small" style={{ height: '100%' }}>
            <div style={{ marginBottom: 10 }}>
              <Text strong style={{ fontSize: 13 }}>
                <UnorderedListOutlined style={{ marginRight: 5, color: '#1a5276' }} />
                Спецификация
              </Text>
            </div>

            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                block
                size="small"
                loading={mut.isPending}
                disabled={!canMutateProject}
                onClick={runGenerate}
              >
                {hasItems ? 'Пересчитать' : 'Сформировать'}
              </Button>

              {/* Режим и параметры полного BOM — в блоке заполнения параметров
                  над таблицей (workflow-params-panel), как на SC-03. */}

              {canManuallyEdit && (
                <Button
                  icon={<PlusOutlined />}
                  block
                  size="small"
                  disabled={!hasItems}
                  onClick={() => setAddOpen(true)}
                >
                  Добавить из БД
                </Button>
              )}

              <div>
                <Text style={{ fontSize: 11, color: '#888' }}>Группировка</Text>
                <Segmented<GroupBy>
                  block
                  size="small"
                  value={groupBy}
                  onChange={setGroupBy}
                  options={[
                    { label: 'Нет', value: 'none' },
                    { label: 'Кат.', value: 'category' },
                    { label: 'Ед.', value: 'unit' },
                  ]}
                  style={{ marginTop: 4 }}
                />
              </div>

              <div
                style={{
                  marginTop: 6,
                  padding: '6px 8px',
                  background: '#f6f8fa',
                  borderRadius: 6,
                  border: '1px solid #e8e8e8',
                }}
              >
                <Text style={{ fontSize: 11, display: 'block' }}>
                  Позиций: <strong>{items.length}</strong>
                </Text>
                {isSpecStale && (
                  <Text style={{ fontSize: 11, color: '#d46b08', display: 'block' }}>
                    Статус: <strong>устарела</strong>
                  </Text>
                )}
                <Text style={{ fontSize: 11, display: 'block' }}>
                  Категорий: <strong>{categoriesCount}</strong>
                </Text>
                {isEmployee && (
                  <Text style={{ fontSize: 11, color: '#722ed1' }}>
                    Ручных: <strong>
                      {items.filter((i) => i.source === 'manual').length}
                    </strong>
                  </Text>
                )}
              </div>
            </Space>
          </Card>
        </Col>

        <Col className="specification-page-main" flex="1" style={{ minWidth: 0 }}>
          <Card
            size="small"
            title={<Text strong>Окно спецификаций</Text>}
            styles={{ body: { paddingTop: 8 } }}
          >
            {isSpecStale && (
              <Alert
                className="specification-empty-alert"
                type="warning"
                showIcon
                message="Спецификация устарела"
                description="После изменения объектов старые позиции нельзя использовать для закупки. Сформируйте спецификацию заново."
                style={{ marginBottom: 16 }}
                action={
                  <Button
                    size="small"
                    type="primary"
                    icon={<ReloadOutlined />}
                    loading={mut.isPending}
                    disabled={!canMutateProject}
                    onClick={runGenerate}
                  >
                    Сформировать заново
                  </Button>
                }
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
                    style={{ marginBottom: 16 }}
                    action={
                      <Button
                        size="small"
                        icon={<ThunderboltOutlined />}
                        onClick={() => navigate(ROUTES.elecCalc)}
                      >
                        К электрорасчёту
                      </Button>
                    }
                  />
                )}

                <SpecTable
                  items={items}
                  groupBy={groupBy}
                  canDelete={canManuallyEdit && hasItems}
                  isStale={isSpecStale}
                  onDelete={handleDelete}
                />
              </>
            )}

            {/* Переключатель вариантов системы (по эскизу Прил. 4 Рис. 3) */}
            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: '1px solid #e8e8e8',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 11, color: '#888' }}>ЭР:</Text>
              <div style={{ maxWidth: '100%', overflowX: 'auto', paddingBottom: 4 }}>
                <Segmented<string>
                  value={selectedElectricalVariant.id}
                  onChange={variantContext.selectVariant}
                  disabled={mut.isPending || saveMut.isPending}
                  size="small"
                  options={variantContext.variants.map((item) => ({
                    label: item.name,
                    value: item.id,
                    disabled: item.legacy_variant_number == null,
                  }))}
                />
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Спецификация и расчёт сохраняются отдельно для каждого варианта.
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

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
    </>
  );
}
