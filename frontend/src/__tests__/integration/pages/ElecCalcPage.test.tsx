import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ElecCalcPage from '@/pages/ElecCalcPage';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalCalcSummary, ElectricalPageResponse } from '@/types/calculation';
import type { Project, ProjectObject } from '@/types/project';

vi.mock('@/api/projects', () => ({
  deleteObject: vi.fn(),
}));

vi.mock('@/api/calculations', () => ({
  batchCalcElectrical: vi.fn(),
  getElectricalPage: vi.fn(),
  listCables: vi.fn().mockResolvedValue([]),
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

function makeElectricalPage(
  objects: ProjectObject[],
  calculations: ElectricalCalcSummary[] = [],
  summaryOverrides: Partial<ElectricalPageResponse['summary']> = {},
  pageInfoOverrides: Partial<ElectricalPageResponse['page_info']> = {},
): ElectricalPageResponse {
  const totalObjects = summaryOverrides.total_objects ?? objects.length;
  const calculated = calculations.filter(
    (calc) =>
      calc.results &&
      !calc.results.error &&
      (calc.cable_mark || calc.results.selected_cable),
  );
  const pageSize = pageInfoOverrides.page_size ?? 50;

  return {
    items: objects,
    calculations,
    summary: {
      total_objects: totalObjects,
      valid_objects:
        summaryOverrides.valid_objects ?? objects.filter((obj) => obj.is_valid).length,
      invalid_objects:
        summaryOverrides.invalid_objects ?? totalObjects - objects.filter((obj) => obj.is_valid).length,
      electrical_calculations_total:
        summaryOverrides.electrical_calculations_total ?? calculations.length,
      calculated_count: summaryOverrides.calculated_count ?? calculated.length,
      failed_count:
        summaryOverrides.failed_count ??
        calculations.filter((calc) => typeof calc.results?.error === 'string').length,
      total_cable_length:
        summaryOverrides.total_cable_length ??
        calculated.reduce((sum, calc) => sum + Number(calc.results?.cable_length ?? 0), 0),
      total_power:
        summaryOverrides.total_power ??
        calculated.reduce((sum, calc) => sum + Number(calc.results?.total_power ?? 0), 0),
      total_current:
        summaryOverrides.total_current ??
        calculated.reduce((sum, calc) => sum + Number(calc.results?.current ?? 0), 0),
      ...summaryOverrides,
    },
    page_info: {
      page: 1,
      page_size: pageSize,
      offset: 0,
      total_pages: totalObjects > 0 ? Math.ceil(totalObjects / pageSize) : 0,
      has_next_page: totalObjects > pageSize,
      has_previous_page: false,
      ...pageInfoOverrides,
    },
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
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Нет объектов/i)).toBeInTheDocument();
    });
  });

  it('переключатель вариантов СО1..СО4 присутствует', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'СО1' })).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button').some((b) => b.textContent === 'СО1')).toBe(true);
    expect(screen.getAllByRole('button').some((b) => b.textContent === 'СО4')).toBe(true);
  });

  it('запрашивает электрорасчёты только для выбранного варианта СО', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(getElectricalPage).toHaveBeenCalledWith('p-1', 1, 1, 50);
    });

    await user.click(screen.getByRole('button', { name: 'СО2' }));

    await waitFor(() => {
      expect(getElectricalPage).toHaveBeenCalledWith('p-1', 2, 1, 50);
    });
  });

  it('при наличии валидного объекта показывает кнопку «Выполнить электрорасчёт»', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Выполнить электрорасчёт/i })
      ).toBeInTheDocument();
    });
  });

  it('пагинирует таблицу электрики, чтобы не рендерить все строки сразу', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const objects = Array.from({ length: 80 }, (_, index) =>
      makeObject({
        id: `o-${index + 1}`,
        sort_order: index,
        params: { name: `Труба-${index + 1}` },
      })
    );
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage(
        objects.slice(0, 50),
        [],
        { total_objects: 80, valid_objects: 80, invalid_objects: 0 },
        { total_pages: 2, has_next_page: true },
      ),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('1-50 из 80')).toBeInTheDocument();
    });
    expect(screen.getByText('Труба-1')).toBeInTheDocument();
    expect(screen.getByText('Труба-50')).toBeInTheDocument();
    expect(screen.queryByText('Труба-51')).not.toBeInTheDocument();
    expect(document.querySelector('.ant-pagination')).toBeTruthy();
  });

  it('запускает batch ТЛТ с electrical params, а не пустым набором', async () => {
    const { batchCalcElectrical, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    (batchCalcElectrical as ReturnType<typeof vi.fn>).mockResolvedValue({
      calculated: 1,
      skipped: 0,
      heat_loss_failed: 0,
      errors: [],
      results: [],
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Выполнить электрорасчёт СО1/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Выполнить электрорасчёт СО1/i }));

    await waitFor(() => {
      expect(batchCalcElectrical).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating',
        expect.objectContaining({
          supplyVoltage: 220,
          windingCoefficient: 1,
          layingStep: 0.1,
        }),
      );
    });
  });

  it('селектор типа кабеля содержит ТТН/ТТВ/ТТХ, single_core, three_core как доступные', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
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
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
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
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('ТЛТ-30').length).toBeGreaterThan(0);
    });
  });

  it('изменение шага навива пересчитывает текущий объект с выбранной маркой', async () => {
    const { getElectricalPage, selectCableManual } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
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
      ]),
    );
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
    const { batchCalcElectrical, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    (batchCalcElectrical as ReturnType<typeof vi.fn>).mockResolvedValue({
      calculated: 1,
      skipped: 0,
      heat_loss_failed: 0,
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
