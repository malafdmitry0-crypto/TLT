import AppRoutes from './routes';
import ErrorBoundary from '@/components/common/ErrorBoundary';

export default function App() {
  // Auth-state читается из localStorage синхронно при инициализации authStore
  // (см. readInitialState в store/authStore.ts) — отдельный hydrate не нужен.
  //
  // Корневой ErrorBoundary — последний рубеж: ловит сбои загрузки lazy-чанков,
  // ошибки в роутере и всё, что не перехватили вложенные границы (см.
  // RouteErrorBoundary в MainLayout), вместо «белого экрана».
  return (
    <ErrorBoundary boundaryName="root">
      <AppRoutes />
    </ErrorBoundary>
  );
}
