import type { ReactNode } from 'react';
import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ProjectMenu from './ProjectMenu';

const { Header, Sider, Content } = Layout;

interface Props {
  children?: ReactNode;
}

export default function MainLayout({ children }: Props) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="heatcalc-header">
        <h2 style={{ color: 'white', margin: 0, marginRight: 24 }}>HeatCalc</h2>
        <ProjectMenu />
      </Header>
      <Layout>
        <Sider width={220} className="heatcalc-sidebar" theme="light">
          <Sidebar />
        </Sider>
        <Content className="heatcalc-content">{children ?? <Outlet />}</Content>
      </Layout>
    </Layout>
  );
}
