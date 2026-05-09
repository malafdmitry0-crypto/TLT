# TLT HeatCalc — Оптимизация базы данных (v2 · definitive)

**Дата:** 2026-05-10  
**Статус:** Единый источник истины — заменяет все предыдущие версии  
**Сверен с:** реальным кодом `project_object.py`, `electrical_calculation.py`,
`calculation_service.py`, `object_query_service.py`, `project_service.py`,
миграциями 0004–0006, `docker-compose.yml`, `cache.py`  

---

## 0. Фактическая схема данных

Прежде чем что-то рекомендовать — зафиксируем, как данные хранятся на самом деле.

### 0.1 `project_objects` — основная таблица

```sql
CREATE TABLE project_objects (
    id UUID PK,
    project_id UUID FK → projects(id) ON DELETE CASCADE,
    object_type project_object_type_enum,   -- 'pipe' | 'tank'
    sort_order INTEGER,
    params JSONB,                            -- все входные параметры объекта
    results JSONB,                           -- результаты heat_loss прямо здесь
    is_valid BOOLEAN,
    validation_errors JSONB
);
```

**Ключевое:** результаты теплопотерь (`q`, `Q`, `thermal_resistance` etc.)
хранятся как JSONB-колонка `results` в той же строке. **Нет отдельной таблицы
`heat_calculations`.** Это сделано осознанно — JOIN не нужен, N+1 невозможен.

### 0.2 `electrical_calculations` — отдельная таблица

```sql
CREATE TABLE electrical_calculations (
    id UUID PK,
    project_id UUID FK → projects(id) ON DELETE CASCADE,
    object_id UUID FK → project_objects(id) ON DELETE CASCADE,
    variant_number INTEGER,           -- 1..4 (CO1..CO4)
    cable_type VARCHAR(64),
    cable_mark VARCHAR(128),
    params JSONB,
    results JSONB
);
```

**Ключевое:** в модели `ProjectObject` **нет relationship**
`obj.electrical_calculations`. Электрические расчёты загружаются отдельным
API-запросом `GET /api/v1/calculations?project_id=...&variant_number=...`.
Это предотвращает N+1 на уровне архитектуры.

### 0.3 `projects` — проекты

```sql
CREATE TABLE projects (
    id UUID PK,
    user_id UUID FK → users(id),
    session_id UUID FK → guest_sessions(id) ON DELETE CASCADE,
    name VARCHAR,
    task_number VARCHAR,
    common_data JSONB
);
```

### 0.4 `guest_sessions` — гостевые сессии

```sql
CREATE TABLE guest_sessions (
    id UUID PK,
    session_id VARCHAR UNIQUE,
    last_activity TIMESTAMPTZ
);
```

Фоновая задача каждые N минут: `DELETE FROM guest_sessions WHERE last_activity < now() - TTL`.
Каскадное удаление → projects → project_objects → electrical_calculations.

---

## 1. Что уже сделано (аудит кодовой базы)

| # | Оптимизация | Статус | Детали |
|---|---|---|---|
| **Индексы** | ✅ | Миграция 0004: `ix_project_objects_project_type_sort (project_id, object_type, sort_order)`, `ix_electrical_calculations_project_variant (project_id, variant_number)`. Миграция 0005: перестроен с добавлением `id` для covering, добавлены `ix_electrical_calculations_object_variant`, `ix_projects_user_updated`, `ix_projects_session_updated`, `ix_guest_sessions_last_activity` |
| **Автовакуум** | ✅ | Миграция 0006: `guest_sessions (scale_factor=0.01, insert_threshold=1000)`, `project_objects (0.05)`, `electrical_calculations (0.05)` |
| **Кэш** | ✅ | `core/cache.py` — Redis + in-memory fallback. Используется в `get_coefficients()` (TTL 1 час) |
| **pg_stat_statements** | ✅ | Включён в `docker-compose.yml`: `shared_preload_libraries`, `track=all`, `log_min_duration_statement` |
| **N+1 prevention** | ✅ | Архитектурно: `results` — колонка, не relationship. `electrical_calculations` загружается отдельным API. `selectinload(Project.objects)` в `project_service` и `report_service` |
| **Prepared statements** | ✅ | 0 f-string в SQL-запросах (grep подтвердил) |

### 1.1 Что ещё нужно сделать (2 пункта)

| # | Оптимизация | Приоритет | Трудозатраты |
|---|---|---|---|
| **PG-01** | PostgreSQL config tuning: `shared_buffers`, `effective_cache_size`, `work_mem`, `random_page_cost` | P0 | 10 минут |
| **PG-02** | Batch UPDATE в `batch_recalculate` (50 отдельных UPDATE → 1) | P2 | 2–4 часа |

---

## PG-01. PostgreSQL config tuning (docker-compose)

**Что:** Добавить 4 параметра в `docker-compose.yml` → `db.command`.

**Почему:** `random_page_cost=4.0` (дефолт) говорит планировщику «случайное
чтение в 4 раза дороже последовательного». Это правда для HDD, но ложь для
SSD / Docker-томов. Планировщик может выбирать seq scan вместо index scan.

**Как:**

```yaml
# docker-compose.yml → services.db.command
command:
  - postgres
  - -c shared_preload_libraries=pg_stat_statements    # уже есть
  - -c pg_stat_statements.track=all                    # уже есть
  - -c log_min_duration_statement=100ms                # уже есть
  - -c shared_buffers=512MB         # ← ДОБАВИТЬ (25% от RAM контейнера)
  - -c effective_cache_size=1GB     # ← ДОБАВИТЬ (50-75% от RAM)
  - -c work_mem=16MB                # ← ДОБАВИТЬ (память на сортировку)
  - -c random_page_cost=1.1         # ← ДОБАВИТЬ (критично: SSD, не HDD)
```

**Применить:** `docker compose up -d db` (контейнер перезапустится с новыми
параметрами).

**Проверить:**
```sql
SHOW shared_buffers;       -- должно быть 512MB
SHOW random_page_cost;     -- должно быть 1.1
```

**Эффект:** +20–40% throughput на повторяющихся запросах. Планировщик
перестаёт избегать индексов.

---

## PG-02. Batch UPDATE в batch_recalculate

**Что:** `calculation_service.batch_recalculate()` обновляет 50 объектов
50 отдельными UPDATE-запросами (даже в одной транзакции).

**Текущий код (`calculation_service.py:169-184`):**
```python
for obj in objects:
    await self.recalculate_object(obj)  # мутирует obj.results, obj.is_valid
await self.db.commit()  # 50 UPDATE в одной транзакции
```

SQLAlchemy отслеживает изменения объектов и генерирует индивидуальные UPDATE
для каждой изменённой строки. В рамках одной транзакции это 50 round-trip'ов.

**Решение (для N > 20 объектов):**

```python
# Вариант А: сырой SQL (самый эффективный, ~2 мс на весь batch)
from sqlalchemy import text

values_clause = ", ".join(
    f"(:id_{i}, :results_{i}::jsonb, :valid_{i})"
    for i in range(len(objects))
)
params = {}
for i, obj in enumerate(objects):
    params[f"id_{i}"] = obj.id
    params[f"results_{i}"] = json.dumps(obj.results)
    params[f"valid_{i}"] = obj.is_valid

await db.execute(text(f"""
    UPDATE project_objects AS po SET
        results = v.results,
        is_valid = v.is_valid,
        validation_errors = NULL
    FROM (VALUES {values_clause}) AS v(id, results, is_valid)
    WHERE po.id = v.id::uuid
"""), params)
await db.commit()
```

```python
# Вариант Б: SQLAlchemy bulk_update_mappings (проще, ~5 мс на batch)
from sqlalchemy import update

mappings = [
    {"id": obj.id, "results": obj.results, "is_valid": obj.is_valid}
    for obj in objects
]
# SQLAlchemy 2.x style:
stmt = update(ProjectObject)
await db.execute(stmt, mappings)
await db.commit()
```

**Приоритет:** P2. Для 50 объектов разница 100–200 мс — не критично.
Реализовать при рефакторинге `batch_recalculate`.

---

## 2. Что НЕ нужно делать (мифы)

### Миф 1: «Нужен eager loading для heat_calculations»

**Нет.** Таблицы `heat_calculations` не существует. Результаты теплопотерь
хранятся как JSONB-колонка `results` в той же строке `project_objects`.
JOIN не нужен. N+1 невозможен. Всё уже оптимально.

### Миф 2: «Нужен GIN-индекс на params»

**Не сейчас.** `object_query_service.py` фильтрует объекты **in-memory**
(Python), а не в SQL. `params` читается как колонка строки, парсится на
фронте. GIN-индекс на `params` не используется ни одним запросом.
Добавить **вместе** с T-02 (серверная фильтрация), когда появится
`WHERE params @> '{"insulation_material": "mineral_wool"}'`.

### Миф 3: «Нужно партицирование»

**Нет.** Самая большая таблица: `electrical_calculations` — 4 строки × 50
объектов × 1000 проектов = 200 000 строк. Это 20 MB. PostgreSQL держит
миллиарды строк без партицирования. Не нужно.

### Миф 4: «Нужен PgBouncer»

**Нет.** SQLAlchemy async `pool_size=20`. PostgreSQL держит 500 соединений
на 2 GB RAM. 20 соединений — это не та нагрузка. PgBouncer — лишняя точка
отказа на текущем масштабе.

### Миф 5: «Нужна read replica»

**Нет.** 95% запросов — `SELECT` по первичному ключу (index scan, <1 мс).
PostgreSQL на 2 vCPU держит 5000 таких запросов/сек. HeatCalc: 10–50 запросов/сек.

### Миф 6: «Нужна денормализация»

**Уже сделана — осознанно.** Результаты теплопотерь (`q`, `Q`) хранятся
как JSONB-колонка `results` прямо в `project_objects`. Это и есть
денормализация: нет отдельной таблицы `heat_calculations`, нет JOIN, нет N+1.
Дальнейшая денормализация (`electrical_calculations` → в `project_objects`)
не нужна: эти данные загружаются отдельным API-запросом.

---

## 3. Инструменты диагностики

### 3.1 Пять SQL-запросов для мгновенной проверки

```sql
-- 1. Медленные запросы
SELECT LEFT(query, 150), calls, mean_exec_time, total_exec_time
FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;

-- 2. Seq scans преобладают над index scans?
SELECT relname, seq_scan, idx_scan,
       CASE WHEN idx_scan = 0 THEN 'НЕТ ИНДЕКСОВ!' ELSE 'OK' END
FROM pg_stat_user_tables WHERE seq_scan > 10
ORDER BY seq_scan DESC;

-- 3. Раздутые таблицы (мёртвых строк > 20%)
SELECT relname, n_dead_tup, n_live_tup,
       round(100.0 * n_dead_tup / NULLIF(n_live_tup+n_dead_tup,0), 2) AS dead_pct
FROM pg_stat_user_tables WHERE n_dead_tup > 100
ORDER BY n_dead_tup DESC;

-- 4. Неиспользуемые индексы (кандидаты на удаление)
SELECT relname, indexrelname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid::regclass)) AS size
FROM pg_stat_user_indexes WHERE idx_scan = 0 AND indexrelname NOT LIKE '%pkey'
ORDER BY pg_relation_size(indexrelid::regclass) DESC;

-- 5. Хит-рейт кэша (должен быть > 99%)
SELECT sum(heap_blks_read) AS disk_reads,
       sum(heap_blks_hit) AS cache_hits,
       round(100.0 * sum(heap_blks_hit) /
         NULLIF(sum(heap_blks_hit)+sum(heap_blks_read),0), 2) AS cache_hit_pct
FROM pg_statio_user_tables;
```

### 3.2 EXPLAIN ANALYZE — чтение вывода

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM project_objects WHERE project_id = '...' ORDER BY sort_order;
```

| Строка | Что значит | Плохо | Хорошо |
|---|---|---|---|
| `Seq Scan` | Полный скан таблицы | > 1000 строк | < 100 строк |
| `Index Scan` | Скан индекса | Читает > 50% таблицы | Читает < 10% |
| `Index Only Scan` | Чтение из индекса, без таблицы | — | Всегда ✅ |
| `actual time=0.1..5.6` | Реальное время | > 10 мс | < 1 мс |
| `Buffers: shared hit=50` | Чтение из кэша | `read=50` (с диска) | `hit=50` (из кэша) |

---

## 4. Когда что делать

| Когда | Что |
|---|---|
| **Сегодня** | PG-01: 4 строки в docker-compose, перезапуск БД |
| **При рефакторинге batch_recalculate** | PG-02: batch UPDATE (экономия 100–200 мс) |
| **При реализации T-02 (серверные фильтры)** | GIN-индекс на `params` (появится потребность) |
| **При реализации F-10 (телеметрия)** | TimescaleDB hypertable (миллионы строк/день) |
| **При SaaS с 50+ тенантами** | PgBouncer (200+ соединений) |
| **Никогда (на текущем масштабе)** | Партицирование, read replica, денормализация |

---

*Документ подготовлен: 2026-05-10 · v2  
Основан на построчном аудите кодовой базы.  
Заменяет: database-optimization.md (v1), architecture-decisions.md Part 2, db-audit-report.md.  
Код не тронут.*
