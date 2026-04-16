import apiClient from './client';
import type {
  AccessoryEntry,
  CableTltEntry,
  ClimateEntry,
  InsulationEntry,
} from '@/types/reference';

export async function getClimate(): Promise<ClimateEntry[]> {
  const { data } = await apiClient.get<ClimateEntry[]>('/references/climate');
  return data;
}

export async function getInsulation(): Promise<InsulationEntry[]> {
  const { data } = await apiClient.get<InsulationEntry[]>('/references/insulation');
  return data;
}

export async function getCablesTlt(): Promise<CableTltEntry[]> {
  const { data } = await apiClient.get<CableTltEntry[]>('/references/cables');
  return data;
}

export async function getAccessories(): Promise<AccessoryEntry[]> {
  const { data } = await apiClient.get<AccessoryEntry[]>('/references/accessories');
  return data;
}
