import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReferencesPage from '@/pages/admin/ReferencesPage';

vi.mock('@/api/references', () => ({
  getClimate: vi.fn(),
  getInsulation: vi.fn(),
  getPipeMaterials: vi.fn(),
  getCablesTlt: vi.fn(),
  getResistiveCables: vi.fn(),
  getSoilConductivity: vi.fn(),
  getAccessories: vi.fn(),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReferencesPage />
    </QueryClientProvider>
  );
}

const climateData = [
  { city: 'Москва', region: 'Московская', t_cold_day_0_98: -26.0, t_abs_min: -42.0, wind_avg_cold: 4.9, wind_max_jan: 14.0 },
  { city: 'Казань', region: 'Татарстан', t_cold_day_0_98: -31.0, t_abs_min: -47.0, wind_avg_cold: 4.0, wind_max_jan: 12.0 },
];

const insulationData = [
  { material: 'mineral_wool', name: 'Минеральная вата', conductivity: 0.045, temperature_range: [-180, 700], density_kg_m3: 100 },
];

const pipeMaterialsData = [
  { material: 'carbon_steel', name: 'Сталь углеродистая', formula: 'linear', a: 53.0, b: -0.04, accuracy: '±2%' },
];

const cablesTltData = [
  { model: 'ТЛТ-10', brand: 'ТЛТ', power_per_meter: 10, min_temperature: -60, max_temperature: 65, voltage: 230 },
];

const resistiveData = {
  single_core: [{ brand: 'ПНСВ', model: 'ПНСВ-1', resistance_ohm_km: 0.15, conductor_section_mm2: 1.2, diameter_mm: 3.8 }],
  three_core: [{ brand: 'КМВЭВ', model: '3×2.5', nominal_size_mm: '3×2.5', mass_kg_km: 120, min_bend_radius_mm: 50 }],
};

const soilData = [
  { soil: 'Песок', soil_code: 'sand', density_kg_m3: 1500, moisture_percent: 10, conductivity: 1.5 },
];

const accessoriesData = [
  { category: 'Муфты', name: 'Муфта концевая', article: 'МК-1', unit: 'шт', per_object: 2 },
];

describe('ReferencesPage', () => {
  beforeEach(() => vi.clearAllMocks());

  async function mockAll() {
    const refs = await import('@/api/references');
    (refs.getClimate as ReturnType<typeof vi.fn>).mockResolvedValue(climateData);
    (refs.getInsulation as ReturnType<typeof vi.fn>).mockResolvedValue(insulationData);
    (refs.getPipeMaterials as ReturnType<typeof vi.fn>).mockResolvedValue(pipeMaterialsData);
    (refs.getCablesTlt as ReturnType<typeof vi.fn>).mockResolvedValue(cablesTltData);
    (refs.getResistiveCables as ReturnType<typeof vi.fn>).mockResolvedValue(resistiveData);
    (refs.getSoilConductivity as ReturnType<typeof vi.fn>).mockResolvedValue(soilData);
    (refs.getAccessories as ReturnType<typeof vi.fn>).mockResolvedValue(accessoriesData);
  }

  it('рендерит карточку с заголовком', async () => {
    await mockAll();
    renderPage();
    expect(screen.getByText('Встроенные справочники')).toBeInTheDocument();
  });

  it('показывает таб Климат с количеством городов', async () => {
    await mockAll();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Климат \(2\)/i })).toBeInTheDocument();
    });
  });

  it('отображает данные климата в таблице', async () => {
    await mockAll();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Москва')).toBeInTheDocument();
      expect(screen.getByText('Казань')).toBeInTheDocument();
    });
  });

  it('фильтр климата по городу', async () => {
    await mockAll();
    renderPage();
    await waitFor(() => expect(screen.getByText('Москва')).toBeInTheDocument());

    const search = screen.getByPlaceholderText(/Поиск по городу/i);
    await userEvent.type(search, 'Казань');
    await waitFor(() => {
      expect(screen.getByText('Казань')).toBeInTheDocument();
      expect(screen.queryByText('Москва')).not.toBeInTheDocument();
    });
  });

  it('переключается на таб Изоляция и показывает данные', async () => {
    await mockAll();
    renderPage();
    const tab = await screen.findByRole('tab', { name: /Изоляция/i });
    await userEvent.click(tab);
    await waitFor(() => {
      expect(screen.getByText('Минеральная вата')).toBeInTheDocument();
    });
  });

  it('переключается на таб Материалы труб и показывает данные', async () => {
    await mockAll();
    renderPage();
    const tab = await screen.findByRole('tab', { name: /Материалы труб/i });
    await userEvent.click(tab);
    await waitFor(() => {
      expect(screen.getByText('Сталь углеродистая')).toBeInTheDocument();
    });
  });

  it('переключается на таб Кабели ТЛТ и показывает марку', async () => {
    await mockAll();
    renderPage();
    const tab = await screen.findByRole('tab', { name: /Кабели ТЛТ/i });
    await userEvent.click(tab);
    await waitFor(() => {
      expect(screen.getByText('ТЛТ-10')).toBeInTheDocument();
    });
  });

  it('переключается на таб Грунты и показывает данные', async () => {
    await mockAll();
    renderPage();
    const tab = await screen.findByRole('tab', { name: /Грунты/i });
    await userEvent.click(tab);
    await waitFor(() => {
      expect(screen.getByText('Песок')).toBeInTheDocument();
    });
  });

  it('переключается на таб Аксессуары и показывает данные', async () => {
    await mockAll();
    renderPage();
    const tab = await screen.findByRole('tab', { name: /Аксессуары/i });
    await userEvent.click(tab);
    await waitFor(() => {
      expect(screen.getByText('Муфта концевая')).toBeInTheDocument();
    });
  });

  it('не показывает столбцы Код и Источник', async () => {
    await mockAll();
    renderPage();
    await waitFor(() => expect(screen.getByText('Встроенные справочники')).toBeInTheDocument());
    expect(screen.queryByRole('columnheader', { name: /^Код$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Источник$/i })).not.toBeInTheDocument();
  });
});
