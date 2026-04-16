export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'employee' | 'admin';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAdminUserRequest {
  email: string;
  password: string;
  full_name?: string;
  role?: 'employee' | 'admin';
}

export interface Coefficient {
  id: string;
  key: string;
  value: number;
  description: string | null;
  updated_at: string;
}
