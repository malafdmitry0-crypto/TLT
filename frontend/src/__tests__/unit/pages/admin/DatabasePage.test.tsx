import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DatabasePage from '@/pages/admin/DatabasePage';

vi.mock('@/api/admin', () => ({
  listAdminCables: vi.fn(),
  createAdminCable: vi.fn(),
  updateAdminCable: vi.fn(),
  deleteAdminCable: vi.fn(),
  listAdminAccessories: vi.fn(),
  createAdminAccessory: vi.fn(),
  updateAdminAccessory: vi.fn(),
  deleteAdminAccessory: vi.fn(),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DatabasePage />
    </QueryClientProvider>
  );
}

describe('DatabasePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('рендерит таблицы Кабели/Аксессуары из admin API', async () => {
    const api = await import('@/api/admin');
    (api.listAdminCables as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'c1',
        cable_type: 'self_regulating',
        brand: 'ТЛТ',
        model: 'ТЛТ-40',
        power_per_meter: 40,
        max_temperature: 65,
        min_temperature: -60,
        resistance_per_meter: null,
        supplier_name: 'Поставщик',
        article: 'A-40',
        currency: 'RUB',
        price_per_meter: 120,
        stock_quantity_m: 500,
        stock_status: 'in_stock',
        lead_time_days: 2,
        supplier_priority: 1,
        is_preferred: true,
        order_multiple_m: 5,
        min_order_quantity_m: 10,
        is_discontinued: false,
        replacement_group: null,
        price_updated_at: null,
        stock_updated_at: null,
        commercial_data_source: 'test',
        params: null,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    ]);
    (api.listAdminAccessories as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'a1',
        category: 'Муфты',
        name: 'Муфта',
        article: 'M-1',
        params: { price_per_unit: 10 },
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Кабели \(1\)/i })).toBeInTheDocument();
      expect(screen.getByText('ТЛТ-40')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Аксессуары \(1\)/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Добавить кабель/i })).toBeInTheDocument();
  });
});
