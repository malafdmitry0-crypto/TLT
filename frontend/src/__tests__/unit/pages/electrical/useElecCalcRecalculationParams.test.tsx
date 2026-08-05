import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useElecCalcRecalculationParams } from '@/pages/electrical/useElecCalcRecalculationParams';

describe('useElecCalcRecalculationParams', () => {
  it('keeps existing default electrical recalculation params', () => {
    const { result } = renderHook(() => useElecCalcRecalculationParams());

    expect(result.current.values).toEqual({
      selectionPolicy: 'technical_minimum',
      supplyVoltage: 230,
      connectionType: 'line_1ph',
      windingCoefficient: 1,
      heatingHeight: null,
      layingStep: undefined,
    });
  });

  it('updates params independently without normalizing engineering values', () => {
    const { result } = renderHook(() => useElecCalcRecalculationParams());

    act(() => {
      result.current.setters.selectionPolicy('lowest_cost');
      result.current.setters.supplyVoltage(380);
      result.current.setters.connectionType('star_3ph');
      result.current.setters.windingCoefficient(1.25);
      result.current.setters.heatingHeight(2.4);
      result.current.setters.layingStep(0.2);
    });

    expect(result.current.values).toEqual({
      selectionPolicy: 'lowest_cost',
      supplyVoltage: 380,
      connectionType: 'star_3ph',
      windingCoefficient: 1.25,
      heatingHeight: 2.4,
      layingStep: 0.2,
    });
  });
});
