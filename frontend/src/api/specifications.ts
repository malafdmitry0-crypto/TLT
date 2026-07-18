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
}

export interface SpecificationGenerateResult {
  project_id: string;
  items: SpecificationItem[];
  /** Фактически применённый режим генерации. */
  mode: 'basic' | 'full';
  /** Объекты без успешного электрорасчёта, не вошедшие в полный BOM. */
  skipped_objects: number;
}

export async function generateSpecification(
  projectId: string,
  variant: number = 1,
  electricalVariantId?: string,
  mode: 'basic' | 'full' = 'basic',
  options?: SpecificationOptions,
): Promise<SpecificationGenerateResult> {
  const { data } = await apiClient.post(
    `/specifications/${projectId}/generate`,
    { mode, options: options ?? null },
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
