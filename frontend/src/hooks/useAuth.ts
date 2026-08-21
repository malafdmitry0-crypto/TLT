import { useCallback } from 'react';
import { createGuestSession, login as loginApi, getMe } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import type { Role } from '@/constants/roles';

type LoginRole = Extract<Role, 'employee' | 'admin'>;

export function useAuth() {
  // Field-селекторы на стабильные экшены — без подписки на весь стор,
  // чтобы refresh access-токена не ре-рендерил потребителей useAuth.
  const setGuest = useAuthStore((s) => s.setGuest);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setEmployee = useAuthStore((s) => s.setEmployee);
  const logout = useAuthStore((s) => s.logout);
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);

  const loginAsGuest = useCallback(async () => {
    // Сбрасываем проект перед созданием новой сессии:
    // старый currentProject принадлежит предыдущей сессии и вызовет 403
    setCurrentProject(null);
    const { session_id, project } = await createGuestSession();
    setGuest(session_id);
    // У пользователя ровно один авто-проект — сразу делаем его текущим,
    // чтобы UI не показывал «создать/выбрать проект».
    setCurrentProject(project);
  }, [setGuest, setCurrentProject]);

  const loginAsRole = useCallback(
    async (email: string, password: string, role: LoginRole) => {
      setCurrentProject(null);
      const tokens = await loginApi({ email, password, role });
      setAccessToken(tokens.access_token);
      localStorage.setItem('role', role);
      const user = await getMe();
      if (user.role !== role) {
        logout();
        throw new Error('Пользователь не соответствует выбранной роли');
      }
      setEmployee(user, {
        access: tokens.access_token,
        refresh: tokens.refresh_token,
      });
    },
    [setAccessToken, setEmployee, logout, setCurrentProject]
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
    loginAsGuest,
    loginAsEmployee,
    loginAsAdmin,
  };
}
