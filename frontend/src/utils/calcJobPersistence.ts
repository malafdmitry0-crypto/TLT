const STORAGE_PREFIX = 'tlt:active-calc-job:';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readPersistedCalcJobId(scope: string): string | null {
  try {
    const value = storage()?.getItem(`${STORAGE_PREFIX}${scope}`)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function persistCalcJobId(scope: string, taskId: string): void {
  try {
    storage()?.setItem(`${STORAGE_PREFIX}${scope}`, taskId);
  } catch {
    // Tracking persistence is best-effort; the server remains authoritative.
  }
}

export function clearPersistedCalcJobId(scope: string): void {
  try {
    storage()?.removeItem(`${STORAGE_PREFIX}${scope}`);
  } catch {
    // Tracking persistence is best-effort; the server remains authoritative.
  }
}

export function heatLossJobScope(projectId: string): string {
  return `heat-loss:${projectId}`;
}

export function importHeatLossJobScope(projectId: string): string {
  return `import-heat-loss:${projectId}`;
}
