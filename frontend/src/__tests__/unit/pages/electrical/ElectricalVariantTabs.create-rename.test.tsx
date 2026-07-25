import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ElectricalVariantTabs from '@/pages/electrical/ElectricalVariantTabs';
import type { ElectricalVariantSelectionController } from '@/hooks/useElectricalVariantSelection';
import type { ElectricalVariant } from '@/types/electricalVariant';

function tabsTree(
  ctrl: ElectricalVariantSelectionController,
  canMutate = true,
) {
  return (
    <MemoryRouter>
      <ElectricalVariantTabs controller={ctrl} canMutate={canMutate} />
    </MemoryRouter>
  );
}

function renderTabs(
  ctrl: ElectricalVariantSelectionController,
  canMutate = true,
) {
  return render(tabsTree(ctrl, canMutate));
}

const PROJECT_ID = 'project-a';
const ER_1_ID = '11111111-1111-4111-8111-111111111111';
const ER_2_ID = '22222222-2222-4222-8222-222222222222';

function variant(
  id: string,
  name: string,
  sortOrder: number,
  isActive = false,
): ElectricalVariant {
  return {
    id,
    project_id: PROJECT_ID,
    name,
    sort_order: sortOrder,
    is_active: isActive,
    copied_from_id: null,
    legacy_variant_number: sortOrder + 1,
    specification_state: 'not_generated',
    created_at: '2026-07-18T10:00:00Z',
    updated_at: '2026-07-18T10:00:00Z',
  };
}

const ER_1 = variant(ER_1_ID, 'Рабочее решение', 0, true);
const ER_2 = variant(ER_2_ID, 'Альтернатива Ω очень длинное имя', 1);

function controller(
  overrides: Partial<ElectricalVariantSelectionController> = {},
): ElectricalVariantSelectionController {
  const variants = overrides.variants ?? [ER_1, ER_2];
  const selectedVariant = overrides.selectedVariant === undefined ? ER_2 : overrides.selectedVariant;
  return {
    projectId: PROJECT_ID,
    variants,
    selectedVariantId: selectedVariant?.id ?? null,
    selectedVariant,
    activeVariant: variants.find((item) => item.is_active) ?? null,
    isLoading: false,
    isFetching: false,
    isError: false,
    listError: null,
    isEmpty: variants.length === 0,
    readiness: null,
    isReadinessLoading: false,
    isReadinessFetching: false,
    readinessError: null,
    mutationError: null,
    isMutating: false,
    pendingOperation: null,
    selectVariant: vi.fn(),
    selectAndActivateVariant: vi.fn().mockResolvedValue(ER_2),
    retryList: vi.fn().mockResolvedValue(undefined),
    retryReadiness: vi.fn().mockResolvedValue(undefined),
    initializeVariant: vi.fn().mockResolvedValue(ER_1),
    createVariant: vi.fn().mockResolvedValue(ER_2),
    copySelectedVariant: vi.fn().mockResolvedValue(ER_2),
    renameVariant: vi.fn().mockResolvedValue(ER_2),
    activateVariant: vi.fn().mockResolvedValue(ER_2),
    deleteVariant: vi.fn().mockResolvedValue(undefined),
    clearMutationError: vi.fn(),
    ...overrides,
  };
}

describe('ElectricalVariantTabs — create-rename', () => {
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

  it('allows the full backend contract of 128 characters for an ER name', async () => {
    const user = userEvent.setup();
    const model = controller();
    renderTabs(model);

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));
    const input = screen.getByRole('textbox', { name: /Новое название ЭР/i });
    const contractName = 'Я'.repeat(128);
    await user.clear(input);
    await user.type(input, `${contractName}{Enter}`);

    await waitFor(() => {
      expect(model.renameVariant).toHaveBeenCalledWith(ER_2_ID, contractName);
    });
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
