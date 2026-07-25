import { render, screen, waitFor } from '@testing-library/react';
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

describe('ElectricalVariantTabs — delete-limits-feedback', () => {
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
