import axios, { AxiosError } from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1',
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  const sessionId = localStorage.getItem('session_id');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (sessionId) {
    config.headers['X-Session-Id'] = sessionId;
  }
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError<{ detail?: string | { msg: string }[] }>) => {
    if (error.response?.status === 401) {
      const hasToken = !!localStorage.getItem('access_token');
      if (hasToken) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
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
