import apiClient from './client';
import type {
  AccessoryExtended,
  AccessoryExtendedPayload,
  AdminUser,
  CableExtended,
  CableExtendedPayload,
  Coefficient,
  CreateAdminUserRequest,
} from '@/types/admin';

export async function listUsers(): Promise<AdminUser[]> {
  const { data } = await apiClient.get<AdminUser[]>('/admin/users');
  return data;
}

export async function createUser(payload: CreateAdminUserRequest): Promise<AdminUser> {
  const { data } = await apiClient.post<AdminUser>('/admin/users', payload);
  return data;
}

export async function deactivateUser(id: string): Promise<AdminUser> {
  const { data } = await apiClient.delete<AdminUser>(`/admin/users/${id}`);
  return data;
}

export async function listCoefficients(): Promise<Coefficient[]> {
  const { data } = await apiClient.get<Coefficient[]>('/admin/coefficients');
  return data;
}

export async function updateCoefficient(
  key: string,
  value: number,
  description?: string
): Promise<Coefficient> {
  const { data } = await apiClient.put<Coefficient>(`/admin/coefficients/${key}`, {
    value,
    description,
  });
  return data;
}

export async function checkFormula(
  formulaType:
    | 'pipe'
    | 'tank'
    | 'electrical'
    | 'electrical_tt'
    | 'resistive_single'
    | 'resistive_three'
    | 'tank_cable_geometry',
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { data } = await apiClient.post<Record<string, unknown>>('/admin/formula-check', {
    formula_type: formulaType,
    params,
  });
  return data;
}

export async function listAdminCables(): Promise<CableExtended[]> {
  const { data } = await apiClient.get<CableExtended[]>('/admin/cables');
  return data;
}

export async function createAdminCable(payload: CableExtendedPayload): Promise<CableExtended> {
  const { data } = await apiClient.post<CableExtended>('/admin/cables', payload);
  return data;
}

export async function updateAdminCable(
  id: string,
  payload: Partial<CableExtendedPayload>
): Promise<CableExtended> {
  const { data } = await apiClient.put<CableExtended>(`/admin/cables/${id}`, payload);
  return data;
}

export async function deleteAdminCable(id: string): Promise<void> {
  await apiClient.delete(`/admin/cables/${id}`);
}

export async function listAdminAccessories(): Promise<AccessoryExtended[]> {
  const { data } = await apiClient.get<AccessoryExtended[]>('/admin/accessories');
  return data;
}

export async function createAdminAccessory(
  payload: AccessoryExtendedPayload
): Promise<AccessoryExtended> {
  const { data } = await apiClient.post<AccessoryExtended>('/admin/accessories', payload);
  return data;
}

export async function updateAdminAccessory(
  id: string,
  payload: Partial<AccessoryExtendedPayload>
): Promise<AccessoryExtended> {
  const { data } = await apiClient.put<AccessoryExtended>(`/admin/accessories/${id}`, payload);
  return data;
}

export async function deleteAdminAccessory(id: string): Promise<void> {
  await apiClient.delete(`/admin/accessories/${id}`);
}
