import { Col, Row, Statistic, Steps, Typography } from 'antd';
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
import { getObjectsSummary } from '@/api/projects';
import { getSpecification } from '@/api/specifications';
import { ROUTES } from '@/routes/routes';
import { useLegacyElectricalVariantContext } from '@/hooks/useLegacyElectricalVariantContext';
import { TltAlert, TltCard } from '@/components/ui-kit';
import './workspace-page.css';

const { Title, Paragraph } = Typography;

export default function WorkspacePage() {
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.currentProject);
  const variantContext = useLegacyElectricalVariantContext(project?.id);
  const selectedElectricalVariant = variantContext.selectedVariant;
  const selectedElectricalVariantId = selectedElectricalVariant?.id ?? null;
  const legacyVariantNumber = variantContext.legacyVariantNumber;

  const { data: summary } = useQuery({
    queryKey: [
      'project',
      project?.id,
      'objects',
      'summary',
      selectedElectricalVariantId ?? 'no-electrical-variant',
    ],
    queryFn: () => getObjectsSummary(
      project!.id,
      selectedElectricalVariantId ?? undefined,
    ),
    enabled: !!project && !variantContext.isLoading && !variantContext.isError,
  });

  const { data: spec } = useQuery({
    queryKey: [
      'spec',
      project?.id,
      selectedElectricalVariantId,
      legacyVariantNumber,
    ],
    queryFn: () => getSpecification(
      project!.id,
      legacyVariantNumber!,
      selectedElectricalVariant!.id,
    ),
    enabled: Boolean(
      project
      && selectedElectricalVariantId
      && legacyVariantNumber != null
      && !variantContext.isLoading
      && !variantContext.isError,
    ),
  });

  if (!project) {
    return (
      <TltCard>
        <Title level={3} className="workspace-page-title">Добро пожаловать в HeatCalc</Title>
        <Paragraph type="secondary">
          Система для расчёта тепловых потерь и подбора систем электрообогрева
          трубопроводов и резервуаров. Работайте по шагам: теплопотери → электрорасчёт → спецификация → отчёт.
        </Paragraph>
        <TltAlert
          tone="info"
          title="Начните с выбора или создания проекта"
          className="workspace-page-alert"
        >
          Нажмите «Новый проект» в шапке, чтобы создать проект, или «Открыть», чтобы выбрать существующий.
        </TltAlert>
      </TltCard>
    );
  }

  // Подсчёт прогресса
  const totalObjects = summary?.total ?? 0;
  const validObjects = summary?.valid ?? 0;
  const elecCalcCount = selectedElectricalVariantId
    ? summary?.objects_with_successful_electrical_calculation ?? 0
    : 0;
  const failedCalcCount = selectedElectricalVariantId
    ? summary?.failed_electrical_calculations ?? 0
    : 0;
  const hasSpec = legacyVariantNumber != null && (spec?.items?.length ?? 0) > 0;
  const hasActualSpec = hasSpec && spec?.is_stale !== true;

  // Текущий шаг (0-based)
  const currentStep =
    totalObjects === 0 ? 0
    : elecCalcCount < totalObjects ? 1
    : !hasActualSpec ? 2
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
      description: spec?.is_stale ? 'Устарела' : hasSpec ? 'Сформирована ✓' : 'Не сформирована',
      icon: <UnorderedListOutlined />,
      route: ROUTES.specification,
      done: hasActualSpec,
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
      <TltCard className="workspace-page-card">
        <Title level={4} className="workspace-page-title">
          {project.name}
        </Title>
        <Paragraph type="secondary" className="workspace-page-lead">
          Следуйте шагам ниже. Каждый шаг разблокирует следующий. Нажмите на карточку шага, чтобы перейти к нему.
        </Paragraph>
      </TltCard>

      {/* Прогресс-бар */}
      <TltCard className="workspace-page-card">
        <Steps
          current={currentStep}
          items={steps.map((s) => ({
            title: s.title,
            description: s.description,
            icon: s.done
              ? <CheckCircleOutlined className="workspace-step-icon--done" />
              : s.done === false && steps.indexOf(s) < currentStep
                ? <ClockCircleOutlined />
                : s.icon,
          }))}
        />
      </TltCard>

      {/* Карточки шагов */}
      <Row gutter={[16, 16]}>
        {steps.map((s, idx) => (
          <Col span={12} key={s.route}>
            <TltCard
              onClick={() => navigate(s.route)}
              className={[
                'workspace-step-card',
                s.done ? 'workspace-step-card--done' : '',
                idx === currentStep ? 'workspace-step-card--current' : '',
                idx > currentStep + 1 ? 'workspace-step-card--far' : '',
              ].filter(Boolean).join(' ')}
            >
              <Statistic
                title={`${idx + 1}. ${s.title}`}
                value={s.description}
                prefix={
                  s.done
                    ? <CheckCircleOutlined className="workspace-step-icon--done" />
                    : s.icon
                }
              />
            </TltCard>
          </Col>
        ))}
      </Row>
    </div>
  );
}
