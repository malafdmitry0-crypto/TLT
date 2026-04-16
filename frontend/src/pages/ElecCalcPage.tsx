import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  List,
  Row,
  Segmented,
  Space,
  Tag,
  Tooltip,
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
  type CableSource,
} from '@/api/calculations';
import { listObjects } from '@/api/projects';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import { useElectricalStats } from '@/hooks/useElectricalStats';
import { isElectricalCalcSuccess, electricalCalcError } from '@/utils/calcStatus';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import WorkflowSteps from '@/components/WorkflowSteps';
import ObjectCalcCard from '@/components/electrical/ObjectCalcCard';
import ElectricalSummary from '@/components/electrical/ElectricalSummary';
import { ROUTES } from '@/routes/routes';

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
  const [activeObjectId, setActiveObjectId] = useState<string | null>(null);

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
  const activeObject = useMemo(
    () => objects.find((o) => o.id === activeObjectId) ?? objects[0],
    [objects, activeObjectId],
  );
  const activeIndex = activeObject ? objects.indexOf(activeObject) : -1;

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
      <Row gutter={8} align="top">
        {/* Col 1 — Меню управления + варианты СО1..СО4 */}
        <Col flex="0 0 88px">
          <Card size="small" style={{ height: '100%' }}>
            <div style={{ marginBottom: 10 }}>
              <Text strong style={{ fontSize: 12 }}>
                <ThunderboltOutlined style={{ marginRight: 4, color: '#faad14' }} />
                Меню
              </Text>
            </div>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Button size="small" block onClick={() => navigate(ROUTES.heatCalc)}>
                ← К теплопотерям
              </Button>
              <Button
                size="small"
                block
                type="primary"
                icon={<ReloadOutlined />}
                loading={batchMut.isPending}
                disabled={stats.validObjects.length === 0}
                onClick={() => batchMut.mutate()}
              >
                Расчёт СО{variant}
              </Button>
              <Button size="small" block onClick={() => navigate(ROUTES.specification)}>
                Спец. →
              </Button>
            </Space>

            <div
              style={{
                marginTop: 14,
                paddingTop: 8,
                borderTop: '1px dashed #e8e8e8',
              }}
            >
              <Text style={{ fontSize: 10, color: '#888', display: 'block', marginBottom: 4 }}>
                Вариант системы
              </Text>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                {[1, 2, 3, 4].map((n) => (
                  <Button
                    key={n}
                    block
                    size="small"
                    type={variant === n ? 'primary' : 'default'}
                    onClick={() => setVariant(n)}
                  >
                    СО{n}
                  </Button>
                ))}
              </Space>
            </div>
          </Card>
        </Col>

        {/* Col 2 — Объекты обогрева системы */}
        <Col flex="0 0 240px">
          <Card
            size="small"
            title={<Text strong style={{ fontSize: 12 }}>Объекты обогрева — СО{variant}</Text>}
            bodyStyle={{ paddingTop: 8 }}
            style={{ height: '100%' }}
          >
            {objects.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                message="Нет объектов"
                description="Добавьте на шаге «Теплопотери»."
              />
            ) : (
              <List
                size="small"
                dataSource={objects}
                renderItem={(obj, idx) => {
                  const calc = stats.calcByObjectId[obj.id];
                  const ok = isElectricalCalcSuccess(calc);
                  const err = electricalCalcError(calc);
                  const name = String(
                    obj.params?.name ??
                      `${OBJECT_TYPE_LABELS[obj.object_type]} #${idx + 1}`,
                  );
                  const isActive = activeObject?.id === obj.id;
                  return (
                    <List.Item
                      style={{
                        cursor: 'pointer',
                        background: isActive ? '#e6f4ff' : undefined,
                        padding: '6px 8px',
                      }}
                      onClick={() => setActiveObjectId(obj.id)}
                    >
                      <Space size={4} style={{ width: '100%' }}>
                        <Tag color="blue" style={{ marginRight: 0, fontSize: 10 }}>
                          {OBJECT_TYPE_LABELS[obj.object_type] ?? obj.object_type}
                        </Tag>
                        <Text style={{ fontSize: 12, flex: 1 }} ellipsis={{ tooltip: name }}>
                          {name}
                        </Text>
                        {ok ? (
                          <CheckCircleFilled style={{ color: '#52c41a', fontSize: 12 }} />
                        ) : err ? (
                          <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 12 }} />
                        ) : null}
                      </Space>
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>

        {/* Col 3 — Структура системы (тип кабеля + источник) */}
        <Col flex="0 0 260px">
          <Card
            size="small"
            title={<Text strong style={{ fontSize: 12 }}>Структура системы</Text>}
            bodyStyle={{ paddingTop: 8 }}
            style={{ height: '100%' }}
          >
            <Text style={{ fontSize: 10, color: '#888' }}>Тип кабеля</Text>
            <Segmented<CableTypeKey>
              block
              size="small"
              vertical
              value={cableType}
              onChange={setCableType}
              options={cableTypeOptions}
              style={{ marginTop: 4 }}
            />
            {cableType !== 'self_regulating' && (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 8, padding: '4px 8px' }}
                message="Доступно в полной версии"
              />
            )}

            {isEmployee && (
              <div style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 10, color: '#888' }}>Источник кабелей</Text>
                <Segmented<CableSource>
                  block
                  size="small"
                  value={cableSource}
                  onChange={setCableSource}
                  options={[
                    { label: 'ТЛТ', value: 'builtin' },
                    { label: 'Внешн.', value: 'extended' },
                    { label: 'Все', value: 'all' },
                  ]}
                  style={{ marginTop: 4 }}
                />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Доступно сотруднику · {cables.length} кабелей
                </Text>
              </div>
            )}
          </Card>
        </Col>

        {/* Col 4 — Блок конфигурирования объекта + сводка */}
        <Col flex="1" style={{ minWidth: 0 }}>
          <Card
            size="small"
            title={<Text strong style={{ fontSize: 12 }}>Блок конфигурирования объекта</Text>}
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
            {stats.calcedCount > 0 && (
              <ElectricalSummary
                totalCableLength={stats.totalCableLength}
                totalPower={stats.totalPower}
                totalCurrent={stats.totalCurrent}
                calcedCount={stats.calcedCount}
                totalObjects={objects.length}
              />
            )}

            {activeObject ? (
              <ObjectCalcCard
                obj={activeObject}
                index={activeIndex >= 0 ? activeIndex : 0}
                calc={stats.calcByObjectId[activeObject.id]}
                cables={cables}
                cableSource={effectiveSource}
                projectId={project.id}
              />
            ) : (
              <Alert
                type="info"
                showIcon
                message="Выберите объект слева"
                description="После расчёта здесь появится подобранный кабель и параметры."
                action={
                  <Tooltip
                    title={
                      stats.validObjects.length === 0
                        ? 'Нет валидных объектов — проверьте параметры на шаге «Теплопотери»'
                        : ''
                    }
                  >
                    <Button
                      type="primary"
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={batchMut.isPending}
                      onClick={() => batchMut.mutate()}
                      disabled={stats.validObjects.length === 0}
                    >
                      Выполнить электрорасчёт
                    </Button>
                  </Tooltip>
                }
              />
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}
