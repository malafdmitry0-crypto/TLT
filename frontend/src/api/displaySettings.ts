import apiClient, { type ApiError } from './client';

/** Кейс §5.9/§5.11: проектные настройки отображения (гость + перенос в файле). */
export interface ProjectDisplaySettingsPayload {
  heatcalc?: Record<string, unknown>;
  electrical?: Record<string, unknown>;
  specification?: Record<string, unknown>;
}

export interface ProjectDisplaySettings {
  project_id: string;
  version: number;
  settings: ProjectDisplaySettingsPayload;
}

export const PROJECT_DISPLAY_SETTINGS_QUERY_KEY = 'project-display-settings';

export async function getProjectDisplaySettings(
  projectId: string,
): Promise<ProjectDisplaySettings> {
  const { data } = await apiClient.get<ProjectDisplaySettings>(
    `/projects/${projectId}/display-settings`,
  );
  return data;
}

export async function updateProjectDisplaySettings(
  projectId: string,
  expectedVersion: number,
  settings: ProjectDisplaySettingsPayload,
): Promise<ProjectDisplaySettings> {
  const { data } = await apiClient.put<ProjectDisplaySettings>(
    `/projects/${projectId}/display-settings`,
    { expected_version: expectedVersion, settings },
  );
  return data;
}

export function isDisplaySettingsVersionConflict(error: unknown): boolean {
  const apiError = error as ApiError | null;
  return apiError?.status === 409
    && apiError?.code === 'PROJECT_DISPLAY_SETTINGS_VERSION_CONFLICT';
}
