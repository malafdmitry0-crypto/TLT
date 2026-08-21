/**
 * Project electrical settings (Iдоп / nominal voltage).
 * Backend: GET/PATCH /projects/{id}/electrical-settings
 */
import apiClient, { type ApiError } from './client';

export const PROJECT_ELECTRICAL_SETTINGS_QUERY_KEY = 'project-electrical-settings';

export type ProjectElectricalSettings = {
  project_id: string;
  nominal_voltage_v: number;
  /** Project-level Iдоп (A). null = not set → sectioning blocked. */
  max_section_start_current_a: number | string | null;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectElectricalSettingsPatch = {
  expected_version: number;
  max_section_start_current_a: number | null;
};

export async function getProjectElectricalSettings(
  projectId: string,
): Promise<ProjectElectricalSettings> {
  const { data } = await apiClient.get<ProjectElectricalSettings>(
    `/projects/${projectId}/electrical-settings`,
  );
  return data;
}

export async function patchProjectElectricalSettings(
  projectId: string,
  body: ProjectElectricalSettingsPatch,
): Promise<ProjectElectricalSettings> {
  const { data } = await apiClient.patch<ProjectElectricalSettings>(
    `/projects/${projectId}/electrical-settings`,
    body,
  );
  return data;
}

export function isElectricalSettingsVersionConflict(error: unknown): boolean {
  const apiError = error as ApiError | null;
  return apiError?.status === 409
    && apiError?.code === 'ELECTRICAL_SETTINGS_VERSION_CONFLICT';
}

/** Parse API decimal/number/null into a finite number or null. */
export function parseIdopAmps(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
