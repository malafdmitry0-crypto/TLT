/**
 * Групповая корректировка — кейс 1 §5.8.
 *
 * Проверяется контракт формы: один параметр за операцию, «Применить» недоступна
 * без выбора, перечень проблемных объектов из ответа 422 виден пользователю.
 */
import {
  cleanup, render, screen, waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HeatCalcGroupUpdateModal from '@/components/heatcalc/HeatCalcGroupUpdateModal';

vi.mock('@/components/ui-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui-kit')>();
  return {
    ...actual,
    TltSelect: ({
      options = [],
      onChange,
      placeholder,
      value,
      'aria-label': ariaLabel,
      'data-testid': testId,
    }: {
      options?: Array<{ label: React.ReactNode; value: string | number }>;
      onChange?: (value: string | number | null) => void;
      placeholder?: string;
      value?: string | number | null;
      'aria-label'?: string;
      'data-testid'?: string;
    }) => (
      <select
        aria-label={ariaLabel ?? placeholder}
        data-testid={testId}
        value={value == null ? '' : String(value)}
        onChange={(event) => onChange?.(event.target.value || null)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    ),
  };
});

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

async function selectParam(value: string) {
  await userEvent.selectOptions(screen.getByTestId('group-update-param'), value);
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

  it('применяет температуру грунта к выбранным резервуарам', async () => {
    const user = userEvent.setup();
    const { onApply } = renderModal({ objectType: 'tank' });

    expect(screen.getByRole('option', { name: 'Температура грунта' })).toHaveValue('ground_temperature');
    await selectParam('ground_temperature');

    const valueInput = screen.getByTestId('group-update-value');
    expect(screen.getByText('°C')).toBeInTheDocument();
    await user.type(valueInput, '5');
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledWith('ground_temperature', 5);
  });

  it('блокирует температуру грунта выше реестровой границы', async () => {
    const user = userEvent.setup();
    const { onApply } = renderModal({ objectType: 'tank' });

    await selectParam('ground_temperature');
    const valueInput = screen.getByTestId('group-update-value');
    await user.type(valueInput, '71');
    await user.tab();

    expect(await screen.findByText('Максимальное значение — 70')).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: 'Применить' });
    expect(apply).toBeDisabled();
    await user.click(apply);
    expect(onApply).not.toHaveBeenCalled();
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

  it.each([
    {
      draft: '999',
      message: 'Максимальное значение — 70',
      boundary: '70',
      expected: 70,
    },
    {
      draft: '-71',
      message: 'Минимальное значение — -70',
      boundary: '-70',
      expected: -70,
    },
  ])('keeps ambient draft $draft, blocks Apply, and sends corrected boundary', async ({
    draft,
    message,
    boundary,
    expected,
  }) => {
    const user = userEvent.setup();
    const { onApply } = renderModal();

    await selectParam('ambient_temperature');

    const valueInput = screen.getByTestId('group-update-value');
    await user.type(valueInput, draft);
    await user.tab();

    expect(valueInput).toHaveValue(draft);
    const error = await screen.findByText(message);
    expect(valueInput).toHaveAttribute('aria-invalid', 'true');
    const errorId = valueInput.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toContainElement(error);

    const apply = screen.getByRole('button', { name: 'Применить' });
    expect(apply).toBeDisabled();
    await user.click(apply);
    expect(onApply).not.toHaveBeenCalled();

    await user.clear(valueInput);
    await user.type(valueInput, boundary);
    await user.tab();

    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
    expect(valueInput).toHaveValue(boundary);
    expect(valueInput).not.toHaveAttribute('aria-invalid');
    expect(apply).toBeEnabled();

    await user.click(apply);
    expect(onApply).toHaveBeenCalledWith('ambient_temperature', expected);
  });

  it('clears the numeric draft and its error when the parameter changes', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectParam('ambient_temperature');
    const ambientInput = screen.getByTestId('group-update-value');
    await user.type(ambientInput, '999');
    await user.tab();
    expect(await screen.findByText('Максимальное значение — 70')).toBeInTheDocument();

    await selectParam('pipe_centerline_depth');

    const burialDepthInput = screen.getByTestId('group-update-value');
    expect(burialDepthInput).toHaveValue('');
    expect(burialDepthInput).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Максимальное значение — 70')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled();
  });
});
