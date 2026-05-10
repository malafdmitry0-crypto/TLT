import apiClient from './client';
import type {
  BatchElectricalResponse,
  CalculationTaskResponse,
  ElectricalCalcSummary,
  ElectricalPageResponse,
  ElectricalRequest,
  ElectricalResponse,
  HeatLossRequest,
  HeatLossResponse,
} from '@/types/calculation';

export async function calcHeatLoss(
  payload: HeatLossRequest
): Promise<HeatLossResponse> {
  const { data } = await apiClient.post<HeatLossResponse>(
    '/calc/heat-loss',
    payload
  );
  return data;
}

export async function calcElectrical(
  payload: ElectricalRequest
): Promise<ElectricalResponse> {
  const { data } = await apiClient.post<ElectricalResponse>(
    '/calc/electrical',
    payload
  );
  return data;
}

export async function getCableOptions(objectId: string): Promise<unknown[]> {
  const { data } = await apiClient.get<unknown[]>(`/calc/cable-options/${objectId}`);
  return data;
}

export async function listElectricalCalcs(
  projectId: string,
  variantNumber?: number,
  page: number = 1,
  pageSize: number = 200,
): Promise<ElectricalCalcSummary[]> {
  const { data } = await apiClient.get<ElectricalCalcSummary[]>('/calc/electrical', {
    params: {
      project_id: projectId,
      variant_number: variantNumber,
      page,
      page_size: pageSize,
    },
  });
  return data;
}

export async function getElectricalPage(
  projectId: string,
  variantNumber: number = 1,
  page: number = 1,
  pageSize: number = 50,
): Promise<ElectricalPageResponse> {
  const { data } = await apiClient.get<ElectricalPageResponse>('/calc/electrical/page', {
    params: {
      project_id: projectId,
      variant_number: variantNumber,
      page,
      page_size: pageSize,
    },
  });
  return data;
}

export type CableSource = 'builtin' | 'extended' | 'all';
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
  windingCoefficient?: number | null;
  windingPitchMm?: number | null;
  numberOfThreads?: number | null;
  heatingHeight?: number | null;
  layingStep?: number | null;
  vaporTemperature?: number | null;
  aggressiveProduct?: boolean;
  skipManual?: boolean;
}

function electricalParams(
  cableType: CableType,
  options: ElectricalBatchOptions = {},
) {
  return {
    cable_type: cableType,
    supply_voltage: options.supplyVoltage ?? undefined,
    connection_type: options.connectionType ?? undefined,
    winding_coefficient: options.windingCoefficient ?? undefined,
    winding_pitch: options.windingPitchMm ?? undefined,
    number_of_threads: options.numberOfThreads ?? undefined,
    heating_height: options.heatingHeight ?? undefined,
    laying_step: options.layingStep ?? undefined,
    vapor_temperature: options.vaporTemperature ?? undefined,
    aggressive_product: options.aggressiveProduct ?? undefined,
    skip_manual: options.skipManual ?? undefined,
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
    },
  );
  return data;
}

export async function getCalcTask(taskId: string): Promise<CalculationTaskResponse> {
  const { data } = await apiClient.get<CalculationTaskResponse>(`/calc/jobs/${taskId}`);
  return data;
}

export async function getCalcTaskResult(taskId: string): Promise<BatchElectricalResponse> {
  const { data } = await apiClient.get<BatchElectricalResponse>(`/calc/jobs/${taskId}/result`);
  return data;
}

export async function cancelCalcTask(taskId: string): Promise<CalculationTaskResponse> {
  const { data } = await apiClient.post<CalculationTaskResponse>(`/calc/jobs/${taskId}/cancel`);
  return data;
}

export async function selectCableManual(
  objectId: string,
  cableMark: string,
  cableSource: CableSource = 'builtin',
  variantNumber: number = 1,
  cableType: CableType = 'self_regulating',
  options: ElectricalBatchOptions = {},
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
        ...electricalParams(cableType, options),
      },
    }
  );
  return data;
}

export interface CableInfo {
  brand: string;
  model: string;
  power_per_meter: number;
  max_temperature: number;
  min_temperature: number;
  voltage?: number;
  source?: CableSource;
}

export async function listCables(source: CableSource = 'builtin'): Promise<CableInfo[]> {
  const { data } = await apiClient.get<CableInfo[]>('/references/cables', {
    params: { source },
  });
  return data;
}
