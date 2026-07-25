import apiClient, { withIdempotencyKey } from './client';
import type {
  BatchElectricalResponse,
  BatchHeatLossResponse,
  CalculationTaskResponse,
  ElectricalCalcSummary,
  ElectricalPageResponse,
  ElectricalQueryCapabilities,
  ElectricalQueryRequest,
  ElectricalQueryResponse,
  ElectricalRequest,
  ElectricalResponse,
  HeatLossRequest,
  HeatLossResponse,
} from '@/types/calculation';
import type { CableSource, CableType } from './electricalBatchCalc';

export {
  listElectricalCandidates,
  createElectricalCandidate,
  updateElectricalCandidate,
  applyElectricalCandidate,
  unapplyElectricalCandidate,
  listElectricalCandidateFolders,
  createElectricalCandidateFolder,
  updateElectricalCandidateFolder,
  deleteElectricalCandidateFolder,
  addElectricalCandidateToFolder,
  removeElectricalCandidateFromFolder,
} from './electricalCandidates';

export type {
  SelectionPolicy,
  CableSource,
  CableType,
  ElectricalBatchOptions,
  CopyElectricalVariantRequest,
  CopyElectricalVariantResponse,
} from './electricalBatchCalc';

export {
  batchCalcElectrical,
  enqueueElectricalBatchJob,
  enqueueElectricalVariantBatchJob,
  copyElectricalVariant,
  selectCableManual,
  selectCableForVariants,
} from './electricalBatchCalc';

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

export async function getElectricalQueryCapabilities(
  projectId: string,
  variantNumber: number = 1,
  electricalVariantId?: string,
): Promise<ElectricalQueryCapabilities> {
  const { data } = await apiClient.get<ElectricalQueryCapabilities>(
    '/calc/electrical/query-capabilities',
    {
      params: {
        project_id: projectId,
        variant_number: variantNumber,
        electrical_variant_id: electricalVariantId,
      },
    },
  );
  return data;
}

export async function queryElectrical(
  payload: ElectricalQueryRequest,
): Promise<ElectricalQueryResponse> {
  const { data } = await apiClient.post<ElectricalQueryResponse>(
    '/calc/electrical/query',
    payload,
  );
  return data;
}

export async function enqueueHeatLossBatchJob(
  projectId: string,
  includeErrors: boolean = true,
  objectIds?: readonly string[],
): Promise<CalculationTaskResponse> {
  const { data } = await apiClient.post<CalculationTaskResponse>(
    '/calc/heat-loss/batch/jobs',
    {
      project_id: projectId,
      include_errors: includeErrors,
      ...(objectIds && objectIds.length > 0 ? { object_ids: objectIds } : {}),
    },
    withIdempotencyKey(),
  );
  return data;
}

export async function getCalcTask(taskId: string): Promise<CalculationTaskResponse> {
  const { data } = await apiClient.get<CalculationTaskResponse>(`/calc/jobs/${taskId}`);
  return data;
}

export async function getCalcTaskResult(
  taskId: string,
): Promise<BatchElectricalResponse | BatchHeatLossResponse> {
  const { data } = await apiClient.get<BatchElectricalResponse | BatchHeatLossResponse>(
    `/calc/jobs/${taskId}/result`,
  );
  return data;
}

export async function cancelCalcTask(taskId: string): Promise<CalculationTaskResponse> {
  const { data } = await apiClient.post<CalculationTaskResponse>(`/calc/jobs/${taskId}/cancel`);
  return data;
}

export interface CableInfo {
  brand: string;
  model: string;
  cable_type?: CableType | string;
  power_per_meter?: number | null;
  max_temperature?: number | null;
  min_temperature?: number | null;
  resistance_ohm_km?: number | null;
  resistance_per_meter?: number | null;
  conductor_section_mm2?: number | null;
  conductor_cross_section?: number | null;
  price_per_meter?: number | null;
  stock_quantity_m?: number | null;
  stock_status?: 'in_stock' | 'limited' | 'on_order' | 'unknown' | string | null;
  lead_time_days?: number | null;
  supplier_priority?: number | null;
  is_preferred?: boolean;
  order_multiple_m?: number | null;
  min_order_quantity_m?: number | null;
  supplier_name?: string | null;
  article?: string | null;
  currency?: string | null;
  is_discontinued?: boolean;
  price_updated_at?: string | null;
  stock_updated_at?: string | null;
  commercial_data_source?: string | null;
  voltage?: number;
  source?: CableSource;
  params?: Record<string, unknown> | null;
}

export async function listCables(
  source: CableSource = 'builtin',
  cableType: CableType = 'self_regulating',
): Promise<CableInfo[]> {
  const { data } = await apiClient.get<CableInfo[]>('/references/cables', {
    params: { source, cable_type: cableType },
  });
  return data;
}
