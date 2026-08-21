export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;

export type Verdict = 'pass' | 'fail' | 'needs_review';
export type Severity = 'low' | 'medium' | 'high';

export type Tolerance = {
  absoluteTolerance?: number;
  relativeTolerance?: number;
};

export type Metadata = Record<string, unknown>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function getByPath(source: unknown, path?: string): unknown {
  if (!path) return source;
  return path.split('.').reduce<unknown>((current, segment) => {
    if (isRecord(current)) return current[segment];
    if (Array.isArray(current)) return current[Number(segment)];
    return undefined;
  }, source);
}
