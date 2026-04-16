import { Card, Col, Row, Statistic, Steps, Typography, Alert } from 'antd';
import {
  FireOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/store/projectStore';
import { listObjects } from '@/api/projects';
import { listElectricalCalcs } from '@/api/calculations';
import { getSpecification } from '@/api/specifications';
import { ROUTES } from '@/routes/routes';
import { isElectricalCalcSuccess } from '@/utils/calcStatus';

const { Title, Paragraph } = Typography;

export default function WorkspacePage() {
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.currentProject);

  const { data: objects = [] } = useQuery({
    queryKey: ['project', project?.id, 'objects'],
    queryFn: () => listObjects(project!.id),
    enabled: !!project,
  });

  const { data: elecCalcs = [] } = useQuery({
    queryKey: ['project', project?.id, 'electrical-calcs'],
    queryFn: () => listElectricalCalcs(project!.id),
    enabled: !!project,
  });

  const { data: spec } = useQuery({
    queryKey: ['spec', project?.id],
    queryFn: () => getSpecification(project!.id),
    enabled: !!project,
  });

  if (!project) {
    return (
      <Card>
        <Title level={3} style={{ marginTop: 0 }}>Добро пожаловать в HeatCalc</Title>
        <Paragraph type="secondary">
          Система для расчёта тепловых потерь и подбора систем электрообогрева
          трубопроводов и резервуаров. Работайте по шагам: теплопотери → электрорасчёт → спецификация → отчёт.
        </Paragraph>
        <Alert
          type="info"
          showIcon
          message="Начните с выбора или создания проекта"
          description="Нажмите «Новый проект» в шапке, чтобы создать проект, или «Открыть», чтобы выбрать существующий."
          style={{ maxWidth: 520 }}
        />
      </Card>
    );
  }

  // Подсчёт прогресса
  const totalObjects = objects.length;
  const validObjects = objects.filter((o) => o.is_valid).length;
  const successCalcIds = new Set(
    elecCalcs.filter(isElectricalCalcSuccess).map((c) => String(c.object_id))
  );
  const elecCalcCount = objects.filter((o) => successCalcIds.has(o.id)).length;
  const failedCalcCount =
    elecCalcs.length - elecCalcs.filter(isElectricalCalcSuccess).length;
  const hasSpec = (spec?.items?.length ?? 0) > 0;

  // Текущий шаг (0-based)
  const currentStep =
    totalObjects === 0 ? 0
    : elecCalcCount < totalObjects ? 1
    : !hasSpec ? 2
    : 3;

  const steps = [
    {
      title: 'Теплопотери',
      description: totalObjects === 0
        ? 'Добавьте объекты'
        : validObjects < totalObjects
          ? `${validObjects} / ${totalObjects} рассчитано`
          : `${totalObjects} объектов ✓`,
      icon: <FireOutlined />,
      route: ROUTES.heatCalc,
      done: totalObjects > 0 && validObjects === totalObjects,
    },
    {
      title: 'Электрорасчёт',
      description: totalObjects === 0
        ? 'Сначала добавьте объекты'
        : elecCalcCount === 0 && failedCalcCount === 0
          ? 'Расчёты не выполнены'
          : failedCalcCount > 0
            ? `${elecCalcCount} из ${totalObjects} · ошибок: ${failedCalcCount}`
            : elecCalcCount < totalObjects
              ? `${elecCalcCount} / ${totalObjects} рассчитано`
              : `${elecCalcCount} объектов ✓`,
      icon: <ThunderboltOutlined />,
      route: ROUTES.elecCalc,
      done: totalObjects > 0 && elecCalcCount === totalObjects && failedCalcCount === 0,
    },
    {
      title: 'Спецификация',
      description: hasSpec ? 'Сформирована ✓' : 'Не сформирована',
      icon: <UnorderedListOutlined />,
      route: ROUTES.specification,
      done: hasSpec,
    },
    {
      title: 'Отчёт',
      description: 'Итоговый документ',
      icon: <FileTextOutlined />,
      route: ROUTES.report,
      done: false,
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={4} style={{ marginTop: 0 }}>
          {project.name}
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Следуйте шагам ниже. Каждый шаг разблокирует следующий. Нажмите на карточку шага, чтобы перейти к нему.
        </Paragraph>
      </Card>

      {/* Прогресс-бар */}
      <Card style={{ marginBottom: 16 }}>
        <Steps
          current={currentStep}
          items={steps.map((s) => ({
            title: s.title,
            description: s.description,
            icon: s.done ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : s.done === false && steps.indexOf(s) < currentStep ? <ClockCircleOutlined /> : s.icon,
          }))}
        />
      </Card>

      {/* Карточки шагов */}
      <Row gutter={[16, 16]}>
        {steps.map((s, idx) => (
          <Col span={12} key={s.route}>
            <Card
              hoverable
              onClick={() => navigate(s.route)}
              style={{
                borderColor: idx === currentStep ? '#1890ff' : undefined,
                opacity: idx > currentStep + 1 ? 0.6 : 1,
              }}
            >
              <Statistic
                title={`${idx + 1}. ${s.title}`}
                value={s.description}
                prefix={
                  s.done
                    ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    : s.icon
                }
                valueStyle={{
                  fontSize: 14,
                  color: s.done ? '#52c41a' : idx === currentStep ? '#1890ff' : '#595959',
                }}
              />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
