import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ElectricalVariantTabs from '@/pages/electrical/ElectricalVariantTabs';
import type { ElectricalVariantSelectionController } from '@/hooks/useElectricalVariantSelection';
import type { ElectricalReadinessResponse, ElectricalVariant } from '@/types/electricalVariant';

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

describe('ElectricalVariantTabs — readiness-errors', () => {
  it('renders loading, retryable list error and mutation error without a fabricated ER1', async () => {
    const user = userEvent.setup();
    const retryList = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderTabs(controller({ isLoading: true, variants: [], selectedVariant: null }));
    expect(screen.getByText('Загружаем список ЭР…')).toBeInTheDocument();
    expect(screen.queryByText('ЭР1')).not.toBeInTheDocument();

    rerender(tabsTree(controller({
          isLoading: false,
          isError: true,
          listError: new Error('Список недоступен'),
          variants: [],
          selectedVariant: null,
          retryList,
        })));
    expect(screen.getByText('Список недоступен')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить загрузку ЭР' }));
    expect(retryList).toHaveBeenCalled();

    rerender(tabsTree(controller({ mutationError: new Error('Имя уже занято') })));
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
    const { rerender } = renderTabs(controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          readiness: blockedReadiness,
        }));

    expect(screen.getByText('Пересчитайте теплопотери ёмкости')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Создать ЭР1/i })).toBeDisabled();

    const initializeVariant = vi.fn().mockResolvedValue(ER_1);
    rerender(tabsTree(controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          readiness: { ...blockedReadiness, ready: true, ready_objects: 2, issues: [] },
          initializeVariant,
        })));
    await user.click(screen.getByRole('button', { name: /Создать ЭР1/i }));
    expect(initializeVariant).toHaveBeenCalled();
  });

  it('keeps initialize disabled while authoritative readiness is refetching', () => {
    renderTabs(controller({
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
        }));

    expect(screen.getByRole('button', { name: 'Создать ЭР1' })).toBeDisabled();
  });

  it('shows a retryable readiness error for an empty project', async () => {
    const user = userEvent.setup();
    const retryReadiness = vi.fn().mockResolvedValue(undefined);
    renderTabs(controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          readinessError: new Error('Readiness API недоступен'),
          retryReadiness,
        }));

    expect(screen.getByText('Readiness API недоступен')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить проверку готовности ЭР' }));
    expect(retryReadiness).toHaveBeenCalled();
  });

  it('does not allow a read-only user to initialize the first ER', () => {
    renderTabs(controller({
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
    }), false);

    expect(screen.getByText('Режим просмотра')).toBeInTheDocument();
    expect(screen.getByText(/Создать первый ЭР может только владелец/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать ЭР1' })).toBeDisabled();
  });
});
