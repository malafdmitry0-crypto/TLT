import apiClient, { withIdempotencyKey } from './client';
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
  variant_number: number;
}

function reportParams(variantNumber: number, sections?: ReportSection[]) {
  return {
    ...(sections && sections.length > 0 ? { sections } : {}),
    variant_number: variantNumber,
  };
}

export async function getReportPreview(
  projectId: string,
  variantNumber: number,
  sections?: ReportSection[],
): Promise<ReportPreview> {
  const { data } = await apiClient.get<ReportPreview>(`/reports/${projectId}/preview`, {
    params: reportParams(variantNumber, sections),
    paramsSerializer: { indexes: null },
  });
  return data;
}

export async function exportReport(
  projectId: string,
  format: 'pdf' | 'docx' | 'xlsx',
  variantNumber: number,
  sections?: ReportSection[],
): Promise<Blob> {
  const task = await enqueueReportExportJob(projectId, format, variantNumber, sections);
  const completed = await waitReportExportTask(task.id);
  if (completed.status !== 'succeeded') {
    throw new Error(completed.error_message || 'Не удалось сформировать отчёт');
  }
  const { data } = await apiClient.get(`/reports/jobs/${completed.id}/download`, {
    responseType: 'blob',
  });
  return data as Blob;
}

export async function enqueueReportExportJob(
  projectId: string,
  format: 'pdf' | 'docx' | 'xlsx',
  variantNumber: number,
  sections?: ReportSection[],
): Promise<CalculationTaskResponse> {
  const { data } = await apiClient.post<CalculationTaskResponse>(
    `/reports/${projectId}/export/${format}/jobs`,
    null,
    withIdempotencyKey({
      params: reportParams(variantNumber, sections),
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
  sections?: ReportSection[],
): Promise<Blob> {
  const { data } = await apiClient.get(`/reports/${projectId}/export/${format}`, {
    responseType: 'blob',
    params: reportParams(variantNumber, sections),
    paramsSerializer: { indexes: null },
  });
  return data as Blob;
}
