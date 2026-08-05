import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  type ElecCalcCableSizingParams,
  useElecCalcCableSizingModalState,
} from '@/pages/electrical/useElecCalcCableSizingModalState';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

const object: ProjectObject = {
  id: 'object-1',
  project_id: 'project-1',
  object_type: 'pipe',
  sort_order: 0,
  version: 1,
  params: {},
  results: null,
  is_valid: true,
  validation_errors: null,
  created_at: '',
  updated_at: '',
};

const calc: ElectricalCalcSummary = {
  id: 'calc-1',
  project_id: 'project-1',
  object_id: object.id,
  cable_type: 'self_regulating',
  cable_mark: 'ТЛТ-25',
  cable_mark_source: 'auto',
  variant_number: 1,
  params: {},
  results: { selected_cable: 'ТЛТ-25' },
  created_at: '',
  updated_at: '',
};

const recalc: ElecCalcCableSizingParams = {
  selectionPolicy: 'technical_minimum',
  supplyVoltage: 220,
  connectionType: 'line_1ph',
  windingCoefficient: 1,
  heatingHeight: null,
  layingStep: undefined,
};

describe('useElecCalcCableSizingModalState', () => {
  it('opens and resets modal state around the selected object', () => {
    const { result } = renderHook(() => useElecCalcCableSizingModalState({
      projectId: 'project-1',
      electricalVariantId: '22222222-2222-4222-8222-222222222222',
      variant: 2,
      objects: [object],
      calcByObjectId: { [object.id]: calc },
      recalc,
      getSavedCableTypeForObject: () => 'self_regulating',
      normalizeAvailableCableType: (type) => type,
    }));

    act(() => {
      result.current.setMode('manual');
      result.current.openModalState(object);
    });

    expect(result.current.object).toEqual(object);
    expect(result.current.calc).toEqual(calc);
    expect(result.current.cableType).toBe('self_regulating');
    expect(result.current.manualMark).toBe('ТЛТ-25');
    expect(result.current.mode).toBe('manual');
    expect(result.current.candidatesQueryKey).toEqual([
      'project',
      'project-1',
      'electrical-variant',
      '22222222-2222-4222-8222-222222222222',
      'candidates',
      object.id,
    ]);
    expect(result.current.candidateFoldersQueryKey).toEqual([
      'project',
      'project-1',
      'electrical-variant',
      '22222222-2222-4222-8222-222222222222',
      'candidate-folders',
      object.id,
    ]);

    act(() => {
      result.current.resetModalState();
    });

    expect(result.current.objectId).toBeNull();
    expect(result.current.object).toBeNull();
    expect(result.current.mode).toBe('auto');
    expect(result.current.manualMark).toBeNull();
  });

  it('derives effective type and candidate params', () => {
    const normalizeAvailableCableType = (type: CableTypeKey) => type;
    const { result } = renderHook(() => useElecCalcCableSizingModalState({
      projectId: 'project-1',
      electricalVariantId: '11111111-1111-4111-8111-111111111111',
      variant: 1,
      objects: [],
      calcByObjectId: {},
      recalc: {
        ...recalc,
        supplyVoltage: 380,
      },
      getSavedCableTypeForObject: () => 'single_core',
      normalizeAvailableCableType,
    }));

    act(() => {
      result.current.setCableType('single_core');
    });

    expect(result.current.effectiveCableType).toBe('single_core');
    expect(result.current.candidateParams).toMatchObject({
      supply_voltage: 380,
      selection_mode: 'auto',
      selection_policy: 'technical_minimum',
      connection_type: 'line_1ph',
    });
  });

  it('keeps downstream voltage and legacy T2/T3/R out of pure TT candidate queries', () => {
    const { result } = renderHook(() => useElecCalcCableSizingModalState({
      projectId: 'project-1',
      electricalVariantId: '11111111-1111-4111-8111-111111111111',
      variant: 1,
      objects: [],
      calcByObjectId: {},
      recalc: {
        ...recalc,
        supplyVoltage: 380,
      },
      getSavedCableTypeForObject: () => 'self_regulating_tt',
      normalizeAvailableCableType: (type) => type,
    }));

    expect(result.current.candidateParams).toEqual({
      selection_mode: undefined,
      selection_policy: 'technical_minimum',
    });
    expect(result.current.candidateParams).not.toHaveProperty('heating_height');
    expect(result.current.candidateParams).not.toHaveProperty('laying_step');
    expect(result.current.candidateParams).not.toHaveProperty('supply_voltage');
    expect(result.current.candidateParams).not.toHaveProperty('maintain_temperature');
    expect(result.current.candidateParams).not.toHaveProperty('vapor_temperature');
    expect(result.current.candidateParams).not.toHaveProperty('aggressive_product');
  });
});
