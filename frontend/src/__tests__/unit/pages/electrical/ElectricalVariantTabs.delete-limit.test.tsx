import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  controller,
  ER_1,
  ER_2_ID,
  renderTabs,
  tabsTree,
  variant,
} from './ElectricalVariantTabs.test-harness';

describe('ElectricalVariantTabs — delete / limit / permissions', () => {
  it('requires explicit delete confirmation and disables deletion of the last ER', async () => {
    const user = userEvent.setup();
    const model = controller();
    const { rerender } = renderTabs(model);

    await user.click(screen.getByRole('button', { name: /Удалить.*Альтернатива Ω/i }));
    expect(await screen.findByText(/назначения объектов, электрические расчёты и выбранные кабели, кандидаты и их папки, а также спецификация/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(model.deleteVariant).toHaveBeenCalledWith(ER_2_ID);

    const oneVariantModel = controller({ variants: [ER_1], selectedVariant: ER_1 });
    rerender(tabsTree(oneVariantModel));
    expect(screen.getByRole('button', { name: /Нельзя удалить последний ЭР/i })).toBeDisabled();
  });

  it('shows an active-job delete conflict and allows recovery without losing selection', async () => {
    const user = userEvent.setup();
    const deleteVariant = vi.fn().mockRejectedValue(
      new Error('Нельзя удалить ЭР, пока выполняются связанные фоновые задачи'),
    );
    const model = controller({ deleteVariant });
    const { rerender } = renderTabs(model);

    await user.click(screen.getByRole('button', { name: /Удалить.*Альтернатива Ω/i }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(deleteVariant).toHaveBeenCalledWith(ER_2_ID));

    rerender(tabsTree(controller({
      deleteVariant,
      mutationError: new Error('Нельзя удалить ЭР, пока выполняются связанные фоновые задачи'),
    })));
    expect(screen.getByText(/пока выполняются связанные фоновые задачи/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Альтернатива Ω/i }))
      .toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /Удалить.*Альтернатива Ω/i })).toBeEnabled();
  });

  it('disables create and copy at the five-ER limit', () => {
    const variants = Array.from({ length: 5 }, (_, index) =>
      variant(`${index + 1}`.repeat(8) + '-1111-4111-8111-111111111111', `ЭР ${index + 1}`, index, index === 0),
    );
    renderTabs(controller({ variants, selectedVariant: variants[0] }));

    expect(screen.getByRole('button', { name: /Добавить пустой ЭР.*лимит 5/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Создать копию.*лимит 5/i })).toBeDisabled();
  });

  it('announces the exact pending lifecycle operation', () => {
    renderTabs(controller({ isMutating: true, pendingOperation: 'copy' }));

    expect(screen.getByRole('status')).toHaveTextContent('Копируем выбранный ЭР…');
    expect(screen.getByRole('button', { name: /Создать копию выбранного ЭР/i })).toBeDisabled();
  });

  it('shows reconciled success without claiming that the operation failed', () => {
    renderTabs(controller({
          mutationNotice: 'ЭР удалён; результат подтверждён после сверки с сервером.',
        }));

    expect(screen.getByText('Результат операции подтверждён')).toBeInTheDocument();
    expect(screen.getByText(/ЭР удалён.*сверки с сервером/i)).toBeInTheDocument();
    expect(screen.queryByText('Операция с ЭР не выполнена')).not.toBeInTheDocument();
  });

  it('keeps lifecycle controls read-only for a non-owner', () => {
    renderTabs(controller(), false);

    expect(screen.getByText('Режим просмотра')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить пустой ЭР' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Создать копию выбранного ЭР/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Переименовать ЭР/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Сделать.*активным/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Удалить ЭР/i })).toBeDisabled();
  });

});
