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
  params: Record<string, unknown>;
  results: Record<string, unknown> | null;
  is_valid: boolean;
  validation_errors: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CreateObjectRequest {
  object_type: ObjectType;
  sort_order?: number;
  params: Record<string, unknown>;
}

export interface UpdateObjectRequest {
  params?: Record<string, unknown>;
  sort_order?: number;
}
