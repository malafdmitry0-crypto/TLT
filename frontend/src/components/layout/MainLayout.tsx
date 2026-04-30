import type { ReactNode } from 'react';
import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ProjectMenu from './ProjectMenu';

const { Header, Content } = Layout;

interface Props {
  children?: ReactNode;
}

export default function MainLayout({ children }: Props) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="heatcalc-header">
        <h2 className="heatcalc-title">HeatCalc</h2>
        <ProjectMenu />
      </Header>
      <Layout className="heatcalc-main-layout">
        <div className="heatcalc-topnav">
          <Sidebar />
        </div>
        <Content className="heatcalc-content">{children ?? <Outlet />}</Content>
      </Layout>
    </Layout>
  );
}
