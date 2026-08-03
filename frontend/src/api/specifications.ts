import apiClient from './client';
import type { Specification, SpecificationItem } from '@/types/specification';

export async function getSpecification(
  projectId: string,
  variant: number = 1,
  electricalVariantId?: string,
): Promise<Specification | null> {
  const { data } = await apiClient.get<Specification | null>(
    `/specifications/${projectId}`,
    { params: { variant, electrical_variant_id: electricalVariantId } }
  );
  return data;
}

export type SpecificationGroupingMode =
  | 'separate_by_object_type'
  | 'merge_materials';

export interface SpecificationOptions {
  catalog_id?: string | null;
  catalog_version?: string | null;
  grouping_mode?: SpecificationGroupingMode | null;
  Ex?: boolean | null;
  K1i?: boolean | null;
  K2i?: boolean | null;
  Kiu?: boolean | null;
  L_K2i_m?: string | null;
  R_gr?: string | null;
}

export interface SpecificationSettings {
  project_id: string;
  version: number;
  settings: SpecificationOptions;
}

export type SpecificationDiagnosticKind =
  | 'blocking'
  | 'confirmable'
  | 'selection_required';

export interface SpecificationDiagnostic {
  code: string;
  kind: SpecificationDiagnosticKind;
  message: string;
  issues: Array<Record<string, unknown>>;
  details: Record<string, unknown>;
}

export interface SpecificationErrorDetail {
  code: string;
  message: string;
  issues: Array<Record<string, unknown>>;
  details: Record<string, unknown>;
}

function normalizeSpecificationErrorDetail(detail: unknown): SpecificationErrorDetail | null {
  if (typeof detail !== 'object' || detail == null) return null;
  const detailRecord = detail as Record<string, unknown>;
  if (typeof detailRecord.code !== 'string' || typeof detailRecord.message !== 'string') return null;
  return {
    code: detailRecord.code,
    message: detailRecord.message,
    issues: Array.isArray(detailRecord.issues)
      ? detailRecord.issues.filter((issue): issue is Record<string, unknown> => (
        typeof issue === 'object' && issue != null
      ))
      : [],
    details: typeof detailRecord.details === 'object' && detailRecord.details != null
      ? detailRecord.details as Record<string, unknown>
      : {},
  };
}

export function getSpecificationErrorDetail(error: unknown): SpecificationErrorDetail | null {
  if (typeof error !== 'object' || error == null) return null;
  if ('detail' in error) {
    const normalized = normalizeSpecificationErrorDetail(error.detail);
    if (normalized) return normalized;
  }
  if (!('response' in error)) return null;
  const response = error.response;
  if (typeof response !== 'object' || response == null || !('data' in response)) return null;
  const data = response.data;
  if (typeof data !== 'object' || data == null || !('detail' in data)) return null;
  return normalizeSpecificationErrorDetail(data.detail);
}

export interface SpecificationGenerateVariantResult {
  electrical_variant_id: string;
  status: 'generated' | 'blocked' | 'confirmation_required' | 'selection_required';
  items: SpecificationItem[];
  excluded_unassigned_object_ids: string[];
  diagnostics: SpecificationDiagnostic[];
  snapshot: Record<string, unknown> | null;
}

export interface SpecificationGenerateResult {
  project_id: string;
  settings_version: number;
  results: SpecificationGenerateVariantResult[];
}

function getSpecificationGenerateResult(data: unknown): SpecificationGenerateResult | null {
  if (typeof data !== 'object' || data == null) return null;
  const candidate = data as Partial<SpecificationGenerateResult>;
  if (
    typeof candidate.project_id !== 'string'
    || typeof candidate.settings_version !== 'number'
    || !Array.isArray(candidate.results)
  ) {
    return null;
  }
  return candidate as SpecificationGenerateResult;
}

export interface SpecificationGenerationRequest {
  variant_ids: string[];
  options: SpecificationOptions;
  exclude_unassigned_confirmed: boolean;
  catalog_selections: Record<string, string>;
}

export interface SpecificationPreflightVariant {
  electrical_variant_id: string;
  electrical_variant_name?: string | null;
  total_objects: number;
  contributing_objects: number;
  skipped_objects: number;
  excluded_object_ids: string[];
}

export interface SpecificationPreflight {
  project_id: string;
  requires_confirmation: boolean;
  total_skipped_objects: number;
  variants: SpecificationPreflightVariant[];
}

export async function getSpecificationSettings(
  projectId: string,
): Promise<SpecificationSettings> {
  const { data } = await apiClient.get<SpecificationSettings>(
    `/specifications/${projectId}/settings`,
  );
  return data;
}

export async function updateSpecificationSettings(
  projectId: string,
  settings: SpecificationOptions,
): Promise<SpecificationSettings> {
  const { data } = await apiClient.put<SpecificationSettings>(
    `/specifications/${projectId}/settings`,
    { settings },
  );
  return data;
}

export async function generateSpecification(
  projectId: string,
  request: SpecificationGenerationRequest,
): Promise<SpecificationGenerateResult> {
  const response = await apiClient.post<SpecificationGenerateResult | { detail?: unknown }>(
    `/specifications/${projectId}/generate`,
    request,
    {
      // 409/422 can carry valid per-ER preflight results. The body shape below
      // distinguishes them from typed error envelopes.
      validateStatus: (status) => (
        (status >= 200 && status < 300)
        || status === 409
        || status === 422
      ),
    },
  );
  const result = getSpecificationGenerateResult(response.data);
  if (result) return result;

  const detail = (
    typeof response.data === 'object'
    && response.data != null
    && 'detail' in response.data
  ) ? normalizeSpecificationErrorDetail(response.data.detail) : null;
  if (detail) {
    const error = new Error(detail.message) as Error & {
      status: number;
      code: string;
      detail: SpecificationErrorDetail;
    };
    error.status = response.status;
    error.code = detail.code;
    error.detail = detail;
    throw error;
  }
  throw new Error('Некорректный ответ формирования спецификации');
}

export async function saveSpecificationItems(
  projectId: string,
  items: SpecificationItem[],
  variant: number = 1,
  electricalVariantId?: string,
): Promise<{ project_id: string; items: SpecificationItem[] }> {
  const { data } = await apiClient.put(
    `/specifications/${projectId}/items`,
    { items },
    { params: { variant, electrical_variant_id: electricalVariantId } }
  );
  return data;
}

export interface AccessoryExtendedInfo {
  id: string;
  category: string;
  name: string;
  article: string | null;
}

export async function listAccessoriesExtended(): Promise<AccessoryExtendedInfo[]> {
  const { data } = await apiClient.get<AccessoryExtendedInfo[]>(
    '/references/accessories/extended'
  );
  return data;
}
