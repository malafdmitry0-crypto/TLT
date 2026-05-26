import type { ObjectType } from '@/constants/objectTypes';

export type ProjectStatus = 'draft' | 'completed';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  task_number: string | null;
  user_id: string | null;
  session_id: string | null;
  status: ProjectStatus;
  owner_email: string | null;
  object_types: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  task_number?: string | null;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string | null;
  task_number?: string | null;
  status?: ProjectStatus;
}

export interface ProjectObject {
  id: string;
  project_id: string;
  object_type: ObjectType;
  sort_order: number;
  version: number;
  params: Record<string, unknown>;
  results: Record<string, unknown> | null;
  is_valid: boolean;
  validation_errors: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectObjectsSummary {
  total: number;
  valid: number;
  invalid: number;
  by_type: Record<HeatCalcObjectType, number>;
  valid_by_type: Record<HeatCalcObjectType, number>;
  electrical_calculations_total: number;
  successful_electrical_calculations: number;
  failed_electrical_calculations: number;
  objects_with_successful_electrical_calculation: number;
}

export interface CreateObjectRequest {
  object_type: ObjectType;
  sort_order?: number;
  params: Record<string, unknown>;
}

export interface UpdateObjectRequest {
  version: number;
  params?: Record<string, unknown>;
  sort_order?: number;
}

export type HeatCalcObjectType = 'pipe' | 'tank';
export type ObjectQueryFilterOp = 'contains' | 'range' | 'in' | 'equals';
export type ObjectQuerySortDir = 'asc' | 'desc';

export interface ObjectQuerySearch {
  text?: string;
  columns?: string[];
}

export interface ObjectQueryFilter {
  key: string;
  op: ObjectQueryFilterOp;
  value?: unknown;
  values?: unknown[];
  min?: number;
  max?: number;
  include_empty?: boolean;
}

export interface ObjectQuerySort {
  key: string;
  dir: ObjectQuerySortDir;
}

export interface ProjectObjectsQueryRequest {
  object_type: HeatCalcObjectType;
  page?: number;
  page_size?: number;
  after_sort_order?: number | null;
  after_id?: string | null;
  after_key?: string | null;
  after_value?: unknown;
  after_value_is_null?: boolean;
  search?: ObjectQuerySearch | null;
  filters?: ObjectQueryFilter[];
  sort?: ObjectQuerySort | null;
}

export interface ProjectObjectsPageInfo {
  page: number;
  page_size: number;
  offset: number;
  total_pages: number;
  has_next_page: boolean;
  has_previous_page: boolean;
  next_cursor?: ProjectObjectsPageCursor | null;
}

export interface ProjectObjectsPageCursor {
  sort_order: number;
  id: string;
  key?: string | null;
  value?: unknown;
  value_is_null?: boolean;
}

export interface ProjectObjectsQueryCounts {
  total: number;
  by_type: Record<HeatCalcObjectType, number>;
  filtered: number;
}

export interface ProjectObjectsQueryResponse {
  items: ProjectObject[];
  page_info: ProjectObjectsPageInfo;
  counts: ProjectObjectsQueryCounts;
  query: {
    object_type: HeatCalcObjectType;
    sort: ObjectQuerySort | null;
  };
}

export interface ObjectQueryOptionItem {
  value: unknown;
  label: string;
}

export interface ObjectQueryFieldOptions {
  mode: 'inline' | 'dictionary' | 'project_values' | 'derived';
  items: ObjectQueryOptionItem[];
  include_empty: boolean;
}

export interface ObjectQueryFieldFilterCapability {
  enabled: boolean;
  ops: ObjectQueryFilterOp[];
  include_empty: boolean;
  reason?: string | null;
}

export interface ObjectQueryFieldSortCapability {
  enabled: boolean;
  type?: 'text' | 'number' | 'label' | 'enum_rank' | null;
  nulls?: 'last' | null;
  collation?: string | null;
  reason?: string | null;
}

export interface ObjectQueryFieldCapability {
  key: string;
  label: string;
  title: string;
  data_type: 'display' | 'text' | 'number' | 'enum' | 'boolean';
  unit: string | null;
  filter: ObjectQueryFieldFilterCapability;
  sort: ObjectQueryFieldSortCapability;
  options: ObjectQueryFieldOptions | null;
}

export interface ObjectQueryCapabilities {
  version: number;
  object_type: HeatCalcObjectType;
  default_page_size: number;
  max_page_size: number;
  default_sort: {
    key: string;
    dir: ObjectQuerySortDir;
  };
  search: {
    enabled: boolean;
    max_text_length: number;
    default_columns: string[];
  };
  fields: ObjectQueryFieldCapability[];
}
