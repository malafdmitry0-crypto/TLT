import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';

export const DEFAULT_CABLE_TYPE: CableTypeKey = 'self_regulating';
export const MVP_CABLE_TYPES: readonly CableTypeKey[] = [DEFAULT_CABLE_TYPE];
export const FULL_FEATURE_CABLE_TYPES: readonly CableTypeKey[] = [
  'self_regulating',
  'self_regulating_tt',
  'single_core',
  'three_core',
];

export const isResistiveCableType = (type: CableTypeKey) =>
  type === 'single_core' || type === 'three_core';
