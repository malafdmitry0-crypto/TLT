/**
 * Electrical batch calc and manual cable selection endpoints.
 */
import apiClient, { withIdempotencyKey } from './client';
import type {
  BatchElectricalResponse,
  CalculationTaskResponse,
  ElectricalCalcSummary,
} from '@/types/calculation';

export type SelectionPolicy =
  | 'technical_minimum'
  | 'lowest_cost'
  | 'fastest_delivery'
  | 'in_stock'
  | 'preferred_supplier'
  | 'balanced';
export type CableSource = 'builtin' | 'commercial' | 'extended' | 'all';
export type CableType =
  | 'self_regulating'
  | 'self_regulating_tt'
  | 'single_core'
  | 'three_core'
  | 'mineral'
  | 'skin';

export interface ElectricalBatchOptions {
  supplyVoltage?: number | null;
  connectionType?: string | null;
  selectionMode?: 'auto' | 'manual' | null;
  windingCoefficient?: number | null;
  windingPitchMm?: number | null;
  numberOfThreads?: number | null;
  heatingHeight?: number | null;
  layingStep?: number | null;
  selectionPolicy?: SelectionPolicy;
  skipManual?: boolean;
  objectIds?: string[];
  forceCableType?: boolean;
  objectOverrides?: Array<{
    object_id: string;
    cable_type?: CableType | null;
  }>;
}

function electricalParams(
  cableType: CableType,
  options: ElectricalBatchOptions = {},
) {
  const sharedParams = {
    cable_type: cableType,
    selection_mode: options.selectionMode ?? undefined,
    selection_policy: options.selectionPolicy ?? undefined,
    skip_manual: options.skipManual ?? true,
  };
  if (cableType === 'self_regulating_tt') {
    return {
      ...sharedParams,
      // Case 1: U is not a cable-candidate criterion. The full calculation
      // still needs it downstream for current and section sizing.
      supply_voltage: options.supplyVoltage ?? undefined,
      winding_pitch: options.windingPitchMm ?? undefined,
      number_of_threads: options.numberOfThreads ?? undefined,
      heating_height: options.heatingHeight ?? undefined,
      laying_step: options.layingStep ?? undefined,
    };
  }
  return {
    ...sharedParams,
    supply_voltage: options.supplyVoltage ?? undefined,
    connection_type: options.connectionType ?? undefined,
    winding_coefficient: options.windingCoefficient ?? undefined,
    winding_pitch: options.windingPitchMm ?? undefined,
    number_of_threads: options.numberOfThreads ?? undefined,
    heating_height: options.heatingHeight ?? undefined,
    laying_step: options.layingStep ?? undefined,
  };
}

export async function batchCalcElectrical(
  projectId: string,
  cableSource: CableSource = 'builtin',
  variantNumber: number = 1,
  cableType: CableType = 'self_regulating_tt',
  options: ElectricalBatchOptions = {},
  electricalVariantId?: string | null,
): Promise<BatchElectricalResponse> {
  const { data } = await apiClient.post<BatchElectricalResponse>(
    '/calc/electrical/batch',
    null,
    withIdempotencyKey({
      params: {
        project_id: projectId,
        cable_source: cableSource,
        variant_number: variantNumber,
        ...(electricalVariantId
          ? { electrical_variant_id: electricalVariantId }
          : {}),
        include_results: false,
        include_errors: false,
        ...electricalParams(cableType, options),
        object_ids: options.objectIds,
        force_cable_type: options.forceCableType,
      },
    }),
  );
  return data;
}

export async function enqueueElectricalBatchJob(
  projectId: string,
  cableSource: CableSource = 'builtin',
  variantNumber: number = 1,
  cableType: CableType = 'self_regulating_tt',
  options: ElectricalBatchOptions = {},
): Promise<CalculationTaskResponse> {
  const { data } = await apiClient.post<CalculationTaskResponse>(
    '/calc/electrical/batch/jobs',
    {
      project_id: projectId,
      cable_source: cableSource,
      variant_number: variantNumber,
      include_results: false,
      include_errors: true,
      ...electricalParams(cableType, options),
      object_ids: options.objectIds,
      force_cable_type: options.forceCableType,
      object_overrides: options.objectOverrides,
    },
    withIdempotencyKey(),
  );
  return data;
}

/**
 * UUID-first electrical batch entrypoint used by the dynamic ER workspace.
 * It intentionally omits the deprecated `variant_number` selector because
 * backend rejects ambiguous requests containing both selectors.
 */
export async function enqueueElectricalVariantBatchJob(
  projectId: string,
  electricalVariantId: string,
  cableSource: CableSource = 'builtin',
  cableType: CableType = 'self_regulating_tt',
  options: ElectricalBatchOptions = {},
): Promise<CalculationTaskResponse> {
  const { data } = await apiClient.post<CalculationTaskResponse>(
    '/calc/electrical/batch/jobs',
    {
      project_id: projectId,
      electrical_variant_id: electricalVariantId,
      cable_source: cableSource,
      include_results: false,
      include_errors: true,
      ...electricalParams(cableType, options),
      object_ids: options.objectIds,
      force_cable_type: options.forceCableType,
      object_overrides: options.objectOverrides,
    },
    withIdempotencyKey(),
  );
  return data;
}

export async function selectCableManual(
  objectId: string,
  cableMark: string,
  cableSource: CableSource = 'builtin',
  variantNumber: number = 1,
  cableType: CableType = 'self_regulating_tt',
  options: ElectricalBatchOptions = {},
  electricalVariantId?: string,
): Promise<ElectricalCalcSummary> {
  const { data } = await apiClient.post<ElectricalCalcSummary>(
    '/calc/electrical/select-cable',
    null,
    {
      params: {
        object_id: objectId,
        cable_mark: cableMark,
        cable_source: cableSource,
        variant_number: variantNumber,
        electrical_variant_id: electricalVariantId,
        ...electricalParams(cableType, options),
      },
    }
  );
  return data;
}
