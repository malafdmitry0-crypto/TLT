import { apiBaseURL, createRequestId } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

type AuditSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';
type AuditResult = 'success' | 'failure' | 'queued' | 'skipped' | 'cancelled';

interface ClientAuditEvent {
  event_type: string;
  severity?: AuditSeverity;
  result?: AuditResult;
  project_id?: string | null;
  object_id?: string | null;
  task_id?: string | null;
  requirement_refs?: string[];
  details?: Record<string, unknown>;
  error_code?: string | null;
  message?: string | null;
}

const MAX_QUEUE_SIZE = 100;
const MAX_BATCH_SIZE = 25;
const FLUSH_DELAY_MS = 1000;

let installed = false;
let flushing = false;
let flushTimer: number | null = null;
const queue: ClientAuditEvent[] = [];

function csrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = 'csrf_token=';
  const item = document.cookie.split('; ').find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : null;
}

function hasPrincipal(): boolean {
  const state = useAuthStore.getState();
  const role = state.role ?? localStorage.getItem('role');
  return (
    !!state.accessToken ||
    !!state.sessionId ||
    !!localStorage.getItem('session_id') ||
    role === 'employee' ||
    role === 'admin'
  );
}

function auditHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': createRequestId(),
  };
  const { accessToken } = useAuthStore.getState();
  const sessionId = localStorage.getItem('session_id');
  const csrf = csrfToken();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (sessionId) {
    headers['X-Session-Id'] = sessionId;
  }
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }
  return headers;
}

function scheduleFlush(): void {
  if (flushTimer != null || typeof window === 'undefined') return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushClientAuditEvents();
  }, FLUSH_DELAY_MS);
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 2000),
    };
  }
  return { value: String(error).slice(0, 1000) };
}

export function recordClientAuditEvent(
  eventType: string,
  details: Record<string, unknown> = {},
  options: Omit<ClientAuditEvent, 'event_type' | 'details'> = {},
): void {
  if (!hasPrincipal()) return;
  const projectId = options.project_id ?? useProjectStore.getState().currentProject?.id ?? null;
  queue.push({
    event_type: eventType,
    severity: options.severity ?? 'info',
    result: options.result ?? 'success',
    project_id: projectId,
    object_id: options.object_id ?? null,
    task_id: options.task_id ?? null,
    requirement_refs: options.requirement_refs ?? [],
    details: {
      path: typeof window !== 'undefined' ? window.location.pathname : null,
      ...details,
    },
    error_code: options.error_code ?? null,
    message: options.message ?? null,
  });
  if (queue.length > MAX_QUEUE_SIZE) {
    queue.splice(0, queue.length - MAX_QUEUE_SIZE);
  }
  scheduleFlush();
}

export async function flushClientAuditEvents(): Promise<void> {
  if (flushing || queue.length === 0 || !hasPrincipal()) return;
  flushing = true;
  const batch = queue.splice(0, MAX_BATCH_SIZE);
  try {
    const response = await fetch(`${apiBaseURL}/audit/client-events`, {
      method: 'POST',
      credentials: 'include',
      headers: auditHeaders(),
      body: JSON.stringify({ events: batch }),
    });
    if (!response.ok) {
      throw new Error(`audit endpoint returned ${response.status}`);
    }
  } catch {
    queue.unshift(...batch);
    if (queue.length > MAX_QUEUE_SIZE) {
      queue.splice(0, queue.length - MAX_QUEUE_SIZE);
    }
  } finally {
    flushing = false;
    if (queue.length > 0) {
      scheduleFlush();
    }
  }
}

export function installClientAudit(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    recordClientAuditEvent(
      'frontend.window.error',
      {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: normalizeError(event.error),
      },
      {
        severity: 'error',
        result: 'failure',
        error_code: 'frontend_error',
        message: event.message,
      },
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const error = normalizeError(event.reason);
    recordClientAuditEvent('frontend.promise.unhandled_rejection', { error }, {
      severity: 'error',
      result: 'failure',
      error_code: 'unhandled_rejection',
      message: typeof error.message === 'string' ? error.message : 'Unhandled promise rejection',
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushClientAuditEvents();
    }
  });
  window.addEventListener('pagehide', () => {
    void flushClientAuditEvents();
  });
}
