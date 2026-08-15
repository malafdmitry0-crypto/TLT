import { create } from 'zustand';
import type { Role } from '@/constants/roles';
import type { CurrentUser } from '@/types/auth';

interface AuthState {
  role: Role | null;
  user: CurrentUser | null;
  sessionId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  setGuest: (sessionId: string) => void;
  setEmployee: (user: CurrentUser, tokens: { access: string; refresh?: string | null }) => void;
  restoreEmployeeIdentity: (user: CurrentUser) => void;
  setAccessToken: (accessToken: string | null) => void;
  logout: () => void;
}

/**
 * Синхронная инициализация из localStorage — выполняется при импорте модуля,
 * до первого рендера React. Это закрывает race-condition с `ProtectedRoute`,
 * который раньше успевал отрабатывать с `role: null` и редиректить на `/`
 * до того, как `useEffect(hydrate)` отработает.
 */
export function readInitialState(): Pick<AuthState, 'role' | 'sessionId' | 'accessToken' | 'refreshToken' | 'user'> {
  if (typeof localStorage === 'undefined') {
    return { role: null, user: null, sessionId: null, accessToken: null, refreshToken: null };
  }
  const sessionId = localStorage.getItem('session_id');
  const storedRole = localStorage.getItem('role') as Role | null;
  if (storedRole === 'employee' || storedRole === 'admin') {
    return {
      role: storedRole,
      user: null,
      sessionId: null,
      accessToken: null,
      refreshToken: null,
    };
  }
  if (sessionId) {
    return {
      role: 'guest',
      user: null,
      sessionId,
      accessToken: null,
      refreshToken: null,
    };
  }
  return { role: null, user: null, sessionId: null, accessToken: null, refreshToken: null };
}

export const useAuthStore = create<AuthState>((set) => ({
  ...readInitialState(),

  setGuest: (sessionId) => {
    localStorage.setItem('session_id', sessionId);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.setItem('role', 'guest');
    set({
      role: 'guest',
      sessionId,
      user: null,
      accessToken: null,
      refreshToken: null,
    });
  },

  setEmployee: (user, tokens) => {
    localStorage.setItem('role', user.role);
    localStorage.removeItem('session_id');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({
      role: user.role,
      user,
      sessionId: null,
      accessToken: tokens.access,
      refreshToken: null,
    });
  },

  restoreEmployeeIdentity: (user) => {
    localStorage.setItem('role', user.role);
    localStorage.removeItem('session_id');
    set({
      role: user.role,
      user,
      sessionId: null,
    });
  },

  setAccessToken: (accessToken) => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ accessToken, refreshToken: null });
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('session_id');
    localStorage.removeItem('role');
    localStorage.removeItem('tlt-current-project');
    set({
      role: null,
      user: null,
      sessionId: null,
      accessToken: null,
      refreshToken: null,
    });
  },
}));
