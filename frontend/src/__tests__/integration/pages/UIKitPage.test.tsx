import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import UIKitPage from '@/pages/UIKitPage';

function renderPage() {
  return render(
    <TestMemoryRouter>
      <UIKitPage />
    </TestMemoryRouter>
  );
}

describe('UIKitPage', () => {
  it('показывает ключевые разделы и реальные контролы', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Инженерный UI Kit' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Основа' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Поля ввода' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Расчёт теплопотерь', level: 2 })).toBeInTheDocument();
    // Правая панель dual-form — реальная CableAlgorithmPanel
    expect(screen.getByRole('heading', { name: 'Алгоритм выбора кабеля', level: 4 })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Наименование' })).toHaveValue('Трубопровод Т-101');
    expect(screen.getByRole('combobox', { name: 'Материал' })).toBeInTheDocument();
    expect(screen.getByText(/BlinkMacSystemFont/)).toBeInTheDocument();
  });

  it('фильтрует демонстрационную таблицу', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox', { name: 'Поиск объекта' }), 'дренаж');

    const table = screen.getByRole('grid');
    expect(within(table).getByText('Дренажная линия')).toBeInTheDocument();
    expect(within(table).queryByText('Подающий трубопровод')).not.toBeInTheDocument();
  });

  it('переключает плотность интерфейса', async () => {
    const { container } = renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByText('Свободно'));

    expect(container.querySelector('.uikit-page')).toHaveClass('uikit-page--comfortable');
  });

  it('показывает интерактивный эталон расчёта теплопотерь', async () => {
    renderPage();
    const user = userEvent.setup();
    const tankButton = screen.getByRole('button', { name: 'Резервуар: 1' });

    await user.click(tankButton);

    expect(tankButton).toHaveAttribute('aria-pressed', 'true');
    const heatTable = screen.getAllByRole('table').find((table) => (
      within(table).queryByText('Резервуар технической воды')
    ));
    expect(heatTable).toBeDefined();
    if (!heatTable) throw new Error('HeatCalc object table is not rendered');
    expect(within(heatTable).getByText('Резервуар технической воды')).toBeInTheDocument();
    expect(within(heatTable).queryByText('Подающий трубопровод')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Показать блок заполнения параметров' }));
    expect(screen.queryByRole('textbox', { name: 'Наименование эталона' })).not.toBeInTheDocument();
  });
});
