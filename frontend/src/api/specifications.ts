import apiClient from './client';
import type { Specification, SpecificationItem } from '@/types/specification';

export async function getSpecification(
  projectId: string,
  electricalVariantId: string,
): Promise<Specification | null> {
  const { data } = await apiClient.get<Specification | null>(
    `/specifications/${projectId}/variants/${electricalVariantId}`,
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

export interface SpecificationCandidate {
  catalog_item_id: string;
  catalog_id: string;
  catalog_version: string;
  category: string;
  name: string;
  mark: string;
  nomenclature_code: string;
  supply_unit: string;
  applicability?: Record<string, unknown>;
  package_parameters?: Record<string, unknown>;
  formula_parameters?: Record<string, unknown>;
}

export type SpecificationSelectionSource = 'auto_single' | 'explicit' | 'none';

export interface SpecificationCandidateGroup {
  group_key: string;
  electrical_variant_id: string;
  category: string;
  object_type_section?: string | null;
  conditions: Record<string, unknown>;
  candidates: SpecificationCandidate[];
  selected_catalog_item_id?: string | null;
  /** How effective selection was obtained (backend SPEC-DEC-05). */
  selection_source?: SpecificationSelectionSource | null;
  candidate_set_fingerprint?: string | null;
}

export interface SpecificationCatalogSelectionEntry {
  candidate_group_key: string;
  catalog_version_id: string;
  catalog_item_id: string;
  candidate_set_fingerprint: string;
}

export interface SpecificationCatalogSelectionsResponse {
  project_id: string;
  electrical_variant_id: string;
  collection_version: number;
  selections: SpecificationCatalogSelectionEntry[];
}

export interface SpecificationCatalogSelectionsPutRequest {
  expected_version: number;
  selections: SpecificationCatalogSelectionEntry[];
}

export interface SpecificationGenerateVariantResult {
  electrical_variant_id: string;
  electrical_variant_name?: string | null;
  status: 'generated' | 'blocked' | 'confirmation_required' | 'selection_required';
  items: SpecificationItem[];
  excluded_unassigned_object_ids: string[];
  diagnostics: SpecificationDiagnostic[];
  candidate_groups: SpecificationCandidateGroup[];
  snapshot: Record<string, unknown> | null;
}

export interface SpecificationGenerateResult {
  project_id: string;
  settings_version: number;
  results: SpecificationGenerateVariantResult[];
}

export type SpecificationReadinessStatus =
  | 'ready'
  | 'blocked'
  | 'confirmation_required'
  | 'selection_required';

export type SpecificationReadinessNextAction =
  | 'recalculate_heat'
  | 'open_electrical_variant'
  | 'configure_specification'
  | 'select_catalog_items'
  | 'confirm_unassigned_exclusion'
  | 'contact_catalog_admin'
  | 'retry_generation';

export interface SpecificationReadinessBlocker {
  code: string;
  kind: SpecificationDiagnosticKind;
  message: string;
  source_stage: 'heat' | 'electrical' | 'specification' | 'catalog';
  scope: 'project' | 'electrical_variant' | 'catalog';
  electrical_variant_id: string;
  electrical_variant_name?: string | null;
  reason: string;
  count: number;
  object_ids: string[];
  next_action: SpecificationReadinessNextAction;
}

export interface SpecificationVariantReadinessResult {
  electrical_variant_id: string;
  electrical_variant_name?: string | null;
  status: SpecificationReadinessStatus;
  total_objects: number;
  contributing_objects: number;
  blockers: SpecificationReadinessBlocker[];
}

export interface SpecificationReadinessResponse {
  project_id: string;
  results: SpecificationVariantReadinessResult[];
}

export const specificationReadinessQueryKey = (
  projectId: string | undefined,
  variantIds: readonly string[] = [],
) => ['spec-readiness', projectId, ...variantIds] as const;

export async function getSpecificationReadiness(
  projectId: string,
  variantIds: readonly string[],
): Promise<SpecificationReadinessResponse> {
  const params = new URLSearchParams();
  variantIds.forEach((variantId) => params.append('variant_ids', variantId));
  const { data } = await apiClient.get<SpecificationReadinessResponse>(
    `/specifications/${projectId}/readiness`,
    { params },
  );
  return data;
}

const SPECIFICATION_GENERATION_STATUSES = new Set<SpecificationGenerateVariantResult['status']>([
  'generated',
  'blocked',
  'confirmation_required',
  'selection_required',
]);

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
  if (candidate.results.some((item) => (
    typeof item !== 'object'
    || item == null
    || typeof item.electrical_variant_id !== 'string'
    || !SPECIFICATION_GENERATION_STATUSES.has(item.status)
    || !Array.isArray(item.items)
    || !Array.isArray(item.excluded_unassigned_object_ids)
    || !Array.isArray(item.diagnostics)
    || !Array.isArray(item.candidate_groups)
  ))) {
    return null;
  }
  return {
    project_id: candidate.project_id,
    settings_version: candidate.settings_version,
    results: candidate.results.map((item) => ({
      ...item,
      candidate_groups: Array.isArray(item.candidate_groups) ? item.candidate_groups : [],
    })),
  };
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
  electricalVariantId: string,
  items: SpecificationItem[],
): Promise<{ project_id: string; items: SpecificationItem[]; electrical_variant_id?: string }> {
  const { data } = await apiClient.put(
    `/specifications/${projectId}/variants/${electricalVariantId}/items`,
    { items },
  );
  return data;
}

export async function getCatalogSelections(
  projectId: string,
  electricalVariantId: string,
): Promise<SpecificationCatalogSelectionsResponse> {
  const { data } = await apiClient.get<SpecificationCatalogSelectionsResponse>(
    `/specifications/${projectId}/variants/${electricalVariantId}/catalog-selections`,
  );
  return data;
}

export async function putCatalogSelections(
  projectId: string,
  electricalVariantId: string,
  request: SpecificationCatalogSelectionsPutRequest,
): Promise<SpecificationCatalogSelectionsResponse> {
  const { data } = await apiClient.put<SpecificationCatalogSelectionsResponse>(
    `/specifications/${projectId}/variants/${electricalVariantId}/catalog-selections`,
    request,
  );
  return data;
}

/** Groups that still need an engineer choice (backend selection_source=none, multi). */
export function candidateGroupNeedsUserChoice(
  group: SpecificationCandidateGroup,
): boolean {
  if (group.candidates.length <= 1) return false;
  if (group.selection_source === 'auto_single') return false;
  if (group.selection_source === 'explicit' && group.selected_catalog_item_id) {
    return false;
  }
  // Prefer typed source; fall back for older payloads without the field.
  if (group.selection_source === 'none' || group.selection_source == null) {
    return !group.selected_catalog_item_id;
  }
  return !group.selected_catalog_item_id;
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
