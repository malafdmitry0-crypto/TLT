import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';

import HeatCalcUnsavedChangesModals from '@/pages/heatcalc/HeatCalcUnsavedChangesModals';
import type { ProjectObject } from '@/types/project';

type Props = ComponentProps<typeof HeatCalcUnsavedChangesModals>;

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'pipe-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    version: 1,
    params: { name: 'Труба DN100' },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    pendingInlineDisableOpen: false,
    pendingWizardObject: null,
    inlineDraftSaving: false,
    cancelPendingInlineDisable: vi.fn(),
    discardPendingInlineDisable: vi.fn(),
    savePendingInlineDisable: vi.fn(),
    discardDraftRows: vi.fn(),
    saveDraftRows: vi.fn(async () => ({ ok: true, saved: [] })),
    setPendingWizardObject: vi.fn(),
    forceOpenEditWizard: vi.fn(),
    ...overrides,
  };
  const user = userEvent.setup();

  render(<HeatCalcUnsavedChangesModals {...props} />);

  return { props, user };
}

function getModal(title: string) {
  const modal = screen.getByText(title).closest('.ant-modal');
  expect(modal).toBeInstanceOf(HTMLElement);
  return modal as HTMLElement;
}

describe('HeatCalcUnsavedChangesModals', () => {
  it('pending inline disable Cancel calls cancelPendingInlineDisable', async () => {
    const { props, user } = setup({ pendingInlineDisableOpen: true });

    await user.click(within(getModal('Отключить редактирование ячеек?')).getByRole('button', { name: 'Cancel' }));

    expect(props.cancelPendingInlineDisable).toHaveBeenCalledTimes(1);
  });

  it('pending inline disable Discard calls discardPendingInlineDisable with discardDraftRows', async () => {
    const { props, user } = setup({ pendingInlineDisableOpen: true });

    await user.click(within(getModal('Отключить редактирование ячеек?')).getByRole('button', { name: 'Discard' }));

    expect(props.discardPendingInlineDisable).toHaveBeenCalledTimes(1);
    expect(props.discardPendingInlineDisable).toHaveBeenCalledWith(props.discardDraftRows);
  });

  it('pending inline disable Save passes callback that saves draft rows', async () => {
    const { props, user } = setup({ pendingInlineDisableOpen: true });

    await user.click(within(getModal('Отключить редактирование ячеек?')).getByRole('button', { name: 'Save' }));

    expect(props.savePendingInlineDisable).toHaveBeenCalledTimes(1);
    const callback = vi.mocked(props.savePendingInlineDisable).mock.calls[0]?.[0];
    expect(callback).toBeTypeOf('function');
    await callback?.();
    expect(props.saveDraftRows).toHaveBeenCalledTimes(1);
    expect(props.saveDraftRows).toHaveBeenCalledWith();
  });

  it('pending wizard Cancel clears pending object', async () => {
    const target = makeObject();
    const { props, user } = setup({ pendingWizardObject: target });

    await user.click(within(getModal('Открыть форму объекта?')).getByRole('button', { name: 'Cancel' }));

    expect(props.setPendingWizardObject).toHaveBeenCalledTimes(1);
    expect(props.setPendingWizardObject).toHaveBeenCalledWith(null);
  });

  it('pending wizard Discard discards target row and opens form', async () => {
    const target = makeObject();
    const { props, user } = setup({ pendingWizardObject: target });

    await user.click(within(getModal('Открыть форму объекта?')).getByRole('button', { name: 'Discard' }));

    expect(props.discardDraftRows).toHaveBeenCalledWith([target.id]);
    expect(props.setPendingWizardObject).toHaveBeenCalledWith(null);
    expect(props.forceOpenEditWizard).toHaveBeenCalledWith(target);
  });

  it('pending wizard Save success opens saved object', async () => {
    const target = makeObject();
    const saved = makeObject({
      id: target.id,
      version: 2,
      params: { name: 'Труба сохранена' },
    });
    const { props, user } = setup({
      pendingWizardObject: target,
      saveDraftRows: vi.fn(async () => ({ ok: true, saved: [saved] })),
    });

    await user.click(within(getModal('Открыть форму объекта?')).getByRole('button', { name: 'Save' }));

    expect(props.saveDraftRows).toHaveBeenCalledWith([target.id]);
    await waitFor(() => {
      expect(props.setPendingWizardObject).toHaveBeenCalledWith(null);
      expect(props.forceOpenEditWizard).toHaveBeenCalledWith(saved);
    });
  });

  it('pending wizard Save fail keeps modal open and does not open form', async () => {
    const target = makeObject();
    const { props, user } = setup({
      pendingWizardObject: target,
      saveDraftRows: vi.fn(async () => ({ ok: false, saved: [] })),
    });

    await user.click(within(getModal('Открыть форму объекта?')).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(props.saveDraftRows).toHaveBeenCalledWith([target.id]);
    });
    expect(getModal('Открыть форму объекта?')).toBeInTheDocument();
    expect(props.setPendingWizardObject).not.toHaveBeenCalled();
    expect(props.forceOpenEditWizard).not.toHaveBeenCalled();
  });
});
