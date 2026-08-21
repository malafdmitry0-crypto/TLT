/**
 * Мелкие type-guard'ы, общие для домена/утилит/компонентов.
 * `isRecord` раньше был скопирован в 10 файлов — теперь единый источник.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
