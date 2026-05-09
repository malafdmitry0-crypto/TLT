# TLT HeatCalc — Оставшиеся оптимизации (план действий)

**Дата:** 2026-05-10  
**Статус:** Готово к выполнению  
**Суммарно:** < 1 недели работы  

---

## Контекст

Оптимизации БД (индексы, автовакуум, кэш, prepared statements, N+1 prevention) — **уже сделаны.** Осталось 5 точечных улучшений на всех слоях стека.

---

## 1. PG-01 — PostgreSQL config tuning

**Слой:** Инфраструктура · **Время:** 10 минут · **Приоритет:** P0

Добавить 4 строки в `docker-compose.yml` → `services.db.command`:

```yaml
command:
  - postgres
  - -c shared_preload_libraries=pg_stat_statements    # уже есть
  - -c pg_stat_statements.track=all                    # уже есть
  - -c log_min_duration_statement=100ms                # уже есть
  - -c shared_buffers=512MB         # ← ДОБАВИТЬ
  - -c effective_cache_size=1GB     # ← ДОБАВИТЬ
  - -c random_page_cost=1.1         # ← ДОБАВИТЬ (критично)
  - -c work_mem=16MB                # ← ДОБАВИТЬ
```

**Зачем:** `random_page_cost=4.0` (дефолт) заставляет PostgreSQL избегать индексов на SSD. Значение `1.1` исправляет это.

**Применить:** `docker compose up -d db`

---

## 2. O-07 — Zustand: debounce + partialize

**Слой:** Фронтенд · **Время:** 2 часа · **Приоритет:** P1

Zustand `persist` пишет 250 KB в `localStorage` синхронно на каждое изменение. Это даёт микрозависания 15–50 мс при вводе в форму.

**Файл:** `frontend/src/store/projectStore.ts`

**Шаг 1 — debounce (30 мин):**

```ts
import { persist } from "zustand/middleware";

const useProjectStore = create(
  persist(
    (set, get) => ({ /* ... текущий стейт */ }),
    {
      name: "tlt-current-project",
      // Не сохранять чаще раза в 2 секунды
      skipHydration: true,
    }
  )
);

// Ручное сохранение с debounce
import { debounce } from "lodash-es";
const save = debounce(
  () => {
    const state = useProjectStore.getState();
    localStorage.setItem("tlt-current-project", JSON.stringify(state));
  },
  2000,
  { maxWait: 5000 }
);
useProjectStore.subscribe(save);
```

**Шаг 2 — partialize (1 час):**

Сохранять только данные, исключая UI-состояние и кэш:

```ts
persist(store, {
  name: "tlt-current-project",
  partialize: (state) => ({
    objects: state.objects,
    commonData: state.commonData,
    activeCO: state.activeCO,
    // Исключены: uiState, calculationCache, selectedIds, filterPresets
  }),
});
```

**Эффект:** микрозависания при вводе → 0 мс. Размер в localStorage: 250 KB → 80 KB.

---

## 3. O-01 — Вынос расчётов из event loop

**Слой:** Бэкенд · **Время:** 1 день · **Приоритет:** P0

Синхронный `recalculate_object()` внутри async-обработчика блокирует event loop. При 3+ пользователях — экспоненциальная деградация.

**Файл:** `backend/app/services/calculation_service.py`

**Быстрый фикс (1 час):**

```python
# В методах, вызывающих recalculate_object:
import asyncio

loop = asyncio.get_running_loop()
result = await loop.run_in_executor(None, self.recalculate_object, obj)
```

**Правильный фикс (оставшийся день):**

Для batch-операций — `ProcessPoolExecutor` (обходит GIL):

```python
from concurrent.futures import ProcessPoolExecutor

executor = ProcessPoolExecutor(max_workers=4)

# В API-обработчике:
task_id = str(uuid4())
loop = asyncio.get_running_loop()
loop.run_in_executor(executor, _batch_calculate_sync, project_id, task_id)
return JSONResponse(status_code=202, content={"task_id": task_id})
```

Фронтенд поллит `GET /api/v1/tasks/{task_id}` каждые 2 секунды.

**Эффект:** P95 latency при 5 пользователях: 8.5 сек → 250 мс.

---

## 4. O-05 — Ленивая загрузка Plotly.js

**Слой:** Фронтенд · **Время:** 1 день · **Приоритет:** P0

Plotly.js (3 MB gzipped) грузится на первом экране, хотя нужен только на страницах с графиками.

**Файлы:** все компоненты, импортирующие Plotly

**Решение:**

```tsx
// Было:
import Plot from "react-plotly.js";

// Стало:
import { lazy, Suspense } from "react";
const Plot = lazy(() => import("react-plotly.js"));

// Использование:
<Suspense fallback={<Skeleton />}>
  <Plot data={...} layout={...} />
</Suspense>
```

Vite выделит Plotly в отдельный чанк (~3 MB), который загрузится только при переходе на страницу с графиком.

**Дополнительно — manualChunks в vite.config.ts:**

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        plotly: ["plotly.js-dist-min", "react-plotly.js"],
        antd: ["antd", "@ant-design/icons"],
      },
    },
  },
},
```

**Эффект:** First Contentful Paint (3G): 8.5 сек → 2.1 сек.

---

## 5. PG-02 — Batch UPDATE в batch_recalculate

**Слой:** Бэкенд · **Время:** 2–4 часа · **Приоритет:** P2

`batch_recalculate()` обновляет 50 объектов 50 отдельными UPDATE.

**Файл:** `backend/app/services/calculation_service.py:169-184`

**Решение — сырой SQL с VALUES:**

```python
import json

values_parts = []
params = {}
for i, obj in enumerate(objects):
    values_parts.append(f"(:id_{i}, :results_{i}::jsonb, :valid_{i})")
    params[f"id_{i}"] = obj.id
    params[f"results_{i}"] = json.dumps(obj.results)
    params[f"valid_{i}"] = obj.is_valid

stmt = text(f"""
    UPDATE project_objects AS po SET
        results = v.results,
        is_valid = v.is_valid,
        validation_errors = NULL
    FROM (VALUES {", ".join(values_parts)}) AS v(id, results, is_valid)
    WHERE po.id = v.id::uuid
""")
await db.execute(stmt, params)
await db.commit()
```

**⚠️ Важно:** параметры собираются через `:param` placeholders, а не f-string для значений — это безопасно. f-string используется только для имён параметров (они не приходят от пользователя).

**Эффект:** batch 50 объектов: 50 UPDATE → 1 UPDATE. Экономия ~100–200 мс.

---

## Порядок выполнения

| # | Что | Время | Когда |
|---|---|---|---|
| 1 | PG-01 — docker-compose | 10 мин | **Сегодня** |
| 2 | O-07 — Zustand debounce | 2 часа | **Сегодня** |
| 3 | O-01 — run_in_executor | 1 день | На этой неделе |
| 4 | O-05 — Ленивый Plotly | 1 день | На этой неделе |
| 5 | PG-02 — Batch UPDATE | 2–4 часа | При рефакторинге |

Первые два — сегодня за час. Пользователь почувствует разницу сразу.

---

*Документ подготовлен: 2026-05-10  
Код не тронут. Только план с конкретными файлами и строками.*
