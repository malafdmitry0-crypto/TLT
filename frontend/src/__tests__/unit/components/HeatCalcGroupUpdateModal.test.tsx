/**
 * Групповая корректировка — кейс 1 §5.8.
 *
 * Проверяется контракт формы: один параметр за операцию, «Применить» недоступна
 * без выбора, перечень проблемных объектов из ответа 422 виден пользователю.
 */
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HeatCalcGroupUpdateModal from '@/components/heatcalc/HeatCalcGroupUpdateModal';

afterEach(cleanup);

function renderModal(overrides: Partial<React.ComponentProps<typeof HeatCalcGroupUpdateModal>> = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <HeatCalcGroupUpdateModal
      open
      objectType="pipe"
      selectedCount={2}
      applying={false}
      problems={[]}
      errorMessage={null}
      onApply={onApply}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onApply, onClose };
}

describe('HeatCalcGroupUpdateModal — кейс §5.8', () => {
  it('показывает число выбранных объектов и правило «один параметр за операцию»', () => {
    renderModal();
    expect(screen.getByText('Выбрано объектов: 2')).toBeInTheDocument();
    expect(screen.getByText(/один параметр/)).toBeInTheDocument();
  });

  it('«Применить» недоступна, пока не выбран параметр и не задано значение', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled();
  });

  it('в списке параметров только вводимые поля — вычисляемых там нет', () => {
    renderModal();
    // поле значения появляется только после выбора параметра
    expect(screen.queryByText('Новое значение')).not.toBeInTheDocument();
    const select = screen.getByTestId('group-update-param');
    expect(select).toBeInTheDocument();
  });

  it('перечисляет проблемные объекты из ответа 422 — данные при этом не изменены', () => {
    renderModal({
      errorMessage: 'Значение нельзя применить ко всем выбранным объектам',
      problems: [
        { object_id: 'a1', name: 'Труба Т-101', error: 'Толщина стенки больше диаметра' },
        { object_id: 'b2', name: null, error: 'Некорректные параметры трубы' },
      ],
    });
    expect(screen.getByText('Значение нельзя применить ко всем выбранным объектам')).toBeInTheDocument();
    expect(screen.getByText(/Труба Т-101: Толщина стенки больше диаметра/)).toBeInTheDocument();
    // объект без имени показывается по идентификатору, а не «пустой строкой»
    expect(screen.getByText(/b2: Некорректные параметры трубы/)).toBeInTheDocument();
  });

  it('закрытие отдаёт onClose', async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onClose).toHaveBeenCalled();
  });
});
