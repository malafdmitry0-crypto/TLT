import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpecPageChrome } from '@/pages/specification/SpecPageChrome';

function renderChrome(overrides: Record<string, unknown> = {}) {
  const props = {
    settingsOpen: true,
    toggleSettings: vi.fn(),
    canMutateProject: true,
    selectedGenerateErIds: ['er-1'],
    setSelectedGenerateErIds: vi.fn(),
    availableGenerateVariants: [{ id: 'er-1', name: 'ЭР1' }],
    reserveCoeff: '1.2',
    setReserveCoeff: vi.fn(),
    exZone: false as boolean | null,
    setExZone: vi.fn(),
    indicationOnBoxes: false,
    setIndicationOnBoxes: vi.fn(),
    endSectionIndication: true,
    setEndSectionIndication: vi.fn(),
    topIndication: false,
    setTopIndication: vi.fn(),
    minLengthK2i: '100',
    setMinLengthK2i: vi.fn(),
    groupingMode: 'separate_by_object_type' as const,
    setGroupingMode: vi.fn(),
    generationDiagnostics: [],
    groupBy: 'object_section' as const,
    setGroupBy: vi.fn(),
    mergeIdentical: false,
    setMergeIdentical: vi.fn(),
    items: [],
    categoriesCount: 0,
    projectSettings: null,
    spec: null,
    mut: { isPending: false },
    generationWorkflowPending: false,
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
    // Ant Modal portals content to document body
    expect(document.querySelectorAll('.tlt-compact-field').length).toBeGreaterThanOrEqual(3);
    // Ant Select puts aria-label on both root and combobox input
    expect(screen.getAllByLabelText('Параметр R гр').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Параметр Ex').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Параметр L К2i').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Выбрать все' })).toBeInTheDocument();
    expect(screen.getByText('Не определена — backend разрешит при формировании'))
      .toBeInTheDocument();
    expect(screen.queryByText('Стандартная активная версия')).not.toBeInTheDocument();
  });

  it('shows Исправить on preflight modal and does not auto-confirm generate', async () => {
    const fixUnassignedAssignments = vi.fn();
    const confirmPartialGenerate = vi.fn();
    renderChrome({
      preflightOpen: true,
      preflightSummary: 'Есть неназначенные объекты. (UNASSIGNED_CONFIRMATION_REQUIRED)',
      fixUnassignedAssignments,
      confirmPartialGenerate,
    });

    expect(screen.getByTestId('spec-preflight-summary')).toBeInTheDocument();
    const fixBtn = screen.getByTestId('spec-preflight-fix');
    expect(fixBtn).toHaveTextContent('Исправить');
    fixBtn.click();
    expect(fixUnassignedAssignments).toHaveBeenCalledTimes(1);
    expect(confirmPartialGenerate).not.toHaveBeenCalled();
  });

  it('shows the catalog identity resolved in the canonical snapshot', () => {
    renderChrome({
      spec: {
        id: 'spec-1',
        project_id: 'project-1',
        electrical_variant_id: 'er-1',
        items: [],
        snapshot: {
          catalog: { catalog_key: 'tnp-approved', version: '2026.08' },
        },
        created_at: '2026-08-03T00:00:00Z',
        updated_at: '2026-08-03T00:00:00Z',
      },
    });

    expect(screen.getByText('tnp-approved · 2026.08')).toBeInTheDocument();
  });

  it('keeps canonical unset state visible and disables writes until it is complete', () => {
    renderChrome({
      selectedGenerateErIds: [],
      reserveCoeff: '',
      exZone: null,
      indicationOnBoxes: null,
      endSectionIndication: null,
      topIndication: null,
      minLengthK2i: '',
      groupingMode: null,
    });

    expect(screen.getByText('Заполните обязательные параметры')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сформировать' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить настройки проекта' })).toBeDisabled();
  });
});
