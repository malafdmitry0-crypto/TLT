import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ElectricalVariantTabs from '@/pages/electrical/ElectricalVariantTabs';
import {
  controller,
  ER_1,
  ER_2,
  ER_2_ID,
  renderTabs,
  tabsTree,
} from './ElectricalVariantTabs.test-harness';

describe('ElectricalVariantTabs — create / copy / rename', () => {
  it('creates an empty ER and copies the exact selected ER', async () => {
    const user = userEvent.setup();
    const model = controller();
    renderTabs(model);

    await user.click(screen.getByRole('button', { name: 'Добавить пустой ЭР' }));
    await user.click(screen.getByRole('button', { name: /Создать копию.*Альтернатива Ω/i }));

    expect(model.createVariant).toHaveBeenCalledWith();
    expect(model.copySelectedVariant).toHaveBeenCalledWith();
  });

  it('saves inline rename on Enter and on blur', async () => {
    const user = userEvent.setup();
    const model = controller();
    renderTabs(model);

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));
    let input = screen.getByRole('textbox', { name: /Новое название ЭР/i });
    await user.clear(input);
    await user.type(input, '  Проектное решение  {Enter}');
    await waitFor(() => {
      expect(model.renameVariant).toHaveBeenCalledWith(ER_2_ID, 'Проектное решение');
    });
    expect(screen.getByRole('tab', { name: /Альтернатива Ω/i })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));
    input = screen.getByRole('textbox', { name: /Новое название ЭР/i });
    await user.clear(input);
    await user.type(input, 'Решение после blur');
    fireEvent.blur(input);
    await waitFor(() => {
      expect(model.renameVariant).toHaveBeenCalledWith(ER_2_ID, 'Решение после blur');
    });
  });

  it('cancels inline rename on Escape and never sends an empty name', async () => {
    const user = userEvent.setup();
    const model = controller();
    renderTabs(model);

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));
    let input = screen.getByRole('textbox', { name: /Новое название ЭР/i });
    await user.clear(input);
    await user.type(input, 'Не сохранять{Escape}');
    expect(model.renameVariant).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: /Альтернатива Ω/i })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));
    input = screen.getByRole('textbox', { name: /Новое название ЭР/i });
    await user.clear(input);
    await user.type(input, '   {Enter}');

    expect(model.renameVariant).not.toHaveBeenCalled();
    expect(screen.getByText('Название ЭР не может быть пустым')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps a server rename conflict inline and allows a successful retry', async () => {
    const user = userEvent.setup();
    const renameVariant = vi.fn()
      .mockRejectedValueOnce(new Error('ЭР с таким названием уже существует'))
      .mockResolvedValueOnce(ER_2);
    renderTabs(controller({ renameVariant }));

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));
    const input = screen.getByRole('textbox', { name: /Новое название ЭР/i });
    await user.clear(input);
    await user.type(input, 'Дублирующее имя{Enter}');

    expect(await screen.findByText('ЭР с таким названием уже существует')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Альтернатива Ω/i }))
      .toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'electrical-variant-rename-error');
    expect(input).toHaveFocus();

    await user.clear(input);
    await user.type(input, 'Уникальное имя{Enter}');
    await waitFor(() => expect(renameVariant).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('textbox', { name: /Новое название ЭР/i })).not.toBeInTheDocument();
  });

  it('keeps rename focus through the real pending and reconciliation transition', async () => {
    const user = userEvent.setup();
    let rejectRename!: (error: Error) => void;
    const renameVariant = vi.fn(() => new Promise<ElectricalVariant>((_resolve, reject) => {
      rejectRename = reject;
    }));
    const initialModel = controller({ renameVariant });
    const { rerender } = renderTabs(initialModel);

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));
    const input = screen.getByRole('textbox', { name: /Новое название ЭР/i });
    await user.clear(input);
    await user.type(input, 'Конфликт{Enter}');
    rerender(tabsTree(controller({
      renameVariant,
      isMutating: true,
      pendingOperation: 'rename',
    })));
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('readonly');

    rejectRename(new Error('ЭР с таким названием уже существует'));
    rerender(tabsTree(controller({
      renameVariant,
      isMutating: true,
      pendingOperation: 'reconcile',
    })));
    expect(input).toHaveFocus();

    rerender(tabsTree(controller({ renameVariant })));
    expect(await screen.findByText('ЭР с таким названием уже существует')).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('locks every other lifecycle write while an inline rename is open', async () => {
    const user = userEvent.setup();
    const model = controller();
    renderTabs(model);

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));

    expect(screen.getByRole('button', { name: 'Добавить пустой ЭР' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Создать копию выбранного ЭР/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Сделать.*активным/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Удалить ЭР/i })).toBeDisabled();
  });

  it('keeps a single selected tab during edit and does not steal focus after blur save', async () => {
    const user = userEvent.setup();
    let resolveRename!: (variant: ElectricalVariant) => void;
    const renameVariant = vi.fn(() => new Promise<ElectricalVariant>((resolve) => {
      resolveRename = resolve;
    }));
    const initialModel = controller({ renameVariant });
    const { rerender } = render(
      <MemoryRouter>
        <ElectricalVariantTabs controller={initialModel} />
        <button type="button">Внешнее действие</button>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));
    const input = screen.getByRole('textbox', { name: /Новое название ЭР/i });
    await user.clear(input);
    await user.type(input, 'Имя после blur');
    rerender(
      <MemoryRouter>
        <ElectricalVariantTabs
          controller={controller({ selectedVariant: ER_1, renameVariant })}
        />
        <button type="button">Внешнее действие</button>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('tab').filter((tab) =>
      tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Рабочее решение' }))
      .toHaveAttribute('aria-selected', 'true');

    const externalButton = screen.getByRole('button', { name: 'Внешнее действие' });
    await user.click(externalButton);
    expect(externalButton).toHaveFocus();
    resolveRename(ER_2);
    await waitFor(() => expect(renameVariant).toHaveBeenCalledWith(ER_2_ID, 'Имя после blur'));
    expect(externalButton).toHaveFocus();
  });

});
