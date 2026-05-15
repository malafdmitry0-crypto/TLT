import apiClient from './client';
import type { CalculationTaskResponse } from '@/types/calculation';
import type {
  CreateObjectRequest,
  CreateProjectRequest,
  Project,
  ProjectObject,
  ProjectObjectsSummary,
  ObjectQueryCapabilities,
  ProjectObjectsQueryRequest,
  ProjectObjectsQueryResponse,
  UpdateObjectRequest,
  UpdateProjectRequest,
} from '@/types/project';

export async function listProjects(): Promise<Project[]> {
  const { data } = await apiClient.get<Project[]>('/projects');
  return data;
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await apiClient.get<Project>(`/projects/${id}`);
  return data;
}

export async function createProject(payload: CreateProjectRequest): Promise<Project> {
  const { data } = await apiClient.post<Project>('/projects', payload);
  return data;
}

export async function updateProject(
  id: string,
  payload: UpdateProjectRequest
): Promise<Project> {
  const { data } = await apiClient.put<Project>(`/projects/${id}`, payload);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`);
}

export async function duplicateProject(id: string): Promise<Project> {
  const { data } = await apiClient.post<Project>(`/projects/${id}/duplicate`);
  return data;
}

export async function exportProjectCsv(id: string): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/projects/${id}/export-csv`, {
    responseType: 'blob',
  });
  return data;
}

export async function importProjectCsv(file: File): Promise<Project> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<Project>('/projects/import-csv', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function exportProjectsCsvBulk(ids: string[]): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/projects/export-csv-bulk', {
    params: { ids: ids.join(',') },
    responseType: 'blob',
  });
  return data;
}

export interface BulkImportResult {
  imported: number;
  errors: { project_key: string; error: string }[];
}

export async function importProjectsCsvBulk(file: File): Promise<BulkImportResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<BulkImportResult>(
    '/projects/import-csv-bulk',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
}

export async function listObjects(projectId: string): Promise<ProjectObject[]> {
  const { data } = await apiClient.get<ProjectObject[]>(
    `/projects/${projectId}/objects`
  );
  return data;
}

export async function getObjectsSummary(projectId: string): Promise<ProjectObjectsSummary> {
  const { data } = await apiClient.get<ProjectObjectsSummary>(
    `/projects/${projectId}/objects/summary`
  );
  return data;
}

export async function getObjectQueryCapabilities(
  projectId: string,
  objectType: 'pipe' | 'tank'
): Promise<ObjectQueryCapabilities> {
  const { data } = await apiClient.get<ObjectQueryCapabilities>(
    `/projects/${projectId}/objects/query-capabilities`,
    { params: { object_type: objectType } }
  );
  return data;
}

export async function queryObjects(
  projectId: string,
  payload: ProjectObjectsQueryRequest
): Promise<ProjectObjectsQueryResponse> {
  const { data } = await apiClient.post<ProjectObjectsQueryResponse>(
    `/projects/${projectId}/objects/query`,
    payload
  );
  return data;
}

export async function createObject(
  projectId: string,
  payload: CreateObjectRequest
): Promise<ProjectObject> {
  const { data } = await apiClient.post<ProjectObject>(
    `/projects/${projectId}/objects`,
    payload
  );
  return data;
}

export async function updateObject(
  projectId: string,
  objectId: string,
  payload: UpdateObjectRequest
): Promise<ProjectObject> {
  const { data } = await apiClient.put<ProjectObject>(
    `/projects/${projectId}/objects/${objectId}`,
    payload
  );
  return data;
}

export async function deleteObject(
  projectId: string,
  objectId: string
): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/objects/${objectId}`);
}

export async function reorderObjects(
  projectId: string,
  order: string[]
): Promise<ProjectObject[]> {
  const { data } = await apiClient.put<ProjectObject[]>(
    `/projects/${projectId}/objects/reorder`,
    { order }
  );
  return data;
}

export interface ImportResult {
  created: number;
  errors: { sheet: string; row: number; message: string }[];
  heat_loss_task?: CalculationTaskResponse;
}

export async function importObjectsExcel(
  projectId: string,
  file: File
): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<ImportResult>(
    `/projects/${projectId}/objects/import-excel`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
}

export async function exportObjectsExcel(projectId: string): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(
    `/projects/${projectId}/objects/export-excel`,
    { responseType: 'blob' }
  );
  return data;
}

export async function downloadImportTemplate(
  projectId: string,
  format: 'xlsx' | 'csv' = 'xlsx'
): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(
    `/projects/${projectId}/objects/import-template`,
    { params: { format }, responseType: 'blob' }
  );
  return data;
}
