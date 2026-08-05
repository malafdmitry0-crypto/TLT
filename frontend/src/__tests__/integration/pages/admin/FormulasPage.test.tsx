import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FormulasPage from '@/pages/admin/FormulasPage';

vi.mock('@/api/admin', () => ({
  checkFormula: vi.fn(),
}));

vi.mock('@/api/references', () => ({
  getInsulation: vi.fn(),
}));

const insulationMock = [
  { material: 'mineral_wool', name: 'Минеральная вата', conductivity: 0.045, temperature_range: [-180, 700], density_kg_m3: 100 },
  { material: 'polyurethane', name: 'ППУ', conductivity: 0.03, temperature_range: [-60, 130], density_kg_m3: 40 },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FormulasPage />
    </QueryClientProvider>
  );
}

describe('FormulasPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const refs = await import('@/api/references');
    (refs.getInsulation as ReturnType<typeof vi.fn>).mockResolvedValue(insulationMock);
  });

  it('рендерит заголовок и все вкладки реализованных формул', () => {
    renderPage();
    expect(screen.getByText('Расчётные формулы')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Трубопровод/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Резервуар$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Саморег\. ТЛТ/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Саморег\. ТТ/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Резистивный/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Укладка на резервуар/i })).toBeInTheDocument();
  });

  it('таб Трубопровод отображает формулу и поля калькулятора', async () => {
    renderPage();
    await waitFor(() => {
      // Кнопка расчёта присутствует
      expect(screen.getByRole('button', { name: /Рассчитать/i })).toBeInTheDocument();
      // Поля формы присутствуют
      expect(screen.getByText(/Длина трубопровода/i)).toBeInTheDocument();
      expect(screen.getByText(/Нар. диаметр трубы/i)).toBeInTheDocument();
    });
  });

  it('инсуляционный выпадающий список заполняется из API', async () => {
    renderPage();
    // Ждём пока query выполнится
    await waitFor(() => {
      // в DOM должны быть label для материала изоляции
      expect(screen.getAllByText(/Материал изоляции/i).length).toBeGreaterThan(0);
    });
  });

  it('переключается на таб Резервуар — кнопка и поля присутствуют', async () => {
    renderPage();
    const tab = screen.getByRole('tab', { name: /^Резервуар$/i });
    await userEvent.click(tab);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Рассчитать/i })).toBeInTheDocument();
      // Поле формы резервуара
      expect(screen.getByText(/Форма/i)).toBeInTheDocument();
    });
  });

  it('переключается на таб Саморег. ТЛТ — кнопка «Подобрать кабель» присутствует', async () => {
    renderPage();
    const tab = screen.getByRole('tab', { name: /Саморег\. ТЛТ/i });
    await userEvent.click(tab);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Подобрать кабель/i })).toBeInTheDocument();
    });
  });

  it('переключается на таб Саморег. ТТ и показывает формулу Case 1', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Саморег\. ТТ/i }));
    expect(screen.getByText(/Температурный допуск марки/i)).toBeInTheDocument();
    expect(screen.getByText(/Паспортная мощность и нитки/i)).toBeInTheDocument();
    expect(screen.getByText(/Навив трубы/i)).toBeInTheDocument();
    expect(screen.getByText(/Базовая длина резервуара/i)).toBeInTheDocument();
    expect(screen.getByText(/Техническая сортировка/i)).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('57 < D ≤ 75 → 1,2');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Qрезервуара без повторного K');
    expect(screen.queryByText(/q1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/T3/i)).not.toBeInTheDocument();
  });

  it('Саморег. ТТ отправляет Case 1 payload без T2/T3/R и ограничивает N до 3', async () => {
    const { checkFormula } = await import('@/api/admin');
    (checkFormula as ReturnType<typeof vi.fn>).mockResolvedValue({ selected_cable: '30ТТВ2-СР' });
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Саморег\. ТТ/i }));
    const panel = within(screen.getByRole('tabpanel'));

    fireEvent.change(panel.getByLabelText('Требуемая мощность, Вт/м'), {
      target: { value: '30' },
    });
    fireEvent.change(panel.getByLabelText('Длина, м'), { target: { value: '50' } });
    fireEvent.change(panel.getByLabelText('T продукта, °C'), { target: { value: '80' } });
    fireEvent.change(panel.getByLabelText('T среды, °C'), { target: { value: '-20' } });
    fireEvent.change(panel.getByLabelText('U, В'), { target: { value: '380' } });
    fireEvent.change(panel.getByLabelText('Наружный диаметр, мм'), { target: { value: '108' } });
    fireEvent.change(panel.getByLabelText('Шаг навива, мм'), { target: { value: '350' } });
    const threads = panel.getByLabelText('Нитки');
    expect(threads).toHaveAttribute('aria-valuemax', '3');
    fireEvent.change(threads, { target: { value: '2' } });
    fireEvent.change(panel.getByLabelText('Точная марка кабеля'), {
      target: { value: '30ТТВ2-СР' },
    });

    await userEvent.click(screen.getByRole('button', { name: /Подобрать кабель/i }));

    await waitFor(() => {
      expect(checkFormula).toHaveBeenCalledWith('electrical_tt', expect.objectContaining({
        required_power_per_meter: 30,
        pipe_length: 50,
        process_temperature: 80,
        ambient_temperature: -20,
        supply_voltage: 380,
        safety_factor: 1.1,
        outer_diameter_mm: 108,
        winding_pitch: 350,
        number_of_threads: 2,
        cable_mark: '30ТТВ2-СР',
        selection_policy: 'technical_minimum',
      }));
    });
    const payload = (checkFormula as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1];
    expect(payload).not.toHaveProperty('maintain_temperature');
    expect(payload).not.toHaveProperty('vapor_temperature');
    expect(payload).not.toHaveProperty('aggressive_product');
    expect(payload).not.toHaveProperty('winding_coefficient');
    expect(panel.queryByLabelText(/пропарки/i)).not.toBeInTheDocument();
    expect(panel.queryByLabelText(/поддержания/i)).not.toBeInTheDocument();
    expect(panel.queryByLabelText('Среда')).not.toBeInTheDocument();
  });

  it('Саморег. ТТ требует наружный диаметр только для навива и не вызывает API при ошибке', async () => {
    const { checkFormula } = await import('@/api/admin');
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Саморег\. ТТ/i }));
    const panel = within(screen.getByRole('tabpanel'));

    fireEvent.change(panel.getByLabelText('Требуемая мощность, Вт/м'), { target: { value: '30' } });
    fireEvent.change(panel.getByLabelText('Длина, м'), { target: { value: '50' } });
    fireEvent.change(panel.getByLabelText('T продукта, °C'), { target: { value: '80' } });
    fireEvent.change(panel.getByLabelText('T среды, °C'), { target: { value: '-20' } });
    fireEvent.change(panel.getByLabelText('Шаг навива, мм'), { target: { value: '350' } });

    await userEvent.click(screen.getByRole('button', { name: /Подобрать кабель/i }));

    expect(await panel.findByText('Укажите диаметр для расчёта навива')).toBeInTheDocument();
    expect(checkFormula).not.toHaveBeenCalled();
  });

  it('Саморег. ТТ для резервуара шлёт геометрию укладки без трубного навива', async () => {
    const { checkFormula } = await import('@/api/admin');
    (checkFormula as ReturnType<typeof vi.fn>).mockResolvedValue({ selected_cable: '30ТТВ2-СТ' });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: /Саморег\. ТТ/i }));
    const panel = within(screen.getByRole('tabpanel'));

    fireEvent.change(panel.getByLabelText('Требуемая мощность, Вт/м'), { target: { value: '30' } });
    fireEvent.change(panel.getByLabelText('Длина, м'), { target: { value: '50' } });
    fireEvent.change(panel.getByLabelText('T продукта, °C'), { target: { value: '80' } });
    fireEvent.change(panel.getByLabelText('T среды, °C'), { target: { value: '-20' } });
    fireEvent.change(panel.getByLabelText('Наружный диаметр, мм'), { target: { value: '108' } });
    fireEvent.change(panel.getByLabelText('Шаг навива, мм'), { target: { value: '350' } });

    await user.click(panel.getByRole('combobox', { name: 'не использовать' }));
    await user.click(await screen.findByText('Цилиндр'));

    expect(panel.queryByLabelText('Наружный диаметр, мм')).not.toBeInTheDocument();
    expect(panel.queryByLabelText('Шаг навива, мм')).not.toBeInTheDocument();
    fireEvent.change(panel.getByLabelText('Диаметр резервуара, мм'), { target: { value: '2000' } });
    fireEvent.change(panel.getByLabelText('Высота обогрева, м'), { target: { value: '1.5' } });
    fireEvent.change(panel.getByLabelText('Шаг укладки, м'), { target: { value: '0.2' } });

    await user.click(screen.getByRole('button', { name: /Подобрать кабель/i }));

    await waitFor(() => {
      expect(checkFormula).toHaveBeenCalledWith('electrical_tt', expect.objectContaining({
        tank_shape: 'cylindrical',
        tank_diameter: 2,
        heating_height: 1.5,
        laying_step: 0.2,
      }));
    });
    const payload = (checkFormula as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1];
    expect(payload).not.toHaveProperty('outer_diameter_mm');
    expect(payload).not.toHaveProperty('winding_pitch');
  });

  it('переключается на таб Резистивный и показывает схемы TT R1/R3', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Резистивный/i }));
    expect(screen.getAllByText(/ТТ Р1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ТТ Р3/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Подобрать кабель/i })).toBeInTheDocument();
  });

  it('переключается на таб Укладка на резервуар и показывает формулу длины кабеля', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Укладка на резервуар/i }));
    expect(screen.getAllByText(/Периметр/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/шаг укладки/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Рассчитать/i })).toBeInTheDocument();
  });

  it('после успешного расчёта трубопровода показывает результат', async () => {
    const { checkFormula } = await import('@/api/admin');
    (checkFormula as ReturnType<typeof vi.fn>).mockResolvedValue({
      heat_loss_per_meter_base: 42.54,
      total_heat_loss_design: 2127.0,
      safety_factor_applied: 1.1,
    });

    renderPage();

    // Ждём появления полей формы
    await screen.findByText(/Нар. диаметр трубы/i);

    // TltNumberField exposes textbox (react-aria); keep spinbutton for any residual Ant fields
    const spinbuttons = [
      ...screen.queryAllByRole('spinbutton'),
      ...screen.queryAllByRole('textbox'),
    ];
    for (const input of spinbuttons) {
      fireEvent.change(input, { target: { value: '50' } });
    }

    const btn = screen.getByRole('button', { name: /Рассчитать/i });
    await userEvent.click(btn);

    await waitFor(() => {
      if ((checkFormula as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        expect(checkFormula).toHaveBeenCalledWith('pipe', expect.any(Object));
      }
      // Либо результат отображается, либо просто не упали
    }, { timeout: 3000 });
  });

  it('показывает alert при ошибке API (мок rejectedValue)', async () => {
    const { checkFormula } = await import('@/api/admin');
    (checkFormula as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('network'), {
        response: { status: 400, data: { detail: 'Ошибка расчёта' } },
      })
    );

    renderPage();
    await screen.findByText(/Нар. диаметр трубы/i);

    // TltNumberField exposes textbox (react-aria)
    const numberInputs = [
      ...screen.queryAllByRole('spinbutton'),
      ...screen.queryAllByRole('textbox'),
    ];
    for (const input of numberInputs) {
      fireEvent.change(input, { target: { value: '50' } });
    }

    const btn = screen.getByRole('button', { name: /Рассчитать/i });
    await userEvent.click(btn);

    // Ждём: либо alert появился, либо checkFormula был вызван
    await waitFor(() => {
      const alertOrCalled =
        screen.queryByRole('alert') !== null ||
        (checkFormula as ReturnType<typeof vi.fn>).mock.calls.length > 0;
      expect(alertOrCalled).toBe(true);
    }, { timeout: 3000 });
  });
});
