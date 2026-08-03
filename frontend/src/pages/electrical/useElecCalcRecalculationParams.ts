import { useMemo, useState } from 'react';

import type { SelectionPolicy } from '@/api/calculations';

export function useElecCalcRecalculationParams() {
  const [selectionPolicy, setSelectionPolicy] = useState<SelectionPolicy>('technical_minimum');
  // DEC-11 / E1: normative voltage is 230 V; UI is read-only (FE-28).
  const [supplyVoltage, setSupplyVoltage] = useState<number | null>(230);
  const [connectionType, setConnectionType] = useState<string>('line_1ph');
  const [windingCoefficient, setWindingCoefficient] = useState<number | null>(1);
  const [heatingHeight, setHeatingHeight] = useState<number | null>(null);
  const [layingStep, setLayingStep] = useState<number | null>(0.1);
  const [maintainTemperature, setMaintainTemperature] = useState<number | null>(null);
  const [vaporTemperature, setVaporTemperature] = useState<number | null>(null);
  const [aggressiveProduct, setAggressiveProduct] = useState(false);

  const values = useMemo(() => ({
    selectionPolicy,
    supplyVoltage,
    connectionType,
    windingCoefficient,
    heatingHeight,
    layingStep,
    maintainTemperature,
    vaporTemperature,
    aggressiveProduct,
  }), [
    aggressiveProduct,
    connectionType,
    heatingHeight,
    layingStep,
    maintainTemperature,
    selectionPolicy,
    supplyVoltage,
    vaporTemperature,
    windingCoefficient,
  ]);
  const setters = useMemo(() => ({
    selectionPolicy: setSelectionPolicy,
    supplyVoltage: setSupplyVoltage,
    connectionType: setConnectionType,
    windingCoefficient: setWindingCoefficient,
    heatingHeight: setHeatingHeight,
    layingStep: setLayingStep,
    maintainTemperature: setMaintainTemperature,
    vaporTemperature: setVaporTemperature,
    aggressiveProduct: setAggressiveProduct,
  }), []);

  return { values, setters };
}
