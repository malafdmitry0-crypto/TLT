import { useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Tabs, Tooltip, Typography } from 'antd';
import {
  DatabaseOutlined,
  FireOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';

import ObjectWizard from '@/components/wizard/ObjectWizard';
import PipeTable from '@/components/tables/PipeTable';
import TankTable from '@/components/tables/TankTable';
import WorkflowSteps from '@/components/WorkflowSteps';
import ImportExcelButton from '@/components/ImportExcelButton';
import ExportObjectsButton from '@/components/ExportObjectsButton';
import EmptyProjectState from '@/components/common/EmptyProjectState';
import TabBadge from '@/components/common/TabBadge';
import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { listObjects } from '@/api/projects';
import { useHeatCalcMutations } from '@/hooks/useHeatCalcMutations';
import type { ProjectObject } from '@/types/project';

const { Text } = Typography;

/** В MVP мастер знает только две формы — трубу и резервуар. */
type WizardObjectType = 'pipe' | 'tank';

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
  const allValid = total > 0 && valid === total;
  return (
    <div
      style={{
        marginTop: 12,
        padding: '6px 8px',
        background: allValid ? '#f6ffed' : '#fff7e6',
        borderRadius: 6,
        border: `1px solid ${allValid ? '#b7eb8f' : '#ffd591'}`,
      }}
    >
      <Text style={{ fontSize: 11, display: 'block' }}>
        Объектов: <strong>{total}</strong>
      </Text>
      {valid < total ? (
        <Text style={{ fontSize: 11, color: '#d9363e' }}>
          Не рассчитано: <strong>{total - valid}</strong>
        </Text>
      ) : (
        <Text style={{ fontSize: 11, color: '#52c41a' }}>Все рассчитаны ✓</Text>
      )}
    </div>
  );
}

export default function HeatCalcPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const [wizardState, setWizardState] = useState<WizardState | null>(null);
  const [activeTab, setActiveTab] = useState<'pipe' | 'tank'>('pipe');

  const { data: objects = [] } = useQuery({
    queryKey: ['project', project?.id, 'objects'],
    queryFn: () => listObjects(project!.id),
    enabled: !!project,
  });

  const closeWizard = () => setWizardState(null);
  const { add, edit, reorder, batchCalc } = useHeatCalcMutations(
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

  const pipes = objects.filter((o) => o.object_type === 'pipe');
  const tanks = objects.filter((o) => o.object_type === 'tank');
  const validCount = objects.filter((o) => o.is_valid).length;
  const totalCount = objects.length;

  function openAddWizard(type: WizardObjectType) {
    setWizardState({ type });
    setActiveTab(type);
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

  /** Сшивает новый порядок одной вкладки с неизменным порядком другой. */
  function handleReorder(kind: 'pipe' | 'tank', newOrder: ProjectObject[]) {
    const pipeIds = kind === 'pipe' ? newOrder.map((o) => o.id) : pipes.map((o) => o.id);
    const tankIds = kind === 'tank' ? newOrder.map((o) => o.id) : tanks.map((o) => o.id);
    reorder.mutate([...pipeIds, ...tankIds]);
  }

  const tabItems = [
    {
      key: 'pipe',
      label: <TabBadge label="Трубопроводы" count={pipes.length} />,
      children: (
        <PipeTable
          data={pipes}
          projectId={project.id}
          onEdit={openEditWizard}
          onReorder={(newPipes) => handleReorder('pipe', newPipes)}
        />
      ),
    },
    {
      key: 'tank',
      label: <TabBadge label="Резервуары" count={tanks.length} />,
      children: (
        <TankTable
          data={tanks}
          projectId={project.id}
          onEdit={openEditWizard}
          onReorder={(newTanks) => handleReorder('tank', newTanks)}
        />
      ),
    },
  ];

  return (
    <>
      <WorkflowSteps current={0} />
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Card size="small" className="workspace-control-card">
          <Row gutter={[12, 12]} align="middle">
            <Col flex="1 1 360px">
              <Alert
                type="warning"
                showIcon
                message="Общие первичные данные проекта"
                description="Климат, температура окружающей среды, напряжение, коэффициент запаса и тип прокладки используются для пересчета объектов."
                action={<Button size="small">Открыть...</Button>}
              />
            </Col>
            <Col flex="0 0 auto">
              <Space wrap size={8}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                size="small"
                onClick={() => openAddWizard('pipe')}
              >
                {OBJECT_TYPE_LABELS['pipe']}
              </Button>
              <Button
                icon={<PlusOutlined />}
                size="small"
                onClick={() => openAddWizard('tank')}
              >
                {OBJECT_TYPE_LABELS['tank']}
              </Button>
              <ImportExcelButton projectId={project.id} />
              {role === 'employee' && (
                <ExportObjectsButton
                  projectId={project.id}
                  projectName={project.name}
                  disabled={totalCount === 0}
                />
              )}
              </Space>
            </Col>
            <Col flex="0 0 190px">
              <ObjectCountBadge total={totalCount} valid={validCount} />
            </Col>
          </Row>
        </Card>

        <Card size="small" className="workspace-control-card">
          <Row gutter={[12, 8]}>
            <Col flex="1 1 280px">
              <Text strong>
                <DatabaseOutlined style={{ marginRight: 6 }} />
                {wizardState?.editingObject
                  ? 'Редактирование объекта'
                  : wizardState
                    ? `Новый объект: ${OBJECT_TYPE_LABELS[wizardState.type]}`
                    : 'Плоская форма объекта'}
              </Text>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                Клик по строке открывает объект на редактирование; кнопки добавления создают новую запись.
              </Text>
            </Col>
            <Col flex="2 1 620px">
              <div className="heat-flat-form-preview">
                <span>Геометрия</span>
                <span>Теплоизоляция</span>
                <span>Температура и среда</span>
                <span>Электрические параметры</span>
                <span>Арматура</span>
              </div>
            </Col>
          </Row>
        </Card>

          <Card
            size="small"
            className="workspace-table-card"
            title={<Text strong>Объекты проекта</Text>}
            extra={
              <Tooltip
                title={
                  validCount === 0
                    ? 'Добавьте и рассчитайте хотя бы один объект'
                    : ''
                }
                placement="topRight"
              >
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={batchCalc.isPending}
                  disabled={validCount === 0}
                  onClick={() => batchCalc.mutate()}
                >
                  Электрорасчёт →
                </Button>
              </Tooltip>
            }
            bodyStyle={{ paddingTop: 0 }}
          >
            <Tabs
              activeKey={activeTab}
              onChange={(k) => setActiveTab(k as 'pipe' | 'tank')}
              items={tabItems}
              size="small"
              tabBarStyle={{ marginBottom: 8 }}
            />
          </Card>
      </Space>

      {wizardState && (
        <ObjectWizard
          objectType={wizardState.type}
          onClose={closeWizard}
          onSubmit={handleWizardSubmit}
          submitting={add.isPending || edit.isPending}
          initialParams={wizardState.editingObject?.params}
        />
      )}
    </>
  );
}
