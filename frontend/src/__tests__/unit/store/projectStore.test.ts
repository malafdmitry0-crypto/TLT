import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '@/store/projectStore';

describe('projectStore', () => {
  beforeEach(() => useProjectStore.getState().setCurrentProject(null));

  it('setCurrentProject updates state', () => {
    useProjectStore.getState().setCurrentProject({
      id: '1',
      name: 'X',
      description: null,
      user_id: null,
      session_id: 'sid',
      status: 'draft',
      task_number: null,
      owner_email: null,
      object_types: [],
      created_at: '2026-04-10T00:00:00Z',
      updated_at: '2026-04-10T00:00:00Z',
    });
    expect(useProjectStore.getState().currentProject?.name).toBe('X');
  });
});
