/** Shared fixtures for HeatCalcNormalGlideGrid scenario tests (no tests, no mocks). */
import type { ProjectObject } from '@/types/project';

export const rows = [
    {
      id: 'row-1',
      project_id: 'project-1',
      object_type: 'pipe',
      params: { name: 'Pipe 1' },
      results: null,
      is_valid: true,
      validation_errors: null,
      sort_order: 1,
      version: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'row-2',
      project_id: 'project-1',
      object_type: 'pipe',
      params: { name: 'Pipe 2' },
      results: null,
      is_valid: true,
      validation_errors: null,
      sort_order: 2,
      version: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ] as ProjectObject[];

