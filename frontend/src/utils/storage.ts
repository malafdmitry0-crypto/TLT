/**
 * Безопасное чтение JSON из localStorage.
 * Возвращает null, если хранилище недоступно (SSR/тесты), ключ пуст или
 * значение не парсится. Ранее эта функция была скопирована в 7 settings-утилит
 * таблиц — теперь единый источник.
 */
export function readStorageJson(key: string): unknown {
  // Сам доступ к localStorage может бросить SecurityError (Safari с блокировкой
  // cookie, sandboxed iframe), поэтому он тоже внутри try.
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
