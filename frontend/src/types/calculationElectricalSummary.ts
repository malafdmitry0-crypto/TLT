/** Pure electrical calculation summary shared by calculation and variant contracts. */
export interface ElectricalCalcSummary {
  id: string;
  project_id?: string;
  object_id: string;
  cable_type: string;
  cable_type_source?: 'auto' | 'manual' | 'bulk' | string | null;
  cable_mark: string | null;
  cable_mark_source?: 'auto' | 'manual' | string | null;
  cable_snapshot?: Record<string, unknown> | null;
  cable_snapshot_status?: {
    technical_status?: 'current' | 'changed' | 'missing' | 'unknown' | string;
    commercial_status?: 'current' | 'changed' | 'missing' | 'unknown' | string;
    severity?: 'ok' | 'warning' | 'critical' | string;
    changed_fields?: string[];
    message?: string;
  } | null;
  variant_number: number;
  params?: Record<string, unknown> | null;
  results: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}
