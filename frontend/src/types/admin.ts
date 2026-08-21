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

export type SpecificationCatalogStatus = 'draft' | 'active' | 'retired';

export type SpecificationCatalogAuthority =
  | 'approved'
  | 'provisional'
  | 'synthetic'
  | 'demo'
  | 'guessed';

export type SpecificationCatalogCategory =
  | 'cable'
  | 'connection_kit'
  | 'repair_kit'
  | 'sealant'
  | 'fiberglass_tape'
  | 'aluminium_tape'
  | 'box';

export interface SpecificationCatalogItemInput {
  item_key: string;
  category: SpecificationCatalogCategory;
  name: string;
  mark: string;
  nomenclature_code: string;
  supply_unit: string;
  applicability?: Record<string, unknown>;
  package_parameters?: Record<string, unknown>;
  formula_parameters?: Record<string, unknown>;
  source_ref: string;
}

export interface SpecificationCatalogImportRequest {
  catalog_key: string;
  version: string;
  authority: SpecificationCatalogAuthority;
  source: string;
  source_checksum: string;
  schema_version: number;
  items: SpecificationCatalogItemInput[];
}

export interface SpecificationCatalogVersion {
  id: string;
  catalog_key: string;
  version: string;
  status: SpecificationCatalogStatus;
  authority: SpecificationCatalogAuthority;
  source: string;
  source_checksum: string;
  payload_checksum: string;
  schema_version: number;
  item_count: number;
  is_complete: boolean;
  validation_issues: SpecificationCatalogValidationIssue[];
  imported_at?: string | null;
  imported_by?: string | null;
  activated_at?: string | null;
  activated_by?: string | null;
}

export interface SpecificationCatalogValidationIssue {
  code: string;
  reason: string;
  item_key?: string;
  category?: SpecificationCatalogCategory;
  details?: Record<string, unknown>;
}

export interface SpecificationCatalogItemSummary {
  id: string;
  item_key: string;
  category: SpecificationCatalogCategory;
  name: string;
  mark: string;
  nomenclature_code: string;
  supply_unit: string;
  source_ref: string;
  position: number;
  applicability: Record<string, unknown>;
  package_parameters: Record<string, unknown>;
  formula_parameters: Record<string, unknown>;
}

export interface SpecificationCatalogDetail extends SpecificationCatalogVersion {
  items: SpecificationCatalogItemSummary[];
}

export interface SpecificationCatalogActivationResult {
  catalog: SpecificationCatalogVersion;
  stale_specification_count: number;
}
