import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectObject } from '@/types/project';
import { useElecCalcGlideActions } from '@/pages/electrical/useElecCalcGlideActions';

function projectObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'object-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    version: 1,
    params: {},
    results: {},
    is_valid: true,
    validation_errors: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(
  options: Partial<Parameters<typeof useElecCalcGlideActions>[0]> = {},
) {
  const onOpenCableMarkModal = vi.fn();
  const onOpenCableSizingModal = vi.fn();

  return {
    onOpenCableMarkModal,
    onOpenCableSizingModal,
    ...renderHook(() => useElecCalcGlideActions({
      activeRowId: 'object-1',
      projectSelected: true,
      canMutate: true,
      isCableMarkPending: false,
      onOpenCableMarkModal,
      onOpenCableSizingModal,
      ...options,
    })),
  };
}

describe('useElecCalcGlideActions', () => {
  it('returns cable mark actions only for the active row', () => {
    const { result } = setup();

    expect(result.current.getElectricalGlideCellActions(projectObject(), 'diameter_mm')).toBeUndefined();
    expect(result.current.getElectricalGlideCellActions(projectObject({ id: 'object-2' }), 'cable_mark'))
      .toBeUndefined();
    expect(result.current.getElectricalGlideCellActions(projectObject(), 'cable_mark')).toEqual([
      { key: 'choose', label: 'Выбор', disabled: false },
      { key: 'size', label: 'Подбор', disabled: false },
    ]);
  });

  it('keeps choose disabled for invalid objects, missing project or pending mark action', () => {
    expect(setup().result.current.getElectricalGlideCellActions(
      projectObject({ is_valid: false }),
      'cable_mark',
    )).toEqual([
      { key: 'choose', label: 'Выбор', disabled: true },
      { key: 'size', label: 'Подбор', disabled: false },
    ]);

    expect(setup({
      projectSelected: false,
    }).result.current.getElectricalGlideCellActions(projectObject(), 'cable_mark')).toEqual([
      { key: 'choose', label: 'Выбор', disabled: true },
      { key: 'size', label: 'Подбор', disabled: true },
    ]);

    expect(setup({
      isCableMarkPending: true,
    }).result.current.getElectricalGlideCellActions(projectObject(), 'cable_mark')).toEqual([
      { key: 'choose', label: 'Выбор', disabled: true },
      { key: 'size', label: 'Подбор', disabled: false },
    ]);
  });

  it('routes choose and size actions to page callbacks without building payloads', () => {
    const row = projectObject();
    const { result, onOpenCableMarkModal, onOpenCableSizingModal } = setup();

    result.current.handleElectricalGlideCellAction(row, 'cable_mark', 'choose');
    expect(onOpenCableMarkModal).toHaveBeenCalledWith(row);

    result.current.handleElectricalGlideCellAction(row, 'cable_mark', 'size');
    expect(onOpenCableSizingModal).toHaveBeenCalledWith(row);
  });

  it('keeps guards for action routing', () => {
    const row = projectObject();
    const { result, onOpenCableMarkModal, onOpenCableSizingModal } = setup({
      projectSelected: false,
    });

    result.current.handleElectricalGlideCellAction(row, 'cable_mark', 'choose');
    result.current.handleElectricalGlideCellAction(row, 'cable_mark', 'size');
    result.current.handleElectricalGlideCellAction(row, 'diameter_mm', 'choose');

    expect(onOpenCableMarkModal).not.toHaveBeenCalled();
    expect(onOpenCableSizingModal).not.toHaveBeenCalled();

    const pending = setup({ isCableMarkPending: true });
    pending.result.current.handleElectricalGlideCellAction(row, 'cable_mark', 'choose');
    pending.result.current.handleElectricalGlideCellAction(projectObject({
      is_valid: false,
    }), 'cable_mark', 'choose');

    expect(pending.onOpenCableMarkModal).not.toHaveBeenCalled();
  });

  it('keeps sizing inspection available but blocks cable writes in read-only mode', () => {
    const row = projectObject();
    const { result, onOpenCableMarkModal, onOpenCableSizingModal } = setup({
      canMutate: false,
    });

    expect(result.current.getElectricalGlideCellActions(row, 'cable_mark')).toEqual([
      { key: 'choose', label: 'Выбор', disabled: true },
      { key: 'size', label: 'Подбор', disabled: false },
    ]);

    result.current.handleElectricalGlideCellAction(row, 'cable_mark', 'choose');
    result.current.handleElectricalGlideCellAction(row, 'cable_mark', 'size');

    expect(onOpenCableMarkModal).not.toHaveBeenCalled();
    expect(onOpenCableSizingModal).toHaveBeenCalledWith(row);
  });
});
