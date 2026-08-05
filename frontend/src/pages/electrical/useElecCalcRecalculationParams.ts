import { useMemo, useState } from 'react';

import type { SelectionPolicy } from '@/api/calculations';

export function useElecCalcRecalculationParams() {
  const [selectionPolicy, setSelectionPolicy] = useState<SelectionPolicy>('technical_minimum');
  // Case 1: 230 V is the initial value, but the user may change U. TT cable
  // eligibility ignores U; the chosen value is used downstream for I/sections.
  const [supplyVoltage, setSupplyVoltage] = useState<number | null>(230);
  const [connectionType, setConnectionType] = useState<string>('line_1ph');
  const [windingCoefficient, setWindingCoefficient] = useState<number | null>(1);
  const [heatingHeight, setHeatingHeight] = useState<number | null>(null);
  const [layingStep, setLayingStep] = useState<number | null | undefined>(undefined);

  const values = useMemo(() => ({
    selectionPolicy,
    supplyVoltage,
    connectionType,
    windingCoefficient,
    heatingHeight,
    layingStep,
  }), [
    connectionType,
    heatingHeight,
    layingStep,
    selectionPolicy,
    supplyVoltage,
    windingCoefficient,
  ]);
  const setters = useMemo(() => ({
    selectionPolicy: setSelectionPolicy,
    supplyVoltage: setSupplyVoltage,
    connectionType: setConnectionType,
    windingCoefficient: setWindingCoefficient,
    heatingHeight: setHeatingHeight,
    layingStep: setLayingStep,
  }), []);

  return { values, setters };
}
