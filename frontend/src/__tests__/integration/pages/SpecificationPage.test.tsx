import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SpecificationPage from '@/pages/SpecificationPage';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/project';

vi.mock('@/api/specifications', () => ({
  getSpecification: vi.fn(),
  generateSpecification: vi.fn(),
  saveSpecificationItems: vi.fn(),
  listAccessoriesExtended: vi.fn().mockResolvedValue([]),
}));

const mockProject: Project = {
  id: 'p-1',
  name: 'Спецификация-проект',
  description: null,
  task_number: null,
  user_id: null,
  session_id: 'sid',
  status: 'draft',
  owner_email: null,
  object_types: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter>
        <SpecificationPage />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
}

describe('SpecificationPage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().setCurrentProject(null);
    useCalculationVariantStore.setState({ variantByProject: {} });
  });

  it('показывает заглушку «Проект не выбран» без проекта', () => {
    renderPage();
    expect(screen.getByText(/Проект не выбран/i)).toBeInTheDocument();
  });

  it('показывает кнопку «Сформировать» при пустых items', async () => {
    const { getSpecification } = await import('@/api/specifications');
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's-1',
      project_id: 'p-1',
      variant_number: 1,
      items: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Спецификация не сформирована/i)).toBeInTheDocument();
    });
    // Кнопка «Сформировать» в левой панели управления (рядом с иконкой ReloadOutlined)
    const buttons = screen.getAllByRole('button');
    expect(
      buttons.some((b) => b.textContent?.trim() === 'Сформировать')
    ).toBe(true);
  });

  it('отображает строки спецификации, пришедшие с бэкенда', async () => {
    const { getSpecification } = await import('@/api/specifications');
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's-1',
      project_id: 'p-1',
      variant_number: 1,
      items: [
        {
          category: 'Кабель',
          name: 'ТЛТ-30',
          article: 'TLT-30-220',
          unit: 'м',
          quantity: 12,
          params: {},
        },
        {
          category: 'Аксессуары',
          name: 'Концевой набор',
          article: 'KIT-1',
          unit: 'шт.',
          quantity: 2,
          params: {},
        },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('ТЛТ-30')).toBeInTheDocument();
      expect(screen.getByText('Концевой набор')).toBeInTheDocument();
    });
    // При наличии items — кнопка «Пересчитать»
    expect(screen.getByRole('button', { name: /Пересчитать/i })).toBeInTheDocument();
  });
});
