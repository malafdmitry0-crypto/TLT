export interface SpecificationItem {
  category: string;
  name: string;
  article: string | null;
  unit: string;
  /** Decimal string from canonical API; number still accepted from transitional mocks. */
  quantity: number | string;
  params: Record<string, unknown>;
  /** Источник позиции: auto — из генератора, manual — добавлено сотрудником. */
  source?: 'auto' | 'manual';
}

export interface SpecificationSnapshot {
  schema?: string;
  schema_version?: number;
  electrical_variant_id?: string;
  settings_revision?: number;
  resolved_options?: Record<string, unknown>;
  catalog?: {
    id?: string;
    catalog_key?: string;
    version?: string;
    source_checksum?: string;
    payload_checksum?: string;
    schema_version?: number;
  };
  [key: string]: unknown;
}

export interface Specification {
  id: string;
  project_id: string;
  /** Primary scope identity (UUID ЭР). */
  electrical_variant_id: string;
  items: SpecificationItem[];
  /** Reproducible canonical generation snapshot returned by the UUID endpoint. */
  snapshot: SpecificationSnapshot | null;
  is_stale?: boolean;
  stale_reason?: string | null;
  stale_at?: string | null;
  stale_details?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
