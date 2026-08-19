import { Layout, Menu } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout as logoutApi } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { RouteErrorBoundary } from '@/components/common/ErrorBoundary';
import './admin-layout.css';

const { Header, Sider, Content } = Layout;

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logoutApi().catch(() => undefined);
    logout();
    navigate('/');
  };

  return (
    <Layout className="admin-layout">
      <Header className="heatcalc-header">
        <h2 className="admin-layout-title">Alfa Heat Desin — Администрирование</h2>
        <button type="button" onClick={handleLogout} className="admin-layout-logout">
          Выход
        </button>
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
              { key: '/admin/specification-catalogs', label: 'Каталоги спецификации' },
              { type: 'divider' as const },
              { key: '/help/admin', label: 'Инструкция', icon: <QuestionCircleOutlined /> },
            ]}
            onClick={(e) => navigate(e.key)}
          />
        </Sider>
        <Content className="admin-layout-content">
          <RouteErrorBoundary>
            <Outlet />
          </RouteErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  );
}
