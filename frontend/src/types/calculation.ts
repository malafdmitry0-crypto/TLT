/**
 * Calculation domain types barrel — heat, electrical, and async job shapes.
 * Split by domain for open-cost; re-exports preserve `@/types/calculation` paths.
 */
import type { ElectricalCalcSummary } from './calculationElectrical';

export type {
  InsulationTemperatureBasis,
  InsulationLayerParams,
  PipeParams,
  PipeResult,
  TankParams,
  TankResult,
  HeatLossRequest,
  HeatLossResponse,
} from './calculationHeat';

export type {
  ElectricalRequest,
  ElectricalResponse,
  ElectricalCalcSummary,
  ElectricalCandidateMode,
  ElectricalCandidateStatus,
  ElectricalCandidate,
  ElectricalCandidateCreateRequest,
  ElectricalCandidateUpsertResponse,
  ElectricalCandidateApplyResponse,
  ElectricalCandidateFolder,
  ElectricalCandidateFolderCreateRequest,
  ElectricalCandidateFolderUpdateRequest,
  ElectricalPageSummary,
  ElectricalPageResponse,
  ElectricalQueryRequest,
  ElectricalQueryCounts,
  ElectricalQueryAssignment,
  ElectricalQueryResponse,
  ElectricalQueryCapabilities,
} from './calculationElectrical';

export type CalculationTaskStatus =
  | 'queued'
  | 'enqueued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface CalculationTaskProgress {
  current: number;
  total: number | null;
  phase: string | null;
  percent: number | null;
}

export interface CalculationTaskLinks {
  status: string;
  result: string;
  cancel: string;
}

export interface BatchElectricalResponse {
  calculated: number;
  skipped: number;
  scope?: 'all' | 'selected';
  heat_loss_failed: number;
  errors: Array<{
    object_id: string;
    error_code?: string;
    category?: 'validation' | 'formula' | 'unsupported' | 'external' | 'stale' | string;
    message?: string;
    field?: string | null;
    hint?: string | null;
    suggested_actions?: string[];
    error_context?: Record<string, unknown>;
  }>;
  results: ElectricalCalcSummary[];
}

export interface BatchHeatLossResponse {
  updated: number;
  failed: number;
  errors: Array<{ object_id: string; error: unknown }>;
}

export interface ReportExportTaskResult {
  project_id: string;
  format: 'pdf' | 'docx' | 'xlsx';
  variant_number: number;
  filename: string;
  media_type: string;
  size_bytes: number;
  download_url: string;
}

export interface CalculationTaskResponse {
  id: string;
  type: string;
  status: CalculationTaskStatus;
  project_id: string | null;
  electrical_variant_id?: string | null;
  progress: CalculationTaskProgress;
  result: BatchElectricalResponse | BatchHeatLossResponse | ReportExportTaskResult | null;
  error_message: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  links: CalculationTaskLinks;
}
