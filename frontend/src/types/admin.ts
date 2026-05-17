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

export interface CableExtended {
  id: string;
  cable_type: 'self_regulating' | 'single_core' | 'three_core' | 'mineral' | 'skin';
  brand: string;
  model: string;
  power_per_meter: number | null;
  max_temperature: number | null;
  min_temperature: number | null;
  resistance_per_meter: number | null;
  supplier_name: string | null;
  article: string | null;
  currency: string | null;
  price_per_meter: number | null;
  stock_quantity_m: number | null;
  stock_status: 'in_stock' | 'limited' | 'on_order' | 'unknown' | null;
  lead_time_days: number | null;
  supplier_priority: number | null;
  is_preferred: boolean;
  order_multiple_m: number | null;
  min_order_quantity_m: number | null;
  is_discontinued: boolean;
  replacement_group: string | null;
  price_updated_at: string | null;
  stock_updated_at: string | null;
  commercial_data_source: string | null;
  params: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CableExtendedPayload = Omit<CableExtended, 'id' | 'created_at' | 'updated_at'>;

export interface AccessoryExtended {
  id: string;
  category: string;
  name: string;
  article: string | null;
  params: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AccessoryExtendedPayload = Omit<AccessoryExtended, 'id' | 'created_at' | 'updated_at'>;
