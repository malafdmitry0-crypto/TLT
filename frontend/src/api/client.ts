import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

export const apiBaseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';
const apiClient = axios.create({
  baseURL: apiBaseURL,
  withCredentials: true,
});

export type ApiErrorDetail = string | { msg: string }[] | {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

export type ApiError = Error & {
  status?: number;
  code?: string;
  detail?: ApiErrorDetail;
};

/**
 * Человекочитаемое сообщение об ошибке для UI.
 *
 * Response-interceptor уже нормализует ошибки FastAPI в Error с человекочитаемым
 * `message`, поэтому обычно достаточно `error.message`; здесь добавлен лишь
 * защитный fallback для не-Error отклонений и пустых сообщений.
 */
export function extractApiErrorMessage(
  error: unknown,
  fallback = 'Произошла ошибка. Попробуйте ещё раз.'
): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

type RetryableConfig = NonNullable<AxiosError['config']> & {
  _authRetry?: boolean;
  _networkRetry?: number;
};

const NETWORK_RETRY_DELAYS_MS = [200, 500, 1200];

let employeeRefreshPromise: Promise<string> | null = null;

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

function isIdempotentMethod(method?: string): boolean {
  return ['get', 'head', 'options'].includes((method ?? 'get').toLowerCase());
}

function projectIdFromAuthoritativeRead403(
  error: AxiosError,
  config?: RetryableConfig,
): string | null {
  if (error.response?.status !== 403 || !['get', 'head'].includes(
    (config?.method ?? 'get').toLowerCase(),
  )) {
    return null;
  }
  const match = (config?.url ?? '').match(/\/projects\/([^/?#]+)(?:[/?#]|$)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function retryDelay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function shouldRetryNetworkError(
  error: AxiosError,
  config?: RetryableConfig,
): config is RetryableConfig {
  if (!config || !isIdempotentMethod(config.method) || error.code === 'ERR_CANCELED') {
    return false;
  }
  const status = error.response?.status;
  return status == null || status >= 500;
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idemp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function withIdempotencyKey(config: AxiosRequestConfig = {}): AxiosRequestConfig {
  return {
    ...config,
    headers: {
      'Idempotency-Key': createIdempotencyKey(),
      ...config.headers,
    },
  };
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
  config.headers = config.headers ?? {};
  config.headers['X-Request-Id'] = config.headers['X-Request-Id'] ?? createRequestId();
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
  async (error: AxiosError<{ detail?: ApiErrorDetail }>) => {
    const originalConfig = error.config as RetryableConfig | undefined;
    if (error.response?.status === 401) {
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

      if (useAuthStore.getState().role === 'guest' && !isAuthRoute(url)) {
        useAuthStore.getState().logout();
        useProjectStore.getState().setCurrentProject(null);
        if (typeof window !== 'undefined' && window.location.pathname !== '/') {
          window.location.href = '/';
        }
      }
    }

    if (shouldRetryNetworkError(error, originalConfig)) {
      const retryCount = originalConfig._networkRetry ?? 0;
      const delayMs = NETWORK_RETRY_DELAYS_MS[retryCount];
      if (delayMs != null) {
        originalConfig._networkRetry = retryCount + 1;
        await retryDelay(delayMs);
        return apiClient(originalConfig);
      }
    }

    // A write-403 does not imply loss of read access (a read-only employee may
    // list an ER but cannot rename it). A GET/HEAD 403 under an exact project,
    // however, is authoritative evidence that the persisted project is stale.
    const deniedProjectId = projectIdFromAuthoritativeRead403(error, originalConfig);
    const currentProject = useProjectStore.getState().currentProject;
    if (deniedProjectId && (!currentProject || currentProject.id === deniedProjectId)) {
      useProjectStore.getState().setCurrentProject(null);
      localStorage.removeItem('tlt-current-project');
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/workspace')) {
        window.location.href = '/workspace';
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
    } else if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      humanMessage = typeof detail.message === 'string' ? detail.message : error.message;
    } else {
      humanMessage = error.message;
    }

    const apiError = new Error(humanMessage) as ApiError;
    apiError.status = error.response?.status;
    apiError.detail = detail;
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      apiError.code = typeof detail.code === 'string' ? detail.code : undefined;
    }
    return Promise.reject(apiError);
  }
);

export default apiClient;
