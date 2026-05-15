import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import type { GuestSessionResponse } from '@/types/auth';

const apiBaseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';
const apiClient = axios.create({
  baseURL: apiBaseURL,
  withCredentials: true,
});

type RetryableConfig = NonNullable<AxiosError['config']> & {
  _authRetry?: boolean;
  _guestRetry?: boolean;
};

let guestRecoveryPromise: Promise<GuestSessionResponse> | null = null;
let employeeRefreshPromise: Promise<string> | null = null;

function hasGuestContext(config?: RetryableConfig): boolean {
  const role = localStorage.getItem('role');
  const sessionId = localStorage.getItem('session_id');
  const requestSessionId = config?.headers?.['X-Session-Id'];
  return role === 'guest' || !!sessionId || !!requestSessionId;
}

function isAuthRoute(url: string): boolean {
  return url.includes('/auth/');
}

function csrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = 'csrf_token=';
  const item = document.cookie.split('; ').find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : null;
}

function isMutatingMethod(method?: string): boolean {
  return !['get', 'head', 'options'].includes((method ?? 'get').toLowerCase());
}

async function recoverGuestSession() {
  const { data } = await axios.post<GuestSessionResponse>(`${apiBaseURL}/auth/guest`, undefined, {
    withCredentials: true,
  });
  useAuthStore.getState().setGuest(data.session_id);
  useProjectStore.getState().setCurrentProject(data.project);
  return data;
}

async function recoverGuestSessionOnce() {
  guestRecoveryPromise ??= recoverGuestSession().finally(() => {
    guestRecoveryPromise = null;
  });
  return guestRecoveryPromise;
}

async function refreshEmployeeSession() {
  const token = csrfToken();
  const { data } = await axios.post<{ access_token: string }>(
    `${apiBaseURL}/auth/refresh`,
    undefined,
    {
      withCredentials: true,
      headers: token ? { 'X-CSRF-Token': token } : undefined,
    },
  );
  useAuthStore.getState().setAccessToken(data.access_token);
  return data.access_token;
}

async function refreshEmployeeSessionOnce() {
  employeeRefreshPromise ??= refreshEmployeeSession().finally(() => {
    employeeRefreshPromise = null;
  });
  return employeeRefreshPromise;
}

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  const sessionId = localStorage.getItem('session_id');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (sessionId) {
    config.headers['X-Session-Id'] = sessionId;
  }
  if (isMutatingMethod(config.method)) {
    const csrf = csrfToken();
    if (csrf) {
      config.headers['X-CSRF-Token'] = csrf;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError<{ detail?: string | { msg: string }[] }>) => {
    if (error.response?.status === 401) {
      const originalConfig = error.config as RetryableConfig | undefined;
      const url = originalConfig?.url ?? '';
      const role = useAuthStore.getState().role ?? localStorage.getItem('role');
      const canRefreshEmployee =
        (role === 'employee' || role === 'admin') &&
        originalConfig &&
        !originalConfig._authRetry &&
        !isAuthRoute(url);
      if (canRefreshEmployee) {
        originalConfig._authRetry = true;
        try {
          const accessToken = await refreshEmployeeSessionOnce();
          originalConfig.headers = originalConfig.headers ?? {};
          originalConfig.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalConfig);
        } catch {
          useAuthStore.getState().logout();
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
      }

      if (
        originalConfig &&
        !originalConfig._guestRetry &&
        !isAuthRoute(url) &&
        hasGuestContext(originalConfig)
      ) {
        originalConfig._guestRetry = true;
        try {
          const guest = await recoverGuestSessionOnce();
          originalConfig.headers = originalConfig.headers ?? {};
          originalConfig.headers['X-Session-Id'] = guest.session_id;
          return apiClient(originalConfig);
        } catch {
          localStorage.removeItem('session_id');
          localStorage.removeItem('role');
          localStorage.removeItem('tlt-current-project');
        }
      }
    }

    // 403 на проектном endpoint — сохранённый проект устарел (сессия сменилась).
    // Очищаем его, чтобы пользователь попал на экран выбора проекта.
    if (error.response?.status === 403) {
      const url = (error.config as { url?: string })?.url ?? '';
      if (url.includes('/projects/')) {
        localStorage.removeItem('tlt-current-project');
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/workspace')) {
          window.location.href = '/workspace';
        }
      }
    }

    // Извлекаем человекочитаемое сообщение из ответа FastAPI
    const detail = error.response?.data?.detail;
    let humanMessage: string;
    if (typeof detail === 'string') {
      humanMessage = detail;
    } else if (Array.isArray(detail) && detail.length > 0) {
      // Pydantic validation error: массив объектов с полем msg
      humanMessage = detail.map((d) => d.msg).join('; ');
    } else {
      humanMessage = error.message;
    }

    return Promise.reject(new Error(humanMessage));
  }
);

export default apiClient;
