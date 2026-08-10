import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    exZone: false,
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
    spec: null,
    mut: { isPending: false },
    generationWorkflowPending: false,
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
  it('exposes only the Case 1 specification formation mode', async () => {
    const user = userEvent.setup();
    renderChrome();

    const groupingMode = screen.getByRole('combobox', {
      name: 'Группировка строк при формировании',
    });
    expect(groupingMode).toBeInTheDocument();

    await user.click(groupingMode);
    expect(screen.getByRole('option', { name: 'Разделять по типам объектов' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Объединять материалы' })).toBeInTheDocument();

    expect(screen.queryByText('Отображение')).not.toBeInTheDocument();
    expect(screen.queryByText('Объединить одинаковые (base+код)')).not.toBeInTheDocument();
    expect(screen.queryByText('Кат.')).not.toBeInTheDocument();
    expect(screen.queryByText('Ед.')).not.toBeInTheDocument();
  });

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

  it('renders boolean TNP parameters as explicit Да / Нет selects', async () => {
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

    const ex = screen.getByRole('combobox', { name: 'Параметр Ex' });
    const k1i = screen.getByRole('combobox', { name: 'Параметр К1i' });
    const k2i = screen.getByRole('combobox', { name: 'Параметр К2i' });
    const kiu = screen.getByRole('combobox', { name: 'Параметр Кiu' });

    expect(ex.closest('.ant-select')).toHaveTextContent('Нет');
    expect(k1i.closest('.ant-select')).toHaveTextContent('Нет');
    expect(k2i.closest('.ant-select')).toHaveTextContent('Да');
    expect(kiu.closest('.ant-select')).toHaveTextContent('Нет');

    const trigger = ex.closest('.ant-select');
    const selector = trigger?.querySelector('.ant-select-selector') ?? ex;
    fireEvent.mouseDown(selector);
    const optionElement = screen.getAllByTitle('Да').find((element) => (
      element.classList.contains('ant-select-item-option')
    ));
    if (!optionElement) throw new Error('Option Да not found');
    fireEvent.mouseDown(optionElement);
    fireEvent.click(optionElement);

    expect(setExZone).toHaveBeenCalledWith(true);
    expect(setIndicationOnBoxes).not.toHaveBeenCalled();
    expect(setEndSectionIndication).not.toHaveBeenCalled();
    expect(setTopIndication).not.toHaveBeenCalled();
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

  it('submits incomplete settings to authoritative backend validation', async () => {
    const user = userEvent.setup();
    const runGenerate = vi.fn();
    renderChrome({
      reserveCoeff: '',
      exZone: false,
      indicationOnBoxes: false,
      endSectionIndication: false,
      topIndication: false,
      minLengthK2i: '',
      groupingMode: null,
      runGenerate,
    });

    expect(screen.queryByText('Заполните обязательные параметры')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сохранить настройки проекта' }))
      .not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сформировать' }));
    expect(runGenerate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Заполните обязательные параметры')).not.toBeInTheDocument();
  });

  it('renders backend field issues and focuses the first rejected field', async () => {
    renderChrome({
      generationDiagnostics: [{
        code: 'SPEC_FORMULA_INPUT_INVALID',
        kind: 'blocking',
        message: 'Настройки не прошли валидацию',
        issues: [
          { field: 'grouping_mode', reason: 'required_option_unresolved' },
          { field: 'L_K2i_m', reason: 'required_option_unresolved' },
          { field: 'R_gr', reason: 'required_option_unresolved' },
        ],
        details: {},
      }],
    });

    expect(screen.getAllByText('Обязательное поле не заполнено')).toHaveLength(3);
    const grouping = screen.getByRole('combobox', {
      name: 'Группировка строк при формировании',
    });
    expect(grouping).toHaveAccessibleDescription('Обязательное поле не заполнено');
    expect(screen.getByRole('spinbutton', { name: 'Параметр L К2i' }))
      .toHaveAccessibleDescription('Обязательное поле не заполнено');
    expect(screen.getByRole('spinbutton', { name: 'Параметр R гр' }))
      .toHaveAccessibleDescription('Обязательное поле не заполнено');
    await waitFor(() => expect(grouping).toHaveFocus());
  });

  it('keeps final validation and the primary action outside the scrolling modal body', () => {
    renderChrome({
      generationDiagnostics: [{
        code: 'SPEC_FORMULA_INPUT_INVALID',
        kind: 'blocking',
        message: 'Не заполнены обязательные настройки спецификации',
        issues: [{ field: 'grouping_mode', reason: 'required_option_unresolved' }],
        details: {},
      }],
    });

    const action = screen.getByRole('button', { name: 'Сформировать' });
    expect(action.closest('.ant-modal-footer')).not.toBeNull();
    const validation = screen.getByRole('alert');
    expect(validation).toHaveTextContent('Не заполнены обязательные настройки спецификации');
    expect(validation.closest('.ant-modal-footer')).not.toBeNull();
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

  it('does not label a project blocker as an electrical-variant failure', () => {
    renderChrome({
      readiness: {
        state: 'blocked',
        blockers: [],
        primaryBlocker: {
          code: 'SPEC_PROJECT_BLOCKED',
          kind: 'blocking',
          message: 'Формирование временно недоступно',
          source_stage: 'specification',
          scope: 'project',
          reason: 'project_blocked',
          count: 1,
          object_ids: [],
          next_action: 'review_specification_settings',
        },
      },
    });

    expect(screen.getByText('Формирование спецификации заблокировано')).toBeInTheDocument();
    expect(screen.queryByText('ЭР не готова к формированию спецификации')).not.toBeInTheDocument();
  });

  it('shows catalog and ER blockers together without assigning catalog to an ER', () => {
    const projectBlocker = {
      code: 'SPEC_CATALOG_UNAVAILABLE',
      kind: 'blocking' as const,
      message: 'Каталог недоступен',
      source_stage: 'catalog' as const,
      scope: 'catalog' as const,
      reason: 'spec_catalog_unavailable',
      count: 1,
      object_ids: [],
      next_action: 'contact_catalog_admin' as const,
    };
    const variantBlocker = {
      code: 'SPEC_VARIANT_NOT_READY',
      kind: 'blocking' as const,
      message: 'Назначение ЭР не готово',
      source_stage: 'electrical' as const,
      scope: 'electrical_variant' as const,
      electrical_variant_id: 'er-1',
      electrical_variant_name: 'ЭР1',
      reason: 'result_stale',
      count: 1,
      object_ids: [],
      next_action: 'open_electrical_variant' as const,
    };
    renderChrome({
      readiness: {
        state: 'blocked',
        blockers: [projectBlocker, variantBlocker],
        primaryBlocker: projectBlocker,
      },
    });

    expect(screen.getByText('Каталог не готов к формированию спецификации'))
      .toBeInTheDocument();
    expect(screen.getByText(/ЭР1: электрорасчёт не готов/)).toBeInTheDocument();
  });

  it('does not block generation when readiness is unavailable', () => {
    renderChrome({
      readiness: { state: 'unavailable', blockers: [], primaryBlocker: null },
    });

    expect(screen.getByText('Не удалось проверить готовность к формированию спецификации'))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сформировать' })).toBeEnabled();
  });
});
