import apiClient from './client';

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
}

export async function getReportPreview(
  projectId: string,
  sections?: ReportSection[],
): Promise<ReportPreview> {
  const { data } = await apiClient.get<ReportPreview>(
    `/reports/${projectId}/preview`,
    { params: sections && sections.length > 0 ? { sections } : undefined,
      paramsSerializer: { indexes: null } }
  );
  return data;
}

export async function exportReport(
  projectId: string,
  format: 'pdf' | 'docx' | 'xlsx',
  sections?: ReportSection[],
): Promise<Blob> {
  const { data } = await apiClient.get(`/reports/${projectId}/export/${format}`, {
    responseType: 'blob',
    params: sections && sections.length > 0 ? { sections } : undefined,
    paramsSerializer: { indexes: null },
  });
  return data as Blob;
}
