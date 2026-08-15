import AppRoutes from './routes';
import AuthIdentityHydrator from '@/components/common/AuthIdentityHydrator';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { AntdAppShell } from '@/feedback/AntdAppShell';

export default function App() {
  // Роль и гостевая сессия читаются из localStorage синхронно. Для
  // сотрудника AuthIdentityHydrator восстанавливает user.id из HttpOnly-сессии:
  // без него собственный проект ошибочно считался read-only после F5.
  //
  // Корневой ErrorBoundary — последний рубеж: ловит сбои загрузки lazy-чанков,
  // ошибки в роутере и всё, что не перехватили вложенные границы (см.
  // RouteErrorBoundary в MainLayout), вместо «белого экрана».
  // AntdAppShell binds appMessage/appModal to ConfigProvider theme context.
  return (
    <AntdAppShell>
      <AuthIdentityHydrator />
      <ErrorBoundary boundaryName="root">
        <AppRoutes />
      </ErrorBoundary>
    </AntdAppShell>
  );
}
