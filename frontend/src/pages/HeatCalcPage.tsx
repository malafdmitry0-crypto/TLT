import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Dropdown,
  InputNumber,
  Popconfirm,
  Select,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message as antdMessage,
} from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  DatabaseOutlined,
  FireOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import ObjectWizard from '@/components/wizard/ObjectWizard';
import ImportExcelButton from '@/components/ImportExcelButton';
import ExportObjectsButton from '@/components/ExportObjectsButton';
import EmptyProjectState from '@/components/common/EmptyProjectState';
import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import { MATERIAL_LABELS } from '@/constants/materials';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { listObjects } from '@/api/projects';
import {
  batchCalcElectrical,
  listCables,
  listElectricalCalcs,
  selectCableManual,
  type CableSource,
} from '@/api/calculations';
import { useHeatCalcMutations } from '@/hooks/useHeatCalcMutations';
import { useElectricalStats } from '@/hooks/useElectricalStats';
import { isElectricalCalcSuccess, electricalCalcError } from '@/utils/calcStatus';
import type { ProjectObject } from '@/types/project';
import { formatNumber, formatPower } from '@/utils/formatters';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';
import { ROUTES } from '@/routes/routes';

const { Text } = Typography;

/** В MVP мастер знает только две формы — трубу и резервуар. */
type WizardObjectType = 'pipe' | 'tank';
type CableTypeKey = 'self_regulating' | 'single_core' | 'three_core' | 'mineral' | 'skin';

const CABLE_TYPE_LABEL: Record<CableTypeKey, string> = {
  self_regulating: 'Саморегулирующийся',
  single_core: 'Однож. пост. мощн.',
  three_core: 'Трёхж. пост. мощн.',
  mineral: 'С мин. изоляцией',
  skin: 'Скин-система',
};

interface WizardState {
  type: WizardObjectType;
  editingObject?: ProjectObject;
}

/** Статус-бейдж в левой панели: «N объектов, все рассчитаны» или «не рассчитано M». */
function ObjectCountBadge({
  total,
  valid,
}: {
  total: number;
  valid: number;
}) {
  if (total === 0) return null;
  return (
    <div className="object-count-badge" aria-label="Статус объектов">
      <span className="object-count-segment">
        Объектов: <strong>{total}</strong>
      </span>
      {valid < total ? (
        <span className="object-count-segment warning">
          Не рассчитано: <strong>{total - valid}</strong>
        </span>
      ) : (
        <span className="object-count-segment success">Все рассчитаны ✓</span>
      )}
    </div>
  );
}

export default function HeatCalcPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const isEmployee = role === 'employee' || role === 'admin';
  const [wizardState, setWizardState] = useState<WizardState | null>(null);
  const [tableTab, setTableTab] = useState<'source' | 'results'>('source');
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [elecVariant, setElecVariant] = useState<number>(1);
  const [cableSource, setCableSource] = useState<CableSource>('builtin');
  const [cableType, setCableType] = useState<CableTypeKey>('self_regulating');
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: objects = [] } = useQuery({
    queryKey: ['project', project?.id, 'objects'],
    queryFn: () => listObjects(project!.id),
    enabled: !!project,
  });

  const { data: elecCalcs = [] } = useQuery({
    queryKey: ['project', project?.id, 'electrical-calcs', elecVariant],
    queryFn: () => listElectricalCalcs(project!.id),
    enabled: !!project,
    select: (rows) => rows.filter((c) => c.variant_number === elecVariant),
  });

  const effectiveSource: CableSource = isEmployee ? cableSource : 'builtin';
  const { data: cables = [] } = useQuery({
    queryKey: ['references', 'cables', effectiveSource],
    queryFn: () => listCables(effectiveSource),
    enabled: !!project,
    staleTime: 5 * 60_000,
  });

  const elecStats = useElectricalStats(objects, elecCalcs);
  const cableOptions = useMemo(
    () => cables.map((c) => ({ value: c.model, label: `${c.model} · ${c.power_per_meter} Вт/м` })),
    [cables],
  );

  const batchElecMut = useMutation({
    mutationFn: () => batchCalcElectrical(project!.id, effectiveSource, elecVariant),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-calcs'] });
      if (res.errors.length > 0) {
        antdMessage.warning(`СО${elecVariant} · рассчитано: ${res.calculated}, пропущено: ${res.skipped}.`);
      } else {
        antdMessage.success(`СО${elecVariant} — расчёт выполнен для ${res.calculated} объектов`);
      }
    },
    onError: (e: Error) => antdMessage.error(e.message),
  });

  const manualCableMut = useMutation({
    mutationFn: ({ objectId, mark }: { objectId: string; mark: string }) =>
      selectCableManual(objectId, mark, effectiveSource, elecVariant),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-calcs'] });
      antdMessage.success('Кабель выбран, расчёт обновлён');
    },
    onError: (e: Error) => antdMessage.error(e.message),
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return;
      if (selectedRowKeys.length === 0) return;
      // Don't hijack copy when text is selected in an input
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const selected = objects.filter((o) => selectedRowKeys.includes(o.id));
      const isResults = tableTab === 'results';

      const header = isResults
        ? ['Тип', 'Наименование', 'Ø, мм', 'L, м', 'δ ИЗ, мм', 'Материал ИЗ', 'T прод., °C', 'T окр., °C', 'q, Вт/м', 'Q сум., Вт', 'Марка кабеля', 'Шаг навива, мм', 'Длина каб., м', 'Мощность, Вт', 'Ток, А', 'Статус', 'Сообщение']
        : ['Тип', 'Наименование', 'Ø, мм', 'L, м', 'δ ИЗ, мм', 'Материал ИЗ', 'T прод., °C', 'T окр., °C'];

      const rows = selected.map((r) => {
        const base = [
          r.object_type === 'pipe' ? 'Труба' : 'Резервуар',
          String(r.params?.name ?? ''),
          r.object_type === 'pipe'
            ? formatNumber(Number(r.params?.outer_diameter) * 1000, 0)
            : formatNumber(Number(r.params?.diameter) * 1000, 0),
          r.object_type === 'pipe' ? formatNumber(Number(r.params?.pipe_length), 1) : '—',
          formatNumber(Number(r.params?.insulation_thickness) * 1000, 0),
          MATERIAL_LABELS[String(r.params?.insulation_material)] ?? String(r.params?.insulation_material ?? ''),
          formatNumber(Number(r.params?.process_temperature), 0),
          formatNumber(Number(r.params?.ambient_temperature), 0),
        ];
        if (!isResults) return base;
        const calc = elecStats.calcByObjectId[r.id];
        const error = electricalCalcError(calc);
        return [
          ...base,
          r.object_type === 'pipe'
            ? formatNumber(Number(r.results?.heat_loss_per_meter), 1)
            : formatNumber(Number(r.results?.heat_loss_per_m2), 1),
          r.results ? formatPower(Number(r.results.total_heat_loss)) : '—',
          calc?.cable_mark ?? '',
          formatNumber(Number(calc?.results?.winding_pitch), 0),
          formatNumber(Number(calc?.results?.cable_length), 1),
          formatPower(Number(calc?.results?.total_power)),
          formatNumber(Number(calc?.results?.current), 2),
          !r.is_valid ? 'тепл. ошибка' : isElectricalCalcSuccess(calc) ? 'рассчитан' : error ? 'эл. ошибка' : 'не рассчитан',
          error ?? '',
        ];
      });

      copyToClipboard(buildTsv([header, ...rows])).then(() => {
        antdMessage.success(`Скопировано строк: ${selected.length}`);
      });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedRowKeys, objects, tableTab, elecStats.calcByObjectId]);

  const closeWizard = () => setWizardState(null);
  const { add, edit, remove, batchCalc } = useHeatCalcMutations(
    project?.id,
    closeWizard,
    closeWizard,
  );

  if (!project) {
    return (
      <EmptyProjectState
        icon={<FireOutlined style={{ marginRight: 8, color: '#e06c1e' }} />}
        title="Расчёт теплопотерь"
        description="Шаг 1 из 4. Добавьте объекты (трубопроводы, резервуары) вручную или импортом из Excel / CSV — система автоматически рассчитает тепловые потери."
      />
    );
  }

  const validCount = objects.filter((o) => o.is_valid).length;
  const totalCount = objects.length;
  const cableTypeOptions = (Object.keys(CABLE_TYPE_LABEL) as CableTypeKey[]).map((k) => ({
    label: k === 'self_regulating'
      ? CABLE_TYPE_LABEL[k]
      : <Tooltip title="Будет доступно в следующей версии">{CABLE_TYPE_LABEL[k]}</Tooltip>,
    value: k,
    disabled: k !== 'self_regulating',
  }));
  const showInKW = elecStats.totalPower >= 1000;
  const powerDisplay = showInKW
    ? `${(elecStats.totalPower / 1000).toFixed(2)} кВт`
    : `${elecStats.totalPower.toFixed(0)} Вт`;
  const formCaptionTitle = wizardState
    ? wizardState.editingObject
      ? `Параметры объекта «${String(
          wizardState.editingObject.params?.name ?? OBJECT_TYPE_LABELS[wizardState.type],
        )}»`
      : `Параметры: ${OBJECT_TYPE_LABELS[wizardState.type]}`
    : 'Параметры объекта';
  const formCaptionMode = wizardState?.editingObject ? 'edit' : wizardState ? 'new' : 'idle';
  const formCaptionModeLabel =
    formCaptionMode === 'edit'
      ? 'Режим: редактирование'
      : formCaptionMode === 'new'
        ? 'новая запись'
        : 'выберите строку или нажмите «＋ Добавить»';

  function openAddWizard(type: WizardObjectType) {
    setWizardState({ type });
  }

  function openEditWizard(obj: ProjectObject) {
    // Редактировать можно только те типы, которые умеем — MVP: трубы и резервуары.
    // Другие типы (pump/platform/other) пока не имеют форм мастера.
    if (obj.object_type !== 'pipe' && obj.object_type !== 'tank') return;
    setWizardState({ type: obj.object_type, editingObject: obj });
  }

  function handleWizardSubmit(params: Record<string, unknown>) {
    if (wizardState?.editingObject) {
      edit.mutate({ objectId: wizardState.editingObject.id, params });
    } else if (wizardState) {
      add.mutate({
        object_type: wizardState.type,
        params,
        sort_order: objects.length,
      });
    }
  }

  function duplicateCurrentObject() {
    const source = wizardState?.editingObject;
    if (!source || (source.object_type !== 'pipe' && source.object_type !== 'tank')) return;
    const sourceName = String(source.params?.name ?? OBJECT_TYPE_LABELS[source.object_type]);
    add.mutate({
      object_type: source.object_type,
      params: {
        ...source.params,
        name: `${sourceName} (копия)`,
      },
      sort_order: objects.length,
    });
  }

  function removeCurrentObject() {
    const source = wizardState?.editingObject;
    if (!source) return;
    remove.mutate(source.id);
  }

  const selectedRowId = wizardState?.editingObject?.id;
  const sourceColumns = [
    { title: '№', width: 42, render: (_: unknown, __: ProjectObject, idx: number) => idx + 1 },
    {
      title: 'Тип',
      width: 70,
      render: (_: unknown, r: ProjectObject) => (r.object_type === 'pipe' ? 'Тр.' : 'Рез.'),
    },
    {
      title: 'Наименование',
      dataIndex: ['params', 'name'],
      width: 240,
      ellipsis: true,
      render: (v: unknown, r: ProjectObject, idx: number) =>
        String(v ?? `${OBJECT_TYPE_LABELS[r.object_type]} #${idx + 1}`),
    },
    {
      title: 'Ø, мм',
      width: 84,
      render: (_: unknown, r: ProjectObject) =>
        r.object_type === 'pipe'
          ? formatNumber(Number(r.params?.outer_diameter) * 1000, 0)
          : formatNumber(Number(r.params?.diameter) * 1000, 0),
    },
    {
      title: 'L, м',
      width: 80,
      render: (_: unknown, r: ProjectObject) =>
        r.object_type === 'pipe' ? formatNumber(Number(r.params?.pipe_length), 1) : '—',
    },
    { title: 'Слоёв ИЗ', width: 86, render: () => '1' },
    {
      title: 'δ ИЗ, мм',
      width: 92,
      render: (_: unknown, r: ProjectObject) =>
        formatNumber(Number(r.params?.insulation_thickness) * 1000, 0),
    },
    {
      title: 'Материал ИЗ',
      width: 120,
      render: (_: unknown, r: ProjectObject) =>
        MATERIAL_LABELS[String(r.params?.insulation_material)] ?? String(r.params?.insulation_material ?? '—'),
    },
    {
      title: 'T прод.',
      width: 86,
      render: (_: unknown, r: ProjectObject) => formatNumber(Number(r.params?.process_temperature), 0),
    },
    {
      title: 'T окр.',
      width: 82,
      render: (_: unknown, r: ProjectObject) => formatNumber(Number(r.params?.ambient_temperature), 0),
    },
    { title: 'Зад.', width: 64, render: () => '—' },
    { title: 'Флн.', width: 64, render: () => '—' },
    { title: 'Опр.', width: 64, render: () => '—' },
  ];
  const resultColumns = [
    ...sourceColumns.slice(0, 3), // #, Тип, Наименование
    {
      title: 'q, Вт/м',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, r: ProjectObject) =>
        r.object_type === 'pipe'
          ? formatNumber(Number(r.results?.heat_loss_per_meter), 1)
          : formatNumber(Number(r.results?.heat_loss_per_m2), 1),
    },
    {
      title: 'Q, Вт',
      width: 100,
      align: 'right' as const,
      render: (_: unknown, r: ProjectObject) =>
        r.results ? formatPower(Number(r.results.total_heat_loss)) : '—',
    },
    {
      title: 'Марка кабеля',
      width: 180,
      render: (_: unknown, r: ProjectObject) => {
        const calc = elecStats.calcByObjectId[r.id];
        return (
          <Select
            size="small"
            showSearch
            allowClear
            placeholder="Авто"
            value={calc?.cable_mark ?? undefined}
            options={cableOptions}
            disabled={!r.is_valid || cables.length === 0}
            loading={manualCableMut.isPending}
            style={{ width: '100%' }}
            onChange={(mark) => {
              if (mark) manualCableMut.mutate({ objectId: r.id, mark });
            }}
          />
        );
      },
    },
    {
      title: 'Шаг навива, мм',
      width: 120,
      align: 'right' as const,
      render: (_: unknown, r: ProjectObject) => (
        <InputNumber
          size="small"
          min={0}
          value={Number(elecStats.calcByObjectId[r.id]?.results?.winding_pitch ?? 0)}
          disabled={cableType === 'mineral'}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Ниток',
      width: 74,
      align: 'right' as const,
      render: () => (
        <InputNumber
          size="small"
          min={1}
          max={8}
          value={1}
          disabled={cableType === 'mineral'}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Длина каб., м',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, r: ProjectObject) =>
        formatNumber(Number(elecStats.calcByObjectId[r.id]?.results?.cable_length), 1),
    },
    {
      title: 'Мощность, Вт',
      width: 115,
      align: 'right' as const,
      render: (_: unknown, r: ProjectObject) =>
        formatPower(Number(elecStats.calcByObjectId[r.id]?.results?.total_power)),
    },
    {
      title: 'Ток, А',
      width: 80,
      align: 'right' as const,
      render: (_: unknown, r: ProjectObject) =>
        formatNumber(Number(elecStats.calcByObjectId[r.id]?.results?.current), 2),
    },
    {
      title: 'Статус',
      width: 130,
      render: (_: unknown, r: ProjectObject) => {
        const calc = elecStats.calcByObjectId[r.id];
        if (!r.is_valid) return <Tag color="error">тепл. ошибка</Tag>;
        if (isElectricalCalcSuccess(calc)) return <Tag color="success" icon={<CheckCircleFilled />}>рассчитан</Tag>;
        if (electricalCalcError(calc)) return <Tag color="error" icon={<CloseCircleFilled />}>эл. ошибка</Tag>;
        return <Tag>не рассчитан</Tag>;
      },
    },
    {
      title: 'Сообщение',
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {electricalCalcError(elecStats.calcByObjectId[r.id]) ?? '—'}
        </Text>
      ),
    },
  ];

  return (
    <>
      <Space direction="vertical" size={5} style={{ width: '100%' }}>
        <div className="inline-form-shell">
          <div className="inline-form-caption">
            <span className="inline-form-caption-title">
              <DatabaseOutlined className="inline-form-caption-icon" />
              {formCaptionTitle}
            </span>
            <span className={`inline-form-caption-mode ${formCaptionMode}`}>
              {formCaptionModeLabel}
            </span>
          </div>
          <div className="inline-form-srs">
            {wizardState ? (
              <ObjectWizard
                objectType={wizardState.type}
                onClose={closeWizard}
                onSubmit={handleWizardSubmit}
                submitting={add.isPending || edit.isPending}
                initialParams={wizardState.editingObject?.params}
              />
            ) : null}
          </div>
        </div>

        <div className="actionbar-srs">
          <Dropdown
            menu={{
              items: [
                { key: 'pipe', label: 'Трубопровод' },
                { key: 'tank', label: 'Резервуар' },
              ],
              onClick: ({ key }) => openAddWizard(key as WizardObjectType),
            }}
          >
            <Button className="add" icon={<PlusOutlined />}>
              Добавить
            </Button>
          </Dropdown>
          <Button
            disabled={!wizardState?.editingObject}
            loading={add.isPending}
            onClick={duplicateCurrentObject}
          >
            Создать на основании
          </Button>
          <Button
            disabled={!wizardState}
            onClick={() => document.getElementById('inline-object-save')?.click()}
          >
            Применить к одному
          </Button>
          <Tooltip title="Массовое применение будет доступно после согласования правил переноса параметров">
            <Button disabled>Применить ко всем</Button>
          </Tooltip>
          <Popconfirm
            title="Удалить объект?"
            okText="Удалить"
            cancelText="Отмена"
            disabled={!wizardState?.editingObject}
            onConfirm={removeCurrentObject}
          >
            <Button danger loading={remove.isPending} disabled={!wizardState?.editingObject}>
              Удалить
            </Button>
          </Popconfirm>
          <span className="sep" />
          <Button
            className="save"
            disabled={!wizardState}
            onClick={() => document.getElementById('inline-object-save')?.click()}
          >
            Сохранить изменения
          </Button>
          <Button disabled={!wizardState} onClick={closeWizard}>Отменить</Button>
          <span className="sep" />
          <ImportExcelButton projectId={project.id} />
          {role === 'employee' && (
            <ExportObjectsButton
              projectId={project.id}
              projectName={project.name}
              disabled={totalCount === 0}
            />
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {selectedRowKeys.length > 0 && (
              <Tag color="blue" style={{ margin: 0 }}>
                Выбрано: {selectedRowKeys.length} · Ctrl+C для копирования
              </Tag>
            )}
            <ObjectCountBadge total={totalCount} valid={validCount} />
          </div>
        </div>

        <div className="tabs-row-srs">
          <button
            className={tableTab === 'source' ? 'active' : ''}
            onClick={() => setTableTab('source')}
          >
            Исходные данные
          </button>
          <button
            className={tableTab === 'results' ? 'active' : ''}
            onClick={() => setTableTab('results')}
          >
            Результаты расчёта
          </button>
          {tableTab === 'results' && (
            <span style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 2 }}>
              <span style={{ fontSize: 11, color: '#607080' }}>Вариант:</span>
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={elecVariant === n ? 'variant active' : 'variant'}
                  onClick={() => setElecVariant(n)}
                >
                  СО{n}
                </button>
              ))}
            </span>
          )}
          {tableTab === 'results' && (
            <>
              <span className="sep" />
              <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>Тип кабеля:</Text>
              <Select<CableTypeKey>
                size="small"
                value={cableType}
                onChange={setCableType}
                options={cableTypeOptions}
                style={{ width: 210 }}
              />
              {isEmployee && (
                <>
                  <span className="sep" />
                  <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>База:</Text>
                  <Segmented<CableSource>
                    size="small"
                    value={cableSource}
                    onChange={setCableSource}
                    options={[
                      { label: 'Встроенная', value: 'builtin' },
                      { label: 'Внешняя', value: 'extended' },
                      { label: 'Все', value: 'all' },
                    ]}
                  />
                </>
              )}
              <Button
                size="small"
                type="primary"
                icon={<ReloadOutlined />}
                loading={batchElecMut.isPending}
                disabled={validCount === 0}
                onClick={() => batchElecMut.mutate()}
                style={{ marginLeft: 'auto', marginBottom: 2 }}
              >
                Выполнить электрорасчёт СО{elecVariant}
              </Button>
            </>
          )}
        </div>

        <Card size="small" className="workspace-table-card srs-table-wrap">
          <Table<ProjectObject>
            className="calc-spreadsheet"
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={objects}
            columns={tableTab === 'source' ? sourceColumns : resultColumns}
            scroll={{ x: tableTab === 'source' ? 1180 : 1520, y: 'calc(100vh - 530px)' }}
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys as string[]),
              columnWidth: 36,
            }}
            rowClassName={(r) => {
              const classes = [];
              if (!r.is_valid) classes.push('row-invalid');
              if (tableTab === 'results' && electricalCalcError(elecStats.calcByObjectId[r.id])) {
                classes.push('row-invalid');
              }
              if (r.id === selectedRowId) classes.push('row-selected');
              return classes.join(' ');
            }}
            onRow={(record) => ({
              onClick: (e) => {
                if (tableTab === 'results') return;
                // Ignore clicks on checkbox cell
                if ((e.target as HTMLElement).closest('.ant-table-selection-column')) return;
                openEditWizard(record);
              },
            })}
            locale={{
              emptyText: (
                <Text type="secondary">
                  Объекты не добавлены. Нажмите «＋ Добавить» или импортируйте XLSX/CSV.
                </Text>
              ),
            }}
          />
          <div className="legend-row-srs">
            <span>
              {tableTab === 'source'
                ? 'ⓘ Клик по строке → форма выше показывает параметры. Красная строка = объект не рассчитан.'
                : `ⓘ СО${elecVariant} · ${CABLE_TYPE_LABEL[cableType]} · Кабель: ${elecStats.totalCableLength.toFixed(1)} м · Мощность: ${powerDisplay} · Ток: ${elecStats.totalCurrent.toFixed(2)} А · рассчитано: ${elecStats.calcedCount}/${objects.length}. Красная строка = ошибка расчёта.`}
            </span>
            {tableTab === 'source' && (
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={batchCalc.isPending}
                disabled={validCount === 0}
                onClick={() => batchCalc.mutate()}
              >
                Электрорасчёт →
              </Button>
            )}
            {tableTab === 'results' && elecStats.calcedCount > 0 && (
              <Button
                size="small"
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={() => navigate(ROUTES.specification)}
              >
                Спецификация →
              </Button>
            )}
          </div>
        </Card>
      </Space>

    </>
  );
}
