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
import {
  normalizeCalculationVariant,
  useCalculationVariantStore,
} from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import SpecTable from '@/components/specification/SpecTable';
import QueryError from '@/components/common/QueryError';
import EmptyProjectState from '@/components/common/EmptyProjectState';
import { ROUTES } from '@/routes/routes';
import { readStorageJson } from '@/utils/storage';
import type { SpecificationItem } from '@/types/specification';

const { Text } = Typography;

const SPEC_PARAMS_PANEL_STORAGE_KEY = 'tlt-spec-params-panel';

type GroupBy = 'none' | 'category' | 'unit';

export default function SpecificationPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const isEmployee = role === 'employee' || role === 'admin';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const storedVariant = useCalculationVariantStore((s) =>
    project?.id ? s.variantByProject[project.id] : undefined
  );
  const saveVariant = useCalculationVariantStore((s) => s.setVariant);
  const variant = normalizeCalculationVariant(storedVariant);
  const setVariant = (nextVariant: number) => {
    if (project?.id) saveVariant(project.id, nextVariant);
  };

  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [addOpen, setAddOpen] = useState(false);
  const [selectedAccessoryId, setSelectedAccessoryId] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);
  // Режим спецификации: базовая (кабель + минимум) или полная (условный BOM ТНП).
  // Полная доступна только Сотруднику/Админу.
  const [specMode, setSpecMode] = useState<'basic' | 'full'>('basic');
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
    queryKey: ['spec', project?.id, variant],
    queryFn: () => getSpecification(project!.id, variant),
    enabled: !!project,
  });

  const { data: accessories = [] } = useQuery({
    queryKey: referenceQueryKeys.accessoriesExtended,
    queryFn: listAccessoriesExtended,
    enabled: isEmployee,
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

  const effectiveMode = isEmployee ? specMode : 'basic';
  const mut = useMutation({
    mutationFn: () =>
      generateSpecification(
        project!.id,
        variant,
        effectiveMode,
        effectiveMode === 'full'
          ? {
              ex_zone: exZone,
              reserve_coefficient: reserveCoeff,
              indication_on_boxes: indicationOnBoxes,
              end_section_indication: endSectionIndication,
              top_indication: topIndication,
              min_length_for_end_indication: minLengthK2i,
            }
          : undefined
      ),
    onSuccess: (result) => {
      message.success(
        `Спецификация (${result.mode === 'full' ? 'полная' : 'базовая'}) для CO${variant} сгенерирована`
      );
      if (result.mode === 'full' && result.skipped_objects > 0) {
        message.warning(
          `Объектов без успешного электрорасчёта: ${result.skipped_objects} — они не вошли в полную спецификацию`
        );
      }
      refetch();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (items: SpecificationItem[]) =>
      saveSpecificationItems(project!.id, items, variant),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spec', project?.id, variant] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const items: SpecificationItem[] = useMemo(
    () => (spec?.items as SpecificationItem[]) ?? [],
    [spec]
  );
  const isSpecStale = spec?.is_stale === true;

  if (!project) {
    return (
      <EmptyProjectState
        icon={<UnorderedListOutlined style={{ marginRight: 8 }} />}
        title="Спецификация"
        description="Шаг 3 из 4. Автоматическое формирование перечня оборудования и материалов на основе расчётов."
      />
    );
  }

  const hasItems = items.length > 0;

  const handleAdd = () => {
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
    saveMut.mutate([...items, newItem], {
      onSuccess: () => {
        message.success('Позиция добавлена');
        setAddOpen(false);
        setSelectedAccessoryId(null);
        setQty(1);
      },
    });
  };

  const handleDelete = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    saveMut.mutate(next, {
      onSuccess: () => message.success('Позиция удалена'),
    });
  };

  const categoriesCount = new Set(items.map((i) => i.category)).size;

  const fullModeActive = specMode === 'full';

  return (
    <>
      {isEmployee && (
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
              СО{variant} · спецификация: {fullModeActive ? 'полная (BOM ТНП)' : 'базовая'} ·{' '}
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

      {isEmployee && paramsPanelVisible && (
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
                onChange={setSpecMode}
                options={[
                  { label: 'Базовая', value: 'basic' },
                  { label: 'Полная', value: 'full' },
                ]}
              />
            </div>
            <div className="workflow-params-row">
              <Text className="workflow-params-label">Коэффициент горячего резервирования R,гр (1–3)</Text>
              <InputNumber
                aria-label="Резерв R,гр"
                min={1}
                max={3}
                step={0.1}
                size="small"
                disabled={!fullModeActive}
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
                disabled={!fullModeActive}
                checked={exZone}
                onChange={(e) => setExZone(e.target.checked)}
              >
                <span style={{ fontSize: 12 }}>Взрывоопасная зона (Ex)</span>
              </Checkbox>
            </div>
            <div className="workflow-params-row">
              <Checkbox
                disabled={!fullModeActive}
                checked={indicationOnBoxes}
                onChange={(e) => setIndicationOnBoxes(e.target.checked)}
              >
                <span style={{ fontSize: 12 }}>Индикация питания на коробках (К1i)</span>
              </Checkbox>
            </div>
            <div className="workflow-params-row">
              <Checkbox
                disabled={!fullModeActive}
                checked={endSectionIndication}
                onChange={(e) => setEndSectionIndication(e.target.checked)}
              >
                <span style={{ fontSize: 12 }}>Индикация в конце нагревательной секции (К2i)</span>
              </Checkbox>
            </div>
            <div className="workflow-params-row">
              <Checkbox
                disabled={!fullModeActive}
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
                onClick={() => mut.mutate()}
              >
                {hasItems ? 'Пересчитать' : 'Сформировать'}
              </Button>

              {/* Режим и параметры полного BOM — в блоке заполнения параметров
                  над таблицей (workflow-params-panel), как на SC-03. */}

              {isEmployee && (
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
                    onClick={() => mut.mutate()}
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
                  canDelete={isEmployee && hasItems}
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
              <Text style={{ fontSize: 11, color: '#888' }}>Вариант системы:</Text>
              <Segmented<number>
                value={variant}
                onChange={(v) => setVariant(Number(v))}
                size="small"
                options={[1, 2, 3, 4].map((n) => ({ label: `СО${n}`, value: n }))}
              />
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
