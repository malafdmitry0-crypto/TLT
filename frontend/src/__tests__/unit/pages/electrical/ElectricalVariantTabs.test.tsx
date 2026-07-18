import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ElectricalVariantTabs from '@/pages/electrical/ElectricalVariantTabs';
import type { ElectricalVariantSelectionController } from '@/pages/electrical/useElectricalVariantSelection';
import type { ElectricalReadinessResponse, ElectricalVariant } from '@/types/electricalVariant';

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

describe('ElectricalVariantTabs', () => {
  it('renders backend names and distinguishes selected from backend active', () => {
    render(<ElectricalVariantTabs controller={controller()} />);

    const tablist = screen.getByRole('tablist', { name: 'Электротехнические решения' });
    const activeTab = within(tablist).getByRole('tab', { name: /Рабочее решение.*активный/i });
    const selectedTab = within(tablist).getByRole('tab', { name: /Альтернатива Ω/i });

    expect(activeTab).toHaveAttribute('aria-selected', 'false');
    expect(selectedTab).toHaveAttribute('aria-selected', 'true');
    expect(selectedTab).toHaveAttribute('id', `electrical-variant-tab-${ER_2_ID}`);
    expect(selectedTab).toHaveAttribute(
      'aria-controls',
      `electrical-variant-panel-${ER_2_ID}`,
    );
    expect(selectedTab).toHaveAttribute('title', ER_2.name);
    expect(screen.getByText(/Выбрано: Альтернатива Ω/)).toBeInTheDocument();
    expect(screen.getByText(/Активный ЭР: Рабочее решение/)).toBeInTheDocument();
  });

  it('supports keyboard tab navigation', () => {
    const model = controller({ selectedVariant: ER_1 });
    render(<ElectricalVariantTabs controller={model} />);
    const tabs = screen.getAllByRole('tab');

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(model.selectVariant).toHaveBeenCalledWith(ER_2_ID);
    expect(tabs[1]).toHaveFocus();
  });

  it('keeps the selected ER visible inside a horizontally scrollable tablist', () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      render(<ElectricalVariantTabs controller={controller()} />);

      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        inline: 'nearest',
      });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('creates an empty ER and copies the exact selected ER', async () => {
    const user = userEvent.setup();
    const model = controller();
    render(<ElectricalVariantTabs controller={model} />);

    await user.click(screen.getByRole('button', { name: 'Добавить пустой ЭР' }));
    await user.click(screen.getByRole('button', { name: /Создать копию.*Альтернатива Ω/i }));

    expect(model.createVariant).toHaveBeenCalledWith();
    expect(model.copySelectedVariant).toHaveBeenCalledWith();
  });

  it('saves inline rename on Enter and on blur', async () => {
    const user = userEvent.setup();
    const model = controller();
    render(<ElectricalVariantTabs controller={model} />);

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
    render(<ElectricalVariantTabs controller={model} />);

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
    render(<ElectricalVariantTabs controller={model} />);

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
    render(<ElectricalVariantTabs controller={controller({ renameVariant })} />);

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
    const { rerender } = render(<ElectricalVariantTabs controller={initialModel} />);

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));
    const input = screen.getByRole('textbox', { name: /Новое название ЭР/i });
    await user.clear(input);
    await user.type(input, 'Конфликт{Enter}');
    rerender(
      <ElectricalVariantTabs
        controller={controller({
          renameVariant,
          isMutating: true,
          pendingOperation: 'rename',
        })}
      />,
    );
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('readonly');

    rejectRename(new Error('ЭР с таким названием уже существует'));
    rerender(
      <ElectricalVariantTabs
        controller={controller({
          renameVariant,
          isMutating: true,
          pendingOperation: 'reconcile',
        })}
      />,
    );
    expect(input).toHaveFocus();

    rerender(<ElectricalVariantTabs controller={controller({ renameVariant })} />);
    expect(await screen.findByText('ЭР с таким названием уже существует')).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('locks every other lifecycle write while an inline rename is open', async () => {
    const user = userEvent.setup();
    const model = controller();
    render(<ElectricalVariantTabs controller={model} />);

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));

    expect(screen.getByRole('button', { name: 'Добавить пустой ЭР' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Создать копию выбранного ЭР/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Сделать ЭР.*активным/i })).toBeDisabled();
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
      <>
        <ElectricalVariantTabs controller={initialModel} />
        <button type="button">Внешнее действие</button>
      </>,
    );

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));
    const input = screen.getByRole('textbox', { name: /Новое название ЭР/i });
    await user.clear(input);
    await user.type(input, 'Имя после blur');
    rerender(
      <>
        <ElectricalVariantTabs
          controller={controller({ selectedVariant: ER_1, renameVariant })}
        />
        <button type="button">Внешнее действие</button>
      </>,
    );

    expect(screen.getAllByRole('tab').filter((tab) =>
      tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: /Рабочее решение.*активный/i }))
      .toHaveAttribute('aria-selected', 'true');

    const externalButton = screen.getByRole('button', { name: 'Внешнее действие' });
    await user.click(externalButton);
    expect(externalButton).toHaveFocus();
    resolveRename(ER_2);
    await waitFor(() => expect(renameVariant).toHaveBeenCalledWith(ER_2_ID, 'Имя после blur'));
    expect(externalButton).toHaveFocus();
  });

  it('requires explicit delete confirmation and disables deletion of the last ER', async () => {
    const user = userEvent.setup();
    const model = controller();
    const { rerender } = render(<ElectricalVariantTabs controller={model} />);

    await user.click(screen.getByRole('button', { name: /Удалить.*Альтернатива Ω/i }));
    expect(await screen.findByText(/назначения объектов, электрические расчёты и выбранные кабели, кандидаты и их папки, а также спецификация/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(model.deleteVariant).toHaveBeenCalledWith(ER_2_ID);

    const oneVariantModel = controller({ variants: [ER_1], selectedVariant: ER_1 });
    rerender(<ElectricalVariantTabs controller={oneVariantModel} />);
    expect(screen.getByRole('button', { name: /Нельзя удалить последний ЭР/i })).toBeDisabled();
  });

  it('shows an active-job delete conflict and allows recovery without losing selection', async () => {
    const user = userEvent.setup();
    const deleteVariant = vi.fn().mockRejectedValue(
      new Error('Нельзя удалить ЭР, пока выполняются связанные фоновые задачи'),
    );
    const model = controller({ deleteVariant });
    const { rerender } = render(<ElectricalVariantTabs controller={model} />);

    await user.click(screen.getByRole('button', { name: /Удалить.*Альтернатива Ω/i }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(deleteVariant).toHaveBeenCalledWith(ER_2_ID));

    rerender(
      <ElectricalVariantTabs
        controller={controller({
          deleteVariant,
          mutationError: new Error('Нельзя удалить ЭР, пока выполняются связанные фоновые задачи'),
        })}
      />,
    );
    expect(screen.getByText(/пока выполняются связанные фоновые задачи/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Альтернатива Ω/i }))
      .toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /Удалить.*Альтернатива Ω/i })).toBeEnabled();
  });

  it('disables create and copy at the five-ER limit', () => {
    const variants = Array.from({ length: 5 }, (_, index) =>
      variant(`${index + 1}`.repeat(8) + '-1111-4111-8111-111111111111', `ЭР ${index + 1}`, index, index === 0),
    );
    render(
      <ElectricalVariantTabs
        controller={controller({ variants, selectedVariant: variants[0] })}
      />,
    );

    expect(screen.getByRole('button', { name: /Добавить пустой ЭР.*лимит 5/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Создать копию.*лимит 5/i })).toBeDisabled();
  });

  it('announces the exact pending lifecycle operation', () => {
    render(
      <ElectricalVariantTabs
        controller={controller({ isMutating: true, pendingOperation: 'copy' })}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Копируем выбранный ЭР…');
    expect(screen.getByRole('button', { name: /Создать копию выбранного ЭР/i })).toBeDisabled();
  });

  it('shows reconciled success without claiming that the operation failed', () => {
    render(
      <ElectricalVariantTabs
        controller={controller({
          mutationNotice: 'ЭР удалён; результат подтверждён после сверки с сервером.',
        })}
      />,
    );

    expect(screen.getByText('Результат операции подтверждён')).toBeInTheDocument();
    expect(screen.getByText(/ЭР удалён.*сверки с сервером/i)).toBeInTheDocument();
    expect(screen.queryByText('Операция с ЭР не выполнена')).not.toBeInTheDocument();
  });

  it('keeps lifecycle controls read-only for a non-owner', () => {
    render(<ElectricalVariantTabs controller={controller()} canMutate={false} />);

    expect(screen.getByText('Режим просмотра')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить пустой ЭР' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Создать копию выбранного ЭР/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Переименовать ЭР/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Сделать ЭР.*активным/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Удалить ЭР/i })).toBeDisabled();
  });

  it('renders loading, retryable list error and mutation error without a fabricated ER1', async () => {
    const user = userEvent.setup();
    const retryList = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <ElectricalVariantTabs controller={controller({ isLoading: true, variants: [], selectedVariant: null })} />,
    );
    expect(screen.getByText('Загружаем список ЭР…')).toBeInTheDocument();
    expect(screen.queryByText('ЭР1')).not.toBeInTheDocument();

    rerender(
      <ElectricalVariantTabs
        controller={controller({
          isLoading: false,
          isError: true,
          listError: new Error('Список недоступен'),
          variants: [],
          selectedVariant: null,
          retryList,
        })}
      />,
    );
    expect(screen.getByText('Список недоступен')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить загрузку ЭР' }));
    expect(retryList).toHaveBeenCalled();

    rerender(
      <ElectricalVariantTabs
        controller={controller({ mutationError: new Error('Имя уже занято') })}
      />,
    );
    expect(screen.getByText('Имя уже занято')).toBeInTheDocument();
  });

  it('shows readiness details for an empty project and initializes only when ready', async () => {
    const user = userEvent.setup();
    const blockedReadiness: ElectricalReadinessResponse = {
      project_id: PROJECT_ID,
      ready: false,
      total_objects: 2,
      ready_objects: 1,
      issues: [{
        code: 'HEAT_NOT_READY',
        message: 'Пересчитайте теплопотери ёмкости',
        object_id: ER_2_ID,
        details: {},
      }],
    };
    const { rerender } = render(
      <ElectricalVariantTabs
        controller={controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          readiness: blockedReadiness,
        })}
      />,
    );

    expect(screen.getByText('Пересчитайте теплопотери ёмкости')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Создать ЭР1/i })).toBeDisabled();

    const initializeVariant = vi.fn().mockResolvedValue(ER_1);
    rerender(
      <ElectricalVariantTabs
        controller={controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          readiness: { ...blockedReadiness, ready: true, ready_objects: 2, issues: [] },
          initializeVariant,
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Создать ЭР1/i }));
    expect(initializeVariant).toHaveBeenCalled();
  });

  it('keeps initialize disabled while authoritative readiness is refetching', () => {
    render(
      <ElectricalVariantTabs
        controller={controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          isReadinessFetching: true,
          readiness: {
            project_id: PROJECT_ID,
            ready: true,
            total_objects: 1,
            ready_objects: 1,
            issues: [],
          },
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Создать ЭР1' })).toBeDisabled();
  });

  it('shows a retryable readiness error for an empty project', async () => {
    const user = userEvent.setup();
    const retryReadiness = vi.fn().mockResolvedValue(undefined);
    render(
      <ElectricalVariantTabs
        controller={controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          readinessError: new Error('Readiness API недоступен'),
          retryReadiness,
        })}
      />,
    );

    expect(screen.getByText('Readiness API недоступен')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить проверку готовности ЭР' }));
    expect(retryReadiness).toHaveBeenCalled();
  });

  it('does not allow a read-only user to initialize the first ER', () => {
    render(
      <ElectricalVariantTabs
        controller={controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          readiness: {
            project_id: PROJECT_ID,
            ready: true,
            total_objects: 1,
            ready_objects: 1,
            issues: [],
          },
        })}
        canMutate={false}
      />,
    );

    expect(screen.getByText('Режим просмотра')).toBeInTheDocument();
    expect(screen.getByText(/Создать первый ЭР может только владелец/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать ЭР1' })).toBeDisabled();
  });
});
