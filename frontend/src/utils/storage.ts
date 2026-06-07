/**
 * Безопасное чтение JSON из localStorage.
 * Возвращает null, если хранилище недоступно (SSR/тесты), ключ пуст или
 * значение не парсится. Ранее эта функция была скопирована в 7 settings-утилит
 * таблиц — теперь единый источник.
 */
export function readStorageJson(key: string): unknown {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
