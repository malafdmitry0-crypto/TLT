export type FieldSource = 'manual' | 'climate';

interface ResolveFieldSourceOptions {
  inputType?: string;
  required: boolean;
  source?: unknown;
}

export function resolveFieldSource({
  inputType,
  required,
  source,
}: ResolveFieldSourceOptions): FieldSource | undefined {
  const directEntry = inputType === 'number' || inputType === 'text';
  if (!directEntry) return undefined;
  if (source === 'climate') return 'climate';
  if (required && (source == null || source === 'manual')) return 'manual';
  return undefined;
}
