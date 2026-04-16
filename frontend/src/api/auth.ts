import apiClient from './client';
import type {
  CurrentUser,
  GuestSessionResponse,
  LoginRequest,
  TokenPair,
} from '@/types/auth';

export async function createGuestSession(): Promise<GuestSessionResponse> {
  const { data } = await apiClient.post<GuestSessionResponse>('/auth/guest');
  return data;
}

export async function login(payload: LoginRequest): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>('/auth/login', payload);
  return data;
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>('/auth/refresh', {
    refresh_token: refreshToken,
  });
  return data;
}

export async function getMe(): Promise<CurrentUser> {
  const { data } = await apiClient.get<CurrentUser>('/auth/me');
  return data;
}
