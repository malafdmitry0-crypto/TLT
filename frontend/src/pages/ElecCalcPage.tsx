import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  InputNumber,
  Select,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ReloadOutlined,
  StopOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';

import {
  cancelCalcTask,
  enqueueElectricalBatchJob,
  getElectricalPage,
  getCalcTask,
  listCables,
  selectCableManual,
  type CableSource,
} from '@/api/calculations';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getCablesTt, getResistiveCables } from '@/api/references';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useElectricalStats } from '@/hooks/useElectricalStats';
import { isElectricalCalcSuccess, electricalCalcError } from '@/utils/calcStatus';
import { getCalcJobRefetchInterval, isActiveCalcJobStatus } from '@/utils/calcJobPolling';
import { formatNumber, formatPower } from '@/utils/formatters';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import { ROUTES } from '@/routes/routes';
import type { ProjectObject } from '@/types/project';
import type { ElectricalCalcSummary } from '@/types/calculation';

const { Text } = Typography;

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
const ELECTRICAL_TABLE_PAGE_SIZE = 50;
const THREAD_OPTIONS = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
];

type CableLayoutDraft = {
  windingPitchMm?: number | null;
  numberOfThreads?: number | null;
};

type ElectricalNavigationState = {
  activeJobId?: string;
} | null;

function getCableMark(calc: ElectricalCalcSummary | undefined) {
  const selectedCable = calc?.results?.selected_cable;
  return calc?.cable_mark ?? (typeof selectedCable === 'string' ? selectedCable : undefined);
}

function calcLayoutValues(calc: ElectricalCalcSummary | undefined, draft?: CableLayoutDraft) {
  return {
    windingPitchMm: draft?.windingPitchMm ?? Number(calc?.results?.winding_pitch ?? 0),
    numberOfThreads: draft?.numberOfThreads ?? Number(calc?.results?.num_circuits ?? 1),
  };
}

export default function ElecCalcPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const isEmployee = role === 'employee' || role === 'admin';
  const location = useLocation();
  const navigationActiveJobId =
    (location.state as ElectricalNavigationState)?.activeJobId ?? null;

  const [variant, setVariant] = useState<number>(1);
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
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(ELECTRICAL_TABLE_PAGE_SIZE);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(
    () => navigationActiveJobId,
  );
  const activeJobScopeRef = useRef<{ projectId?: string; variant: number } | null>(null);

  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    setTablePage(1);
  }, [project?.id, variant]);

  useEffect(() => {
    setActiveRowId(null);
  }, [project?.id, variant, tablePage, tablePageSize]);

  useEffect(() => {
    setSelectedRowKeys([]);
  }, [project?.id, variant]);

  useEffect(() => {
    if (navigationActiveJobId) {
      setActiveJobId(navigationActiveJobId);
    }
  }, [navigationActiveJobId]);

  useEffect(() => {
    const currentScope = { projectId: project?.id, variant };
    const previousScope = activeJobScopeRef.current;
    activeJobScopeRef.current = currentScope;
    if (!previousScope) return;
    if (!previousScope.projectId && currentScope.projectId) return;
    if (
      previousScope.projectId !== currentScope.projectId ||
      previousScope.variant !== currentScope.variant
    ) {
      setActiveJobId(null);
    }
  }, [project?.id, variant]);

  const { data: electricalPage, isFetching: isElectricalPageFetching } = useQuery({
    queryKey: ['project', project?.id, 'electrical-page', variant, tablePage, tablePageSize],
    queryFn: () => getElectricalPage(project!.id, variant, tablePage, tablePageSize),
    enabled: !!project,
  });
  const objects = electricalPage?.items ?? [];
  const elecCalcs = electricalPage?.calculations ?? [];
  const pageSummary = electricalPage?.summary;
  const pageInfo = electricalPage?.page_info;

  useEffect(() => {
    const visibleIds = new Set(objects.map((object) => object.id));
    setSelectedRowKeys((keys) => {
      const nextKeys = keys.filter((key) => visibleIds.has(key));
      return nextKeys.length === keys.length && nextKeys.every((key, index) => key === keys[index])
        ? keys
        : nextKeys;
    });
  }, [objects]);

  const { data: activeJob } = useQuery({
    queryKey: ['calc-job', activeJobId],
    queryFn: () => getCalcTask(activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return getCalcJobRefetchInterval(status);
    },
    refetchIntervalInBackground: true,
  });

  const effectiveSource: CableSource = isEmployee ? cableSource : 'builtin';
  const { data: cables = [] } = useQuery({
    queryKey: referenceQueryKeys.cables(effectiveSource),
    queryFn: () => listCables(effectiveSource),
    ...referenceQueryOptions,
  });
  const { data: ttCables = [] } = useQuery({
    queryKey: referenceQueryKeys.ttCables,
    queryFn: getCablesTt,
    enabled: !!project && cableType === 'self_regulating_tt',
    ...referenceQueryOptions,
  });
  const { data: resistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables,
    queryFn: getResistiveCables,
    enabled: !!project && (cableType === 'single_core' || cableType === 'three_core'),
    ...referenceQueryOptions,
  });

  const batchMut = useMutation({
    mutationFn: () =>
      enqueueElectricalBatchJob(project!.id, effectiveSource, variant, cableType, {
        supplyVoltage,
        connectionType,
        windingCoefficient,
        heatingHeight,
        layingStep,
        vaporTemperature,
        aggressiveProduct,
    }),
    onSuccess: (task) => {
      setActiveJobId(task.id);
      message.info(`СО${variant} · электрорасчёт поставлен в очередь`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const cancelJobMut = useMutation({
    mutationFn: () => cancelCalcTask(activeJobId!),
    onSuccess: (task) => {
      setActiveJobId(task.id);
      message.warning('Электрорасчёт остановлен');
    },
    onError: (e: Error) => message.error(e.message),
  });

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === 'succeeded') {
      const res = activeJob.result;
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-page'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      if (res && res.skipped > 0) {
        message.warning(
          `СО${variant} · рассчитано: ${res.calculated}, пропущено: ${res.skipped}` +
          `${res.heat_loss_failed > 0 ? `, ошибок теплопотерь: ${res.heat_loss_failed}` : ''}.`,
        );
      } else if (res) {
        message.success(
          `СО${variant} — расчёт выполнен для ${res.calculated} объектов` +
          `${res.heat_loss_failed > 0 ? ` (ещё ${res.heat_loss_failed} с ошибками теплопотерь)` : ''}`,
        );
      } else {
        message.success(`СО${variant} — расчёт выполнен`);
      }
      setActiveJobId(null);
    }
    if (activeJob.status === 'failed') {
      message.error(activeJob.error_message || 'Электрорасчёт завершился ошибкой');
      setActiveJobId(null);
    }
    if (activeJob.status === 'cancelled') {
      setActiveJobId(null);
    }
  }, [activeJob, project?.id, qc, variant]);

  const stats = useElectricalStats(objects, elecCalcs);

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

  const manualCableMut = useMutation({
    mutationFn: ({ objectId, mark }: { objectId: string; mark: string }) =>
      selectCableManual(objectId, mark, effectiveSource, variant, cableType, {
        supplyVoltage,
        connectionType,
        windingCoefficient,
        heatingHeight,
        layingStep,
        vaporTemperature,
        aggressiveProduct,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-page'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      message.success('Кабель выбран, расчёт обновлён');
    },
    onError: (e: Error) => message.error(e.message),
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
      selectCableManual(objectId, mark, effectiveSource, variant, cableType, {
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
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-page'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      message.success('Параметры укладки применены');
    },
    onError: (e: Error) => message.error(e.message),
  });
  const manualCableMutate = manualCableMut.mutate;
  const isManualCablePending = manualCableMut.isPending;
  const layoutMutate = layoutMut.mutate;
  const isLayoutPending = layoutMut.isPending;

  const updateLayoutDraft = useCallback((objectId: string, patch: CableLayoutDraft) => {
    setLayoutDrafts((prev) => ({ ...prev, [objectId]: { ...prev[objectId], ...patch } }));
  }, []);

  const commitLayout = useCallback((obj: ProjectObject) => {
    const calc = stats.calcByObjectId[obj.id];
    const mark = getCableMark(calc);
    if (!mark) {
      message.warning('Сначала выполните электрорасчёт или выберите марку кабеля');
      return;
    }
    const values = calcLayoutValues(calc, layoutDrafts[obj.id]);
    layoutMutate({
      objectId: obj.id,
      mark,
      windingPitchMm: values.windingPitchMm,
      numberOfThreads: values.numberOfThreads,
    });
  }, [layoutDrafts, layoutMutate, stats.calcByObjectId]);

  const electricalColumns = useMemo<ColumnsType<ProjectObject>>(() => [
    {
      title: '#',
      width: 40,
      render: (_: unknown, __: ProjectObject, idx: number) =>
        (pageInfo?.offset ?? 0) + idx + 1,
    },
    {
      title: 'Объект',
      dataIndex: ['params', 'name'],
      width: 220,
      ellipsis: true,
      render: (v: unknown, obj) => (
        <Text style={{ fontSize: 12 }}>
          {String(v ?? `${obj.object_type} ${obj.id}`)}
        </Text>
      ),
    },
    {
      title: 'Статус',
      width: 56,
      align: 'center',
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const err = electricalCalcError(calc);
        if (isElectricalCalcSuccess(calc))
          return (
            <Tooltip title="Рассчитан">
              <Tag className="electrical-status-icon-tag" color="success" aria-label="Рассчитан">
                <CheckCircleFilled />
              </Tag>
            </Tooltip>
          );
        if (err)
          return (
            <Tooltip title="Ошибка">
              <Tag className="electrical-status-icon-tag" color="error" aria-label="Ошибка">
                <CloseCircleFilled />
              </Tag>
            </Tooltip>
          );
        return (
          <Tooltip title="Не рассчитан">
            <Tag className="electrical-status-icon-tag" aria-label="Не рассчитан">—</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Марка',
      width: 180,
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const mark = getCableMark(calc);
        const isActive = activeRowId === obj.id;

        if (!isActive) {
          return (
            <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
              {mark ?? 'Авто'}
            </Text>
          );
        }

        return (
          <Select
            size="small"
            showSearch
            allowClear
            placeholder="Авто"
            value={mark}
            options={manualCableOptions}
            disabled={!obj.is_valid || manualCableOptions.length === 0}
            loading={isManualCablePending}
            style={{ width: '100%' }}
            onChange={(nextMark) => {
              if (nextMark) manualCableMutate({ objectId: obj.id, mark: nextMark });
            }}
          />
        );
      },
    },
    {
      title: 'Шаг навива, мм',
      width: 120,
      align: 'right',
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const mark = getCableMark(calc);
        const values = calcLayoutValues(calc, layoutDrafts[obj.id]);
        const isActive = activeRowId === obj.id;

        if (!isActive || !obj.is_valid || !mark) {
          return (
            <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
              {mark ? formatNumber(values.windingPitchMm, 0) : '—'}
            </Text>
          );
        }

        return (
          <InputNumber
            size="small"
            min={0}
            max={500}
            value={values.windingPitchMm}
            disabled={isLayoutPending}
            style={{ width: '100%' }}
            onChange={(v) => updateLayoutDraft(obj.id, { windingPitchMm: Number(v ?? 0) })}
            onBlur={() => commitLayout(obj)}
            onPressEnter={() => commitLayout(obj)}
          />
        );
      },
    },
    {
      title: 'Ниток',
      width: 74,
      align: 'right',
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const mark = getCableMark(calc);
        const values = calcLayoutValues(calc, layoutDrafts[obj.id]);
        const isActive = activeRowId === obj.id;

        if (!isActive || !obj.is_valid || !mark) {
          return (
            <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
              {mark ? values.numberOfThreads : '—'}
            </Text>
          );
        }

        return (
          <Select
            size="small"
            value={values.numberOfThreads}
            disabled={isLayoutPending}
            options={THREAD_OPTIONS}
            style={{ width: '100%' }}
            onChange={(v) => {
              updateLayoutDraft(obj.id, { numberOfThreads: v });
              layoutMutate({
                objectId: obj.id,
                mark,
                windingPitchMm: values.windingPitchMm,
                numberOfThreads: v,
              });
            }}
          />
        );
      },
    },
    {
      title: 'Длина, м',
      width: 90,
      align: 'right',
      render: (_: unknown, obj) =>
        formatNumber(Number(stats.calcByObjectId[obj.id]?.results?.cable_length), 1),
    },
    {
      title: 'Мощность, Вт',
      width: 110,
      align: 'right',
      render: (_: unknown, obj) =>
        formatPower(Number(stats.calcByObjectId[obj.id]?.results?.total_power)),
    },
    {
      title: 'Ток, А',
      width: 80,
      align: 'right',
      render: (_: unknown, obj) =>
        formatNumber(Number(stats.calcByObjectId[obj.id]?.results?.current), 2),
    },
    {
      title: 'Сообщение',
      ellipsis: true,
      render: (_: unknown, obj) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {electricalCalcError(stats.calcByObjectId[obj.id]) ?? '—'}
        </Text>
      ),
    },
  ], [
    activeRowId,
    commitLayout,
    isLayoutPending,
    isManualCablePending,
    layoutDrafts,
    layoutMutate,
    manualCableMutate,
    manualCableOptions,
    pageInfo?.offset,
    stats.calcByObjectId,
    updateLayoutDraft,
  ]);

  if (!project) {
    return (
      <EmptyProjectState
        icon={<ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />}
        title="Электротехнический расчёт"
        description="Шаг 2 из 4. Результаты автоподбора греющего кабеля ТЛТ для каждого объекта."
      />
    );
  }

  const cableTypeOptions = (Object.keys(CABLE_TYPE_LABEL) as CableTypeKey[]).map((k) => ({
    label: ENABLED_CABLE_TYPES.has(k)
      ? CABLE_TYPE_LABEL[k]
      : <Tooltip title="Нет формулы/каталога в текущей поставке">{CABLE_TYPE_LABEL[k]}</Tooltip>,
    value: k,
    disabled: !ENABLED_CABLE_TYPES.has(k),
  }));

  const totalObjects = pageSummary?.total_objects ?? objects.length;
  const validObjectsCount = pageSummary?.valid_objects ?? stats.validObjects.length;
  const calculatedCount = pageSummary?.calculated_count ?? stats.calcedCount;
  const failedCount = pageSummary?.failed_count ?? stats.failedCount;
  const totalCableLength = pageSummary?.total_cable_length ?? stats.totalCableLength;
  const totalPower = pageSummary?.total_power ?? stats.totalPower;
  const totalCurrent = pageSummary?.total_current ?? stats.totalCurrent;
  const showSummaryInKW = totalPower >= 1000;
  const summaryPowerDisplay = showSummaryInKW
    ? `${(totalPower / 1000).toFixed(2)} кВт`
    : `${totalPower.toFixed(0)} Вт`;

  const bannerStats = calculatedCount > 0
    ? `${totalCableLength.toFixed(1)} м · ${summaryPowerDisplay} · ${totalCurrent.toFixed(2)} А · рассчитано: ${calculatedCount}/${totalObjects}`
    : 'расчёт не выполнен';
  const activeJobStatus = activeJob?.status ?? null;
  const isJobActive = isActiveCalcJobStatus(activeJobStatus);
  const jobProgress = activeJob?.progress;
  const jobProgressLabel = jobProgress?.total
    ? `${jobProgress.current}/${jobProgress.total}`
    : activeJobStatus ?? '';

  function renderElectricalTypeControls() {
    if (cableType === 'self_regulating') return null;
    if (cableType === 'self_regulating_tt') {
      return (
        <>
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>T проп., °C:</Text>
          <InputNumber<number> size="small" value={vaporTemperature} onChange={setVaporTemperature} style={{ width: 92 }} />
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
          <Select size="small" value={connectionType} onChange={setConnectionType} options={connectionOptions} style={{ width: 118 }} />
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

  return (
    <>
      <Space direction="vertical" size={5} style={{ width: '100%' }}>

        {/* Summary banner */}
        <div className="common-data-banner">
          <span>
            <span className="label">СО{variant} · {CABLE_TYPE_LABEL[cableType]} · </span>
            {bannerStats}
          </span>
          {failedCount > 0 && (
            <Tag color="error" icon={<CloseCircleFilled />}>
              Ошибок: {failedCount}
            </Tag>
          )}
        </div>

        {/* ActionBar */}
        <div className="actionbar-srs">
          <Button size="small" onClick={() => navigate(ROUTES.heatCalc)}>
            ← Теплопотери
          </Button>
          <span className="sep" />
          {[1, 2, 3, 4].map((n) => (
            <Button
              key={n}
              size="small"
              type={variant === n ? 'primary' : 'default'}
              onClick={() => {
                setTablePage(1);
                setVariant(n);
              }}
            >
              СО{n}
            </Button>
          ))}
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
          <span className="sep" />
          <Button
            size="small"
            type="primary"
            icon={<ReloadOutlined />}
            loading={batchMut.isPending || isJobActive}
            disabled={validObjectsCount === 0 || isJobActive}
            onClick={() => batchMut.mutate()}
          >
            Выполнить электрорасчёт СО{variant}
          </Button>
          {isJobActive && activeJobId && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              loading={cancelJobMut.isPending}
              onClick={() => cancelJobMut.mutate()}
            >
              Отменить
            </Button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <Button size="small" onClick={() => navigate(ROUTES.specification)}>
              Спецификация →
            </Button>
          </div>
        </div>

        {isJobActive && (
          <Alert
            type="info"
            showIcon
            message={`Электрорасчёт выполняется · ${jobProgressLabel}`}
          />
        )}

        {/* Table */}
        <Card size="small" className="workspace-table-card srs-table-wrap">
          {electricalPage && totalObjects === 0 ? (
            <Alert
              type="warning"
              showIcon
              message="Нет объектов"
              description="Добавьте объекты на шаге «Теплопотери»."
              style={{ margin: 12 }}
            />
          ) : (
            <Table<ProjectObject>
              className="calc-spreadsheet electrical-spreadsheet"
              rowKey="id"
              size="small"
              loading={isElectricalPageFetching}
              pagination={{
                current: tablePage,
                pageSize: tablePageSize,
                total: totalObjects,
                pageSizeOptions: ['25', '50', '100'],
                showSizeChanger: true,
                hideOnSinglePage: totalObjects <= tablePageSize,
                showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`,
                size: 'small',
                onChange: (nextPage, nextPageSize) => {
                  setTablePage(nextPage);
                  setTablePageSize(nextPageSize);
                },
              }}
              dataSource={objects}
              scroll={{ x: 1200, y: 'calc(100vh - 430px)' }}
              rowClassName={(obj) =>
                [
                  electricalCalcError(stats.calcByObjectId[obj.id]) ? 'row-invalid' : '',
                  activeRowId === obj.id ? 'electrical-row-active' : '',
                ].filter(Boolean).join(' ')
              }
              onRow={(obj) => ({
                onClick: (event) => {
                  if ((event.target as HTMLElement).closest('.ant-table-selection-column')) return;
                  setActiveRowId(obj.id);
                },
              })}
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as string[]),
                columnWidth: 36,
              }}
              columns={electricalColumns}
            />
          )}

          {/* Legend / summary row */}
          <div className="legend-row-srs">
            <span>
              ⓘ Красная строка = ошибка подбора кабеля. Нажмите «Выполнить электрорасчёт» чтобы рассчитать все объекты.
            </span>
            {calculatedCount > 0 && (
              <Space size={16}>
                <Text style={{ fontSize: 12 }}>
                  Кабель: <strong>{totalCableLength.toFixed(1)} м</strong>
                </Text>
                <Text style={{ fontSize: 12 }}>
                  Мощность: <strong>{summaryPowerDisplay}</strong>
                </Text>
                <Text style={{ fontSize: 12 }}>
                  Ток: <strong>{totalCurrent.toFixed(2)} А</strong>
                </Text>
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={() => navigate(ROUTES.specification)}
                >
                  Спецификация →
                </Button>
              </Space>
            )}
          </div>
        </Card>

      </Space>
    </>
  );
}
