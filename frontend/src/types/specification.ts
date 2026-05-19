export interface SpecificationItem {
  category: string;
  name: string;
  article: string | null;
  unit: string;
  quantity: number;
  params: Record<string, unknown>;
  /** Источник позиции: auto — из генератора, manual — добавлено вручную сотрудником. */
  source?: 'auto' | 'manual';
}

export interface Specification {
  id: string;
  project_id: string;
  variant_number: number;
  items: SpecificationItem[];
  is_stale?: boolean;
  stale_reason?: string | null;
  stale_at?: string | null;
  stale_details?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
