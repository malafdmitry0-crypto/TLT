# Аудит производительности

**Дата:** 2026-06-07
**Стек:** FastAPI + async SQLAlchemy + PostgreSQL (backend); React 18 + Vite +
Zustand + TanStack Query (frontend).
**Метод:** статический анализ. Код не менялся.

## Резюме

Кодовая база **уже сильно оптимизирована**. Недавние коммиты (`f002974`,
`0a45920`, `62ee646`, `da5680d`) закрыли очевидные горячие пути: хеширование
паролей вынесено из event loop, генерация отчётов через `asyncio.to_thread`,
JSON-справочники под `@lru_cache`, references API с ETag + HTTP-кэшем, batch-пересчёт
чанкуется с кооперативным yield + bulk upsert, индексы БД покрывают keyset-пагинацию
и FK-lookup, frontend-polling сам тормозит по статусу задачи и видимости вкладки.

Ни одна находка не является критической; практический масштаб данных ограничен
(50 объектов/проект, 1 проект/гость, `PYTHON_FALLBACK_MAX_ROWS = 1000`).

---

## Backend

### HIGH

**B1. Синхронный `openpyxl` в async-эндпоинте — импорт Excel блокирует event loop**
- **Файл:** `backend/app/services/excel_import_service.py:1183`
  ```python
  wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
  ```
- **Проблема:** `import_objects_from_excel` объявлен `async`, но выполняет
  `load_workbook` **и весь цикл разбора строк** прямо на event loop. Отчёты
  корректно используют `asyncio.to_thread` (`report_service.py:313-316`) — этот
  путь импорта пропущен.
- **Влияние:** один большой `.xlsx` (sample на 100 записей) стопорит все остальные
  запросы воркера на время разбора. Масштабируется с размером файла / числом листов.
- **Серьёзность:** high (блокировка event loop, user-triggered, employee-facing).
- **Рекомендация:** обернуть синхронный `load_workbook` + чтение листов в
  `asyncio.to_thread` (разобрать в plain dicts вне loop, затем async-запись в БД),
  по образцу генераторов отчётов. Проверить CSV-путь, если файлы крупнеют.

### MEDIUM

**B2. Лишний commit на каждую мутацию объекта ради audit-лога**
- **Файл:** `backend/app/api/v1/objects.py:154-170` (а также `add_object`,
  `update_object`, `delete_object`, `reorder_objects`).
- **Проблема:** handler делает `await db.commit()` для бизнес-изменения, затем
  `AuditService(db).try_record(...)`, который внутри делает `record(commit=True)`
  (`audit_service.py:136-138`) — **второй** полный commit + refresh на каждый
  create/update/delete.
- **Влияние:** удваивает число commit-round-trip на самом горячем пути записи —
  каждое inline-редактирование ячейки / добавление объекта. Заметная задержка при
  частом редактировании.
- **Серьёзность:** medium.
- **Рекомендация:** добавлять audit-событие в сессию **до** единственного
  бизнес-commit (`commit=False`/flush, затем один `db.commit()`), чтобы audit и
  бизнес-изменение легли в одну транзакцию. Уточнить семантику изоляции ошибок
  audit (сейчас откатывается независимо).

**B3. Python-side фильтр/сортировка/пагинация в electrical fallback**
- **Файл:** `backend/app/services/electrical_query_service.py:945-953`.
- **Проблема:** fallback грузит **все** строки проекта/варианта (`_load_rows` без
  limit), затем применяет search/filter/sort/offset в Python.
- **Влияние:** ограничен `PYTHON_FALLBACK_MAX_ROWS = 1000` (выше — raises), объекты
  ограничены 50/проект → **сейчас безопасно**. Станет реальной стоимостью, если
  поднять cap объектов или умножить multi-variant строки. Латентный риск.
- **Серьёзность:** medium (латентный; зависит от допущения о cap объектов).
- **Рекомендация:** предпочитать SQL/keyset-путь; Python-fallback держать строго
  как последний резерв. Действий при текущем масштабе не требуется.

### Проверено и чисто

- **N+1 в `list_projects`** — отсутствует. `project_service.py:50-66` один join
  для email владельца, `_annotate_object_types` (418-441) один сгруппированный
  запрос на все проекты.
- **Batch electrical recalc** — `calculation_service.py:3720+` чанкуется
  (`BATCH_ELECTRICAL_CHUNK_SIZE`), преднагружает существующие расчёты, bulk upsert,
  кооперативный yield. Мелочь: `_upsert_failed_electrical` (3903) по одному объекту,
  но только на error-пути.
- **Coefficients** — кэш `cache.aget/aset` TTL 3600 (545); batch передаёт один раз.
- **Reference JSON (539 городов)** — `@lru_cache`, грузится раз; `/references/climate`
  + `@cache.cached` + ETag + HTTP cache headers.
- **Хеширование паролей** — `core/security.py:35-41`, `anyio.to_thread.run_sync` с
  `CapacityLimiter` (коммит `f002974`).
- **Индексы БД** — миграции 0004/0005/0011 покрывают
  `(project_id, object_type, sort_order, id)`, `(object_id, variant_number)`,
  `(user_id, updated_at)`, `(session_id, updated_at)`, `last_activity`.

---

## Frontend

### Проверено и чисто

Горячие пути из брифа **уже закрыты**:

- **`useFocusableTableScrollRegions.ts`** — коалесцирует всплески MutationObserver
  в один `requestAnimationFrame`, гард на лишние записи атрибутов
  (`if (tableBody.tabIndex !== 0)`).
- **Polling** — `utils/calcJobPolling.ts:13-20`: `false` (стоп) при отсутствии
  активной задачи, замедление до `BACKGROUND_JOB_POLL_MS` при скрытой вкладке,
  раздельные интервалы running/queued.
- **Мемоизация** — `ElecCalcPage.tsx` (13 `useMemo` / 13 `useCallback`),
  `HeatCalcNormalGlideGrid.tsx` (13/21, `memo`), virtualized glide-data-grid.
  `.map`/`.filter` внутри `useMemo`/мемоизированных колбэков, не в raw render.
- **TanStack Query** — `main.tsx:16`: `refetchOnWindowFocus: false`,
  `staleTime: 30s`; reference-запросы с большим stale.
- **Пагинация** — heat-calc и electrical используют серверную keyset-пагинацию.
  «Fetch everything» в основных гридах нет.

### Под наблюдение (низкая уверенность, требует профилирования)

- **`HeatCalcNormalGlideGrid.tsx` (1264 строк) и `ElecCalcPage.tsx` (1596 строк)** —
  большие. Конкретного дефекта не найдено, но dependency-массивы `useMemo`/
  `useCallback` — самое вероятное место для устаревшей/слишком широкой зависимости.
  **Требует React Profiler** на проекте с 50 объектами.
- **Bundle / lazy imports** — frontend route-level code-splitting
  (`routes/index.tsx`, `React.lazy`) **не аудирован**. Если страницы не ленивые —
  initial bundle можно урезать. Контрольная точка, не подтверждённый дефект.

---

## Приоритеты

1. **B1 (HIGH)** — обернуть `load_workbook` + разбор листов в `asyncio.to_thread`.
   Изолированный фикс, убирает stall event loop на user-triggered пути.
2. **B2 (MEDIUM)** — свести audit-запись в единый бизнес-commit, вдвое меньше
   round-trip на пути записи.
3. **B3 (MEDIUM)** — действий при текущем масштабе не требуется; вернуться, если
   поднимут cap 50 объектов/проект.
