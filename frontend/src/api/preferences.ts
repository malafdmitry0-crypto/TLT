import apiClient from './client';

export interface UserPreference<TValue = unknown> {
  key: string;
  value: TValue | null;
  user_id: string | null;
}

export async function getUserPreference<TValue = unknown>(
  key: string,
): Promise<UserPreference<TValue>> {
  const { data } = await apiClient.get<UserPreference<TValue>>(
    `/preferences/${encodeURIComponent(key)}`,
  );
  return data;
}

export async function updateUserPreference<TValue = unknown>(
  key: string,
  value: TValue,
): Promise<UserPreference<TValue>> {
  const { data } = await apiClient.put<UserPreference<TValue>>(
    `/preferences/${encodeURIComponent(key)}`,
    { value },
  );
  return data;
}
