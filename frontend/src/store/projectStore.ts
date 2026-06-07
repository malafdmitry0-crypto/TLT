import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project } from '@/types/project';

interface ProjectState {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
}

// Версия схемы persisted-снимка. Бамп при изменении формы Project, чтобы
// устаревший снимок в localStorage не десериализовался как валидный.
const PERSIST_VERSION = 1;

/**
 * Проверяет, что снимок currentProject совпадает по форме с текущим типом
 * Project. Поскольку persist хранит целиком серверную сущность, при добавлении/
 * переименовании полей старый снимок мог бы рендериться в таблицах/формах с
 * отсутствующими ключами и падать в рантайме. Несовпадающий снимок отбрасываем.
 */
function isValidProjectSnapshot(value: unknown): value is Project {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    (p.status === 'draft' || p.status === 'completed') &&
    Array.isArray(p.object_types) &&
    'description' in p &&
    'task_number' in p &&
    'owner_email' in p &&
    'user_id' in p &&
    'session_id' in p &&
    'created_at' in p &&
    'updated_at' in p
  );
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      currentProject: null,
      setCurrentProject: (project) => set({ currentProject: project }),
    }),
    {
      name: 'tlt-current-project',
      version: PERSIST_VERSION,
      // Любой ранее сохранённый снимок (без версии или с другой версией)
      // прогоняется через валидатор формы; несовместимый сбрасывается в null.
      migrate: (persisted) => {
        const state = persisted as Partial<ProjectState> | undefined;
        const project = state?.currentProject;
        return {
          currentProject: isValidProjectSnapshot(project) ? project : null,
        };
      },
    }
  )
);
