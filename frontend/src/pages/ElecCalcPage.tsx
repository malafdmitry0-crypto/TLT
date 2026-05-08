import { useMemo, useState } from 'react';
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
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  batchCalcElectrical,
  listCables,
  listElectricalCalcs,
  selectCableManual,
  type CableSource,
} from '@/api/calculations';
import { getCablesTt, getResistiveCables } from '@/api/references';
import { listObjects } from '@/api/projects';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useElectricalStats } from '@/hooks/useElectricalStats';
import { isElectricalCalcSuccess, electricalCalcError } from '@/utils/calcStatus';
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

export default function ElecCalcPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const isEmployee = role === 'employee' || role === 'admin';

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

  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: objects = [] } = useQuery({
    queryKey: ['project', project?.id, 'objects'],
    queryFn: () => listObjects(project!.id),
    enabled: !!project,
  });

  const { data: elecCalcs = [] } = useQuery({
    queryKey: ['project', project?.id, 'electrical-calcs', variant],
    queryFn: () => listElectricalCalcs(project!.id, variant),
    enabled: !!project,
    select: (rows) => rows.filter((c) => c.variant_number === variant),
  });

  const effectiveSource: CableSource = isEmployee ? cableSource : 'builtin';
  const { data: cables = [] } = useQuery({
    queryKey: ['references', 'cables', effectiveSource],
    queryFn: () => listCables(effectiveSource),
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

  const batchMut = useMutation({
    mutationFn: () =>
      batchCalcElectrical(project!.id, effectiveSource, variant, cableType, {
        supplyVoltage,
        connectionType,
        windingCoefficient,
        heatingHeight,
        layingStep,
        vaporTemperature,
        aggressiveProduct,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-calcs'] });
      if (res.errors.length > 0) {
        message.warning(
          `СО${variant} · рассчитано: ${res.calculated}, пропущено: ${res.skipped}` +
          `${res.heat_loss_failed > 0 ? `, ошибок теплопотерь: ${res.heat_loss_failed}` : ''}.`,
        );
      } else {
        message.success(
          `СО${variant} — расчёт выполнен для ${res.calculated} объектов` +
          `${res.heat_loss_failed > 0 ? ` (ещё ${res.heat_loss_failed} с ошибками теплопотерь)` : ''}`,
        );
      }
    },
    onError: (e: Error) => message.error(e.message),
  });

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
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-calcs'] });
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
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-calcs'] });
      message.success('Параметры укладки применены');
    },
    onError: (e: Error) => message.error(e.message),
  });

  function updateLayoutDraft(objectId: string, patch: CableLayoutDraft) {
    setLayoutDrafts((prev) => ({ ...prev, [objectId]: { ...prev[objectId], ...patch } }));
  }

  function commitLayout(obj: ProjectObject) {
    const calc = stats.calcByObjectId[obj.id];
    if (!calc?.cable_mark) {
      message.warning('Сначала выполните электрорасчёт или выберите марку кабеля');
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

  const showInKW = stats.totalPower >= 1000;
  const powerDisplay = showInKW
    ? `${(stats.totalPower / 1000).toFixed(2)} кВт`
    : `${stats.totalPower.toFixed(0)} Вт`;

  const bannerStats = stats.calcedCount > 0
    ? `${stats.totalCableLength.toFixed(1)} м · ${powerDisplay} · ${stats.totalCurrent.toFixed(2)} А · рассчитано: ${stats.calcedCount}/${objects.length}`
    : 'расчёт не выполнен';

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
          {stats.failedCount > 0 && (
            <Tag color="error" icon={<CloseCircleFilled />}>
              Ошибок: {stats.failedCount}
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
              onClick={() => setVariant(n)}
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
            loading={batchMut.isPending}
            disabled={stats.validObjects.length === 0}
            onClick={() => batchMut.mutate()}
          >
            Выполнить электрорасчёт СО{variant}
          </Button>
          <div style={{ marginLeft: 'auto' }}>
            <Button size="small" onClick={() => navigate(ROUTES.specification)}>
              Спецификация →
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card size="small" className="workspace-table-card srs-table-wrap">
          {objects.length === 0 ? (
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
              pagination={false}
              dataSource={objects}
              scroll={{ x: 1200, y: 'calc(100vh - 430px)' }}
              rowClassName={(obj) =>
                electricalCalcError(stats.calcByObjectId[obj.id]) ? 'row-invalid' : ''
              }
              columns={[
                {
                  title: '#',
                  width: 40,
                  render: (_: unknown, __: ProjectObject, idx: number) => idx + 1,
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
                  width: 130,
                  render: (_: unknown, obj) => {
                    const calc = stats.calcByObjectId[obj.id];
                    const err = electricalCalcError(calc);
                    if (isElectricalCalcSuccess(calc))
                      return <Tag color="success" icon={<CheckCircleFilled />}>рассчитан</Tag>;
                    if (err)
                      return <Tag color="error" icon={<CloseCircleFilled />}>ошибка</Tag>;
                    return <Tag>не рассчитан</Tag>;
                  },
                },
                {
                  title: 'Марка',
                  width: 180,
                  render: (_: unknown, obj) => {
                    const calc = stats.calcByObjectId[obj.id];
                    return (
                      <Select
                        size="small"
                        showSearch
                        allowClear
                        placeholder="Авто"
                        value={calc?.cable_mark ?? undefined}
                        options={manualCableOptions}
                        disabled={!obj.is_valid || manualCableOptions.length === 0}
                        loading={manualCableMut.isPending}
                        style={{ width: '100%' }}
                        onChange={(mark) => {
                          if (mark) manualCableMut.mutate({ objectId: obj.id, mark });
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
                    const values = calcLayoutValues(calc, layoutDrafts[obj.id]);
                    return (
                      <Tooltip title={calc?.cable_mark ? 'Применяется после выхода из поля' : 'Сначала выполните электрорасчёт или выберите марку'}>
                        <InputNumber
                          size="small"
                          min={0}
                          max={500}
                          value={values.windingPitchMm}
                          disabled={!obj.is_valid || !calc?.cable_mark || layoutMut.isPending}
                          style={{ width: '100%' }}
                          onChange={(v) => updateLayoutDraft(obj.id, { windingPitchMm: Number(v ?? 0) })}
                          onBlur={() => commitLayout(obj)}
                          onPressEnter={() => commitLayout(obj)}
                        />
                      </Tooltip>
                    );
                  },
                },
                {
                  title: 'Ниток',
                  width: 74,
                  align: 'right',
                  render: (_: unknown, obj) => {
                    const calc = stats.calcByObjectId[obj.id];
                    const values = calcLayoutValues(calc, layoutDrafts[obj.id]);
                    return (
                      <Select
                        size="small"
                        value={values.numberOfThreads}
                        disabled={!obj.is_valid || !calc?.cable_mark || layoutMut.isPending}
                        options={[
                          { value: 1, label: '1' },
                          { value: 2, label: '2' },
                          { value: 3, label: '3' },
                        ]}
                        style={{ width: '100%' }}
                        onChange={(v) => {
                          updateLayoutDraft(obj.id, { numberOfThreads: v });
                          const current = calcLayoutValues(calc, layoutDrafts[obj.id]);
                          layoutMut.mutate({
                            objectId: obj.id,
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
              ]}
            />
          )}

          {/* Legend / summary row */}
          <div className="legend-row-srs">
            <span>
              ⓘ Красная строка = ошибка подбора кабеля. Нажмите «Выполнить электрорасчёт» чтобы рассчитать все объекты.
            </span>
            {stats.calcedCount > 0 && (
              <Space size={16}>
                <Text style={{ fontSize: 12 }}>
                  Кабель: <strong>{stats.totalCableLength.toFixed(1)} м</strong>
                </Text>
                <Text style={{ fontSize: 12 }}>
                  Мощность: <strong>{powerDisplay}</strong>
                </Text>
                <Text style={{ fontSize: 12 }}>
                  Ток: <strong>{stats.totalCurrent.toFixed(2)} А</strong>
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
