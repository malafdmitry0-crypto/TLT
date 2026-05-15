import type { Role } from '@/constants/roles';
import type { Project } from '@/types/project';

export interface LoginRequest {
  email: string;
  password: string;
  role?: Extract<Role, 'employee' | 'admin'>;
}

export interface TokenPair {
  access_token: string;
  refresh_token?: string | null;
  token_type: string;
}

export interface GuestSessionResponse {
  session_id: string;
  project: Project;
}

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
}
