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

export interface SpecificationOptions {
  reserve_coefficient?: number;
  ex_zone?: boolean;
  indication_on_boxes?: boolean;
  end_section_indication?: boolean;
  top_indication?: boolean;
  min_length_for_end_indication?: number;
  group_by?: string;
  merge_identical?: boolean;
}

export interface SpecificationSettings {
  project_id: string;
  version: number;
  settings: SpecificationOptions;
}

export interface SpecificationGenerateResult {
  project_id: string;
  items: SpecificationItem[];
  /** Фактически применённый режим генерации. */
  mode: 'basic' | 'full';
  /** Объекты без успешного электрорасчёта, не вошедшие в полный BOM. */
  skipped_objects: number;
  partial?: boolean;
  excluded_groups?: Array<{
    group?: string;
    error_code?: string;
    message?: string;
    object_ids?: string[];
  }>;
  settings_version?: number | null;
  electrical_variant_id?: string | null;
  results?: Array<{
    electrical_variant_id: string;
    items: SpecificationItem[];
    mode: 'basic' | 'full';
    skipped_objects: number;
    partial?: boolean;
    excluded_groups?: SpecificationGenerateResult['excluded_groups'];
  }>;
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
  variant: number = 1,
  electricalVariantId?: string,
  mode: 'basic' | 'full' = 'full',
  options?: SpecificationOptions,
  electricalVariantIds?: string[],
  confirmPartial: boolean = false,
): Promise<SpecificationGenerateResult> {
  const explicitIds = electricalVariantIds?.length
    ? electricalVariantIds
    : electricalVariantId
      ? [electricalVariantId]
      : undefined;
  const { data } = await apiClient.post(
    `/specifications/${projectId}/generate`,
    {
      mode,
      options: options ?? null,
      electrical_variant_ids: explicitIds ?? null,
      confirm_partial: confirmPartial,
    },
    { params: { variant, electrical_variant_id: electricalVariantId } }
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
