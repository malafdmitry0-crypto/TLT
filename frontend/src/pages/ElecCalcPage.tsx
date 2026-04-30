import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
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
import { listObjects } from '@/api/projects';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useElectricalStats } from '@/hooks/useElectricalStats';
import { isElectricalCalcSuccess, electricalCalcError } from '@/utils/calcStatus';
import { formatNumber, formatPower } from '@/utils/formatters';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import { ROUTES } from '@/routes/routes';
import type { ProjectObject } from '@/types/project';

const { Text } = Typography;

type CableTypeKey = 'self_regulating' | 'single_core' | 'three_core' | 'mineral' | 'skin';

const CABLE_TYPE_LABEL: Record<CableTypeKey, string> = {
  self_regulating: 'Саморегулирующийся',
  single_core: 'Однож. пост. мощн.',
  three_core: 'Трёхж. пост. мощн.',
  mineral: 'С мин. изоляцией',
  skin: 'Скин-система',
};

export default function ElecCalcPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const isEmployee = role === 'employee' || role === 'admin';

  const [variant, setVariant] = useState<number>(1);
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
    queryKey: ['project', project?.id, 'electrical-calcs', variant],
    queryFn: () => listElectricalCalcs(project!.id),
    enabled: !!project,
    select: (rows) => rows.filter((c) => c.variant_number === variant),
  });

  const effectiveSource: CableSource = isEmployee ? cableSource : 'builtin';
  const { data: cables = [] } = useQuery({
    queryKey: ['references', 'cables', effectiveSource],
    queryFn: () => listCables(effectiveSource),
    staleTime: 5 * 60_000,
  });

  const batchMut = useMutation({
    mutationFn: () => batchCalcElectrical(project!.id, effectiveSource, variant),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-calcs'] });
      if (res.errors.length > 0) {
        message.warning(`СО${variant} · рассчитано: ${res.calculated}, пропущено: ${res.skipped}.`);
      } else {
        message.success(`СО${variant} — расчёт выполнен для ${res.calculated} объектов`);
      }
    },
    onError: (e: Error) => message.error(e.message),
  });

  const stats = useElectricalStats(objects, elecCalcs);

  const cableOptions = useMemo(
    () => cables.map((c) => ({ value: c.model, label: `${c.model} · ${c.power_per_meter} Вт/м` })),
    [cables],
  );

  const manualCableMut = useMutation({
    mutationFn: ({ objectId, mark }: { objectId: string; mark: string }) =>
      selectCableManual(objectId, mark, effectiveSource, variant),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-calcs'] });
      message.success('Кабель выбран, расчёт обновлён');
    },
    onError: (e: Error) => message.error(e.message),
  });

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
    label: k === 'self_regulating'
      ? CABLE_TYPE_LABEL[k]
      : <Tooltip title="Будет доступно в следующей версии">{CABLE_TYPE_LABEL[k]}</Tooltip>,
    value: k,
    disabled: k !== 'self_regulating',
  }));

  const showInKW = stats.totalPower >= 1000;
  const powerDisplay = showInKW
    ? `${(stats.totalPower / 1000).toFixed(2)} кВт`
    : `${stats.totalPower.toFixed(0)} Вт`;

  const bannerStats = stats.calcedCount > 0
    ? `${stats.totalCableLength.toFixed(1)} м · ${powerDisplay} · ${stats.totalCurrent.toFixed(2)} А · рассчитано: ${stats.calcedCount}/${objects.length}`
    : 'расчёт не выполнен';

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
                        options={cableOptions}
                        disabled={!obj.is_valid || cables.length === 0}
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
                  render: (_: unknown, obj) => (
                    <InputNumber
                      size="small"
                      min={0}
                      value={Number(stats.calcByObjectId[obj.id]?.results?.winding_pitch ?? 0)}
                      disabled={cableType === 'mineral'}
                      style={{ width: '100%' }}
                    />
                  ),
                },
                {
                  title: 'Ниток',
                  width: 74,
                  align: 'right',
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
