import type { ReactNode } from 'react';
import { Button, Layout, Space } from 'antd';
import { DatabaseOutlined, FireFilled, LogoutOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import ProjectMenu from './ProjectMenu';
import { logout as logoutApi } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';

const { Header, Content } = Layout;

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
      <Layout className="heatcalc-main-layout">
        <Content className="heatcalc-content">{children ?? <Outlet />}</Content>
      </Layout>
    </Layout>
  );
}
