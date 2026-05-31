import type { ProjectObject } from '@/types/project';

export type ElectricalLayoutCableType =
  | 'self_regulating'
  | 'self_regulating_tt'
  | 'single_core'
  | 'three_core'
  | 'mineral'
  | 'skin';

export const ELECTRICAL_LAYOUT_EDITABLE_COLUMNS = new Set(['winding_pitch_mm', 'number_of_threads']);

export function parseElectricalLayoutNumber(value: unknown) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function maxThreadsForCableType(type: ElectricalLayoutCableType) {
  return type === 'self_regulating' ? 3 : 100;
}

export function pipeOuterDiameterMm(obj: ProjectObject) {
  if (obj.object_type !== 'pipe') return null;
  const raw = Number(obj.params?.outer_diameter);
  return Number.isFinite(raw) && raw > 0 ? raw * 1000 : null;
}

export function maxWindingCoefficientForDiameterMm(diameterMm: number) {
  if (diameterMm < 57) return 1.0;
  if (diameterMm === 57) return 1.1;
  if (diameterMm <= 75) return 1.2;
  if (diameterMm <= 89) return 1.3;
  if (diameterMm <= 108) return 1.4;
  return 1.5;
}

export function windingCoefficientForPitch(diameterMm: number, pitchMm: number) {
  return Math.sqrt(1 + ((Math.PI * diameterMm) / pitchMm) ** 2);
}
