/**
 * Shared formula calculator runner for admin FormulasPage tabs.
 */
import { useState } from 'react';
import { checkFormula } from '@/api/admin';

export type FormulaType =
  | 'pipe'
  | 'tank'
  | 'electrical'
  | 'electrical_tt'
  | 'resistive_single'
  | 'resistive_three'
  | 'tank_cable_geometry';

export function useFormulaCalc(formulaType: FormulaType) {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (params: Record<string, unknown>) => {
    setError(null);
    setLoading(true);
    try {
      setResult(await checkFormula(formulaType, params));
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(detail ? String(detail) : (e instanceof Error ? e.message : 'Ошибка расчёта'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return { result, error, loading, run };
}

export function collectInsulationLayers(v: Record<string, unknown>) {
  return [1, 2, 3]
    .map((i) => ({
      thickness: Number(v[`insulation_thickness_${i}_mm`]) / 1000,
      material: v[`insulation_material_${i}`],
      conductivity: v[`insulation_conductivity_${i}`],
    }))
    .filter((layer) => layer.thickness > 0 && typeof layer.material === 'string')
    .map((layer) => ({
      thickness: layer.thickness,
      material: layer.material,
      ...(layer.conductivity != null ? { conductivity: Number(layer.conductivity) } : {}),
    }));
}

export function assignIfPresent(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  transform?: (v: unknown) => unknown,
) {
  if (value !== undefined && value !== null && value !== '') {
    target[key] = transform ? transform(value) : value;
  }
}
