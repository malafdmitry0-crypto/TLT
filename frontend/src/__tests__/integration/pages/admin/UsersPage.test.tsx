import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from '@/pages/admin/UsersPage';

vi.mock('@/api/admin', () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  deactivateUser: vi.fn(),
  // прочие, импортируемые из admin, оставляем на всякий
  listCoefficients: vi.fn(),
  upsertCoefficient: vi.fn(),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <UsersPage />
    </QueryClientProvider>
  );
}

describe('UsersPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('рендерит таблицу из listUsers', async () => {
    const { listUsers } = await import('@/api/admin');
    (listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: '1', email: 'a@b.c', full_name: 'A', role: 'employee', is_active: true },
      { id: '2', email: 'd@e.f', full_name: null, role: 'admin', is_active: false },
    ]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('a@b.c')).toBeInTheDocument();
      expect(screen.getByText('d@e.f')).toBeInTheDocument();
    });
  });

  it('кнопка «Деактивировать» только у активных', async () => {
    const { listUsers } = await import('@/api/admin');
    (listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: '1', email: 'on@x', full_name: '', role: 'employee', is_active: true },
      { id: '2', email: 'off@x', full_name: '', role: 'employee', is_active: false },
    ]);
    renderPage();
    await screen.findByText('on@x');
    const buttons = screen.getAllByRole('button', { name: /Деактивировать/i });
    expect(buttons.length).toBe(1);
  });

  it('Открывает модалку «Добавить»', async () => {
    const { listUsers } = await import('@/api/admin');
    (listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: 'Добавить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    // Modal с антд имеет role dialog
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
