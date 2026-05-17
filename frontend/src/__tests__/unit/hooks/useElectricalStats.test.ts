import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useElectricalStats } from '@/hooks/useElectricalStats';
import type { ProjectObject } from '@/types/project';
import type { ElectricalCalcSummary } from '@/types/calculation';

function makeObj(id: string, isValid = true): ProjectObject {
  return {
    id,
    project_id: 'p1',
    object_type: 'pipe',
    sort_order: 0,
    params: {},
    results: { heat_loss_per_meter: 50 },
    is_valid: isValid,
    validation_errors: null,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };
}

function makeCalc(
  objectId: string,
  variantNumber: number,
  results: Record<string, unknown>,
  cableMark: string | null = 'ТЛТ-25',
): ElectricalCalcSummary {
  return {
    id: `calc-${objectId}-${variantNumber}`,
    project_id: 'p1',
    object_id: objectId,
    variant_number: variantNumber,
    cable_type: 'self_regulating',
    cable_mark: cableMark,
    params: {},
    results,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };
}

describe('useElectricalStats', () => {
  it('возвращает нули когда объектов нет', () => {
    const { result } = renderHook(() => useElectricalStats([], []));
    expect(result.current.calcedCount).toBe(0);
    expect(result.current.failedCount).toBe(0);
    expect(result.current.allCalced).toBe(false);
    expect(result.current.totalCableLength).toBe(0);
    expect(result.current.totalPower).toBe(0);
    expect(result.current.totalCurrent).toBe(0);
  });

  it('суммирует длину, мощность, ток по успешным расчётам', () => {
    const objects = [makeObj('a'), makeObj('b')];
    const calcs = [
      makeCalc('a', 1, {
        selected_cable: 'ТЛТ-25',
        cable_length: 10,
        total_power: 250,
        current: 1.2,
      }),
      makeCalc('b', 1, {
        selected_cable: 'ТЛТ-40',
        cable_length: 20,
        total_power: 800,
        current: 3.6,
      }),
    ];
    const { result } = renderHook(() => useElectricalStats(objects, calcs));
    expect(result.current.totalCableLength).toBe(30);
    expect(result.current.totalPower).toBe(1050);
    expect(result.current.totalCurrent).toBeCloseTo(4.8, 3);
    expect(result.current.calcedCount).toBe(2);
    expect(result.current.allCalced).toBe(true);
  });

  it('суммирует заказную длину, если она есть в результате', () => {
    const objects = [makeObj('a')];
    const calcs = [
      makeCalc('a', 1, {
        selected_cable: 'ТЛТ-25',
        cable_length: 10,
        order_cable_length: 11,
        total_power: 250,
        current: 1.2,
      }),
    ];
    const { result } = renderHook(() => useElectricalStats(objects, calcs));
    expect(result.current.totalCableLength).toBe(11);
  });

  it('берёт последний вариант расчёта (с наибольшим variant_number)', () => {
    const objects = [makeObj('a')];
    const calcs = [
      makeCalc('a', 1, { selected_cable: 'ТЛТ-10', cable_length: 5 }),
      makeCalc('a', 2, { selected_cable: 'ТЛТ-25', cable_length: 10 }),
    ];
    const { result } = renderHook(() => useElectricalStats(objects, calcs));
    // мапа содержит последний вариант
    expect(result.current.calcByObjectId['a'].variant_number).toBe(2);
    // сумма — по обоим расчётам (их два, оба считаются успешными)
    expect(result.current.totalCableLength).toBe(15);
  });

  it('не считает ошибочные расчёты в calcedCount, считает в failedCount', () => {
    const objects = [makeObj('a'), makeObj('b')];
    const calcs = [
      makeCalc('a', 1, { selected_cable: 'ТЛТ-25', cable_length: 10 }),
      makeCalc('b', 1, { error: 'Теплопотери вне диапазона ТЛТ' }, null),
    ];
    const { result } = renderHook(() => useElectricalStats(objects, calcs));
    expect(result.current.calcedCount).toBe(1);
    expect(result.current.failedCount).toBe(1);
    expect(result.current.allCalced).toBe(false);
  });

  it('allCalced = false если хоть один валидный объект не рассчитан', () => {
    const objects = [makeObj('a'), makeObj('b')];
    const calcs = [makeCalc('a', 1, { selected_cable: 'ТЛТ-25', cable_length: 10 })];
    const { result } = renderHook(() => useElectricalStats(objects, calcs));
    expect(result.current.calcedCount).toBe(1);
    expect(result.current.validObjects.length).toBe(2);
    expect(result.current.allCalced).toBe(false);
  });
});
