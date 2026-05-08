import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
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
import { getCablesTt, getInsulation, getResistiveCables } from '@/api/references';
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
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import { formatNumber, formatPower } from '@/utils/formatters';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';
import { findDN } from '@/utils/objectWizardUtils';
import { ROUTES } from '@/routes/routes';

const { Text } = Typography;

/** В MVP мастер знает только две формы — трубу и резервуар. */
type WizardObjectType = 'pipe' | 'tank';
type CableTypeKey =
  | 'self_regulating'
  | 'self_regulating_tt'
  | 'single_core'
  | 'three_core'
  | 'mineral'
  | 'skin';

const CABLE_TYPE_LABEL: Record<CableTypeKey, string> = {
  self_regulating: 'Саморегулирующийся',
  self_regulating_tt: 'ТТН/ТТВ/ТТХ',
  single_core: 'Однож. пост. мощн.',
  three_core: 'Трёхж. пост. мощн.',
  mineral: 'С мин. изоляцией',
  skin: 'Скин-система',
};

const ENABLED_CABLE_TYPES: ReadonlySet<CableTypeKey> = new Set([
  'self_regulating',
  'self_regulating_tt',
  'single_core',
  'three_core',
]);

type CableLayoutDraft = {
  windingPitchMm?: number | null;
  numberOfThreads?: number | null;
};

function calcLayoutValues(calc: ElectricalCalcSummary | undefined, draft?: CableLayoutDraft) {
  return {
    windingPitchMm: draft?.windingPitchMm ?? Number(calc?.results?.winding_pitch ?? 0),
    numberOfThreads: draft?.numberOfThreads ?? Number(calc?.results?.num_circuits ?? 1),
  };
}

function insulationEntryLabel(entry: { name: string; density_kg_m3?: number | string }) {
  return entry.density_kg_m3 != null
    ? `${entry.name}, ${entry.density_kg_m3} кг/м³`
    : entry.name;
}

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
  const [supplyVoltage, setSupplyVoltage] = useState<number | null>(220);
  const [connectionType, setConnectionType] = useState<string>('line_1ph');
  const [windingCoefficient, setWindingCoefficient] = useState<number | null>(1);
  const [heatingHeight, setHeatingHeight] = useState<number | null>(null);
  const [layingStep, setLayingStep] = useState<number | null>(0.1);
  const [vaporTemperature, setVaporTemperature] = useState<number | null>(null);
  const [aggressiveProduct, setAggressiveProduct] = useState(false);
  const [layoutDrafts, setLayoutDrafts] = useState<Record<string, CableLayoutDraft>>({});
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: objects = [] } = useQuery({
    queryKey: ['project', project?.id, 'objects'],
    queryFn: () => listObjects(project!.id),
    enabled: !!project,
  });

  const { data: elecCalcs = [] } = useQuery({
    queryKey: ['project', project?.id, 'electrical-calcs', elecVariant],
    queryFn: () => listElectricalCalcs(project!.id, elecVariant),
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
  const { data: ttCables = [] } = useQuery({
    queryKey: ['references', 'tt-cables'],
    queryFn: getCablesTt,
    enabled: !!project && cableType === 'self_regulating_tt',
    staleTime: 5 * 60_000,
  });
  const { data: resistiveCables } = useQuery({
    queryKey: ['references', 'resistive-cables'],
    queryFn: getResistiveCables,
    enabled: !!project && (cableType === 'single_core' || cableType === 'three_core'),
    staleTime: 5 * 60_000,
  });
  const { data: insulationMaterials = [] } = useQuery({
    queryKey: ['insulation'],
    queryFn: getInsulation,
    enabled: !!project,
    staleTime: 5 * 60_000,
  });

  const elecStats = useElectricalStats(objects, elecCalcs);
  const cableOptions = useMemo(
    () => cables.map((c) => ({ value: c.model, label: `${c.model} · ${c.power_per_meter} Вт/м` })),
    [cables],
  );
  const manualCableOptions = useMemo(() => {
    if (cableType === 'self_regulating') return cableOptions;
    if (cableType === 'self_regulating_tt') {
      const suffix = aggressiveProduct ? 'СТ' : 'СР';
      return ttCables.map((c) => ({
        value: `${c.model}-${suffix}`,
        label: `${c.model}-${suffix} · ${c.series} · ${c.nominal_power} Вт/м`,
      }));
    }
    if (cableType === 'single_core') {
      return (resistiveCables?.single_core ?? []).map((c) => ({
        value: c.model,
        label: `${c.model} · ${c.resistance_ohm_km ?? '—'} Ом/км`,
      }));
    }
    if (cableType === 'three_core') {
      return (resistiveCables?.three_core ?? []).map((c) => ({
        value: c.model,
        label: `${c.model} · ${c.nominal_size_mm ?? '—'}`,
      }));
    }
    return [];
  }, [aggressiveProduct, cableOptions, cableType, resistiveCables, ttCables]);
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

  const batchElecMut = useMutation({
    mutationFn: () => {
      if (cableType === 'self_regulating') {
        return batchCalcElectrical(project!.id, effectiveSource, elecVariant);
      }
      return batchCalcElectrical(project!.id, effectiveSource, elecVariant, cableType, {
        supplyVoltage,
        connectionType,
        windingCoefficient,
        heatingHeight,
        layingStep,
        vaporTemperature,
        aggressiveProduct,
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-calcs'] });
      if (res.errors.length > 0) {
        antdMessage.warning(
          `СО${elecVariant} · рассчитано: ${res.calculated}, пропущено: ${res.skipped}` +
          `${res.heat_loss_failed > 0 ? `, ошибок теплопотерь: ${res.heat_loss_failed}` : ''}.`,
        );
      } else {
        antdMessage.success(
          `СО${elecVariant} — расчёт выполнен для ${res.calculated} объектов` +
          `${res.heat_loss_failed > 0 ? ` (ещё ${res.heat_loss_failed} с ошибками теплопотерь)` : ''}`,
        );
      }
    },
    onError: (e: Error) => antdMessage.error(e.message),
  });

  const manualCableMut = useMutation({
    mutationFn: ({ objectId, mark }: { objectId: string; mark: string }) =>
      selectCableManual(objectId, mark, effectiveSource, elecVariant, cableType, {
        supplyVoltage,
        connectionType,
        windingCoefficient,
        heatingHeight,
        layingStep,
        vaporTemperature,
        aggressiveProduct,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-calcs'] });
      antdMessage.success('Кабель выбран, расчёт обновлён');
    },
    onError: (e: Error) => antdMessage.error(e.message),
  });

  const layoutMut = useMutation({
    mutationFn: ({
      objectId,
      mark,
      windingPitchMm,
      numberOfThreads,
    }: {
      objectId: string;
      mark: string;
      windingPitchMm: number;
      numberOfThreads: number;
    }) =>
      selectCableManual(objectId, mark, effectiveSource, elecVariant, cableType, {
        supplyVoltage,
        connectionType,
        windingCoefficient,
        windingPitchMm,
        numberOfThreads,
        heatingHeight,
        layingStep,
        vaporTemperature,
        aggressiveProduct,
      }),
    onSuccess: (_calc, vars) => {
      setLayoutDrafts((prev) => {
        const next = { ...prev };
        delete next[vars.objectId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-calcs'] });
      antdMessage.success('Параметры укладки применены');
    },
    onError: (e: Error) => antdMessage.error(e.message),
  });

  function updateLayoutDraft(objectId: string, patch: CableLayoutDraft) {
    setLayoutDrafts((prev) => ({ ...prev, [objectId]: { ...prev[objectId], ...patch } }));
  }

  function commitLayout(obj: ProjectObject) {
    const calc = elecStats.calcByObjectId[obj.id];
    if (!calc?.cable_mark) {
      antdMessage.warning('Сначала выполните электрорасчёт или выберите марку кабеля');
      return;
    }
    const values = calcLayoutValues(calc, layoutDrafts[obj.id]);
    layoutMut.mutate({
      objectId: obj.id,
      mark: calc.cable_mark,
      windingPitchMm: values.windingPitchMm,
      numberOfThreads: values.numberOfThreads,
    });
  }

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
        ? ['Тип', 'Наименование', 'Ø, мм', 'DN', 'L, м', 'δ ИЗ, мм', 'Материал ИЗ', 'T подд., °C', 'T окр., °C', 'Зад.', 'Флн.', 'Опр.', 'q, Вт/м', 'Q сум., Вт', 'Марка кабеля', 'Шаг навива, мм', 'Длина каб., м', 'Мощность, Вт', 'Ток, А', 'Статус']
        : ['Тип', 'Наименование', 'Ø, мм', 'DN', 'L, м', 'δ ИЗ, мм', 'Материал ИЗ', 'T подд., °C', 'T окр., °C', 'Зад.', 'Флн.', 'Опр.'];

      const rows = selected.map((r) => {
        const base = [
          r.object_type === 'pipe' ? 'Труба' : 'Резервуар',
          String(r.params?.name ?? ''),
          r.object_type === 'pipe'
            ? formatNumber(Number(r.params?.outer_diameter) * 1000, 0)
            : formatNumber(Number(r.params?.diameter) * 1000, 0),
          dnValue(r),
          r.object_type === 'pipe' ? formatNumber(Number(r.params?.pipe_length), 1) : '—',
          formatNumber(Number(r.params?.insulation_thickness) * 1000, 0),
          insulationLabel(r.params?.insulation_material),
          formatNumber(Number(r.params?.process_temperature), 0),
          formatNumber(Number(r.params?.ambient_temperature), 0),
          countParamValue(r, 'valve_count'),
          countParamValue(r, 'flange_count'),
          countParamValue(r, 'support_count'),
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
        ];
      });

      copyToClipboard(buildTsv([header, ...rows])).then(() => {
        antdMessage.success(`Скопировано строк: ${selected.length}`);
      });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedRowKeys, objects, tableTab, elecStats.calcByObjectId, dnValue, insulationLabel]);

  const closeWizard = () => setWizardState(null);
  const keepEditedObjectOpen = (obj: ProjectObject) => {
    const type =
      obj.object_type === 'pipe' || obj.object_type === 'tank'
        ? obj.object_type
        : wizardState?.type;
    if (type !== 'pipe' && type !== 'tank') return;
    setWizardState({ type, editingObject: { ...obj, object_type: type } });
  };
  const { add, edit, remove, batchCalc } = useHeatCalcMutations(
    project?.id,
    closeWizard,
    keepEditedObjectOpen,
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
    label: ENABLED_CABLE_TYPES.has(k)
      ? CABLE_TYPE_LABEL[k]
      : <Tooltip title="Нет формулы/каталога в текущей поставке">{CABLE_TYPE_LABEL[k]}</Tooltip>,
    value: k,
    disabled: !ENABLED_CABLE_TYPES.has(k),
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
      const currentState = wizardState;
      const editingObject = currentState.editingObject!;
      const optimisticObject: ProjectObject = {
        ...editingObject,
        params,
      };
      setWizardState({ type: currentState.type, editingObject: optimisticObject });
      edit.mutate(
        { objectId: editingObject.id, params },
        {
          onSuccess: (obj) => {
            setWizardState({
              type: currentState.type,
              editingObject: { ...obj, object_type: currentState.type },
            });
          },
        },
      );
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
  const selectedObject = selectedRowId ? objects.find((o) => o.id === selectedRowId) : null;
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

  function renderElectricalTypeControls() {
    if (cableType === 'self_regulating') return null;
    if (cableType === 'self_regulating_tt') {
      return (
        <>
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>T проп., °C:</Text>
          <InputNumber<number>
            size="small"
            value={vaporTemperature}
            onChange={setVaporTemperature}
            style={{ width: 92 }}
          />
          <Checkbox
            checked={aggressiveProduct}
            onChange={(e) => setAggressiveProduct(e.target.checked)}
          >
            <span style={{ fontSize: 12 }}>агр.</span>
          </Checkbox>
        </>
      );
    }
    if (cableType === 'single_core' || cableType === 'three_core') {
      const connectionOptions = cableType === 'single_core'
        ? [
            { value: 'line_1ph', label: 'Линия' },
            { value: 'loop_1ph', label: 'Петля' },
            { value: 'star_3ph', label: 'Звезда' },
          ]
        : [
            { value: 'line_1ph', label: 'Линия' },
            { value: 'loop_2x3', label: 'Петля 2×3' },
            { value: 'loop_1x3', label: 'Петля 1×3' },
            { value: 'star_3x3', label: 'Звезда 3×3' },
            { value: 'star_1x3', label: 'Звезда 1×3' },
          ];
      return (
        <>
          <Select
            size="small"
            value={connectionType}
            onChange={setConnectionType}
            options={connectionOptions}
            style={{ width: 118 }}
          />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>U:</Text>
          <InputNumber<number> size="small" min={1} value={supplyVoltage} onChange={setSupplyVoltage} style={{ width: 76 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>w:</Text>
          <InputNumber<number> size="small" min={1} max={1.5} step={0.05} value={windingCoefficient} onChange={setWindingCoefficient} style={{ width: 72 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>h:</Text>
          <InputNumber<number> size="small" min={0} step={0.1} value={heatingHeight} onChange={setHeatingHeight} style={{ width: 76 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>шаг:</Text>
          <InputNumber<number> size="small" min={0.05} max={0.5} step={0.01} value={layingStep} onChange={setLayingStep} style={{ width: 76 }} />
        </>
      );
    }
    return null;
  }
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
      render: (_: unknown, r: ProjectObject) =>
        String(r.params?.insulation_layer_count ?? (
          Array.isArray(r.params?.insulation_layers) ? r.params.insulation_layers.length : 1
        )),
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
            options={manualCableOptions}
            disabled={!r.is_valid || manualCableOptions.length === 0}
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
      render: (_: unknown, r: ProjectObject) => {
        const calc = elecStats.calcByObjectId[r.id];
        const values = calcLayoutValues(calc, layoutDrafts[r.id]);
        return (
          <Tooltip title={calc?.cable_mark ? 'Применяется после выхода из поля' : 'Сначала выполните электрорасчёт или выберите марку'}>
            <InputNumber
              size="small"
              min={0}
              max={500}
              value={values.windingPitchMm}
              disabled={!r.is_valid || !calc?.cable_mark || layoutMut.isPending}
              style={{ width: '100%' }}
              onChange={(v) => updateLayoutDraft(r.id, { windingPitchMm: Number(v ?? 0) })}
              onBlur={() => commitLayout(r)}
              onPressEnter={() => commitLayout(r)}
            />
          </Tooltip>
        );
      },
    },
    {
      title: 'Ниток',
      width: 74,
      align: 'right' as const,
      render: (_: unknown, r: ProjectObject) => {
        const calc = elecStats.calcByObjectId[r.id];
        const values = calcLayoutValues(calc, layoutDrafts[r.id]);
        return (
          <Select
            size="small"
            value={values.numberOfThreads}
            disabled={!r.is_valid || !calc?.cable_mark || layoutMut.isPending}
            options={[
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
            ]}
            style={{ width: '100%' }}
            onChange={(v) => {
              updateLayoutDraft(r.id, { numberOfThreads: v });
              const current = calcLayoutValues(calc, layoutDrafts[r.id]);
              layoutMut.mutate({
                objectId: r.id,
                mark: calc!.cable_mark!,
                windingPitchMm: current.windingPitchMm,
                numberOfThreads: v,
              });
            }}
          />
        );
      },
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
        const error = electricalCalcError(calc);
        if (error) {
          return (
            <Tooltip title={error}>
              <Tag color="error" icon={<CloseCircleFilled />}>эл. ошибка</Tag>
            </Tooltip>
          );
        }
        return <Tag>не рассчитан</Tag>;
      },
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
                onChange={(next) => {
                  setCableType(next);
                  setConnectionType('line_1ph');
                }}
                options={cableTypeOptions}
                style={{ width: 210 }}
              />
              {renderElectricalTypeControls()}
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

        {renderAssumptionsPanel()}

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
