import type { CableSource } from '@/api/calculations';

export const REFERENCE_STALE_TIME_MS = 60 * 60_000;
export const REFERENCE_GC_TIME_MS = 6 * 60 * 60_000;

export const referenceQueryOptions = {
  staleTime: REFERENCE_STALE_TIME_MS,
  gcTime: REFERENCE_GC_TIME_MS,
} as const;

export const referenceQueryKeys = {
  climate: ['references', 'climate'] as const,
  insulation: ['references', 'insulation'] as const,
  pipeMaterials: ['references', 'pipe-materials'] as const,
  soilConductivity: ['references', 'soil-conductivity'] as const,
  cables: (source: CableSource) => ['references', 'cables', source] as const,
  cablesTlt: ['references', 'cables-tlt'] as const,
  ttCables: ['references', 'tt-cables'] as const,
  resistiveCables: ['references', 'resistive-cables'] as const,
  accessories: ['references', 'accessories'] as const,
  accessoriesExtended: ['references', 'accessories-extended'] as const,
} as const;
