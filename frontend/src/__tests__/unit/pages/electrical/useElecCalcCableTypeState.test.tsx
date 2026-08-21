import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useElecCalcCableTypeState } from '@/pages/electrical/useElecCalcCableTypeState';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalCalcSummary } from '@/types/calculation';

function calc(cableType: string): ElectricalCalcSummary {
  return {
    id: `calc-${cableType}`,
    project_id: 'project-1',
    object_id: 'object-1',
    cable_type: cableType,
    cable_mark: 'ТЛТ-25',
    cable_mark_source: 'auto',
    variant_number: 1,
    params: {},
    results: { selected_cable: 'ТЛТ-25' },
    created_at: '',
    updated_at: '',
  };
}

function renderCableTypeState(options: {
  available?: CableTypeKey[];
  selectedRowKeys?: string[];
  calcByObjectId?: Record<string, ElectricalCalcSummary | undefined>;
  projectId?: string;
  variant?: number;
} = {}) {
  return renderHook(
    (props: Required<typeof options>) => useElecCalcCableTypeState({
      availableCableTypes: new Set(props.available),
      selectedRowKeys: props.selectedRowKeys,
      calcByObjectId: props.calcByObjectId,
      projectId: props.projectId,
      variant: props.variant,
    }),
    {
      initialProps: {
        available: ['self_regulating', 'single_core'],
        selectedRowKeys: [],
        calcByObjectId: {},
        projectId: 'project-1',
        variant: 1,
        ...options,
      },
    },
  );
}

describe('useElecCalcCableTypeState', () => {
  it('resolves saved, draft and selected cable type state', () => {
    const { result } = renderCableTypeState({
      selectedRowKeys: ['object-1', 'object-2'],
      calcByObjectId: {
        'object-1': calc('single_core'),
        'object-2': calc('self_regulating'),
      },
    });

    expect(result.current.getSavedCableTypeForObject('object-1')).toBe('single_core');
    expect(result.current.selectedCableTypesMixed).toBe(true);
    expect(result.current.visibleCableTypeControl).toBeNull();

    act(() => {
      result.current.setCableTypeDraftByObjectId({
        'object-1': 'single_core',
        'object-2': 'single_core',
      });
    });

    expect(result.current.selectedCableTypes).toEqual(['single_core', 'single_core']);
    expect(result.current.selectedCableType).toBe('single_core');
    expect(result.current.visibleCableTypeControl).toBe('single_core');
    expect(result.current.objectOverridesForIds(['object-1', 'object-2'])).toEqual([
      { object_id: 'object-1', cable_type: 'single_core' },
      { object_id: 'object-2', cable_type: 'single_core' },
    ]);
  });

  it('normalizes unavailable cable types and clears drafts on scope changes', () => {
    const { result, rerender } = renderCableTypeState();

    act(() => {
      result.current.setDefaultCableType('single_core');
      result.current.setCableTypeDraftByObjectId({ 'object-1': 'single_core' });
    });
    expect(result.current.defaultCableType).toBe('single_core');
    expect(result.current.cableTypeDraftByObjectId).toEqual({ 'object-1': 'single_core' });

    rerender({
      available: ['self_regulating'],
      selectedRowKeys: ['object-1'],
      calcByObjectId: {},
      projectId: 'project-1',
      variant: 1,
    });

    expect(result.current.defaultCableType).toBe('self_regulating');
    expect(result.current.cableTypeDraftByObjectId).toEqual({});

    act(() => {
      result.current.setCableTypeDraftByObjectId({ 'object-1': 'self_regulating' });
    });
    rerender({
      available: ['self_regulating'],
      selectedRowKeys: ['object-1'],
      calcByObjectId: {},
      projectId: 'project-1',
      variant: 2,
    });

    expect(result.current.cableTypeDraftByObjectId).toEqual({});
  });
});
