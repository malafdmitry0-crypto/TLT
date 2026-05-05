import { useCallback } from 'react';
import { createGuestSession, login as loginApi, getMe } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import type { Role } from '@/constants/roles';

type LoginRole = Extract<Role, 'employee' | 'admin'>;

export function useAuth() {
  const store = useAuthStore();
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);

  const loginAsGuest = useCallback(async () => {
    // Сбрасываем проект перед созданием новой сессии:
    // старый currentProject принадлежит предыдущей сессии и вызовет 403
    setCurrentProject(null);
    const { session_id, project } = await createGuestSession();
    store.setGuest(session_id);
    // У пользователя ровно один авто-проект — сразу делаем его текущим,
    // чтобы UI не показывал «создать/выбрать проект».
    setCurrentProject(project);
  }, [store, setCurrentProject]);

  const loginAsRole = useCallback(
    async (email: string, password: string, role: LoginRole) => {
      setCurrentProject(null);
      const tokens = await loginApi({ email, password, role });
      localStorage.setItem('access_token', tokens.access_token);
      const user = await getMe();
      if (user.role !== role) {
        store.logout();
        throw new Error('Пользователь не соответствует выбранной роли');
      }
      store.setEmployee(user, {
        access: tokens.access_token,
        refresh: tokens.refresh_token,
      });
    },
    [store, setCurrentProject]
  );

  const loginAsEmployee = useCallback(
    async (email: string, password: string) => loginAsRole(email, password, 'employee'),
    [loginAsRole]
  );

  const loginAsAdmin = useCallback(
    async (email: string, password: string) => loginAsRole(email, password, 'admin'),
    [loginAsRole]
  );

  return {
    ...store,
    loginAsGuest,
    loginAsEmployee,
    loginAsAdmin,
  };
}
