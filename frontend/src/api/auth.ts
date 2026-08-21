import apiClient from './client';
import type {
  CurrentUser,
  GuestSessionResponse,
  LoginRequest,
  TokenPair,
} from '@/types/auth';

export async function createGuestSession(): Promise<GuestSessionResponse> {
  const { data } = await apiClient.post<GuestSessionResponse>('/auth/guest/resolve');
  return data;
}

export async function getCurrentGuestSession(): Promise<GuestSessionResponse | null> {
  const { data } = await apiClient.get<GuestSessionResponse | null>('/auth/guest/current');
  return data;
}

export async function login(payload: LoginRequest): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>('/auth/login', payload);
  return data;
}

export async function refresh(): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>('/auth/refresh');
  return data;
}

export async function getMe(): Promise<CurrentUser> {
  const { data } = await apiClient.get<CurrentUser>('/auth/me');
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}
