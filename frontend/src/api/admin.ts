import apiClient from './client';
import type {
  AdminUser,
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
