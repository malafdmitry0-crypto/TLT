import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Layout, Space } from 'antd';
import { DatabaseOutlined, FireFilled, LogoutOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import ProjectMenu from './ProjectMenu';
import { RouteErrorBoundary } from '@/components/common/ErrorBoundary';
import { logout as logoutApi } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';

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
      <Button icon={<QuestionCircleOutlined />} onClick={() => navigate(helpRoute)}>
        Инструкция
      </Button>
      <Button icon={<LogoutOutlined />} onClick={handleLogout}>
        Выход
      </Button>
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

  useEffect(() => {
    const update = () => {
      setNarrowViewport(window.innerWidth < MIN_SUPPORTED_VIEWPORT_PX);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <Layout style={{ minHeight: '100vh' }}>
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
      {narrowViewport && (
        <Alert
          className="viewport-min-width-warning"
          type="warning"
          showIcon
          banner
          message="Рекомендуемая ширина окна — от 1280 px"
          description="Интерактивный рабочий поток Phase 5 официально поддерживается от 1280 px (PDL-ER-30). На меньшей ширине возможны ограничения раскладки; печать остаётся адаптивной."
        />
      )}
      <Layout className="heatcalc-main-layout">
        <Content className="heatcalc-content">
          <RouteErrorBoundary>{children ?? <Outlet />}</RouteErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  );
}
