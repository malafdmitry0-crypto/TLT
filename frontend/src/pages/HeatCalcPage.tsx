import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message as antdMessage,
} from 'antd';
import {
  CheckOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FireOutlined,
  PlusOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';

import ObjectWizard from '@/components/wizard/ObjectWizard';
import ImportExcelButton from '@/components/ImportExcelButton';
import ExportObjectsButton from '@/components/ExportObjectsButton';
import EmptyProjectState from '@/components/common/EmptyProjectState';
import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import { MATERIAL_LABELS } from '@/constants/materials';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { listObjects } from '@/api/projects';
import { getInsulation } from '@/api/references';
import { useHeatCalcMutations } from '@/hooks/useHeatCalcMutations';
import type { ProjectObject } from '@/types/project';
import { formatNumber } from '@/utils/formatters';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';
import { findDN } from '@/utils/objectWizardUtils';

const { Text } = Typography;

/** В MVP мастер знает только две формы — трубу и резервуар. */
type WizardObjectType = 'pipe' | 'tank';

function PipeTypeIcon() {
  return (
    <svg className="object-type-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2.5 6h11v4h-11z" />
      <path d="M1.5 5v6M14.5 5v6" />
      <path d="M5 4.5v7M11 4.5v7" />
    </svg>
  );
}

function TankTypeIcon() {
  return (
    <svg className="object-type-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 4.5c0-1 8-1 8 0v7c0 1-8 1-8 0z" />
      <path d="M4 4.5c0 1 8 1 8 0" />
      <path d="M4 11.5c0 1 8 1 8 0" />
    </svg>
  );
}

function insulationEntryLabel(entry: { name: string; density_kg_m3?: number | string }) {
  return entry.density_kg_m3 != null
    ? `${entry.name}, ${entry.density_kg_m3} кг/м³`
    : entry.name;
}

function insulationLayerCount(record: ProjectObject) {
  return String(record.params?.insulation_layer_count ?? (
    Array.isArray(record.params?.insulation_layers) ? record.params.insulation_layers.length : 1
  ));
}

function tankShapeLabel(shape: unknown) {
  if (shape === 'cylindrical') return 'Цилиндр';
  if (shape === 'rectangular') return 'Прямоуг.';
  if (shape === 'spherical') return 'Сфера';
  return '—';
}

function placementLabel(placement: unknown) {
  if (placement === 'indoor') return 'В помещении';
  if (placement === 'underground') return 'Подземно';
  if (placement === 'outdoor') return 'Открыто';
  return '—';
}

function mmParam(record: ProjectObject, key: string) {
  const value = Number(record.params?.[key]);
  return Number.isFinite(value) ? formatNumber(value * 1000, 0) : '—';
}

function tankDimensions(record: ProjectObject) {
  const shape = record.params?.shape;
  if (shape === 'cylindrical') {
    return `Ø${mmParam(record, 'diameter')} × H${mmParam(record, 'height')} мм`;
  }
  if (shape === 'rectangular') {
    return `${mmParam(record, 'length')} × ${mmParam(record, 'width')} × ${mmParam(record, 'height')} мм`;
  }
  if (shape === 'spherical') {
    return `Ø${mmParam(record, 'diameter')} мм`;
  }
  return '—';
}

interface WizardState {
  type: WizardObjectType;
  editingObject?: ProjectObject;
}

/** Статус-бейдж в левой панели: «N объектов, все рассчитаны» или «не рассчитано M». */
function ObjectCountBadge({
  total,
  valid,
  pipeTotal,
  tankTotal,
}: {
  total: number;
  valid: number;
  pipeTotal: number;
  tankTotal: number;
}) {
  if (pipeTotal + tankTotal === 0) return null;
  return (
    <div className="object-count-badge" aria-label="Статус объектов">
      <span className="object-count-segment">
        Труб: <strong>{pipeTotal}</strong>
      </span>
      <span className="object-count-segment">
        Рез.: <strong>{tankTotal}</strong>
      </span>
      <span className="object-count-segment">
        Объектов: <strong>{total}</strong>
      </span>
      {total === 0 ? (
        <span className="object-count-segment warning">Нет выбранного типа</span>
      ) : valid < total ? (
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
  const [wizardState, setWizardState] = useState<WizardState | null>(null);
  const [newWizardRevision, setNewWizardRevision] = useState(0);
  const [activeObjectType, setActiveObjectType] = useState<WizardObjectType>('pipe');
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const { data: objects = [] } = useQuery({
    queryKey: ['project', project?.id, 'objects'],
    queryFn: () => listObjects(project!.id),
    enabled: !!project,
  });

  const { data: insulationMaterials = [] } = useQuery({
    queryKey: ['insulation'],
    queryFn: getInsulation,
    enabled: !!project,
    staleTime: 5 * 60_000,
  });

  const visibleObjects = useMemo(
    () => objects.filter((obj) => obj.object_type === activeObjectType),
    [objects, activeObjectType],
  );
  const insulationLabelByCode = useMemo(
    () => new Map(insulationMaterials.map((m) => [m.material, insulationEntryLabel(m)])),
    [insulationMaterials],
  );
  const insulationLabel = useCallback((material: unknown) => {
    const code = String(material ?? '');
    if (!code) return '—';
    return insulationLabelByCode.get(code) ?? MATERIAL_LABELS[code] ?? code;
  }, [insulationLabelByCode]);

  const outerDiameterMm = useCallback((record: ProjectObject) => {
    const value = record.object_type === 'pipe'
      ? Number(record.params?.outer_diameter) * 1000
      : Number(record.params?.diameter) * 1000;
    return Number.isFinite(value) ? value : null;
  }, []);

  const dnValue = useCallback((record: ProjectObject) => {
    if (record.object_type !== 'pipe') return '—';
    const diameter = outerDiameterMm(record);
    if (diameter == null) return '—';
    const dn = findDN(diameter);
    return dn != null ? `DN${dn}` : '—';
  }, [outerDiameterMm]);

  useEffect(() => {
    setSelectedRowKeys([]);
    setWizardState((current) => {
      if (!current || current.type === activeObjectType) return current;
      return null;
    });
  }, [activeObjectType]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return;
      if (selectedRowKeys.length === 0) return;
      // Don't hijack copy when text is selected in an input
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const selected = visibleObjects.filter((o) => selectedRowKeys.includes(o.id));
      const isPipeTable = activeObjectType === 'pipe';

      const header = isPipeTable
        ? ['Тип', 'Наименование', 'Ø, мм', 'DN', 'L, м', 'δ ИЗ, мм', 'Материал ИЗ', 'T подд., °C', 'T окр., °C', 'Зад.', 'Флн.', 'Опр.']
        : ['Тип', 'Наименование', 'Форма', 'Габариты', 'Размещение', 'δ ИЗ, мм', 'Материал ИЗ', 'T подд., °C', 'T окр., °C', 'Q доп., Вт'];

      const rows = selected.map((r) => {
        return isPipeTable
          ? [
              'Труба',
              String(r.params?.name ?? ''),
              formatNumber(Number(r.params?.outer_diameter) * 1000, 0),
              dnValue(r),
              formatNumber(Number(r.params?.pipe_length), 1),
              formatNumber(Number(r.params?.insulation_thickness) * 1000, 0),
              insulationLabel(r.params?.insulation_material),
              formatNumber(Number(r.params?.process_temperature), 0),
              formatNumber(Number(r.params?.ambient_temperature), 0),
              countParamValue(r, 'valve_count'),
              countParamValue(r, 'flange_count'),
              countParamValue(r, 'support_count'),
            ]
          : [
              'Резервуар',
              String(r.params?.name ?? ''),
              tankShapeLabel(r.params?.shape),
              tankDimensions(r),
              placementLabel(r.params?.placement ?? r.params?.location),
              formatNumber(Number(r.params?.insulation_thickness) * 1000, 0),
              insulationLabel(r.params?.insulation_material),
              formatNumber(Number(r.params?.process_temperature), 0),
              formatNumber(Number(r.params?.ambient_temperature), 0),
              formatNumber(Number(r.params?.q_additional), 0),
            ];
      });

      copyToClipboard(buildTsv([header, ...rows])).then(() => {
        antdMessage.success(`Скопировано строк: ${selected.length}`);
      });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeObjectType, selectedRowKeys, visibleObjects, dnValue, insulationLabel]);

  const closeWizard = () => setWizardState(null);
  const openNewObjectMode = (obj?: ProjectObject) => {
    const type =
      obj?.object_type === 'pipe' || obj?.object_type === 'tank'
        ? obj.object_type
        : wizardState?.type ?? activeObjectType;
    if (type !== 'pipe' && type !== 'tank') return;
    setNewWizardRevision((revision) => revision + 1);
    setWizardState({ type });
  };
  const { add, edit, remove, batchCalc } = useHeatCalcMutations(
    project?.id,
    openNewObjectMode,
    openNewObjectMode,
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

  const validCount = visibleObjects.filter((o) => o.is_valid).length;
  const totalCount = visibleObjects.length;
  const pipeCount = objects.filter((o) => o.object_type === 'pipe').length;
  const tankCount = objects.filter((o) => o.object_type === 'tank').length;
  const activeObjectTypeLabel = activeObjectType === 'pipe' ? 'Труба' : 'Резервуар';
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
        : 'выберите строку или нажмите «+»';
  const hasWizard = !!wizardState;
  const hasEditingObject = !!wizardState?.editingObject;
  const submittingObject = add.isPending || edit.isPending;

  function openAddWizard(type: WizardObjectType = activeObjectType) {
    setNewWizardRevision((revision) => revision + 1);
    setWizardState({ type });
  }

  function handleObjectTypeChange(type: WizardObjectType) {
    setActiveObjectType(type);
    setSelectedRowKeys([]);
    const firstObject = objects.find((obj) => obj.object_type === type);
    setWizardState(firstObject ? { type, editingObject: { ...firstObject, object_type: type } } : null);
  }

  function openEditWizard(obj: ProjectObject) {
    // Редактировать можно только те типы, которые умеем — MVP: трубы и резервуары.
    // Другие типы (pump/platform/other) пока не имеют форм мастера.
    if (obj.object_type !== 'pipe' && obj.object_type !== 'tank') return;
    setWizardState({ type: obj.object_type, editingObject: obj });
  }

  function handleWizardSubmit(params: Record<string, unknown>) {
    if (wizardState?.editingObject) {
      const currentState = wizardState;
      const editingObject = currentState.editingObject!;
      const optimisticObject: ProjectObject = {
        ...editingObject,
        params,
      };
      setWizardState({ type: currentState.type, editingObject: optimisticObject });
      edit.mutate({ objectId: editingObject.id, params });
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
  const selectedObject = selectedRowId ? visibleObjects.find((o) => o.id === selectedRowId) : null;
  const selectedResults = selectedObject?.results as Record<string, unknown> | undefined;
  const selectedParams = selectedObject?.params as Record<string, unknown> | undefined;

  function resultValue(key: string, digits = 3) {
    const value = Number(selectedResults?.[key]);
    return Number.isFinite(value) ? formatNumber(value, digits) : '—';
  }

  function paramValue(key: string, digits = 1) {
    const value = Number(selectedParams?.[key]);
    return Number.isFinite(value) ? formatNumber(value, digits) : '—';
  }

  function sourceText(source: unknown) {
    if (source === 'climate') return 'из климата';
    if (source === 'manual') return 'вручную';
    return '—';
  }

  function countParamValue(record: ProjectObject, key: string) {
    if (record.object_type !== 'pipe') return '—';
    const value = Number(record.params?.[key]);
    return Number.isFinite(value) ? formatNumber(value, 0) : '—';
  }

  function renderAssumptionsPanel() {
    if (!selectedObject || !selectedResults) return null;
    const isPipe = selectedObject.object_type === 'pipe';
    const isUnderground = selectedParams?.placement === 'underground'
      || selectedParams?.burial_depth != null;
    return (
      <div className="calc-assumptions-panel">
        <strong>Расчётные допущения:</strong>
        <span>Tср: {paramValue('ambient_temperature', 0)}°C ({sourceText(selectedParams?.ambient_temperature_source)})</span>
        <span>ветер: {paramValue('wind_speed', 1)} м/с ({sourceText(selectedParams?.wind_speed_source)})</span>
        <span>α: {resultValue('alpha_vnesh', 1)} Вт/м²К</span>
        <span>K: {resultValue('safety_factor', 2)}</span>
        {isPipe ? (
          <>
            <span>Rст: {resultValue('wall_resistance', 4)}</span>
            <span>Rиз: {resultValue('insulation_resistance', 4)}</span>
            <span>{isUnderground ? 'Rгр' : 'Rвнеш'}: {resultValue('external_resistance', 4)}</span>
            <span>Lэфф: {resultValue('effective_length', 1)} м</span>
          </>
        ) : (
          <>
            <span>Rст: {resultValue('wall_resistance', 4)}</span>
            <span>Rиз: {resultValue('insulation_resistance', 4)}</span>
            <span>Rвнеш: {resultValue('external_resistance', 4)}</span>
            {isUnderground && <span>Rгр: {resultValue('ground_resistance', 4)}</span>}
            {isUnderground && <span>Sвозд: {resultValue('air_surface_area', 1)} м²</span>}
            {isUnderground && <span>Sгр: {resultValue('ground_surface_area', 1)} м²</span>}
          </>
        )}
        {isUnderground && <span>λгр: {resultValue('ground_conductivity', 2)} Вт/мК</span>}
      </div>
    );
  }

  const baseColumns = [
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
  ];
  const pipeSourceColumns = [
    ...baseColumns,
    {
      title: 'Ø, мм',
      width: 76,
      render: (_: unknown, r: ProjectObject) => {
        const diameter = outerDiameterMm(r);
        return diameter != null ? formatNumber(diameter, 0) : '—';
      },
    },
    {
      title: 'DN',
      width: 58,
      render: (_: unknown, r: ProjectObject) => dnValue(r),
    },
    {
      title: 'L, м',
      width: 74,
      render: (_: unknown, r: ProjectObject) =>
        r.object_type === 'pipe' ? formatNumber(Number(r.params?.pipe_length), 1) : '—',
    },
    {
      title: 'Слоёв ИЗ',
      width: 86,
      render: (_: unknown, r: ProjectObject) => insulationLayerCount(r),
    },
    {
      title: 'δ ИЗ, мм',
      width: 92,
      render: (_: unknown, r: ProjectObject) =>
        formatNumber(Number(r.params?.insulation_thickness) * 1000, 0),
    },
    {
      title: 'Материал ИЗ',
      width: 160,
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) =>
        insulationLabel(r.params?.insulation_material),
    },
    {
      title: 'T подд.',
      width: 86,
      render: (_: unknown, r: ProjectObject) => formatNumber(Number(r.params?.process_temperature), 0),
    },
    {
      title: 'T окр.',
      width: 82,
      render: (_: unknown, r: ProjectObject) => formatNumber(Number(r.params?.ambient_temperature), 0),
    },
    {
      title: 'Зад.',
      width: 64,
      render: (_: unknown, r: ProjectObject) => countParamValue(r, 'valve_count'),
    },
    {
      title: 'Флн.',
      width: 64,
      render: (_: unknown, r: ProjectObject) => countParamValue(r, 'flange_count'),
    },
    {
      title: 'Опр.',
      width: 64,
      render: (_: unknown, r: ProjectObject) => countParamValue(r, 'support_count'),
    },
  ];
  const tankSourceColumns = [
    ...baseColumns,
    {
      title: 'Форма',
      width: 92,
      render: (_: unknown, r: ProjectObject) => tankShapeLabel(r.params?.shape),
    },
    {
      title: 'Габариты',
      width: 190,
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => tankDimensions(r),
    },
    {
      title: 'Размещение',
      width: 116,
      render: (_: unknown, r: ProjectObject) => placementLabel(r.params?.placement ?? r.params?.location),
    },
    {
      title: 'Слоёв ИЗ',
      width: 86,
      render: (_: unknown, r: ProjectObject) => insulationLayerCount(r),
    },
    {
      title: 'δ ИЗ, мм',
      width: 92,
      render: (_: unknown, r: ProjectObject) =>
        formatNumber(Number(r.params?.insulation_thickness) * 1000, 0),
    },
    {
      title: 'Материал ИЗ',
      width: 160,
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) =>
        insulationLabel(r.params?.insulation_material),
    },
    {
      title: 'T подд.',
      width: 86,
      render: (_: unknown, r: ProjectObject) => formatNumber(Number(r.params?.process_temperature), 0),
    },
    {
      title: 'T окр.',
      width: 82,
      render: (_: unknown, r: ProjectObject) => formatNumber(Number(r.params?.ambient_temperature), 0),
    },
    {
      title: 'Q доп., Вт',
      width: 94,
      render: (_: unknown, r: ProjectObject) => formatNumber(Number(r.params?.q_additional), 0),
    },
  ];
  const sourceColumns = activeObjectType === 'pipe' ? pipeSourceColumns : tankSourceColumns;

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
                key={wizardState.editingObject?.id ?? `${wizardState.type}-new-${newWizardRevision}`}
                objectType={wizardState.type}
                onClose={closeWizard}
                onSubmit={handleWizardSubmit}
                submitting={add.isPending || edit.isPending}
                initialParams={wizardState.editingObject?.params}
              />
            ) : null}
          </div>
        </div>

        <div className="actionbar-srs" aria-label="Действия с объектами">
          <div className="actionbar-group actionbar-context-group">
            <span className="actionbar-context-label">{activeObjectTypeLabel}</span>
            <Segmented<WizardObjectType>
              value={activeObjectType}
              onChange={handleObjectTypeChange}
              options={[
                {
                  label: (
                    <Tooltip title="Трубопровод">
                      <span className="object-type-option" aria-label="Трубопровод">
                        <PipeTypeIcon />
                      </span>
                    </Tooltip>
                  ),
                  value: 'pipe',
                },
                {
                  label: (
                    <Tooltip title="Резервуары">
                      <span className="object-type-option" aria-label="Резервуары">
                        <TankTypeIcon />
                      </span>
                    </Tooltip>
                  ),
                  value: 'tank',
                },
              ]}
            />
          </div>

          <div className="actionbar-group actionbar-edit-group">
            <Tooltip title="Добавить">
              <Button
                className="action-icon-button add"
                icon={<PlusOutlined />}
                aria-label="Добавить"
                onClick={() => openAddWizard()}
              />
            </Tooltip>
            <Tooltip title={hasEditingObject ? 'Создать на основании' : 'Выберите строку для копирования'}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button"
                  icon={<CopyOutlined />}
                  aria-label="Создать на основании"
                  disabled={!hasEditingObject}
                  loading={add.isPending}
                  onClick={duplicateCurrentObject}
                />
              </span>
            </Tooltip>
            <Tooltip title={hasWizard ? 'Применить к одному' : 'Откройте или создайте объект'}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button"
                  icon={<CheckOutlined />}
                  aria-label="Применить к одному"
                  disabled={!hasWizard}
                  loading={submittingObject}
                  onClick={() => document.getElementById('inline-object-save')?.click()}
                />
              </span>
            </Tooltip>
            <Tooltip title="Массовое применение будет доступно после согласования правил переноса параметров">
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button"
                  icon={<CheckSquareOutlined />}
                  aria-label="Применить ко всем"
                  disabled
                />
              </span>
            </Tooltip>
            <Tooltip title={hasEditingObject ? 'Удалить' : 'Выберите строку для удаления'}>
              <span className="action-tooltip-wrap">
                <Popconfirm
                  title="Удалить объект?"
                  okText="Удалить"
                  cancelText="Отмена"
                  disabled={!hasEditingObject}
                  onConfirm={removeCurrentObject}
                >
                  <Button
                    danger
                    className="action-icon-button"
                    icon={<DeleteOutlined />}
                    aria-label="Удалить"
                    loading={remove.isPending}
                    disabled={!hasEditingObject}
                  />
                </Popconfirm>
              </span>
            </Tooltip>
          </div>

          <div className="actionbar-group actionbar-save-group">
            <Tooltip title={hasWizard ? 'Сохранить изменения' : 'Откройте или создайте объект'}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button save"
                  icon={<SaveOutlined />}
                  aria-label="Сохранить изменения"
                  disabled={!hasWizard}
                  loading={submittingObject}
                  onClick={() => document.getElementById('inline-object-save')?.click()}
                />
              </span>
            </Tooltip>
            <Tooltip title={hasWizard ? 'Отменить' : 'Нет открытой формы'}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button"
                  icon={<CloseOutlined />}
                  aria-label="Отменить"
                  disabled={!hasWizard}
                  onClick={closeWizard}
                />
              </span>
            </Tooltip>
          </div>

          <div className="actionbar-group actionbar-io-group">
            <ImportExcelButton projectId={project.id} />
            {role === 'employee' && (
              <ExportObjectsButton
                projectId={project.id}
                projectName={project.name}
                disabled={objects.length === 0}
              />
            )}
          </div>

          <div className="actionbar-status">
            {selectedRowKeys.length > 0 && (
              <Tag color="blue" className="selection-status-tag">
                Выбрано: {selectedRowKeys.length} · Ctrl+C
              </Tag>
            )}
            <ObjectCountBadge
              total={totalCount}
              valid={validCount}
              pipeTotal={pipeCount}
              tankTotal={tankCount}
            />
          </div>
        </div>

        {renderAssumptionsPanel()}

        <Card size="small" className="workspace-table-card srs-table-wrap">
          <Table<ProjectObject>
            className="calc-spreadsheet"
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={visibleObjects}
            columns={sourceColumns}
            scroll={{
              x: activeObjectType === 'pipe' ? 1180 : 1160,
              y: 'calc(100vh - 500px)',
            }}
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys as string[]),
              columnWidth: 36,
            }}
            rowClassName={(r) => {
              const classes = [];
              if (!r.is_valid) classes.push('row-invalid');
              if (r.id === selectedRowId) classes.push('row-selected');
              return classes.join(' ');
            }}
            onRow={(record) => ({
              onClick: (e) => {
                // Ignore clicks on checkbox cell
                if ((e.target as HTMLElement).closest('.ant-table-selection-column')) return;
                openEditWizard(record);
              },
            })}
            locale={{
              emptyText: (
                <Text type="secondary">
                  {activeObjectType === 'pipe'
                    ? 'Трубопроводы не добавлены. Нажмите «+» или импортируйте XLSX/CSV.'
                    : 'Резервуары не добавлены. Нажмите «+» или импортируйте XLSX/CSV.'}
                </Text>
              ),
            }}
          />
          <div className="legend-row-srs">
            <span>
              ⓘ Клик по строке → форма выше показывает параметры. Красная строка = объект не рассчитан.
            </span>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={batchCalc.isPending}
              disabled={validCount === 0}
              onClick={() => batchCalc.mutate()}
            >
              Электрорасчёт →
            </Button>
          </div>
        </Card>
      </Space>

    </>
  );
}
