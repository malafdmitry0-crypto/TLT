import apiClient from './client';
import type { Specification, SpecificationItem } from '@/types/specification';

export async function getSpecification(
  projectId: string,
  variant: number = 1,
): Promise<Specification | null> {
  const { data } = await apiClient.get<Specification | null>(
    `/specifications/${projectId}`,
    { params: { variant } }
  );
  return data;
}

export async function generateSpecification(
  projectId: string,
  variant: number = 1,
): Promise<{ project_id: string; items: SpecificationItem[] }> {
  const { data } = await apiClient.post(
    `/specifications/${projectId}/generate`,
    null,
    { params: { variant } }
  );
  return data;
}

export async function saveSpecificationItems(
  projectId: string,
  items: SpecificationItem[],
  variant: number = 1,
): Promise<{ project_id: string; items: SpecificationItem[] }> {
  const { data } = await apiClient.put(
    `/specifications/${projectId}/items`,
    { items },
    { params: { variant } }
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
