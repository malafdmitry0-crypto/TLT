import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpecPageChrome } from '@/pages/specification/SpecPageChrome';

function renderChrome(overrides: Record<string, unknown> = {}) {
  const props = {
    settingsOpen: true,
    toggleSettings: vi.fn(),
    canMutateProject: true,
    fullModeActive: true,
    selectedGenerateErIds: ['er-1'],
    setSelectedGenerateErIds: vi.fn(),
    availableGenerateVariants: [{ id: 'er-1', name: 'ЭР1' }],
    reserveCoeff: 1.2,
    setReserveCoeff: vi.fn(),
    connectorKitSectionsPerKit: 1 as const,
    setConnectorKitSectionsPerKit: vi.fn(),
    exZone: false,
    setExZone: vi.fn(),
    indicationOnBoxes: false,
    setIndicationOnBoxes: vi.fn(),
    endSectionIndication: true,
    setEndSectionIndication: vi.fn(),
    topIndication: false,
    setTopIndication: vi.fn(),
    minLengthK2i: 100,
    setMinLengthK2i: vi.fn(),
    groupBy: 'object_section',
    setGroupBy: vi.fn(),
    mergeIdentical: false,
    setMergeIdentical: vi.fn(),
    items: [],
    categoriesCount: 0,
    projectSettings: null,
    spec: null,
    mut: { isPending: false },
    saveDefaultsMut: { isPending: false, mutate: vi.fn() },
    runGenerate: vi.fn(),
    canManuallyEdit: true,
    hasItems: false,
    isSpecStale: false,
    setAddOpen: vi.fn(),
    addOpen: false,
    handleAdd: vi.fn(),
    saveMut: { isPending: false, mutate: vi.fn() },
    selectedAccessoryId: null,
    setSelectedAccessoryId: vi.fn(),
    qty: 1,
    setQty: vi.fn(),
    accessories: [],
    preflightOpen: false,
    setPreflightOpen: vi.fn(),
    setPendingGenerate: vi.fn(),
    confirmPartialGenerate: vi.fn(),
    preflightSummary: null,
    ...overrides,
  };
  return render(<SpecPageChrome {...props} />);
}

describe('SpecPageChrome UI kit strangler (U2)', () => {
  it('renders settings param rows via CompactField + kit controls', () => {
    renderChrome();

    expect(screen.getByTestId('spec-params-panel')).toBeInTheDocument();
    // Ant Drawer portals content to document body
    expect(document.querySelectorAll('.tlt-compact-field').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByLabelText('Резерв R,гр')).toBeInTheDocument();
    expect(screen.getByLabelText('Секций на соединительный комплект')).toBeInTheDocument();
    expect(screen.getByLabelText('Мин. длина секции для К2i')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбрать все' })).toBeInTheDocument();
  });
});
