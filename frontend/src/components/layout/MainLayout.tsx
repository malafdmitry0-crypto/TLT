import type { ReactNode } from 'react';
import { Button, Layout, Space } from 'antd';
import { DatabaseOutlined, LogoutOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import ProjectMenu from './ProjectMenu';
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

  const handleLogout = () => {
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

function WorkspaceHeaderContext() {
  const context = useWorkspaceHeaderStore((s) => s.context);

  if (!context) return null;

  return (
    <div className="workspace-header-context" aria-label="Контекст рабочей области">
      <DatabaseOutlined className="workspace-header-context-icon" />
      <span className="workspace-header-context-title" title={context.title}>
        {context.title}
      </span>
      <span className={`workspace-header-context-mode ${context.mode}`}>
        {context.modeLabel}
      </span>
    </div>
  );
}

export default function MainLayout({ children }: Props) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="heatcalc-header">
        <h2 className="heatcalc-title">HeatCalc</h2>
        <ProjectMenu />
        <HeaderActions />
      </Header>
      <Layout className="heatcalc-main-layout">
        <div className="heatcalc-topnav">
          <Sidebar />
          <WorkspaceHeaderContext />
        </div>
        <Content className="heatcalc-content">{children ?? <Outlet />}</Content>
      </Layout>
    </Layout>
  );
}
