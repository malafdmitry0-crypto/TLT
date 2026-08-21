/**
 * AF9-TEST-HARNESS-01 — render helper for Electrical integration.
 */
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import ElecCalcPage from '@/pages/ElecCalcPage';

export function renderPage(
  state?: { activeJobId?: string },
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TestMemoryRouter initialEntries={[{ pathname: '/workspace/elec-calc', state }]}>
        <ElecCalcPage />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}
