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
  const { data } = await apiClient.post<SpecificationGenerateResult>(
    `/specifications/${projectId}/generate`,
    request,
  );
  return data;
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
