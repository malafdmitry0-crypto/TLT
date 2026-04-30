import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  InputNumber,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ThunderboltOutlined,
  ReloadOutlined,
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
import WorkflowSteps from '@/components/WorkflowSteps';
import ElectricalSummary from '@/components/electrical/ElectricalSummary';
import { ROUTES } from '@/routes/routes';
import type { ProjectObject } from '@/types/project';

const { Text } = Typography;

type CableTypeKey = 'self_regulating' | 'single_core' | 'three_core' | 'mineral' | 'skin';

const CABLE_TYPE_LABEL: Record<CableTypeKey, string> = {
  self_regulating: 'Саморегулирующийся',
  single_core: 'Однож. постоянной мощности',
  three_core: 'Трёхж. постоянной мощности',
  mineral: 'С минеральной изоляцией',
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
        message.warning(
          `Вариант СО${variant} · рассчитано: ${res.calculated}, пропущено: ${res.skipped}.`,
        );
      } else {
        message.success(
          `Вариант СО${variant} — расчёт выполнен для ${res.calculated} объектов`,
        );
      }
    },
    onError: (e: Error) => message.error(e.message),
  });

  const stats = useElectricalStats(objects, elecCalcs);
  const cableOptions = useMemo(
    () =>
      cables.map((c) => ({
        value: c.model,
        label: `${c.model} · ${c.power_per_meter} Вт/м`,
      })),
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
    label: (
      <Space size={4}>
        <span>{CABLE_TYPE_LABEL[k]}</span>
        {k !== 'self_regulating' && (
          <Tag color="default" style={{ marginLeft: 2, fontSize: 10 }}>
            полная
          </Tag>
        )}
      </Space>
    ),
    value: k,
    disabled: k !== 'self_regulating',
  }));

  return (
    <>
      <WorkflowSteps current={1} />
      <Space direction="vertical" size={5} style={{ width: '100%' }}>
        <Card size="small" className="workspace-control-card">
          <Row gutter={[12, 12]} align="middle">
            <Col flex="1 1 360px">
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Text strong>
                  <ThunderboltOutlined style={{ marginRight: 6, color: '#faad14' }} />
                  Вариант системы
                </Text>
                <Space size={4} wrap>
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
                </Space>
              </Space>
            </Col>

            <Col flex="1 1 360px">
              <Space wrap size={8}>
              <Button size="small" block onClick={() => navigate(ROUTES.heatCalc)}>
                ← К теплопотерям
              </Button>
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
              <Button size="small" block onClick={() => navigate(ROUTES.specification)}>
                Спец. →
              </Button>
              </Space>
            </Col>

            <Col flex="1 1 420px">
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Тип кабеля</Text>
                <Segmented<CableTypeKey>
                  size="small"
                  value={cableType}
                  onChange={setCableType}
                  options={cableTypeOptions}
                />
              </Space>
            </Col>
            {isEmployee && (
              <Col flex="0 0 260px">
                <Text style={{ fontSize: 12, color: '#888', display: 'block' }}>
                  База расчёта
                </Text>
                <Segmented<CableSource>
                  size="small"
                  value={cableSource}
                  onChange={setCableSource}
                  options={[
                    { label: 'Встроенная', value: 'builtin' },
                    { label: 'Внешняя', value: 'extended' },
                    { label: 'Все', value: 'all' },
                  ]}
                  style={{ marginTop: 4 }}
                />
              </Col>
            )}
          </Row>
        </Card>

        {stats.calcedCount > 0 && (
          <ElectricalSummary
            totalCableLength={stats.totalCableLength}
            totalPower={stats.totalPower}
            totalCurrent={stats.totalCurrent}
            calcedCount={stats.calcedCount}
            totalObjects={objects.length}
          />
        )}

        <Card
          size="small"
          className="workspace-table-card"
          title={<Text strong>Карточки объектов для СО{variant}</Text>}
          bodyStyle={{ paddingTop: 8 }}
        >
            {stats.failedCount > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`Ошибки в ${stats.failedCount} объектах варианта СО${variant}`}
                style={{ marginBottom: 10 }}
              />
            )}
            {objects.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                message="Нет объектов"
                description="Добавьте объекты на шаге «Теплопотери»."
              />
            ) : (
              <Table<ProjectObject>
                className="calc-spreadsheet electrical-spreadsheet"
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={objects}
                scroll={{ x: 1180, y: 'calc(100vh - 430px)' }}
                rowClassName={(obj) =>
                  electricalCalcError(stats.calcByObjectId[obj.id]) ? 'row-invalid' : ''
                }
                columns={[
                  {
                    title: '#',
                    width: 44,
                    render: (_: unknown, __: ProjectObject, idx: number) => idx + 1,
                  },
                  {
                    title: 'Объект',
                    dataIndex: ['params', 'name'],
                    width: 220,
                    ellipsis: true,
                    render: (v: unknown, obj) => String(v ?? `${obj.object_type} ${obj.id}`),
                  },
                  {
                    title: 'Статус',
                    width: 130,
                    render: (_: unknown, obj) => {
                      const calc = stats.calcByObjectId[obj.id];
                      const err = electricalCalcError(calc);
                      if (isElectricalCalcSuccess(calc)) {
                        return <Tag color="success" icon={<CheckCircleFilled />}>расчёт выполнен</Tag>;
                      }
                      if (err) return <Tag color="error" icon={<CloseCircleFilled />}>ошибка</Tag>;
                      return <Tag>не рассчитан</Tag>;
                    },
                  },
                  {
                    title: 'Тип кабеля',
                    width: 210,
                    render: () => (
                      <Select
                        size="small"
                        value={cableType}
                        options={cableTypeOptions}
                        style={{ width: '100%' }}
                        onChange={setCableType}
                      />
                    ),
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
                    width: 128,
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
                    width: 82,
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
                    width: 100,
                    align: 'right',
                    render: (_: unknown, obj) =>
                      formatNumber(Number(stats.calcByObjectId[obj.id]?.results?.cable_length), 1),
                  },
                  {
                    title: 'Мощность, Вт',
                    width: 120,
                    align: 'right',
                    render: (_: unknown, obj) =>
                      formatPower(Number(stats.calcByObjectId[obj.id]?.results?.total_power)),
                  },
                  {
                    title: 'Ток, А',
                    width: 88,
                    align: 'right',
                    render: (_: unknown, obj) =>
                      formatNumber(Number(stats.calcByObjectId[obj.id]?.results?.current), 2),
                  },
                  {
                    title: 'Сообщение',
                    width: 280,
                    ellipsis: true,
                    render: (_: unknown, obj) => (
                      <Text type="secondary">
                        {electricalCalcError(stats.calcByObjectId[obj.id]) ?? '—'}
                      </Text>
                    ),
                  },
                ]}
              />
            )}
        </Card>
      </Space>
    </>
  );
}
