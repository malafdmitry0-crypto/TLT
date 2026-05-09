# TLT HeatCalc — Значительное ускорение базы данных

**Дата:** 2026-05-10  
**Статус:** Практическое руководство · Этап 0  
**Цель:** Снизить время БД-запросов в 5–20× с помощью целенаправленных,
измеряемых оптимизаций  

---

## 0. Откуда берётся медленность БД

Время ответа = **round-trip latency × количество запросов + execution time**.

| Фактор | Типичное значение для HeatCalc | Вклад |
|---|---|---|
| Round-trip (сеть + парсинг) | 0.5–2 мс на запрос | 251 запрос × 1 мс = **251 мс** ← главный убийца |
| Execution time (БД) | 0.1–5 мс на запрос | 251 × 0.5 мс = 125 мс |
| Передача данных | ~0.5 мс на 100 KB | 250 KB = 1 мс |

**Главный враг — не медленные запросы, а их количество.**
251 запрос по 1 мс = 251 мс. 3 запроса по 3 мс = 9 мс.
Ускорение: **28×** без изменения ни одного индекса, только за счёт сокращения
round-trip'ов.

---

## DB-01. Уничтожение N+1: eager loading ВЕЗДЕ

**Приоритет:** P0 — самая высокоэффективная оптимизация  
**Трудозатраты:** 1–2 дня  
**Ожидаемый эффект:** страница объектов: 251 запрос → 3 запроса (1200 мс → 180 мс)

### Где искать

Любой `for obj in objects: obj.relation` в коде — это N+1. Найти все:

```bash
grep -rn "for.*in.*objects" backend/app/services/
grep -rn "\.heat_calculation\|\.electrical_calculation\|\.specification" backend/app/services/
```

### Как чинить

**objects_service.py — загрузка списка объектов:**

```python
# ❌ Было: 1 + 50 + 50×4 = 251 запрос
objects = await db.execute(select(ProjectObject).where(...))
for obj in objects.scalars():
    heat = obj.heat_calculation          # +1 запрос
    elecs = obj.electrical_calculations   # +1..4 запроса

# ✅ Стало: 3 запроса
from sqlalchemy.orm import selectinload

stmt = (
    select(ProjectObject)
    .where(ProjectObject.project_id == project_id)
    .options(
        selectinload(ProjectObject.heat_calculation),
        selectinload(ProjectObject.electrical_calculations),
    )
    .order_by(ProjectObject.sort_order)
)
objects = (await db.execute(stmt)).scalars().unique().all()
# heat_calc и elec_calc уже загружены в память — obj.heat_calculation не делает запрос
```

**Почему `selectinload`, а не `joinedload`:**

- `selectinload` — отдельный `SELECT ... WHERE id IN (...)` для каждой relations.
  Для 50 объектов: 3 запроса. Нет дублирования родительских строк.
- `joinedload` — LEFT JOIN. Для 50 объектов × 4 elec_calcs = 200 строк в
  результате. SQLAlchemy дедуплицирует через `.unique()`, но оверхед есть.
  Для 1:1 (heat_calc) — ок. Для 1:N (elec_calcs) — selectinload лучше.

### Проверка

Включи `echo=True` в engine, открой страницу объектов в браузере. В логах
должно быть ровно 3 SQL-запроса (objects, heat_calcs, elec_calcs), а не 251.

---

## DB-02. Стратегические индексы — не «на всё», а точечно

**Приоритет:** P0  
**Трудозатраты:** 2–4 часа  
**Ожидаемый эффект:** `WHERE project_id = ...` — seq scan → index scan (O(log n) вместо O(n))

### Минимальный набор

```sql
-- 1. Основной запрос: список объектов проекта, сортировка по sort_order
CREATE INDEX CONCURRENTLY idx_objects_project_sort
    ON project_objects (project_id, sort_order);
-- Покрывает: WHERE project_id = ? ORDER BY sort_order — index-only scan

-- 2. Загрузка heat_calc по object_id (selectinload)
CREATE INDEX CONCURRENTLY idx_heat_calc_object
    ON heat_calculations (object_id);

-- 3. Загрузка elec_calcs по object_id + variant_number (selectinload)
CREATE INDEX CONCURRENTLY idx_elec_calc_object_co
    ON electrical_calculations (object_id, variant_number);

-- 4. Список проектов пользователя, сортировка по дате изменения
CREATE INDEX CONCURRENTLY idx_projects_owner_updated
    ON projects (owner_id, updated_at DESC);

-- 5. Очистка гостевых сессий (фоновая задача каждые 10 минут)
CREATE INDEX CONCURRENTLY idx_guest_sessions_activity
    ON guest_sessions (last_activity)
    WHERE last_activity IS NOT NULL;
```

**Почему `CONCURRENTLY`:** не блокирует таблицу на запись во время создания
индекса. Для production — обязательно. Занимает в 2–3 раза дольше, но без
простоя.

### Составные индексы: порядок колонок имеет значение

```sql
-- ✅ Правильно: project_id первый → индекс используется для WHERE project_id = ?
CREATE INDEX ON project_objects (project_id, sort_order);

-- ❌ Бесполезно: sort_order первый → индекс НЕ используется для WHERE project_id = ?
CREATE INDEX ON project_objects (sort_order, project_id);
```

Правило: **колонки из WHERE первыми, колонки из ORDER BY следующими.**

### Покрывающие индексы (covering indexes) — для самых горячих запросов

Если запрос читает только колонки, которые есть в индексе — PostgreSQL делает
index-only scan (не заглядывает в таблицу вообще, читает прямо из индекса):

```sql
-- Запрос: SELECT id, sort_order, params->>'name' FROM project_objects WHERE project_id = ?
-- Включаем читаемые колонки в индекс:
CREATE INDEX CONCURRENTLY idx_objects_project_covering
    ON project_objects (project_id, sort_order)
    INCLUDE (id, params);
-- Теперь index-only scan — не нужно ходить в таблицу за id и params
```

### Как проверить, что индексы используются

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM project_objects WHERE project_id = '...' ORDER BY sort_order;
```

В выводе должно быть `Index Scan using idx_objects_project_sort`, а не
`Seq Scan`. Если Seq Scan — индекс не создан или не подходит под запрос.

---

## DB-03. JSONB: GIN-индексы и извлечение горячих полей

**Приоритет:** P1 — делать если pg_stat_statements показывает JSONB-запросы  
**Трудозатраты:** 2–4 часа  
**Ожидаемый эффект:** фильтрация по JSONB-полям: seq scan (50–200 мс) → index scan (< 1 мс)

### Проблема

`params` и `results` — JSONB. Если есть запросы:
```sql
SELECT * FROM project_objects WHERE params->>'insulation_material' = 'mineral_wool';
```
Без индекса PostgreSQL сканирует всю таблицу, разбирая JSONB для каждой строки.

### Решение: GIN-индекс

```sql
-- Универсальный GIN для операторов @> (contains), ? (key exists)
CREATE INDEX CONCURRENTLY idx_objects_params_gin
    ON project_objects USING GIN (params jsonb_path_ops);
```

Теперь `WHERE params @> '{"insulation_material": "mineral_wool"}'` использует индекс.

### Альтернатива: extracted column (если поле фильтруется постоянно)

```sql
-- Добавить генерируемую колонку
ALTER TABLE project_objects
ADD COLUMN insulation_material TEXT
GENERATED ALWAYS AS (params->>'insulation_material') STORED;

-- Индекс по ней (B-tree, меньше и быстрее GIN)
CREATE INDEX idx_objects_ins_mat ON project_objects (insulation_material);
```

Плюс: B-tree быстрее GIN для equality-поиска. Минус: занимает место в таблице.
Делать только для полей, по которым реально фильтруют (pg_stat_statements
покажет).

### Кеш вычисляемых значений

Если `q`, `Q`, `cable_mark` хранятся в JSONB и читаются при каждом открытии
таблицы — вынести в отдельные колонки:

```sql
ALTER TABLE heat_calculations
ADD COLUMN q_per_meter DOUBLE PRECISION
GENERATED ALWAYS AS ((results->>'heat_loss_per_meter')::float) STORED;

ALTER TABLE electrical_calculations
ADD COLUMN cable_mark TEXT
GENERATED ALWAYS AS (results->>'selected_cable') STORED;
```

SQLAlchemy читает колонку `q_per_meter` в 3–5× быстрее, чем
`results->>'heat_loss_per_meter'` (не нужно парсить JSONB).

---

## DB-04. PostgreSQL: тюнинг конфигурации под нагрузку HeatCalc

**Приоритет:** P1  
**Трудозатраты:** 2–4 часа (настройка + тестирование)  
**Ожидаемый эффект:** +30–50% throughput, −20–40% latency на повторных запросах

### Конфигурация (postgresql.conf или ALTER SYSTEM)

```ini
# === Память ===
# 25% от RAM контейнера (для 2 GB контейнера = 512 MB)
shared_buffers = 512MB

# Кэш страниц ОС (эффективный размер для планировщика запросов)
# 50–75% от RAM (для 2 GB = 1 GB)
effective_cache_size = 1GB

# Память на операцию (сортировка, хэш-таблица, merge join)
# Для HeatCalc (маленькие запросы) — умеренно
work_mem = 16MB

# Память для maintenance-операций (VACUUM, CREATE INDEX)
maintenance_work_mem = 128MB

# === Планировщик ===
# Выключаем seq scan для маленьких таблиц в пользу index scan
random_page_cost = 1.1  # дефолт 4.0 — для HDD; SSD → 1.1
effective_io_concurrency = 200  # для SSD

# === WAL (Write-Ahead Log) ===
# Для HeatCalc (мало write-нагрузки, важнее read) — умеренно
wal_buffers = 16MB
min_wal_size = 512MB
max_wal_size = 2GB

# === Автовакуум ===
# Агрессивнее на таблицах с частыми UPDATE/DELETE (guest_sessions)
autovacuum_max_workers = 4
autovacuum_naptime = 30s
autovacuum_vacuum_scale_factor = 0.05   # вакуумить при 5% изменений (дефолт 20%)
autovacuum_vacuum_cost_limit = 2000     # больше I/O на вакуум (дефолт 200)
```

### Применить

```sql
-- Через ALTER SYSTEM (переживает перезапуск контейнера)
ALTER SYSTEM SET shared_buffers = '512MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET random_page_cost = 1.1;

-- Перезагрузить конфигурацию без перезапуска БД
SELECT pg_reload_conf();

-- Проверить
SELECT name, setting FROM pg_settings
WHERE name IN ('shared_buffers', 'effective_cache_size', 'work_mem', 'random_page_cost');
```

### Настройка для Docker

Если PostgreSQL в Docker-контейнере, проще через `command` в docker-compose:

```yaml
db:
  image: postgres:16
  command:
    - "postgres"
    - "-c"
    - "shared_buffers=512MB"
    - "-c"
    - "effective_cache_size=1GB"
    - "-c"
    - "work_mem=16MB"
    - "-c"
    - "random_page_cost=1.1"
```

---

## DB-05. Пакетные операции: сокращение round-trip'ов

**Приоритет:** P1  
**Трудозатраты:** 1–2 дня  
**Ожидаемый эффект:** Массовое обновление 50 объектов: 50 запросов → 1 запрос (500 мс → 10 мс)

### Проблема

Сохранение 50 объектов после batch-расчёта — 50 отдельных UPDATE + 50 INSERT
(для результатов). 100 round-trip'ов × 1 мс = 100 мс оверхеда.

### Решение: batch INSERT/UPDATE

```python
# ❌ Было: 50 + 200 = 250 отдельных запросов
for obj in objects:
    obj.params = new_params
    db.add(obj)
for calc in calculations:
    db.add(calc)
await db.commit()  # 250 запросов в одной транзакции — но всё ещё 250 round-trip'ов

# ✅ Стало: 2 запроса (1 UPDATE + 1 INSERT ... ON CONFLICT)
from sqlalchemy.dialects.postgresql import insert as pg_insert

# Массовый upsert heat_calculations
stmt = pg_insert(HeatCalculation).values([{
    "object_id": r["object_id"],
    "results": r["results"],
    "updated_at": now,
} for r in batch_results])

stmt = stmt.on_conflict_do_update(
    index_elements=["object_id"],
    set_={"results": stmt.excluded.results, "updated_at": stmt.excluded.updated_at}
)
await db.execute(stmt)
await db.commit()
# 1 запрос вместо 50
```

### Bulk UPDATE через VALUES

```sql
-- Один запрос для обновления N объектов
UPDATE project_objects AS po
SET params = v.new_params
FROM (
    VALUES
        ('id-1', '{"insulation_thickness": 0.06}'::jsonb),
        ('id-2', '{"insulation_thickness": 0.08}'::jsonb),
        -- ... N строк
) AS v(id, new_params)
WHERE po.id = v.id::uuid;
```

SQLAlchemy пока не поддерживает такой UPDATE из коробки — сырой SQL через
`db.execute(text(...))`.

---

## DB-06. Материализованные представления для отчётов

**Приоритет:** P2 — при медленных отчётах  
**Трудозатраты:** 2–4 часа  
**Ожидаемый эффект:** Отчёт «Сводка по проекту»: 500 мс → 5 мс

### Проблема

Страница «Отчёт» делает агрегатный запрос: суммарная длина кабеля по маркам,
суммарная мощность, количество объектов по типам. JOIN 4 таблиц + GROUP BY +
SUM. При 50 объектах — 100–500 мс. При каждом открытии отчёта.

### Решение

```sql
CREATE MATERIALIZED VIEW mv_project_summary AS
SELECT
    po.project_id,
    ec.results->>'selected_cable' AS cable_mark,
    COUNT(*) AS object_count,
    SUM((ec.results->>'cable_length')::float) AS total_cable_length,
    SUM((ec.results->>'total_power')::float) AS total_power
FROM project_objects po
JOIN electrical_calculations ec ON ec.object_id = po.id
WHERE ec.variant_number = 1  -- активный CO
GROUP BY po.project_id, ec.results->>'selected_cable';

-- Индекс для быстрого поиска
CREATE UNIQUE INDEX idx_mv_summary_project_cable
    ON mv_project_summary (project_id, cable_mark);
```

Обновлять при изменении данных проекта:

```python
# После batch-расчёта:
await db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_summary"))
```

**`CONCURRENTLY`** — не блокирует чтение во время обновления. Требует уникальный индекс.

---

## DB-07. Prepared Statements — включены по умолчанию, но проверь

**Приоритет:** P1 — бесплатно, нужно только проверить  
**Трудозатраты:** 15 минут  
**Ожидаемый эффект:** −30% времени планирования для повторяющихся запросов

SQLAlchemy + asyncpg по умолчанию используют prepared statements (кэширование
плана запроса на стороне PostgreSQL). Но есть нюансы:

### Что ломает prepared statement cache

```python
# ❌ Разные тексты запроса — разные prepared statements (не кешируются)
await db.execute(text(f"SELECT * FROM projects WHERE id = '{id}'"))  # NEVER DO THIS
await db.execute(text(f"SELECT * FROM projects WHERE id = '{id2}'"))

# ✅ Параметризованный запрос — один prepared statement
stmt = text("SELECT * FROM projects WHERE id = :id")
await db.execute(stmt, {"id": id1})
await db.execute(stmt, {"id": id2})  # использует кэшированный план
```

SQLAlchemy ORM (`.where(Project.id == id)`) делает параметризацию автоматически.
Но если где-то используется `text()` с f-string — это убивает prepared statement
кэш **и** открывает SQL-инъекцию.

Найти все f-string в SQL:

```bash
grep -rn "text(f" backend/app/
```

Если есть — переписать на параметризованные.

---

## DB-08. Борьба с раздуванием (bloat): агрессивный автовакуум

**Приоритет:** P1 — при активной гостевой нагрузке  
**Трудозатраты:** 30 минут  
**Ожидаемый эффект:** Таблицы не раздуваются → индексные сканы быстрее, дискового места меньше

### Диагностика

```sql
-- Какие таблицы раздуты?
SELECT
    relname,
    n_live_tup,
    n_dead_tup,
    round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE n_dead_tup > 100
ORDER BY n_dead_tup DESC;
```

Если `dead_pct > 20%` — таблица раздута, индексы неэффективны.

### Решение

**Для guest_sessions (частые DELETE каскадом):**

```sql
ALTER TABLE guest_sessions SET (
    autovacuum_vacuum_scale_factor = 0.01,   -- вакуумить уже при 1% мёртвых строк
    autovacuum_vacuum_cost_limit = 2000,
    autovacuum_vacuum_insert_threshold = 1000  -- вакуумить после 1000 insert'ов
);
```

**Для project_objects (частые UPDATE params):**

```sql
ALTER TABLE project_objects SET (
    autovacuum_vacuum_scale_factor = 0.05
);
```

### Ручной VACUUM (если автовакуум не справляется)

```sql
-- Обычный вакуум (не блокирует, можно в любое время)
VACUUM (VERBOSE, ANALYZE) project_objects;

-- Полный вакуум (блокирует таблицу! Только в maintenance-окно)
VACUUM FULL project_objects;  -- перезаписывает таблицу, возвращает место ОС
```

---

## DB-09. EXPLAIN ANALYZE — главный инструмент

**Приоритет:** P0 — перед ЛЮБОЙ оптимизацией  
**Трудозатраты:** 30 минут на изучение  
**Ожидаемый эффект:** Понимание, что именно тормозит, вместо догадок

### Как читать

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM project_objects
WHERE project_id = '018f9c8a-...'
ORDER BY sort_order;
```

Ключевые слова в выводе:

| Строка | Значение | Плохо | Хорошо |
|---|---|---|---|
| `Seq Scan` | Последовательное сканирование всей таблицы | На таблице > 1000 строк | На таблице < 100 строк |
| `Index Scan` | Сканирование индекса | Если читает > 50% таблицы | Если читает < 10% таблицы |
| `Index Only Scan` | Чтение прямо из индекса, без захода в таблицу | — | Всегда хорошо |
| `Nested Loop` | Вложенный цикл (JOIN) | Для больших таблиц | Для маленьких таблиц |
| `Hash Join` | Хэш-соединение | Если нет индекса | Для больших таблиц |
| `actual time=0.123..5.678` | Реальное время в мс | `..5.678` — 5.6 мс | `..0.456` — <1 мс |
| `Buffers: shared hit=...` | Чтение из кэша (hit) vs диска (read) | `read=500` — 500 страниц с диска | `hit=500` — всё из кэша |
| `rows=251` | Количество возвращённых строк | 251 строк для 50 объектов = N+1 | 50 строк |

### Автоматизация для HeatCalc

Собрать все медленные запросы и EXPLAIN их:

```sql
-- Взять топ-5 запросов из pg_stat_statements
SELECT queryid, LEFT(query, 200), calls, mean_exec_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 5;

-- Для каждого queryid:
EXPLAIN (ANALYZE, BUFFERS)
<вставить запрос с реальными параметрами>;
```

---

## DB-10. Сводный план: что делать и в каком порядке

| # | Оптимизация | Ускорение | Время | Риск |
|---|---|---|---|---|
| **1** | N+1 → selectinload | **20–30×** | 1–2 дня | Низкий |
| **2** | EXPLAIN ANALYZE топ-5 запросов | Диагностика | 30 мин | Нет |
| **3** | Индексы (FK + составные) | **3–10×** | 2–4 часа | Низкий (CREATE CONCURRENTLY) |
| **4** | Prepared statements: убрать f-string в SQL | **1.3×** | 15 мин | Нет |
| **5** | t_conf: shared_buffers, work_mem, random_page_cost | **1.3–2×** | 2 часа | Средний (тестировать) |
| **6** | Пакетные INSERT/UPDATE | **5–10×** (для batch-операций) | 1–2 дня | Средний |
| **7** | GIN-индекс на params (если нужен) | **10–50×** (для JSONB-фильтров) | 1 час | Низкий |
| **8** | Extracted columns для горячих JSONB-полей | **3–5×** | 2 часа | Низкий |
| **9** | Автовакуум для guest_sessions | Стабильность | 30 мин | Низкий |
| **10** | Материализованные представления для отчётов | **10–50×** | 2–4 часа | Низкий |

**Первые 4 оптимизации = 2–3 дня работы = ускорение БД-части в 30–50×.**

### Как измерить результат

До и после каждого изменения:

```bash
# Включить логирование долгих запросов
ALTER SYSTEM SET log_min_duration_statement = 100;  # логировать > 100 мс
SELECT pg_reload_conf();

# После оптимизаций — проверить, исчезли ли медленные запросы
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 50
ORDER BY mean_exec_time DESC;

# Сбросить статистику, чтобы увидеть «чистую» картину после оптимизаций
SELECT pg_stat_statements_reset();
```

---

## Шпаргалка: 5 SQL-запросов для мгновенной диагностики

```sql
-- 1. Топ-10 медленных запросов
SELECT LEFT(query, 150), calls, mean_exec_time, total_exec_time
FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;

-- 2. Таблицы без индексов (seq scan преобладает)
SELECT relname, seq_scan, idx_scan,
       CASE WHEN idx_scan = 0 THEN 'НЕТ ИНДЕКСОВ!' ELSE 'OK' END
FROM pg_stat_user_tables WHERE seq_scan > 10
ORDER BY seq_scan DESC;

-- 3. Раздутые таблицы
SELECT relname, n_dead_tup, n_live_tup,
       round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
FROM pg_stat_user_tables WHERE n_dead_tup > 100
ORDER BY n_dead_tup DESC;

-- 4. Неиспользуемые индексы (кандидаты на удаление)
SELECT relname, indexrelname, idx_scan
FROM pg_stat_user_indexes WHERE idx_scan = 0 AND indexrelname NOT LIKE '%pkey'
ORDER BY pg_relation_size(indexrelid::regclass) DESC;

-- 5. Хит-рейт кэша (должен быть > 99%)
SELECT sum(heap_blks_read) AS disk_reads,
       sum(heap_blks_hit) AS cache_hits,
       round(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS cache_hit_pct
FROM pg_statio_user_tables;
```

---

*Документ подготовлен: 2026-05-10  
Первые 4 оптимизации ускорят БД в 30–50 раз за 2–3 дня.  
Код не тронут.*
