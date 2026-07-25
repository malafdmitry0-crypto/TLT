import { fireEvent, render, screen, within } from '@testing-library/react';
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

describe('ElectricalVariantTabs — render-nav', () => {
  it('renders ER names; current tab is selected (no separate ★ active UX)', () => {
    renderTabs(controller());

    const tablist = screen.getByRole('tablist', { name: 'Варианты ЭР' });
    expect(screen.queryByText('Электротехнические решения')).not.toBeInTheDocument();
    const otherTab = within(tablist).getByRole('tab', { name: 'Рабочее решение' });
    const selectedTab = within(tablist).getByRole('tab', { name: /Альтернатива Ω/i });

    expect(otherTab).toHaveAttribute('aria-selected', 'false');
    expect(selectedTab).toHaveAttribute('aria-selected', 'true');
    expect(selectedTab).toHaveAttribute('id', `electrical-variant-tab-${ER_2_ID}`);
    expect(selectedTab).toHaveAttribute(
      'aria-controls',
      `electrical-variant-panel-${ER_2_ID}`,
    );
    expect(selectedTab).toHaveAttribute('title', ER_2.name);
    expect(screen.queryByText('Активный')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Сделать.*активным/i })).not.toBeInTheDocument();
  });

  it('supports keyboard tab navigation via selectAndActivate', () => {
    const model = controller({ selectedVariant: ER_1 });
    renderTabs(model, true);
    const tabs = screen.getAllByRole('tab');

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(model.selectAndActivateVariant).toHaveBeenCalledWith(ER_2_ID);
    expect(tabs[1]).toHaveFocus();
  });

  it('keeps the selected ER visible inside a horizontally scrollable tablist', () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      renderTabs(controller());

      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        inline: 'nearest',
      });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});
