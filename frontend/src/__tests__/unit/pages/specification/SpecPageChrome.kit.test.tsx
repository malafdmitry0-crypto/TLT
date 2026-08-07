import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    readiness: { state: 'ready' as const, blockers: [], primaryBlocker: null },
    retryReadiness: vi.fn(),
    handleReadinessRecovery: vi.fn(),
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

  it('renders boolean TNP parameters as controlled checkboxes', async () => {
    const user = userEvent.setup();
    const setExZone = vi.fn();
    const setIndicationOnBoxes = vi.fn();
    const setEndSectionIndication = vi.fn();
    const setTopIndication = vi.fn();
    renderChrome({
      setExZone,
      setIndicationOnBoxes,
      setEndSectionIndication,
      setTopIndication,
    });

    const ex = screen.getByRole('checkbox', { name: 'Параметр Ex' });
    const k1i = screen.getByRole('checkbox', { name: 'Параметр К1i' });
    const k2i = screen.getByRole('checkbox', { name: 'Параметр К2i' });
    const kiu = screen.getByRole('checkbox', { name: 'Параметр Кiu' });

    expect(ex).not.toBeChecked();
    expect(k1i).not.toBeChecked();
    expect(k2i).toBeChecked();
    expect(kiu).not.toBeChecked();

    await user.click(ex);
    await user.click(k1i);
    await user.click(k2i);
    await user.click(kiu);

    expect(setExZone).toHaveBeenCalledWith(true);
    expect(setIndicationOnBoxes).toHaveBeenCalledWith(true);
    expect(setEndSectionIndication).toHaveBeenCalledWith(false);
    expect(setTopIndication).toHaveBeenCalledWith(true);
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

  it('explains that a stale specification must be regenerated before manual editing', () => {
    renderChrome({ hasItems: true, isSpecStale: true });

    const addButton = screen.getByRole('button', { name: /Добавить из БД/ });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveAccessibleDescription(
      'Эта спецификация устарела. Сформируйте её заново, чтобы добавить позиции вручную.',
    );
    expect(screen.getByText(
      'Эта спецификация устарела. Сформируйте её заново, чтобы добавить позиции вручную.',
    )).toBeInTheDocument();
  });

  it('explains that a specification must be generated before manual positions are available', () => {
    renderChrome({ hasItems: false, isSpecStale: false });

    const addButton = screen.getByRole('button', { name: /Добавить из БД/ });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveAccessibleDescription(
      'Сначала сформируйте спецификацию, чтобы добавить позиции вручную.',
    );
    expect(screen.getByText(
      'Сначала сформируйте спецификацию, чтобы добавить позиции вручную.',
    )).toBeInTheDocument();
  });

  it('keeps manual adding enabled without a warning for an up-to-date specification', () => {
    renderChrome({ hasItems: true, isSpecStale: false });

    const addButton = screen.getByRole('button', { name: 'Добавить из БД' });
    expect(addButton).toBeEnabled();
    expect(addButton).not.toHaveAccessibleDescription();
    expect(screen.queryByText(/Сформируйте её заново/)).not.toBeInTheDocument();
  });

  it('blocks only a definitive upstream blocker and exposes one recovery action', async () => {
    const user = userEvent.setup();
    const handleReadinessRecovery = vi.fn();
    renderChrome({
      readiness: {
        state: 'blocked',
        blockers: [],
        primaryBlocker: {
          code: 'SPEC_VARIANT_NOT_READY',
          kind: 'blocking',
          message: 'Назначение ЭР не готово',
          source_stage: 'electrical',
          scope: 'electrical_variant',
          electrical_variant_id: 'er-1',
          electrical_variant_name: 'ЭР1',
          reason: 'project_section_current_limit_changed',
          count: 6,
          object_ids: [],
          next_action: 'open_electrical_variant',
        },
      },
      handleReadinessRecovery,
    });

    expect(screen.getByText('ЭР не готова к формированию спецификации')).toBeInTheDocument();
    expect(screen.getByText(/Затронуто объектов: 6/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сформировать' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Пересчитать ЭР' }));
    expect(handleReadinessRecovery).toHaveBeenCalledTimes(1);
  });

  it('does not block generation when readiness is unavailable', () => {
    renderChrome({
      readiness: { state: 'unavailable', blockers: [], primaryBlocker: null },
    });

    expect(screen.getByText('Не удалось проверить готовность ЭР')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сформировать' })).toBeEnabled();
  });
});
