import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ElecCalcPage from '@/pages/ElecCalcPage';
import { useProjectStore } from '@/store/projectStore';
import type { Project, ProjectObject } from '@/types/project';

vi.mock('@/api/projects', () => ({
  listObjects: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock('@/api/calculations', () => ({
  batchCalcElectrical: vi.fn(),
  listCables: vi.fn().mockResolvedValue([]),
  listElectricalCalcs: vi.fn(),
  selectCableManual: vi.fn(),
}));

vi.mock('@/api/references', () => ({
  getCablesTt: vi.fn().mockResolvedValue([
    {
      model: '30ТТВ2',
      series: 'ТТВ',
      nominal_power: 30,
      q1: -0.141,
      q2: 32,
      max_product_temp: 120,
      max_vapor_temp: 210,
      voltage: 220,
    },
  ]),
  getResistiveCables: vi.fn().mockResolvedValue({ single_core: [], three_core: [], common: {} }),
}));

const mockProject: Project = {
  id: 'p-1',
  name: 'Электро',
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

function makeObject(over: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'o-1',
    project_id: 'p-1',
    object_type: 'pipe',
    sort_order: 0,
    params: { name: 'Труба-1' },
    results: { heat_loss_per_meter: 50, total_heat_loss: 5000 },
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ElecCalcPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ElecCalcPage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().setCurrentProject(null);
  });

  it('показывает заглушку без проекта', () => {
    renderPage();
    expect(screen.getByText(/Проект не выбран/i)).toBeInTheDocument();
  });

  it('пустой проект — показывает alert «Нет объектов»', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Нет объектов/i)).toBeInTheDocument();
    });
  });

  it('переключатель вариантов СО1..СО4 присутствует', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'СО1' })).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button').some((b) => b.textContent === 'СО1')).toBe(true);
    expect(screen.getAllByRole('button').some((b) => b.textContent === 'СО4')).toBe(true);
  });

  it('запрашивает электрорасчёты только для выбранного варианта СО', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(listElectricalCalcs).toHaveBeenCalledWith('p-1', 1);
    });

    await user.click(screen.getByRole('button', { name: 'СО2' }));

    await waitFor(() => {
      expect(listElectricalCalcs).toHaveBeenCalledWith('p-1', 2);
    });
  });

  it('при наличии валидного объекта показывает кнопку «Выполнить электрорасчёт»', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Выполнить электрорасчёт/i })
      ).toBeInTheDocument();
    });
  });

  it('селектор типа кабеля содержит ТТН/ТТВ/ТТХ, single_core, three_core как доступные', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Тип кабеля/i)).toBeInTheDocument();
    });
    // Открываем селектор
    const selectors = document.querySelectorAll('.ant-select-selector');
    const cableTypeSelect = Array.from(selectors).find((el) =>
      el.textContent?.includes('Саморегулирующийся')
    );
    expect(cableTypeSelect).toBeTruthy();
    if (cableTypeSelect) {
      await user.click(cableTypeSelect as HTMLElement);
    }
    // Проверяем, что новые типы есть в выпадающем списке и не disabled
    await waitFor(() => {
      expect(screen.getByText(/ТТН\/ТТВ\/ТТХ/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Однож. пост. мощн./i)).toBeInTheDocument();
    expect(screen.getByText(/Трёхж. пост. мощн./i)).toBeInTheDocument();
  });

  it('при успешном расчёте отображает подобранный кабель в карточке объекта', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'c-1',
        object_id: 'o-1',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-30',
        variant_number: 1,
        results: {
          selected_cable: 'ТЛТ-30',
          cable_length: 11,
          total_power: 600,
          current: 2.7,
          voltage: 220,
        },
      },
    ]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('ТЛТ-30').length).toBeGreaterThan(0);
    });
  });

  it('изменение шага навива пересчитывает текущий объект с выбранной маркой', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs, selectCableManual } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'c-1',
        object_id: 'o-1',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-30',
        variant_number: 1,
        results: {
          selected_cable: 'ТЛТ-30',
          winding_pitch: 0,
          num_circuits: 1,
          cable_length: 11,
          total_power: 600,
          current: 2.7,
          voltage: 220,
        },
      },
    ]);
    (selectCableManual as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c-1',
      object_id: 'o-1',
      cable_type: 'self_regulating',
      cable_mark: 'ТЛТ-30',
      variant_number: 1,
      results: { winding_pitch: 80, num_circuits: 1 },
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('ТЛТ-30').length).toBeGreaterThan(0);
    });
    const pitchInput = document.querySelector('input[role="spinbutton"][value="0"]');
    expect(pitchInput).toBeTruthy();
    fireEvent.change(pitchInput as HTMLInputElement, { target: { value: '80' } });
    fireEvent.blur(pitchInput as HTMLInputElement);

    await waitFor(() => {
      expect(selectCableManual).toHaveBeenCalledWith(
        'o-1',
        'ТЛТ-30',
        'builtin',
        1,
        'self_regulating',
        expect.objectContaining({ windingPitchMm: 80, numberOfThreads: 1 }),
      );
    });
  });

  it('запускает batch с выбранным типом ТТН/ТТВ/ТТХ и его параметрами', async () => {
    const { listObjects } = await import('@/api/projects');
    const { batchCalcElectrical, listElectricalCalcs } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (batchCalcElectrical as ReturnType<typeof vi.fn>).mockResolvedValue({
      calculated: 1,
      skipped: 0,
      errors: [],
      results: [],
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Тип кабеля/i)).toBeInTheDocument();
    });
    const selectors = document.querySelectorAll('.ant-select-selector');
    const cableTypeSelect = Array.from(selectors).find((el) =>
      el.textContent?.includes('Саморегулирующийся')
    );
    expect(cableTypeSelect).toBeTruthy();
    await user.click(cableTypeSelect as HTMLElement);
    await user.click(await screen.findByText('ТТН/ТТВ/ТТХ'));
    await user.click(screen.getByRole('button', { name: /Выполнить электрорасчёт СО1/i }));

    await waitFor(() => {
      expect(batchCalcElectrical).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({ aggressiveProduct: false }),
      );
    });
  });
});
