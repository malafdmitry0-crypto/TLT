/**
 * Electrical batch calc / variant copy / manual cable selection endpoints.
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
  maintainTemperature?: number | null;
  vaporTemperature?: number | null;
  aggressiveProduct?: boolean;
  selectionPolicy?: SelectionPolicy;
  skipManual?: boolean;
  objectIds?: string[];
  forceCableType?: boolean;
  objectOverrides?: Array<{
    object_id: string;
    cable_type?: CableType | null;
  }>;
}

export interface CopyElectricalVariantRequest {
  project_id: string;
  source_variant_number: number;
  target_variant_number: number;
  overwrite?: boolean;
}

export interface CopyElectricalVariantResponse {
  project_id: string;
  source_variant_number: number;
  target_variant_number: number;
  copied_count: number;
  project_objects_count: number;
  not_copied_uncalculated_count?: number;
  deleted_target_count: number;
  overwrite_applied: boolean;
  specification_regenerated: boolean;
  validated_count?: number;
  validation_failed_count?: number;
  preserved_without_validation_count?: number;
}

function electricalParams(
  cableType: CableType,
  options: ElectricalBatchOptions = {},
) {
  return {
    cable_type: cableType,
    supply_voltage: options.supplyVoltage ?? undefined,
    selection_mode: options.selectionMode ?? undefined,
    connection_type: options.connectionType ?? undefined,
    winding_coefficient: options.windingCoefficient ?? undefined,
    winding_pitch: options.windingPitchMm ?? undefined,
    number_of_threads: options.numberOfThreads ?? undefined,
    heating_height: options.heatingHeight ?? undefined,
    laying_step: options.layingStep ?? undefined,
    maintain_temperature: options.maintainTemperature ?? undefined,
    vapor_temperature: options.vaporTemperature ?? undefined,
    aggressive_product: options.aggressiveProduct ?? undefined,
    selection_policy: options.selectionPolicy ?? undefined,
    skip_manual: options.skipManual ?? true,
  };
}

export async function batchCalcElectrical(
  projectId: string,
  cableSource: CableSource = 'builtin',
  variantNumber: number = 1,
  cableType: CableType = 'self_regulating',
  options: ElectricalBatchOptions = {},
): Promise<BatchElectricalResponse> {
  const { data } = await apiClient.post<BatchElectricalResponse>('/calc/electrical/batch', null, {
    params: {
      project_id: projectId,
      cable_source: cableSource,
      variant_number: variantNumber,
      include_results: false,
      include_errors: false,
      ...electricalParams(cableType, options),
      object_ids: options.objectIds,
      force_cable_type: options.forceCableType,
    },
  });
  return data;
}

export async function enqueueElectricalBatchJob(
  projectId: string,
  cableSource: CableSource = 'builtin',
  variantNumber: number = 1,
  cableType: CableType = 'self_regulating',
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
  cableType: CableType = 'self_regulating',
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

export async function copyElectricalVariant(
  payload: CopyElectricalVariantRequest,
): Promise<CopyElectricalVariantResponse> {
  const { data } = await apiClient.post<CopyElectricalVariantResponse>(
    '/calc/electrical/variants/copy',
    {
      ...payload,
      // PDL-ER-13: an ER/calculation copy never carries or regenerates a BOM.
      regenerate_specification: false,
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
  cableType: CableType = 'self_regulating',
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

export async function selectCableForVariants(
  objectId: string,
  cableMark: string | null,
  cableSource: CableSource = 'builtin',
  variantNumbers: number[] = [1],
  cableType: CableType = 'self_regulating',
  options: ElectricalBatchOptions = {},
  electricalVariantIds: Record<number, string> = {},
): Promise<ElectricalCalcSummary[]> {
  const { data } = await apiClient.post<ElectricalCalcSummary[]>(
    '/calc/electrical/select-cable/variants',
    {
      object_id: objectId,
      cable_mark: cableMark,
      cable_source: cableSource,
      variant_numbers: variantNumbers,
      electrical_variant_ids: electricalVariantIds,
      cable_type: cableType,
      selection_mode: options.selectionMode ?? null,
      supply_voltage: options.supplyVoltage ?? null,
      connection_type: options.connectionType ?? null,
      winding_coefficient: options.windingCoefficient ?? null,
      winding_pitch: options.windingPitchMm ?? null,
      number_of_threads: options.numberOfThreads ?? null,
      heating_height: options.heatingHeight ?? null,
      laying_step: options.layingStep ?? null,
      maintain_temperature: options.maintainTemperature ?? null,
      vapor_temperature: options.vaporTemperature ?? null,
      aggressive_product: options.aggressiveProduct ?? false,
      selection_policy: options.selectionPolicy ?? 'technical_minimum',
    },
  );
  return data;
}
