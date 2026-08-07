import apiClient, { withIdempotencyKey, type ApiError } from './client';
import type { CalculationTaskResponse } from '@/types/calculation';

export type ReportSection = 'summary' | 'pipes' | 'tanks' | 'electrical' | 'specification';

export const REPORT_SECTIONS: ReportSection[] = [
  'summary',
  'pipes',
  'tanks',
  'electrical',
  'specification',
];

export const REPORT_SECTION_LABELS: Record<ReportSection, string> = {
  summary: 'Сводка / итоги',
  pipes: 'Трубопроводы',
  tanks: 'Резервуары',
  electrical: 'Электротехнический расчёт',
  specification: 'Спецификация',
};

export interface ReportPreview {
  project_id: string;
  html: string;
  sections: string[];
  variant_number: number | null;
  electrical_variant_id?: string | null;
  electrical_variant_name?: string | null;
}

const reportTaskStorageKey = (
  projectId: string,
  format: 'pdf' | 'docx' | 'xlsx',
  electricalVariantId: string,
  sections: ReportSection[] | undefined,
) => `tlt:report-export-task:${projectId}:${electricalVariantId}:${format}:${
  [...(sections ?? [])].sort().join(',')
}`;

function readReportTaskId(storageKey: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function persistReportTaskId(storageKey: string, taskId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey, taskId);
  } catch {
    // The export can still finish in this page even when storage is unavailable.
  }
}

function clearReportTaskId(storageKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // The server-side terminal status remains authoritative.
  }
}

function reportParams(
  variantNumber: number | null | undefined,
  electricalVariantId: string | string[],
  sections?: ReportSection[],
) {
  const ids = Array.isArray(electricalVariantId)
    ? electricalVariantId
    : electricalVariantId
      ? [electricalVariantId]
      : [];
  return {
    ...(sections && sections.length > 0 ? { sections } : {}),
    ...(variantNumber != null && ids.length <= 1 ? { variant_number: variantNumber } : {}),
    ...(ids.length === 1 ? { electrical_variant_id: ids[0] } : {}),
    ...(ids.length > 1 ? { electrical_variant_ids: ids } : {}),
  };
}

function reportJobParams(electricalVariantId: string, sections?: ReportSection[]) {
  return {
    ...(sections && sections.length > 0 ? { sections } : {}),
    electrical_variant_id: electricalVariantId,
  };
}

export async function getReportPreview(
  projectId: string,
  variantNumber: number | null | undefined,
  electricalVariantId: string | string[],
  sections?: ReportSection[],
): Promise<ReportPreview> {
  const { data } = await apiClient.get<ReportPreview>(`/reports/${projectId}/preview`, {
    params: reportParams(variantNumber, electricalVariantId, sections),
    paramsSerializer: { indexes: null },
  });
  return data;
}

export async function exportReport(
  projectId: string,
  format: 'pdf' | 'docx' | 'xlsx',
  electricalVariantId: string,
  sections?: ReportSection[],
): Promise<Blob> {
  const storageKey = reportTaskStorageKey(projectId, format, electricalVariantId, sections);
  const persistedTaskId = readReportTaskId(storageKey);
  let task: CalculationTaskResponse;
  if (persistedTaskId) {
    try {
      task = await getReportExportTask(persistedTaskId);
    } catch (error) {
      if ((error as ApiError).status !== 404) throw error;
      clearReportTaskId(storageKey);
      task = await enqueueReportExportJob(projectId, format, electricalVariantId, sections);
    }
  } else {
    task = await enqueueReportExportJob(projectId, format, electricalVariantId, sections);
  }
  persistReportTaskId(storageKey, task.id);
  const completed = ['succeeded', 'failed', 'cancelled'].includes(task.status)
    ? task
    : await waitReportExportTask(task.id);
  if (completed.status !== 'succeeded') {
    clearReportTaskId(storageKey);
    throw new Error(completed.error_message || 'Не удалось сформировать отчёт');
  }
  const { data } = await apiClient.get(`/reports/jobs/${completed.id}/download`, {
    responseType: 'blob',
  });
  clearReportTaskId(storageKey);
  return data as Blob;
}

export async function enqueueReportExportJob(
  projectId: string,
  format: 'pdf' | 'docx' | 'xlsx',
  electricalVariantId: string,
  sections?: ReportSection[],
): Promise<CalculationTaskResponse> {
  const { data } = await apiClient.post<CalculationTaskResponse>(
    `/reports/${projectId}/export/${format}/jobs`,
    null,
    withIdempotencyKey({
      params: reportJobParams(electricalVariantId, sections),
      paramsSerializer: { indexes: null },
    }),
  );
  return data;
}

export async function getReportExportTask(taskId: string): Promise<CalculationTaskResponse> {
  const { data } = await apiClient.get<CalculationTaskResponse>(`/reports/jobs/${taskId}`);
  return data;
}

async function waitReportExportTask(
  taskId: string,
  timeoutMs: number = 120_000,
): Promise<CalculationTaskResponse> {
  const startedAt = Date.now();
  let delayMs = 700;

  while (Date.now() - startedAt < timeoutMs) {
    const task = await getReportExportTask(taskId);
    if (['succeeded', 'failed', 'cancelled'].includes(task.status)) {
      return task;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
    delayMs = Math.min(2_000, Math.round(delayMs * 1.25));
  }

  throw new Error('Отчёт формируется дольше ожидаемого времени');
}

export async function exportReportDirect(
  projectId: string,
  format: 'pdf' | 'docx' | 'xlsx',
  variantNumber: number,
  electricalVariantId: string,
  sections?: ReportSection[],
): Promise<Blob> {
  const { data } = await apiClient.get(`/reports/${projectId}/export/${format}`, {
    responseType: 'blob',
    params: reportParams(variantNumber, electricalVariantId, sections),
    paramsSerializer: { indexes: null },
  });
  return data as Blob;
}
