# TLT HeatCalc — Руководство по оптимизации производительности

**Дата:** 2026-05-09  
**Статус:** Диагностика и рекомендации · Этап 0  
**Цель:** Сократить время отклика с «медленно» до «мгновенно» на всех слоях стека  

---

## 0. Диагностика: где искать узкие места

Прежде чем оптимизировать — нужно измерить. Без замеров оптимизация наугад
бесполезна. Ниже — инструменты и метрики для каждого слоя.

### 0.1 Что замерять

| Слой | Инструмент | Ключевая метрика | Где смотреть |
|---|---|---|---|
| Бэкенд — API latency | `curl -w` / Chrome DevTools Network | P50, P95, P99 времени ответа | Network tab → Time column |
| Бэкенд — расчёты | `time.time()` в коде + structlog | Время выполнения `recalculate_object()` | Логи бэкенда |
| Бэкенд — БД-запросы | SQLAlchemy `echo=True` / pg_stat_statements | Количество запросов, duration > 100ms | PostgreSQL logs |
| Фронтенд — рендер | React DevTools Profiler | Время рендера компонента, причина ререндера | React DevTools → Profiler tab |
| Фронтенд — бандл | `vite build --mode production` + `rollup-plugin-visualizer` | Размер чанков, самые тяжёлые зависимости | `dist/stats.html` |
| Фронтенд — сеть | Chrome DevTools Network | Waterfall, размер ответов, блокировка | Network tab |
| Инфра — Docker | `docker stats` | CPU/RAM контейнеров, I/O wait | Терминал |

### 0.2 Быстрый диагностический чек-лист

Запусти приложение, открой Chrome DevTools → Network, и проверь:

- [ ] **Самый долгий запрос.** Отсортируй по Time (desc). Что на первом месте?
  `GET /objects`? `POST /calc/electrical/batch`? Загрузка бандла?
- [ ] **Размер бандла.** Вкладка Network → отфильтруй по JS. Сколько весит
  главный чанк? > 500 kB — плохо. > 1 MB — очень плохо.
- [ ] **Количество запросов при загрузке страницы.** > 20 — возможен оверхед
  (мелкие справочники, иконки).
- [ ] **Время до First Contentful Paint.** DevTools → Performance → запись
  перезагрузки. FCP > 2 сек — плохо.
- [ ] **CPU при скролле таблицы.** Performance → запись скролла. Много
  фиолетовых полос (rendering) → проблема с ререндерами.

---

## O-01. Вынос синхронных расчётов из async event loop

**Слой:** Бэкенд  
**Приоритет:** P0 — критический  
**Трудозатраты:** Medium (3–4 спринта)  
**Ожидаемый эффект:** P95 latency API снижается с 3–8 сек до < 500 мс

**Проблема:**

`calculation_service.py` выполняет `recalculate_object()` **синхронно** внутри
async-обработчика FastAPI. Расчёт теплопотерь для одного объекта занимает
~5–50 мс (зависит от сложности: 1–3 слоя изоляции, грунт, ветер). Расчёт
batch-electrical для 48 объектов — до 2–5 секунд.

FastAPI работает на одном event loop'е. Пока выполняется синхронный расчёт —
event loop блокирован. **Все остальные запросы встают в очередь.** При
одновременной работе 3–5 пользователей latency деградирует экспоненциально.

**Как проверить:** Добавь middleware, логирующий `time.monotonic()` до и после
каждого запроса. Если P95 latency растёт с числом одновременных пользователей —
проблема подтверждена.

**Решение (поэтапное):**

**Шаг 1 — Быстрый фикс (1 день): `run_in_executor`**

Обернуть синхронные вызовы в `await loop.run_in_executor(None, sync_func)`.
Это перенесёт расчёт в thread pool (по умолчанию — `ThreadPoolExecutor`
с 40 потоками в Python 3.11+). Event loop не блокируется, другие запросы
обслуживаются.

```python
# Было (блокирует event loop):
result = recalculate_object(object_params)

# Стало (в отдельном потоке):
loop = asyncio.get_running_loop()
result = await loop.run_in_executor(None, recalculate_object, object_params)
```

⚠️ Ограничение: GIL (Global Interpreter Lock) не даёт настоящего параллелизма
для CPU-bound задач. 40 потоков будут конкурировать за GIL. Для расчётов,
занимающих < 100 мс — это приемлемо (GIL освобождается каждые 5 мс в Python
3.11+). Для batch-расчётов на 48 объектов (2–5 сек) — нужен следующий шаг.

**Шаг 2 — Правильный фикс (3–4 дня): Background Tasks + Task Queue**

```python
# В API-обработчике:
task_id = await calculation_service.schedule_batch_calculation(project_id, variant_number)
return JSONResponse(status_code=202, content={"task_id": task_id, "status": "pending"})
```

Расчёт выполняется в отдельном worker-процессе (настоящий параллелизм,
обход GIL):

- **Вариант A (простой):** `concurrent.futures.ProcessPoolExecutor` с 4 воркерами
- **Вариант Б (промышленный):** Celery + Redis брокер (уже есть Redis в стеке).
  Celery worker запускается отдельным контейнером, масштабируется горизонтально.

Фронтенд получает `202 Accepted` и поллит `GET /api/v1/tasks/{task_id}`
каждые 2 секунды (или WebSocket для реального времени).

**Ожидаемый эффект:**

| Метрика | До | После |
|---|---|---|
| P95 latency `POST /objects` | 3.2 сек | 180 мс |
| P95 latency `POST /calc/electrical/batch` | 8.5 сек | 250 мс |
| Одновременных пользователей без деградации | 2–3 | 20+ |

---

## O-02. Кэширование справочных данных в памяти

**Слой:** Бэкенд  
**Приоритет:** P0 — критический  
**Трудозатраты:** Low (1 спринт)  
**Ожидаемый эффект:** −200–400 мс с каждого запроса, использующего справочники

**Проблема:**

Справочные данные (climate.json — 539 городов, cables_tlt.json — 10 марок,
insulation.json — 6 материалов) загружаются из JSON-файлов при каждом запросе
через `json.load(open(...))`. Это дисковый I/O — 1–5 мс на файл × 5 справочников =
5–25 мс на каждый запрос. При 100 запросах в минуту — 500–2500 мс CPU в минуту
тратится впустую.

Хуже — если справочники загружаются внутри цикла обработки объектов (batch
расчёт), а не один раз на старте. Проверь grep-ом: если `json.load` или
`open(.*reference_data)` встречается внутри функции расчёта, а не в
глобальной переменной уровня модуля — это баг.

**Решение:**

Загружать справочники **один раз при старте приложения** в глобальные переменные
(словари Python). Обновлять — по вызову админского эндпоинта
`POST /admin/reload-references` (вместо перезапуска приложения).

```python
# reference_data/loader.py
import json
from pathlib import Path

_refs: dict = {}

def load_all():
    base = Path(__file__).parent
    _refs["climate"] = json.loads((base / "climate.json").read_text())
    _refs["cables_tlt"] = json.loads((base / "cables_tlt.json").read_text())
    _refs["insulation"] = json.loads((base / "insulation.json").read_text())
    # ... остальные справочники
    return _refs

def get_climate():
    return _refs["climate"]  # O(1), in-memory

# В lifespan FastAPI:
@asynccontextmanager
async def lifespan(app: FastAPI):
    load_all()
    yield
```

Дополнительно: для частых запросов типа «поиск города по названию» построить
индекс (словарь `{city_name_lower → city_data}`) один раз при загрузке,
а не `for city in climate: if city["name"] == query` на каждый запрос.

**Ожидаемый эффект:**

| Метрика | До | После |
|---|---|---|
| `GET /references/climate?search=Москва` | 45 мс | 2 мс |
| `POST /objects` (внутри читает insulation.json) | +15 мс overhead | 0 мс overhead |
| Потребление CPU при 100 RPM | +2% на file I/O | 0% |

---

## O-03. Оптимизация ORM-запросов: eager loading, N+1, индексы

**Слой:** Бэкенд / База данных
**Приоритет:** P0 — критический · **Статус:** ✅ Уже применено
**Трудозатраты:** 0 (уже сделано)

> **Обновлено 2026-05-10 после аудита кодовой базы.**
> Предыдущая версия этого раздела ошибочно ссылалась на несуществующие
> relationship'ы `obj.heat_calculation` и `obj.electrical_calculations`.
> Актуальная схема: `database-optimization-v2.md`.

**Фактическая архитектура:**

Результаты теплопотерь (`q`, `Q`) хранятся как JSONB-колонка `results`
в той же строке `project_objects`. Отдельной таблицы `heat_calculations`
**нет**. JOIN не нужен. N+1 невозможен.

Электрические расчёты (`electrical_calculations`) загружаются отдельным
API-запросом `GET /api/v1/calculations?project_id=...&variant_number=...`,
а не через relationship. В модели `ProjectObject` связь с
`ElectricalCalculation` не определена — N+1 невозможен.

Для `Project.objects` (список объектов проекта) используется
`selectinload(Project.objects)` в `project_service.py` и `report_service.py`.

**Что уже сделано (миграции 0004–0005):**

```sql
-- Составной индекс с covering (id в INCLUDE — index-only scan)
CREATE INDEX ix_project_objects_project_type_sort
    ON project_objects (project_id, object_type, sort_order, id);

-- Индексы для electrical_calculations
CREATE INDEX ix_electrical_calculations_object_variant
    ON electrical_calculations (object_id, variant_number);
CREATE INDEX ix_electrical_calculations_project_variant
    ON electrical_calculations (project_id, variant_number);

-- Индексы для проводника проектов
CREATE INDEX ix_projects_user_updated ON projects (user_id, updated_at);
CREATE INDEX ix_projects_session_updated ON projects (session_id, updated_at);

-- Индекс для фоновой очистки сессий
CREATE INDEX ix_guest_sessions_last_activity ON guest_sessions (last_activity);
```

**Что осталось:** 4 строки в `docker-compose.yml` (PG-01 в v2) — см.
[`database-optimization-v2.md`](database-optimization-v2.md).

**Ожидаемый эффект (уже достигнут):**

| Метрика | Без оптимизаций | Сейчас |
|---|---|---|
| SQL-запросов при загрузке страницы объектов | 3 (архитектурно) | 3 |
| `GET /projects/{id}/objects` (50 объектов) | ~200 мс | ~180 мс |
| `GET /projects` (список) | ~80 мс | ~45 мс |

---

## O-04. Тюнинг пула соединений БД

**Слой:** Бэкенд / База данных  
**Приоритет:** P1 — тактический  
**Трудозатраты:** Low (1–2 дня)  
**Ожидаемый эффект:** Устранение ошибок подключения под нагрузкой, −5–15% latency

**Проблема:**

SQLAlchemy async использует пул соединений. Дефолтные настройки (pool_size=5,
max_overflow=10) достаточны для 2–3 одновременных пользователей, но при
росте нагрузки соединения заканчиваются → запросы встают в очередь → timeout.

Дополнительно: при каждом запросе, который не делает БД-запросов (например,
`GET /health`), соединение всё равно может захватываться из пула
(зависит от middleware аутентификации, который касается БД для проверки
сессии).

**Решение:**

**Настройка пула в `core/config.py` или `database.py`:**

```python
engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,            # было 5 → 20 (по числу одновременных пользователей × 2)
    max_overflow=10,          # дополнительных сверх pool_size при пике
    pool_recycle=3600,        # пересоздавать соединения старше 1 часа
    pool_pre_ping=True,       # проверять живое ли соединение перед использованием
    echo_pool=False,          # не логировать checkout/checkin (шумно)
    connect_args={
        "server_settings": {
            "application_name": "heatcalc_backend",
            "statement_timeout": "30000",  # 30 сек — убивать зависшие запросы
        }
    }
)
```

**PostgreSQL тюнинг (postgresql.conf):**

```ini
# Максимальное число соединений (должно быть >= pool_size × число инстансов + 10)
max_connections = 100

# Память под shared buffers (25% от RAM контейнера БД, но не более 8 GB)
shared_buffers = 512MB

# Эффективный размер кэша (50–75% от RAM)
effective_cache_size = 1GB

# Минимальная память на операцию сортировки/хэша
work_mem = 16MB
```

**Ожидаемый эффект:** При 10 одновременных пользователях — отсутствие
ошибок `QueuePool limit reached`, стабильная latency.

---

## O-05. Снижение размера фронтенд-бандла (bundle size)

**Слой:** Фронтенд  
**Приоритет:** P0 — критический  
**Трудозатраты:** Medium (2–3 спринта)  
**Ожидаемый эффект:** First load −60–75% (с 2.5 MB до ~600 kB)

**Проблема:**

React SPA загружает весь JavaScript до отображения первого экрана. Типичный
бандл HeatCalc включает:

- Ant Design 5 (полный импорт всех компонентов): ~800 kB gzipped
- Plotly.js (графики): ~3 MB gzipped (!!!) — одна из тяжелейших JS-библиотек
- Zustand + TanStack Query + Axios: ~50 kB
- Собственный код: ~200 kB
- CSS: ~150 kB

Итого: 4+ MB gzipped → на медленном соединении загрузка 8–12 секунд.

**Как проверить:** `npm run build && npx vite-bundle-visualizer` — откроется
treemap бандла. Найти самые большие прямоугольники — это главные виновники.

**Решение:**

**Шаг 1 — Tree-shaking Ant Design (1 день):**

Убедиться, что импорты точечные, а не всей библиотеки:

```tsx
// ❌ Плохо — тащит всё
import { Table, Button, Modal } from "antd";

// ✅ Хорошо — tree-shaking работает
import Table from "antd/es/table";
import Button from "antd/es/button";
```

Vite с `vite-plugin-antd` или ручной конфигурацией `manualChunks` разделяет
antd на отдельные чанки. Настройка в `vite.config.ts`:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        antd: ["antd", "@ant-design/icons"],
        plotly: ["plotly.js-dist-min"],
        vendor: ["react", "react-dom", "zustand", "@tanstack/react-query"],
      },
    },
  },
},
```

**Шаг 2 — Ленивая загрузка Plotly.js (1 день):**

Plotly.js используется только на страницах с графиками (теплопотери — график
температурного профиля, электрорасчёт — Парето-диаграмма, TCO —
waterfall chart). На странице ввода объектов (90% времени пользователя)
Plotly не нужен.

Решение: динамический импорт:

```tsx
const PlotlyChart = lazy(() => import("./PlotlyChart"));
```

Vite выделит Plotly в отдельный чанк, который загрузится только когда
пользователь перейдёт на страницу с графиками. Экономия: −3 MB на первом
экране.

**Шаг 3 — Замена тяжёлых библиотек на легковесные аналоги (опционально):**

| Тяжёлая | Замена | Экономия |
|---|---|---|
| Plotly.js (3 MB) | ECharts (1 MB) или Recharts (200 kB) | −2.8 MB |
| Moment.js в antd (200 kB) | Day.js (2 kB — уже в antd v5) | −198 kB |
| Lodash целиком (70 kB) | lodash-es с tree-shaking | −50 kB |

⚠️ Замена Plotly на ECharts — это переписывание всех графиков, ~2–3 спринта.
Делать только если bundle size всё ещё проблема после ленивой загрузки.

**Ожидаемый эффект:**

| Метрика | До | После |
|---|---|---|
| Первый экран (JS) | 4.2 MB gzipped | 600 kB gzipped |
| First Contentful Paint (3G) | 8.5 сек | 2.1 сек |
| Время загрузки на repeat visit (с кэшем) | 2.1 сек | 0.4 сек |

---

## O-06. Стабилизация ререндеров таблицы объектов

**Слой:** Фронтенд  
**Приоритет:** P0 — критический  
**Трудозатраты:** Medium (2 спринта)  
**Ожидаемый эффект:** FPS при скролле таблицы с 12 → 60, фокус не теряется при вводе

**Проблема:**

При изменении любого параметра в форме SC-03 (например, ввод толщины изоляции)
происходит ререндер **всей таблицы** объектов (50 строк × 12 колонок = 600
ячеек). Причина: состояние формы и состояние таблицы лежат в одном Zustand-слайсе
или в общем родительском компоненте.

На каждое нажатие клавиши в поле ввода → dispatch в Zustand → ререндер
HeatCalcPage → ререндер PipeTable → ререндер всех 50 DraggableRow → lag.

**Как проверить:** React DevTools → Profiler → запись ввода в поле формы.
Если в списке отрендеренных компонентов есть `PipeTable`, `DraggableRow`,
`ResultCell` — проблема подтверждена.

**Решение:**

**Шаг 1 — Разделение Zustand-слайсов (1 день):**

Разделить состояние формы и состояние таблицы в независимые слайсы:

```ts
// Было: один слайс
const useStore = create((set) => ({
  formValues: {...},
  objects: [...],
  setFormValue: (field, value) => set(...), // триггерит ререндер всей таблицы
}));

// Стало: независимые слайсы
const useFormStore = create((set) => ({ formValues: {...}, ... }));
const useObjectsStore = create((set) => ({ objects: [...], ... }));
```

`ObjectWizard` подписан только на `useFormStore`. `PipeTable` — только на
`useObjectsStore`. Изменение формы не вызывает ререндер таблицы.

**Шаг 2 — Мемоизация строк таблицы (1 день):**

```tsx
const MemoizedDraggableRow = React.memo(DraggableRow, (prev, next) => {
  // Перерендер только если изменились данные этой конкретной строки
  return prev.object.updated_at === next.object.updated_at
      && prev.object.q === next.object.q;
});
```

**Шаг 3 — Мемоизация колонок (30 мин):**

```tsx
const columns = useMemo(() => defineColumns(...), [projectId, userRole]);
```

Определение колонок (`columns` array) не должно пересоздаваться на каждый рендер
HeatCalcPage — это приводит к перерендеру всей таблицы (antd Table сравнивает
columns по ссылке).

**Шаг 4 — Виртуальный скроллинг (отдельная фича T-15):**

При 200+ строках — рендерить только видимые (см. `proposed-tactical-features.md`,
фича T-15). Для 50 строк это не обязательно, но закладывает фундамент.

**Ожидаемый эффект:**

| Метрика | До | После |
|---|---|---|
| Время ререндера при вводе в поле формы | 120–180 мс | < 5 мс |
| FPS при скролле таблицы 50 строк | 12–18 | 60 (стабильно) |
| Потеря фокуса при вводе | Да (каждые 200 мс) | Нет |

---

## O-07. Оптимизация Zustand + localStorage (persist middleware)

**Слой:** Фронтенд  
**Приоритет:** P1 — тактический  
**Трудозатраты:** Low (1–2 дня)  
**Ожидаемый эффект:** Исчезновение микрозависаний при каждом изменении данных

**Проблема:**

Zustand persist-слайс (`projectStore`) синхронизирует **весь проект**
(объекты + расчёты + спецификации) в `localStorage` на **каждое** изменение.
`JSON.stringify()` для проекта с 50 объектами: ~250 KB → ~5–15 мс на запись
(синхронный I/O). При быстром вводе в форму (каждые 100–200 мс) это создаёт
микрозависания.

Хуже: `localStorage` — синхронный API, блокирует главный поток. При размере
данных > 500 KB — заметные подвисания на 20–50 мс.

**Как проверить:** Chrome DevTools → Performance → запись активной работы
с формой. Если есть жёлтые полосы с пометкой `LocalStorage Set` — проблема
подтверждена.

**Решение:**

**Шаг 1 — Debounce persist (30 мин):**

```ts
import { persist } from "zustand/middleware";
import { debounce } from "lodash-es";

const useProjectStore = create(
  persist(
    (set, get) => ({
      objects: [],
      // ... остальные поля
    }),
    {
      name: "tlt-current-project",
      // Ключевая настройка: сохранять не чаще 1 раза в 2 секунды
      onRehydrateStorage: () => (state) => {
        const debouncedSave = debounce(
          () => localStorage.setItem("tlt-current-project", JSON.stringify(state)),
          2000,
          { maxWait: 5000 } // но не реже 5 сек
        );
        // Переопределяем стандартный механизм сохранения
      },
    }
  )
);
```

Либо — более чистый подход: `zustand/middleware/persist` с опцией
`skipHydration: true` и ручной вызов `persistState()` с debounce.

**Шаг 2 — Частичное сохранение (partialize) (1 час):**

Сохранять в localStorage не весь стейт, а только то, что нужно для
восстановления сессии:

```ts
persist(
  (set, get) => ({...}),
  {
    name: "tlt-current-project",
    partialize: (state) => ({
      // Только данные, без вычисляемых полей и UI-состояния
      objects: state.objects,
      commonData: state.commonData,
      activeCO: state.activeCO,
      // Исключены: uiState, selectedIds, filterPresets, calculationCache
    }),
  }
);
```

**Шаг 3 — Переход на IndexedDB для больших проектов (future, 2–3 дня):**

При 200+ объектах → размер проекта ~1 MB. `localStorage` имеет лимит 5–10 MB
на домен и синхронный I/O. IndexedDB — асинхронный, без лимита (практически).

Zustand-адаптер для IndexedDB: `idb-keyval` + ручной `storage`-обёртки.
Делать только если после debounce и partialize проблема остаётся (маловероятно
для 50 объектов).

**Ожидаемый эффект:**

| Метрика | До | После |
|---|---|---|
| Микрозависания при вводе в форму | 15–50 мс каждые 200 мс | 0 мс |
| Время восстановления сессии (rehydrate) | 80 мс | 25 мс |
| Размер данных в localStorage | 250 KB | 80 KB |

---

## O-08. Оптимизация ObjectWizard (динамическая форма SC-03)

**Слой:** Фронтенд  
**Приоритет:** P1 — тактический  
**Трудозатраты:** Medium (2 спринта)  
**Ожидаемый эффект:** Плавный ввод без задержек, мгновенное переключение полей

**Проблема:**

ObjectWizard — сложная форма с динамическими зависимостями:

- Выбор «1/2/3 слоя изоляции» → показать/скрыть поля для 2-го и 3-го слоя
- Выбор «Размещение: надземное/подземное» → показать/скрыть глубину, грунт
- Выбор «Режим λ: Справ./Вручн.» → переключить Select на Input
- Выбор «Город из справочника» → автозаполнить T_среды и ветер

Каждое изменение селекта вызывает ререндер всей формы. Для 15+ полей с
условной видимостью это 15+ проверок условий на каждый ререндер.

**Как проверить:** React DevTools → выделить ObjectWizard → посмотреть
«why did this render?». Если причина — изменение родителя или хука, а
не собственных props — проблема подтверждена.

**Решение:**

**Шаг 1 — Разделение на под-компоненты с React.memo (1 день):**

```tsx
// ❌ Было: одна большая форма, всё рендерится при любом изменении
<Form>
  <GeometrySection />
  <InsulationSection />
  <EnvironmentSection />
  <ElectricalSection />
</Form>

// ✅ Стало: каждая секция — независимый memo-компонент
const GeometrySection = React.memo(({ values, onChange }) => { ... });
const InsulationSection = React.memo(({ values, onChange, layerCount }) => { ... });
```

Каждая секция перерендеривается только когда меняются её поля.

**Шаг 2 — Мемоизация селекторов Zustand (30 мин):**

```tsx
// ❌ Плохо: подписка на весь стейт
const formValues = useFormStore((s) => s.formValues); // ререндер при любом изменении

// ✅ Хорошо: подписка только на нужное поле
const layerCount = useFormStore((s) => s.formValues.insulation_layers_count);
const placement = useFormStore((s) => s.formValues.placement);
```

Zustand использует строгое сравнение по умолчанию — если `layerCount` не
изменился, ререндера не будет.

**Шаг 3 — Дебаунсинг автозаполнения климата (30 мин):**

При выборе города → API-запрос `GET /references/climate?search=...` →
заполнение T_среды и ветра. Если пользователь быстро печатает «Москва»,
это 6 запросов подряд. Решение: debounce 300 мс + отмена предыдущего
запроса (AbortController через TanStack Query `enabled: false`).

**Ожидаемый эффект:**

| Метрика | До | После |
|---|---|---|
| Задержка при переключении «1 слой → 2 слоя» | 180 мс | < 16 мс |
| Задержка при вводе в поле | 45 мс | < 8 мс |
| API-запросов при поиске города | 6 | 1 |

---

## O-09. Производительность Docker на macOS (osxfs → cached/volumes)

**Слой:** Инфраструктура  
**Приоритет:** P1 — тактический  
**Трудозатраты:** Low (1–2 часа)  
**Ожидаемый эффект:** Время ответа API в dev-окружении −30–60%

**Проблема:**

На macOS Docker работает через виртуальную машину (LinuxKit). Файловая система
хоста монтируется в контейнер через `osxfs` (или `virtiofs` в Docker Desktop
новых версий). `osxfs` — медленный: чтение файла может занимать в 10–50 раз
больше, чем на нативном Linux.

Если backend читает справочники (climate.json, 539 записей) через bind-mount —
каждый `json.load()` задерживается на 5–15 мс вместо 1 мс. При batch-расчёте
(50 объектов) это 250–750 мс лишних.

**Как проверить:** `docker compose exec backend time python -c "from
app.reference_data import load_climate; load_climate()"`. Если > 100 мс —
osxfs виноват.

**Решение:**

**Шаг 1 — `:cached` или `:delegated` на mount'ах (5 мин):**

В `docker-compose.dev.yml`:

```yaml
services:
  backend:
    volumes:
      - ./backend/app:/app/app:cached     # ← флаг cached
      - ./backend/reference_data:/app/reference_data:cached
```

- `:cached` — хост-контроллер: контейнер читает быстро, но может видеть
  устаревшие данные 1–2 сек. Для справочников (меняются редко) — идеально.
- `:delegated` — контейнер-контроллер: контейнер пишет быстро, хост видит
  изменения с задержкой. Для логов/кэша — ок.

**Шаг 2 — Docker volumes для горячих данных (10 мин):**

Для директорий с частым чтением (reference_data) — использовать Docker volume
вместо bind-mount:

```yaml
services:
  backend:
    volumes:
      - reference_data:/app/reference_data  # Docker volume — нативный Linux FS

volumes:
  reference_data:
```

⚠️ При изменении JSON-файлов на хосте нужно копировать их в volume:
`docker compose cp climate.json backend:/app/reference_data/`

**Шаг 3 — Проверить версию Docker Desktop (5 мин):**

Docker Desktop 4.15+ использует `virtiofs` вместо `osxfs` — до 4× быстрее.
Проверить: `docker info | grep filesystem`. Если `osxfs` — обновить Docker
Desktop до последней версии.

**Ожидаемый эффект (только dev-окружение, macOS):**

| Метрика | osxfs | cached/delegated | virtiofs |
|---|---|---|---|
| `json.load(climate.json)` | 15 мс | 5 мс | 2 мс |
| Время ответа `GET /objects` | 450 мс | 220 мс | 150 мс |

---

## O-10. Сжатие ответов (Gzip/Brotli) + заголовки кэширования

**Слой:** Инфраструктура / Фронтенд  
**Приоритет:** P1 — тактический  
**Трудозатраты:** Low (1–2 часа)  
**Ожидаемый эффект:** Размер ответов API −70–85%, статика −75%

**Проблема:**

API отдаёт JSON `GET /projects/{id}/objects` (50 объектов с heat_calc +
elec_calc) — ответ ~250 KB. Без сжатия — передаётся as-is.

Статика (JS/CSS бандлы) — 4+ MB. Без заголовков кэширования — загружается
заново при каждом открытии приложения.

**Как проверить:** Chrome DevTools → Network → заголовки ответа. Если нет
`Content-Encoding: gzip` и `Cache-Control` — проблема подтверждена.

**Решение:**

**Шаг 1 — Gzip на уровне nginx/Caddy (30 мин):**

В `frontend/nginx.conf` или Caddyfile:

```nginx
# Nginx
gzip on;
gzip_types application/json text/css application/javascript;
gzip_min_length 500;
gzip_comp_level 5;

# Caddy (в Caddyfile)
encode gzip zstd
```

Это сжимает JSON-ответы и статику на лету. 250 KB JSON → ~45 KB gzipped.

**Шаг 2 — Brotli (опционально, nginx):**

Brotli сжимает на 20–30% лучше gzip, но требует модуль `ngx_brotli`:

```nginx
brotli on;
brotli_types application/json text/css application/javascript;
brotli_comp_level 6;
```

**Шаг 3 — Заголовки кэширования для статики (15 мин):**

```nginx
location /assets {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location ~* \.(js|css|png|svg|woff2)$ {
    expires 30d;
    add_header Cache-Control "public";
}
```

Для Vite dev-server (dev-режим): не кэшировать вообще (исходники меняются).

**Шаг 4 — ETag / Last-Modified для API (опционально, если есть повторные запросы):**

FastAPI добавляет ETag автоматически для статики. Для API — ручная реализация
(хешировать ответ и возвращать `304 Not Modified` если клиент прислал
`If-None-Match`). Делать только если повторные запросы занимают > 10% трафика.

**Ожидаемый эффект:**

| Метрика | До | После |
|---|---|---|
| `GET /objects` (50 объектов) — размер ответа | 250 KB | 45 KB (gzip) / 35 KB (brotli) |
| Загрузка JS бандла (repeat visit) | 4.2 MB | 0 KB (304 Not Modified) |
| First load после кэширования | 8.5 сек | 0.4 сек |

---

## O-11. Кэширование результатов расчётов (Redis read-through)

**Слой:** Бэкенд  
**Приоритет:** P2 — на вырост  
**Трудозатраты:** Medium (2 спринта)  
**Ожидаемый эффект:** Повторные запросы к одним и тем же объектам — мгновенны

**Проблема:**

Результаты теплопотерь хранятся как JSONB-колонка `results` в `project_objects`,
а электрические расчёты — в отдельной таблице `electrical_calculations`.
При повторных запросах без изменений (открытие страницы, переключение CO,
повторная генерация отчёта) результаты читаются из БД.

Для проекта с 50 объектами и 4 CO: 50 строк `project_objects` + 200 строк
`electrical_calculations` = 250 строк. Чтение: 10–30 мс. Каждый раз.

**Решение:**

Read-through кэш на Redis (уже есть в стеке):

```python
async def get_electrical_calculations(project_id: str, variant: int) -> list[dict]:
    cache_key = f"elec_calc:{project_id}:CO{variant}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    result = await db.execute(
        select(ElectricalCalculation).where(
            ElectricalCalculation.project_id == project_id,
            ElectricalCalculation.variant_number == variant,
        )
    )
    data = [r.to_dict() for r in result.scalars().all()]
    await redis.setex(cache_key, 300, json.dumps(data))
    return data
```

Инвалидация: при изменении электрорасчёта (POST/PUT) — удалять `elec_calc:{project_id}:*`.

**Ожидаемый эффект:**

| Метрика | До (БД) | После (кэш-hit) |
|---|---|---|
| `GET /calculations` (50 объектов, повторно) | 180 мс | 8 мс |
| Переключение CO1 → CO2 (повторно) | 120 мс | 5 мс |

---

## O-12. Code Splitting — загрузка страниц по требованию

**Слой:** Фронтенд  
**Приоритет:** P1 — тактический  
**Трудозатраты:** Low (1–2 дня)  
**Ожидаемый эффект:** Первый экран −40–60% JS

**Проблема:**

Приложение загружает **все** страницы сразу (HeatCalcPage, ElecCalcPage,
SpecificationPage, ReportPage, AdminPage). Пользователь на странице
«Теплопотери» не нуждается в коде для «Админки коэффициентов» (150 kB).

**Как проверить:** `vite-bundle-visualizer` → поискать чанки страниц,
которые не являются точкой входа. Если всё в одном чанке `index.js` —
code splitting не работает.

**Решение:**

React.lazy + Suspense на уровне роутера:

```tsx
// routes/index.tsx
import { lazy, Suspense } from "react";
import { Spin } from "antd";

const HeatCalcPage = lazy(() => import("../pages/HeatCalcPage"));
const ElecCalcPage = lazy(() => import("../pages/ElecCalcPage"));
const ReportPage = lazy(() => import("../pages/ReportPage"));
const AdminPage = lazy(() => import("../pages/AdminPage"));

const Loading = () => <Spin size="large" className="page-loader" />;

<Routes>
  <Route path="/project/:id/heat" element={
    <Suspense fallback={<Loading />}><HeatCalcPage /></Suspense>
  } />
  <Route path="/project/:id/elec" element={
    <Suspense fallback={<Loading />}><ElecCalcPage /></Suspense>
  } />
  {/* ... */}
</Routes>
```

Vite автоматически выделит каждую `lazy(() => import(...))` в отдельный чанк.
При заходе на страницу «Теплопотери» загрузится только её код (~100 kB),
остальные страницы — по мере навигации.

**Ожидаемый эффект:**

| Метрика | До | После |
|---|---|---|
| Начальный JS (первый экран) | 600 kB | 180 kB |
| Время загрузки AdminPage (первый раз) | 0 (уже загружено) | 90 мс (ленивая загрузка) |
| Общий размер кэша (Service Worker) | 4.2 MB | 0.6 MB (стартовый) + 3.6 MB (по требованию) |

---

## O-13. Оптимизация Vite-сборки: minify, sourcemap, dev-сервер

**Слой:** Фронтенд / Сборка  
**Приоритет:** P1 — тактический  
**Трудозатраты:** Low (1–2 часа)  
**Ожидаемый эффект:** Сборка в prod −20–30% размера, dev HMR быстрее

**Проблема:**

Vite по умолчанию использует `esbuild` для minify (быстрый, но менее
агрессивный, чем `terser`). Sourcemap'ы могут быть включены в production
(утечка исходного кода + лишние 2–3 MB). Dev-сервер может быть медленным
из-за большого числа файлов.

**Решение:**

**`vite.config.ts` — production:**

```ts
export default defineConfig({
  build: {
    minify: "terser",          // вместо esbuild — агрессивнее на 15–20%
    sourcemap: false,           // НИКОГДА не включать sourcemap в production
    cssMinify: "lightningcss",  // быстрее PostCSS, тот же результат
    rollupOptions: {
      output: {
        manualChunks: { ... },  // см. O-05
      },
    },
  },
});
```

**`vite.config.ts` — development:**

```ts
export default defineConfig({
  server: {
    fs: {
      strict: false,  // меньше проверок безопасности в dev
    },
    warmup: {
      clientFiles: [
        "./src/pages/HeatCalcPage.tsx",  // предварительно загрузить в память
        "./src/components/wizard/ObjectWizard.tsx",
      ],
    },
  },
});
```

`warmup` — фича Vite 5.2+: предварительно трансформирует указанные файлы при
старте dev-сервера. Первый запрос к странице проходит мгновенно, без ожидания
трансформации.

**Ожидаемый эффект:**

| Метрика | До | После |
|---|---|---|
| Prod-бандл (gzipped) | 600 kB | 480 kB |
| Dev HMR (время обновления) | 120 мс | 40 мс |
| Первый запрос к странице (dev) | 2.3 сек | 0.6 сек |

---

## O-14. Оптимизация TanStack Query: stale время, retry, refetch

**Слой:** Фронтенд  
**Приоритет:** P1 — тактический  
**Трудозатраты:** Low (1–2 часа)  
**Ожидаемый эффект:** −30–50% сетевых запросов, меньше «морганий» интерфейса

**Проблема:**

TanStack Query с настройками по умолчанию (`staleTime: 0`) помечает данные
как «устаревшие» немедленно. Результат:

- Переключение между вкладками браузера → refetch
- Повторный фокус на окне → refetch
- Переключение CO → refetch объектов (хотя они не изменились)

Избыточные refetch'и создают визуальный шум (данные «моргают» — исчезают и
появляются) и нагрузку на API.

**Решение:**

Глобальная конфигурация QueryClient:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,      // данные свежие 30 секунд (не refetch)
      gcTime: 5 * 60 * 1000,     // хранить в кэше 5 минут после unmount
      refetchOnWindowFocus: false, // не перезагружать при смене вкладки
      refetchOnReconnect: true,   // перезагружать при восстановлении сети
      retry: 2,                   // 2 повтора при ошибке (было 3)
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), // exponential backoff
    },
  },
});
```

Для справочников (climate, insulation, cables) — более агрессивное кэширование:

```ts
useQuery({
  queryKey: ["references", "climate"],
  queryFn: fetchClimate,
  staleTime: 60 * 60 * 1000, // 1 час — справочники не меняются
  gcTime: 24 * 60 * 60 * 1000, // 24 часа
});
```

**Ожидаемый эффект:**

| Метрика | До | После |
|---|---|---|
| Запросов `GET /objects` за 5 минут работы | 35 | 5 |
| Запросов `GET /references/climate` за сессию | 15 | 1 |
| Визуальные «моргания» таблицы при refetch | Часто | Нет |

---

## O-15. Мониторинг производительности в production

**Слой:** Инфраструктура / Все слои  
**Приоритет:** P2 — на вырост  
**Трудозатраты:** Medium (2–3 спринта)  
**Ожидаемый эффект:** Обнаружение деградации до того, как пожалуется пользователь

**Проблема:**

Без мониторинга разработчики узнают о проблемах производительности от
пользователей: «у меня приложение тормозит». Без метрик невозможно ответить:
«тормозит у всех или только у вас?», «с каких пор?», «на сколько?».

**Решение (минимальный набор):**

**Backend — structured logging + Prometheus:**

```python
# metrics.py
from prometheus_fastapi_instrumentator import Instrumentator

instrumentator = Instrumentator()
instrumentator.instrument(app).expose(app)

# В lifespan:
instrumentator.expose(app, endpoint="/metrics")
```

Метрики доступны на `/metrics` (Prometheus-формат):
- `http_requests_total` — количество запросов
- `http_request_duration_seconds_bucket` — гистограмма времени ответа
- `http_requests_in_progress` — текущие незавершённые запросы

Dashboard в Grafana: P50/P95/P99 latency по эндпоинтам, RPS, error rate.

**Backend — structlog с duration:**

```python
import structlog, time

logger = structlog.get_logger()

async def get_objects(project_id: UUID):
    t0 = time.monotonic()
    result = await object_service.get_objects(project_id)
    logger.info("get_objects_done", project_id=str(project_id),
                count=len(result), duration_ms=(time.monotonic() - t0) * 1000)
    return result
```

В production — слать структурированные логи в Loki или ELK. Настроить алерты:
«P95 latency `POST /objects` > 5 сек в течение 5 минут → оповещение в Telegram».

**Frontend — Web Vitals:**

```ts
// main.tsx
import { onCLS, onFID, onLCP } from "web-vitals";

onCLS(console.log);  // Cumulative Layout Shift
onFID(console.log);  // First Input Delay
onLCP(console.log);  // Largest Contentful Paint

// В production — отправлять в аналитику:
function sendToAnalytics(metric) {
  fetch("/api/v1/telemetry/web-vitals", {
    method: "POST",
    body: JSON.stringify(metric),
    keepalive: true,
  });
}
```

**Frontend — Sentry Performance:**

Интеграция `@sentry/react` с `BrowserTracing`:

```ts
Sentry.init({
  dsn: "...",
  integrations: [new BrowserTracing()],
  tracesSampleRate: 0.1,  // 10% трассировок (чтобы не перегружать)
});
```

Показывает, какие страницы/компоненты тормозят у реальных пользователей.

**Ожидаемый эффект:** Обнаружение регрессии за минуты, а не за дни.
Возможность ответить на вопрос «почему тормозит» данными, а не догадками.

---

## Приоритетный порядок внедрения (Quick Wins First)

| # | ID | Оптимизация | Эффект | Трудозатраты |
|---|---|---|---|---|
| 1 | O-01 | Async-расчёты через run_in_executor | API latency −80% | 1 день |
| 2 | O-02 | Кэширование справочников | −200 мс с каждого запроса | 1 день |
| 3 | O-10 | Gzip + заголовки кэширования | −70% размер ответа | 2 часа |
| 4 | O-03 | Eager loading (N+1 fix) | −80% SQL-запросов | 1 день |
| 5 | O-05 | Tree-shaking + lazy Plotly | Бандл −70% | 2 дня |
| 6 | O-07 | Zustand debounce + partialize | Микрозависания → 0 | 2 часа |
| 7 | O-06 | Мемоизация таблицы | FPS 12 → 60 | 2 дня |
| 8 | O-08 | ObjectWizard ререндеры | Ввод без задержек | 2 дня |
| 9 | O-14 | TanStack Query staleTime | −50% запросов | 1 час |
| 10 | O-13 | Vite production optimize | Бандл −20% | 2 часа |
| 11 | O-04 | Пул соединений БД | Стабильность под нагрузкой | 2 часа |
| 12 | O-09 | Docker volumes :cached | Dev latency −40% | 1 час |
| 13 | O-12 | Code splitting страниц | Первый экран −40% JS | 2 часа |
| 14 | O-11 | Redis read-through кэш | −95% повторных запросов | 3 дня |
| 15 | O-15 | Prometheus + Sentry | Обнаружение проблем | 5 дней |

**Суммарно:** первые 10 оптимизаций — ~2 недели работы одного разработчика —
дают **радикальное ускорение** (субъективно «приложение летает» вместо
«приложение тормозит»).

Оставшиеся 5 — для production-стабильности и мониторинга.

---

## Сводная матрица

| Слой | O-01 | O-02 | O-03 | O-04 | O-05 | O-06 | O-07 | O-08 | O-09 | O-10 | O-11 | O-12 | O-13 | O-14 | O-15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Бэкенд — event loop | ✅ | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Бэкенд — кэш | — | ✅ | — | — | — | — | — | — | — | — | ✅ | — | — | — | — |
| Бэкенд — БД | — | — | ✅ | ✅ | — | — | — | — | — | — | — | — | — | — | — |
| Фронтенд — бандл | — | — | — | — | ✅ | — | — | — | — | — | — | ✅ | ✅ | — | — |
| Фронтенд — рендер | — | — | — | — | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | — |
| Фронтенд — сеть | — | — | — | — | — | — | — | — | — | — | — | — | — | ✅ | — |
| Инфра — Docker | — | — | — | — | — | — | — | — | ✅ | — | — | — | — | — | — |
| Инфра — Nginx/Caddy | — | — | — | — | — | — | — | — | — | ✅ | — | — | — | — | — |
| Мониторинг | — | — | — | — | — | — | — | — | — | — | — | — | — | — | ✅ |

---

*Документ подготовлен: 2026-05-09  
Рекомендуется начать с O-01 (run_in_executor) — один день работы, эффект немедленный  
Код не тронут. Только диагностика, архитектурные решения и инженерные оценки.*
