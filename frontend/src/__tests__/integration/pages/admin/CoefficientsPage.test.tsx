import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CoefficientsPage from '@/pages/admin/CoefficientsPage';

vi.mock('@/api/admin', () => ({
  listCoefficients: vi.fn(),
  updateCoefficient: vi.fn(),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CoefficientsPage />
    </QueryClientProvider>
  );
}

describe('CoefficientsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('рендерит коэффициенты из API', async () => {
    const { listCoefficients } = await import('@/api/admin');
    (listCoefficients as ReturnType<typeof vi.fn>).mockResolvedValue([
      { key: 'safety_factor', value: 1.1, description: 'Запас' },
      { key: 'wind_factor', value: 1.0, description: 'Ветер' },
    ]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('safety_factor')).toBeInTheDocument();
      expect(screen.getByText('wind_factor')).toBeInTheDocument();
    });
  });

  it('пустой список — таблица показывает «Нет данных»', async () => {
    const { listCoefficients } = await import('@/api/admin');
    (listCoefficients as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      // antd Table показывает «No data» / «Нет данных» по умолчанию
      expect(screen.getAllByText(/No data|Нет данных/i)[0]).toBeInTheDocument();
    });
  });
});
