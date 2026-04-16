import AppRoutes from './routes';

export default function App() {
  // Auth-state читается из localStorage синхронно при инициализации authStore
  // (см. readInitialState в store/authStore.ts) — отдельный hydrate не нужен.
  return <AppRoutes />;
}
