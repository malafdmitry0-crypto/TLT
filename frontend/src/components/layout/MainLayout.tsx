import { useEffect, useState, type ReactNode } from 'react';
import { Layout, Space } from 'antd';
import { DatabaseOutlined, FireFilled, LogoutOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import ProjectMenu from './ProjectMenu';
import { RouteErrorBoundary } from '@/components/common/ErrorBoundary';
import { TltAlert, TltButton } from '@/components/ui-kit';
import { ProjectCalculationWorkflowBanner } from '@/components/workflow/ProjectCalculationWorkflowBanner';
import { CalculationWorkflowLockBoundary } from '@/components/workflow/CalculationWorkflowLockBoundary';
import { logout as logoutApi } from '@/api/auth';
import { useProjectCalculationWorkflow } from '@/hooks/useProjectCalculationWorkflow';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import './layout-chrome.css';

const { Header, Content } = Layout;

/** PDL-ER-30: interactive product flow is officially supported from 1280px. */
const MIN_SUPPORTED_VIEWPORT_PX = 1280;

interface Props {
  children?: ReactNode;
}

function HeaderActions() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const helpRoute = role === 'admin' ? '/help/admin' : role === 'employee' ? '/help/employee' : '/help/guest';

  const handleLogout = async () => {
    await logoutApi().catch(() => undefined);
    logout();
    navigate('/');
  };

  return (
    <Space className="header-actions" size={3}>
      <TltButton icon={<QuestionCircleOutlined />} onClick={() => navigate(helpRoute)}>
        Инструкция
      </TltButton>
      <TltButton icon={<LogoutOutlined />} onClick={handleLogout}>
        Выход
      </TltButton>
    </Space>
  );
}

function WorkspaceHeaderContextRow() {
  const context = useWorkspaceHeaderStore((s) => s.context);

  if (!context) return null;

  return (
    <div className="heatcalc-context-row">
      <div className="workspace-header-context" aria-label="Контекст рабочей области">
        <DatabaseOutlined className="workspace-header-context-icon" />
        <span className="workspace-header-context-title" title={context.title}>
          {context.title}
        </span>
        <span className={`workspace-header-context-mode ${context.mode}`}>
          {context.modeLabel}
        </span>
      </div>
    </div>
  );
}

export default function MainLayout({ children }: Props) {
  const [narrowViewport, setNarrowViewport] = useState(false);
  const location = useLocation();
  const projectId = useProjectStore((state) => state.currentProject?.id);
  const {
    workflow,
    isCalculationLocked,
    cancelWorkflow,
    cancelPending,
  } = useProjectCalculationWorkflow(projectId);
  const contentLocked = isCalculationLocked && !(
    workflow?.status === 'waiting_input'
    && location.pathname.startsWith('/workspace/specification')
  );

  useEffect(() => {
    const update = () => {
      setNarrowViewport(window.innerWidth < MIN_SUPPORTED_VIEWPORT_PX);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <Layout className="main-layout">
      <Header className="heatcalc-header">
        <div className="heatcalc-primary-row">
          <div className="heatcalc-brand" aria-label="HeatCalc">
            <FireFilled className="heatcalc-brand-icon" />
            <h2 className="heatcalc-title">HeatCalc</h2>
          </div>
          <nav className="heatcalc-primary-nav" aria-label="Разделы проекта">
            <Sidebar />
          </nav>
          <div className="heatcalc-primary-actions">
            <ProjectMenu />
            <HeaderActions />
          </div>
        </div>
        <WorkspaceHeaderContextRow />
      </Header>
      {workflow && isCalculationLocked && (
        <ProjectCalculationWorkflowBanner
          workflow={workflow}
          cancelPending={cancelPending}
          onCancel={() => void cancelWorkflow(workflow.id)}
        />
      )}
      {narrowViewport && (
        <TltAlert
          className="viewport-min-width-warning"
          tone="warning"
          title="Рекомендуемая ширина окна — от 1280 px"
        >
          Интерактивный рабочий поток Phase 5 официально поддерживается от 1280 px (PDL-ER-30).
          На меньшей ширине возможны ограничения раскладки; печать остаётся адаптивной.
        </TltAlert>
      )}
      <Layout className="heatcalc-main-layout">
        <Content className="heatcalc-content">
          <CalculationWorkflowLockBoundary locked={contentLocked}>
            <RouteErrorBoundary>{children ?? <Outlet />}</RouteErrorBoundary>
          </CalculationWorkflowLockBoundary>
        </Content>
      </Layout>
    </Layout>
  );
}
