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

  describe('persist migrate', () => {
    const migrate = useProjectStore.persist.getOptions().migrate!;

    const validProject = {
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
    };

    it('keeps a snapshot matching the current Project shape', () => {
      const result = migrate({ currentProject: validProject }, 0) as {
        currentProject: unknown;
      };
      expect(result.currentProject).toEqual(validProject);
    });

    it('drops a stale snapshot missing newer fields (e.g. object_types)', () => {
      const stale = Object.fromEntries(
        Object.entries(validProject).filter(([key]) => key !== 'object_types'),
      );
      const result = migrate({ currentProject: stale }, 0) as { currentProject: unknown };
      expect(result.currentProject).toBeNull();
    });

    it('drops garbage and empty snapshots', () => {
      expect((migrate({ currentProject: { id: 1 } }, 0) as { currentProject: unknown }).currentProject).toBeNull();
      expect((migrate({}, 0) as { currentProject: unknown }).currentProject).toBeNull();
      expect((migrate(undefined, 0) as { currentProject: unknown }).currentProject).toBeNull();
    });
  });
});
