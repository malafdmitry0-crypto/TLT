import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { useElecCalcCableMarkModalState } from '@/pages/electrical/useElecCalcCableMarkModalState';
import { AUTO_CABLE_MARK_VALUE } from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ElectricalVariant } from '@/types/electricalVariant';
import type { ProjectObject } from '@/types/project';

vi.mock('@/api/calculations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/calculations')>();
  return {
    ...actual,
    getCableOptions: vi.fn().mockResolvedValue([]),
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const ER_1_ID = '11111111-1111-4111-8111-111111111111';
const ER_2_ID = '22222222-2222-4222-8222-222222222222';
const ER_4_ID = '44444444-4444-4444-8444-444444444444';
const ER_5_ID = '55555555-5555-4555-8555-555555555555';

function electricalVariant(
  overrides: Partial<ElectricalVariant> & Pick<ElectricalVariant, 'id' | 'name'>,
): ElectricalVariant {
  return {
    project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sort_order: 0,
    is_active: false,
    copied_from_id: null,
    legacy_variant_number: null,
    specification_state: 'not_generated',
    created_at: '2026-07-18T00:00:00Z',
    updated_at: '2026-07-18T00:00:00Z',
    ...overrides,
  };
}

const electricalVariants: ElectricalVariant[] = [
  electricalVariant({ id: ER_5_ID, name: 'Резерв', sort_order: 50 }),
  electricalVariant({
    id: ER_2_ID,
    name: 'Лето',
    sort_order: 20,
    legacy_variant_number: 2,
  }),
  electricalVariant({
    id: ER_4_ID,
    name: 'Пик',
    sort_order: 40,
    legacy_variant_number: 4,
  }),
  electricalVariant({
    id: ER_1_ID,
    name: 'ЭР1',
    sort_order: 10,
    legacy_variant_number: 1,
  }),
];

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
  cable_mark_source: 'manual',
  variant_number: 1,
  params: {},
  results: { selected_cable: 'ТЛТ-25' },
  created_at: '',
  updated_at: '',
};

describe('useElecCalcCableMarkModalState', () => {
  it('opens on the selected UUID, derives options and selected cable, then closes', () => {
    const onOpenObject = vi.fn();
    const findCableRowForMark = vi.fn(() => ({
      model: 'ТЛТ-25',
      cable_type: 'self_regulating' as const,
      source: 'builtin' as const,
    }));
    const { result } = renderHook(() => useElecCalcCableMarkModalState({
      objects: [object],
      calcByObjectId: { [object.id]: calc },
      electricalVariants,
      electricalVariantId: ER_2_ID,
      getSavedCableTypeForObject: () => 'self_regulating',
      normalizeAvailableCableType: (type) => type,
      cableMarkOptionsFor: () => [
        {
          value: AUTO_CABLE_MARK_VALUE,
          label: 'Авто',
          searchLabel: 'Авто',
          mark: null,
          optionSource: 'builtin',
        },
        {
          value: 'builtin::TLT-25',
          label: 'ТЛТ-25',
          searchLabel: 'ТЛТ-25',
          mark: 'ТЛТ-25',
          optionSource: 'builtin',
          cableSource: 'builtin',
        },
      ],
      cableMarkValueForCalc: () => 'builtin::TLT-25',
      findCableRowForMark,
      onOpenObject,
    }), { wrapper: createWrapper() });

    act(() => {
      result.current.open(object);
    });

    expect(onOpenObject).toHaveBeenCalledWith(object);
    expect(result.current.object).toEqual(object);
    expect(result.current.cableType).toBe('self_regulating');
    expect(result.current.value).toBe('builtin::TLT-25');
    expect(result.current.targetVariants).toEqual([ER_2_ID]);
    expect(result.current.targetVariantsForSubmit).toEqual([{
      id: ER_2_ID,
      name: 'Лето',
      legacyVariantNumber: 2,
    }]);
    expect(result.current.targetVariantOptions.map(({ value, disabled }) => ({
      value,
      disabled,
    }))).toEqual([
      { value: ER_1_ID, disabled: false },
      { value: ER_2_ID, disabled: false },
      { value: ER_4_ID, disabled: false },
      { value: ER_5_ID, disabled: true },
    ]);
    expect(result.current.selectedCable?.model).toBe('ТЛТ-25');
    expect(findCableRowForMark).toHaveBeenCalledWith(
      'self_regulating',
      'ТЛТ-25',
      calc,
      'builtin',
    );

    act(() => {
      result.current.close();
    });

    expect(result.current.object).toBeNull();
    expect(result.current.cableType).toBeNull();
    expect(result.current.value).toBeNull();
    expect(result.current.targetVariants).toEqual([]);
  });

  it('normalizes cable type changes and maps target UUIDs at the API boundary', () => {
    const onCableTypeChange = vi.fn();
    const normalizeAvailableCableType = vi.fn((type: CableTypeKey) =>
      type === 'single_core' ? 'self_regulating' : type);
    const { result } = renderHook(() => useElecCalcCableMarkModalState({
      objects: [object],
      calcByObjectId: {},
      electricalVariants,
      electricalVariantId: ER_4_ID,
      getSavedCableTypeForObject: () => 'self_regulating',
      normalizeAvailableCableType,
      cableMarkOptionsFor: () => [],
      cableMarkValueForCalc: () => AUTO_CABLE_MARK_VALUE,
      findCableRowForMark: () => null,
      onCableTypeChange,
    }), { wrapper: createWrapper() });

    act(() => {
      result.current.open(object);
      result.current.changeCableType('single_core');
      result.current.setTargetVariantsFromValues([
        ER_5_ID,
        ER_1_ID,
        ER_1_ID,
        4,
        'ЭР4',
        'unknown-id',
      ]);
    });

    expect(result.current.cableType).toBe('self_regulating');
    expect(result.current.value).toBe(AUTO_CABLE_MARK_VALUE);
    expect(result.current.targetVariants).toEqual([ER_1_ID, ER_5_ID]);
    expect(result.current.targetVariantsForSubmit).toEqual([{
      id: ER_1_ID,
      name: 'ЭР1',
      legacyVariantNumber: 1,
    }]);
    expect(onCableTypeChange).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setTargetVariants([]);
    });

    expect(result.current.targetVariantsForSubmit).toEqual([]);
  });

  it('keeps a selected lifecycle-only UUID visible but never submits an inferred number', () => {
    const { result } = renderHook(() => useElecCalcCableMarkModalState({
      objects: [object],
      calcByObjectId: {},
      electricalVariants,
      electricalVariantId: ER_5_ID,
      getSavedCableTypeForObject: () => 'self_regulating',
      normalizeAvailableCableType: (type) => type,
      cableMarkOptionsFor: () => [],
      cableMarkValueForCalc: () => AUTO_CABLE_MARK_VALUE,
      findCableRowForMark: () => null,
    }), { wrapper: createWrapper() });

    act(() => {
      result.current.open(object);
    });

    expect(result.current.targetVariants).toEqual([ER_5_ID]);
    expect(result.current.targetVariantsForSubmit).toEqual([]);
    expect(result.current.targetVariantOptions.find(({ value }) => value === ER_5_ID))
      .toMatchObject({ disabled: true });
  });
});
