import { Layout, Menu } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

const { Header, Sider, Content } = Layout;

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="heatcalc-header">
        <h2 style={{ color: 'white', margin: 0 }}>HeatCalc — Администрирование</h2>
        <a
          onClick={() => {
            logout();
            navigate('/');
          }}
          style={{ color: 'white', marginLeft: 'auto', cursor: 'pointer' }}
        >
          Выход
        </a>
      </Header>
      <Layout>
        <Sider width={220} theme="light">
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={[
              { key: '/admin/users', label: 'Пользователи' },
              { key: '/admin/coefficients', label: 'Коэффициенты' },
              { key: '/admin/database', label: 'База данных' },
              { key: '/admin/references', label: 'Справочники' },
              { key: '/admin/formulas', label: 'Формулы' },
              { type: 'divider' as const },
              { key: '/help/admin', label: 'Инструкция', icon: <QuestionCircleOutlined /> },
            ]}
            onClick={(e) => navigate(e.key)}
          />
        </Sider>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
