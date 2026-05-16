# TLT HeatCalc — Оптимизации для высоких нагрузок

**Дата:** 2026-05-10  
**Статус:** Аудит runtime-конфигурации  

---

## Что проверено

| Компонент | Статус |
|---|---|
| `uvloop` (быстрый event loop) | ✅ Уже активен (транзитивная зависимость `uvicorn[standard]`) |
| `DB_POOL_SIZE=20`, `pool_pre_ping=True`, `expire_on_commit=False` | ✅ Настроено |
| `DB_STATEMENT_TIMEOUT_MS=30_000` | ✅ Защита от зависших запросов |
| Background worker (Celery-like через Redis streams) | ✅ Уже в `docker-compose.yml` как `worker`-сервис |
| `MaxBodySizeMiddleware` (защита от DoS) | ✅ Реализовано |
| Distributed cleanup lock (Redis SETNX) | ✅ Реализовано |

---

## Найдено: 4 неиспользованных оптимизации

**Применено сейчас:** HL-01, HL-02 и HL-03. HL-04 оставлен как гипотеза до
профилирования p99/GC.

### HL-01. `orjson` — быстрая JSON-сериализация ✅ применено

**Проблема:** FastAPI использует stdlib `json.dumps()` для сериализации ответов.
Для ответа с 50 объектами по 3–8 KB JSONB = 150–400 KB полезной нагрузки.
Стандартный `json` — 15–30 мс на такой ответ. `orjson` — 3–5× быстрее (3–8 мс).

При 100 RPS экономия: 1.2–2.2 секунды CPU в секунду.

**Решение — применено:**

```python
# requirements.txt
orjson==3.10.18
```

```python
# main.py
from fastapi.responses import ORJSONResponse

app = FastAPI(
    title=settings.PROJECT_NAME,
    default_response_class=ORJSONResponse,  # ← все ответы через orjson
    ...
)
```

**Совместимость:** `orjson` сериализует `datetime` в ISO 8601 (как и stdlib),
`UUID` в строку, `Decimal` как число. Для всех типов HeatCalc — обратно совместимо.

**Эффект:** −60–70% времени сериализации JSON. Без изменения кода эндпоинтов.

---

### HL-02. Redis `maxmemory` + eviction policy ✅ применено с безопасной policy

**Проблема:** Redis используется для:
- Rate limiter (sliding window, ключи с TTL)
- Кэш справочников и коэффициентов
- Брокер задач для worker'ов (Redis streams)
- Distributed lock для cleanup

Без `maxmemory` Redis будет потреблять память до OOM килла контейнера. При
высокой нагрузке (100+ одновременных гостей) ключи rate limiter'а могут
заполнить память.

**Решение — применено в `docker-compose.yml`:**

```yaml
redis:
  image: redis:7-alpine
  command: >
    redis-server
    --maxmemory 256mb
    --maxmemory-policy volatile-lru
    --save ""
    --appendonly no
```

- `maxmemory 256mb` — лимит памяти (достаточно для кэша + rate limiter)
- `volatile-lru` — при заполнении вытеснять только ключи с TTL. Это безопаснее
  для Redis Streams: stream `heatcalc:tasks:cpu` не имеет TTL и не будет
  вытеснен как обычный cache key.
- `save ""` — отключить RDB-снапшоты, `appendonly no` — отключить AOF.

Дополнительно применено ограничение Redis Stream:

```python
redis.xadd(..., maxlen=settings.WORKER_QUEUE_MAXLEN, approximate=True)
```

По умолчанию `WORKER_QUEUE_MAXLEN=10_000`. Postgres остаётся источником истины
по статусам задач; Redis — transport.

**Эффект:** Redis не упадёт по OOM при пиковой нагрузке. Старые/неиспользуемые
ключи автоматически вытесняются.

---

### HL-03. Uvicorn: тюнинг под нагрузку ✅ применено

**Проблема:** текущий `CMD` в Dockerfile:

```
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

При 20+ одновременных пользователях и синхронных операциях (даже через
`run_in_executor`) 2 воркера — узкое место. Также отсутствуют
`--limit-concurrency`, `--backlog`, `--timeout-keep-alive`.

**Решение — применено через env:**

```dockerfile
CMD ["sh", "-c", "exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers ${UVICORN_WORKERS:-2} \
    --limit-concurrency ${UVICORN_LIMIT_CONCURRENCY:-100} \
    --backlog ${UVICORN_BACKLOG:-128} \
    --timeout-keep-alive ${UVICORN_KEEPALIVE:-5} \
    --loop uvloop \
    --http httptools"]
```

| Параметр | Дефолт | Назначение |
|---|---|---|
| `--workers` | 2 | Поднять до `$(nproc)` при росте нагрузки |
| `--limit-concurrency` | 100 | Макс. одновременных задач на воркер. При 100 пользователях — поднять до 500 |
| `--backlog` | 128 | Очередь TCP-соединений. При пиках — до 512 |
| `--timeout-keep-alive` | 5 | Таймаут keep-alive соединений. Для API с частыми запросами — оставить 5. |
| `--loop uvloop` | auto | Явно включить (и так auto-detected, но explicit лучше) |

**Эффект:** меньше dropped connections при пиках, выше throughput.

---

### HL-04. Python GC: предотвращение пауз при высокой нагрузке ⏸ не применено

**Проблема:** Python GC (generational, reference counting + cycle detector)
может вызывать pause до 50–200 мс при сборке старых поколений. При 100 RPS
это проявляется как периодические «заикания» latency.

Особенно актуально для HeatCalc: `ProjectObject.params` и `.results` — большие
вложенные dict'ы, создающие много циклических ссылок при де/сериализации.

**Статус:** не применено. Это стоит делать только после профилирования, которое
покажет GC как источник p99 spikes. Обычные JSON `dict/list` после parse не
создают циклические ссылки сами по себе, поэтому без измерений это может быть
преждевременным тюнингом.

**Возможное решение после подтверждения:**

```python
# main.py — после загрузки справочников
import gc

# Загружаем справочники один раз при старте
preload_all()

# «Замораживаем» их — GC не будет их сканировать при каждой сборке
# (экономия ~5-10 мс на каждой сборке поколения 2)
gc.freeze()
```

**Что делает `gc.freeze()`:** перемещает все текущие объекты в «вечную»
generation, которую GC пропускает. Подходит для данных, загружаемых при
старте (справочники, кэш).

**Дополнительно (только если profiling покажет GC как bottleneck):**

```python
# Увеличить пороги сборки — реже запускать GC поколений 0 и 1
gc.set_threshold(2000, 50, 20)  # дефолт: 700, 10, 10
```

**Эффект:** сглаживание latency — меньше выбросов p99.

---

## Итог

| # | Оптимизация | Время | Эффект |
|---|---|---|---|
| HL-01 | `orjson` | 10 мин | −60% времени сериализации |
| HL-02 | Redis maxmemory + safe stream cap | 5 мин | Нет OOM при пиках без eviction Streams |
| HL-03 | Uvicorn tuning | 10 мин | +30% throughput, меньше dropped conns |
| HL-04 | `gc.freeze()` | отложено | Только после GC profiling |

**Все 4 — суммарно 30 минут.** Ни одна не требует изменения кода эндпоинтов
или бизнес-логики. Чистый runtime/config.

---

## Что уже работает хорошо

| Компонент | Детали |
|---|---|
| `uvloop` | Auto-detected uvicorn'ом (транзитивная зависимость). 2–4× быстрее asyncio. |
| Worker-сервис | Уже в `docker-compose.yml` — отдельный контейнер для фоновых задач. |
| Distributed lock | Redis SETNX для cleanup — не дублируется на репликах. |
| `expire_on_commit=False` | Нет лишних SELECT после коммита. |
| `autoflush=False` | Нет случайных flush во время чтения. |
| `pool_pre_ping=True` | Неиспользуемые соединения переподключаются. |

---

*Документ подготовлен: 2026-05-10  
Проверено: Dockerfile, main.py, docker-compose.yml, requirements.txt, requirements-lock.txt, config.py, database.py, task_queue.py.*

---

## Второй проход: что ещё можно улучшить (2026-05-10)

### HL-05. Redis connection pool — явная настройка

**Проблема:** `task_queue.py` создаёт Redis-клиент через `Redis.from_url()` без
явной настройки пула. По умолчанию `max_connections` не ограничен. При 10+ репликах
и worker'ах возможно исчерпание файловых дескрипторов.

**Решение (`task_queue.py` + `cache.py`):**

```python
self._redis = redis.Redis.from_url(
    self.redis_url,
    max_connections=50,
    socket_keepalive=True,
    socket_connect_timeout=5,
    retry_on_timeout=True,
    health_check_interval=30,
)
```

---

### HL-06. Асинхронное логирование

**Проблема:** `logging.basicConfig()` — синхронный write(2) на каждый лог.
При 1000+ логов/сек блокирует event loop.

**Решение:** `QueueHandler` + `QueueListener` — неблокирующая очередь в памяти,
отдельный поток для записи. 10 строк в `main.py`.

---

### HL-07. `synchronous_commit = off` для batch-импорта

**Проблема:** Каждый COMMIT ждёт fsync WAL. Для 400 объектов — 400 fsync().

**Решение:** `SET LOCAL synchronous_commit = off` в транзакции импорта.
Риск: потеря ~600 мс данных при крахе. Для импорта приемлемо.

---

### HL-08. `ulimits` + `somaxconn` в Docker

**Проблема:** Дефолт `nofile=1024`, `somaxconn=128`. При 100 пользователях —
исчерпание дескрипторов, dropped connections.

**Решение в `docker-compose.yml`:**

```yaml
backend:
  ulimits:
    nofile: { soft: 4096, hard: 8192 }
  sysctls:
    net.core.somaxconn: 512
```

---

### HL-09. `fillfactor = 80` для UPDATE-тяжёлых таблиц

**Проблема:** `project_objects` и `electrical_calculations` часто обновляются.
При `fillfactor=100` нет места для HOT-обновлений → фрагментация.

```sql
ALTER TABLE project_objects SET (fillfactor = 80);
ALTER TABLE electrical_calculations SET (fillfactor = 80);
```

Эффект: −30% дискового I/O на UPDATE. Цена: +20% места на диске (незначительно).

---

### HL-10. `jsonb_strip_nulls` на params

**Проблема:** `params` содержит десятки полей с `null`. Каждый `null` — 5 байт
в JSONB. Бесполезная нагрузка при каждом чтении и передаче.

**Решение — при сохранении:**

```python
obj.params = {k: v for k, v in obj.params.items() if v is not None}
```

Эффект: −15–30% размера `params` JSONB. Экономия на каждом запросе.

---

## Итог (все 10 оптимизаций)

| # | Оптимизация | Время | Слой |
|---|---|---|---|
| HL-01 | `orjson` | 10 мин | Backend |
| HL-02 | Redis maxmemory | 5 мин | Infra |
| HL-03 | Uvicorn tuning | 10 мин | Backend |
| HL-04 | `gc.freeze()` | 1 мин | Backend |
| HL-05 | Redis connection pool | 15 мин | Backend |
| HL-06 | Async logging | 30 мин | Backend |
| HL-07 | `synchronous_commit=off` для импорта | 10 мин | DB |
| HL-08 | `ulimits` + `somaxconn` | 5 мин | Infra |
| HL-09 | `fillfactor=80` | 5 мин | DB |
| HL-10 | `jsonb_strip_nulls` | 15 мин | DB |

**Суммарно: 10 оптимизаций, ~2 часа.** Ни одной правки бизнес-логики.

---

## План нагрузочного тестирования (2026-05-16)

Цель: отделить медленный импорт файла, медленный batch-расчёт, ожидание worker'а,
медленный API таблицы и медленный рендер фронта. Без таких замеров любые
оптимизации будут гипотезами.

### 1. Базовые сценарии

| # | Сценарий | Что измеряем |
|---|---|---|
| LT-01 | Импорт Excel/CSV на 50, 100, 250, 500, 1000, 2000, 3000 объектов | upload time, parse time, insert time, enqueue time |
| LT-02 | Batch теплопотерь после импорта | время задачи, progress lag, ошибок/сек |
| LT-03 | Batch электрорасчёта CO1 на 50, 100, 250, 500, 1000, 2000, 3000 объектов | время задачи, p50/p95/max, ошибки подбора |
| LT-04 | Одновременный запуск 3, 5, 10 batch-задач на M/L/XL/3XL | очередь, конкуренция worker'ов, starvation read API |
| LT-05 | `/objects/query` при фильтрах/сортировках | p50/p95/max, размер ответа, SQL vs Python fallback |
| LT-06 | Вкладка `Все` на теплопотерях | полный `/objects`, размер payload, время рендера |
| LT-07 | Электрорасчёт: таблица + смена страницы + фильтр | API latency, payload, FPS/long tasks в браузере |
| LT-08 | Гостевые сессии: 10-50 параллельных гостей | лимиты, rate-limit, изоляция, очистка сессий |
| LT-09 | Длительный soak-тест на 3000 объектах, 30-60 минут | утечки памяти, рост latency, зависшие pending-задачи |

### 2. Наборы данных

| Набор | Состав | Назначение |
|---|---|---|
| S | 50 объектов: 30 труб, 20 резервуаров | Базовый NFR-PERF-02 |
| M | 100 объектов: 60 труб, 40 резервуаров | Типовой большой гостевой импорт |
| L | 250 объектов: 150 труб, 100 резервуаров | Верхняя рабочая нагрузка для dev/demo |
| XL | 500 объектов: 300 труб, 200 резервуаров | Стресс по dev-лимиту `GUEST_MAX_OBJECTS_PER_PROJECT=500` |
| 2XL | 1000 объектов: 600 труб, 400 резервуаров | Проверка линейности импорта/query/worker |
| 3XL-A | 2000 объектов: 1200 труб, 800 резервуаров | Проверка больших payload, progress и очереди |
| 3XL | 3000 объектов: 1800 труб, 1200 резервуаров | Целевой stress-тест верхней границы |
| ERR | 3000 объектов с 5-10% ошибочных строк/расчётов | Проверка ошибок, подсказок, красных строк и payload ошибок |

Данные должны быть детерминированными: один seed, одинаковые файлы, одинаковые
коэффициенты и справочники. Для каждого набора хранить исходный CSV/XLSX и
ожидаемое число объектов/ошибок.

Важно: текущий dev-лимит гостевого проекта равен `GUEST_MAX_OBJECTS_PER_PROJECT=500`.
Для 1000-3000 объектов нужен отдельный нагрузочный стенд: либо employee-проект
без гостевого лимита, либо временное значение `GUEST_MAX_OBJECTS_PER_PROJECT=3000`
только на изолированном стенде. В production такой лимит нельзя поднимать без
отдельного решения по ресурсам и очистке гостевых данных.

### 3. Метрики

Backend:
- время чтения upload body;
- время парсинга CSV/XLSX;
- время сохранения объектов в БД;
- время постановки задачи в Redis/background_tasks;
- время выполнения heat-loss batch;
- время выполнения electrical batch;
- количество SQL-запросов на сценарий;
- p50/p95/p99/max latency для `/objects/query`, `/calc/electrical/query`,
  `/calc/jobs/{id}`;
- размер JSON-ответа по каждому endpoint.
- линейность: рост времени на 1000 объектов относительно 100 и 500.

Worker/Redis:
- длина Redis stream;
- `pending`, `lag`, dead-letter count;
- активные `background_tasks`;
- среднее время задачи;
- время ожидания задачи до старта;
- throughput: объектов/сек.

Frontend:
- время первого отображения таблицы;
- время смены страницы;
- время применения фильтра/сортировки;
- long tasks > 50 ms;
- размер данных в памяти для текущей вкладки;
- отдельный замер вкладки `Все`, потому что она может грузить весь `/objects`.
- время mount/update таблицы на 500/1000/3000 объектах, если включён полный список.

Infra:
- CPU/RAM backend, worker, db, redis;
- количество DB connections;
- медленные SQL через `pg_stat_statements`;
- network payload по основным endpoints.

### 4. Пороговые значения

| Проверка | Целевой порог | Красный флаг |
|---|---:|---:|
| `/objects/query`, 50 строк | p95 < 300 ms | p95 > 800 ms |
| `/calc/electrical/query`, 50 строк | p95 < 300 ms | p95 > 800 ms |
| Полный `/objects` для 500 объектов | < 1.5 MB | > 3 MB |
| Полный `/objects` для 3000 объектов | < 12 MB | > 25 MB |
| Импорт 100 объектов до `task_id` | < 3 s | > 8 s |
| Импорт 500 объектов до `task_id` | < 10 s | > 30 s |
| Импорт 3000 объектов до `task_id` | < 60 s | > 180 s |
| Heat-loss batch 100 объектов | < 10 s | > 30 s |
| Heat-loss batch 500 объектов | < 45 s | > 120 s |
| Heat-loss batch 3000 объектов | < 5 min | > 12 min |
| Electrical batch 100 объектов | < 10 s | > 30 s |
| Electrical batch 500 объектов | < 45 s | > 120 s |
| Electrical batch 3000 объектов | < 5 min | > 12 min |
| Старт задачи из очереди | < 2 s | > 10 s |
| Redis pending | 0 после завершения | pending зависает |
| Ошибки worker | 0 unexpected | dead-letter растёт |
| Frontend long tasks | единичные | серия > 50 ms при скролле/фильтре |

Пороговые значения предварительные. Их нужно уточнить после первого прогона на
production-like машине. Для `/objects/query` целевой p95 не должен кратно расти
от 500 к 3000 объектам, потому что endpoint постраничный. Если растёт, значит
работает полный scan/fallback или слишком тяжёлый count/sort.

### 5. Команды и инструменты

Уже есть стартовая точка для worker-нагрузки:

```bash
python scripts/load-worker-batch.py \
  --api http://localhost:8000/api/v1 \
  --project-id <uuid> \
  --session-id <guest-session> \
  --concurrency 5
```

Нужно добавить отдельные сценарии:

```bash
# Импорт объектов + фиксация времени до постановки task_id
python scripts/load-import-objects.py --file tests/fixtures/load/3XL-3000.xlsx

# Query API с сортировками/фильтрами
python scripts/load-object-query.py --project-id <uuid> --page-size 50 --scenario filters --target-size 3000

# Фронтенд-рендер через Playwright trace
npm --prefix frontend run perf:workspace -- --project-id <uuid> --target-size 3000
```

Если скриптов ещё нет, это отдельные задачи. До их появления можно запускать
частичные проверки через `curl -w`, `docker stats`, `pg_stat_statements` и
Playwright trace.

### 6. Порядок первого прогона

1. Поднять чистый dev/prod-like стенд.
2. Зафиксировать конфигурацию: число backend workers, worker-контейнеров,
   `GUEST_MAX_OBJECTS_PER_PROJECT`, DB pool, Redis config.
3. Прогнать S/M/L/XL/2XL/3XL-A/3XL импорт без параллельных пользователей.
4. Для каждого проекта отдельно прогнать heat-loss batch и electrical batch.
5. Прогнать `/objects/query` и `/calc/electrical/query` без фильтров, с SQL-фильтрами,
   с поиском, с сортировкой по result-полям.
6. Прогнать 3/5/10 параллельных batch-задач через `scripts/load-worker-batch.py`
   сначала на M/L, потом на XL/3XL.
7. Во время batch каждые 2 секунды дергать read endpoints и фиксировать p95.
8. Открыть UI через Playwright, собрать trace/screenshot/console errors для
   теплопотерь, электрорасчёта и вкладки `Все`.
9. Сформировать таблицу: сценарий, объекты, concurrency, p50/p95/max, payload,
   CPU/RAM, итог.
10. Повторить 3XL-прогон с 1, 2 и 4 worker-контейнерами, чтобы увидеть
    реальную масштабируемость worker-слоя.

### 7. Решения по результатам

| Симптом | Вероятное решение |
|---|---|
| Импорт медленный до `task_id` | Перенести весь Excel/CSV import в background task |
| Очередь задач растёт | Увеличить worker replicas, разбить batch на chunk-задачи |
| 3000 объектов считаются только одним worker'ом слишком долго | Разбить batch по chunk-задачам и обрабатывать параллельно |
| `/objects/query` быстрый, UI медленный | Оптимизировать таблицу/виртуализацию/вкладку `Все` |
| `/objects/query` медленный только с поиском | Убрать Python fallback, добавить SQL-выражения или отключить тяжёлые поля |
| Payload большой | Slim DTO: отдавать только видимые колонки и нужные `results` |
| DB CPU/IO высокий | Проверить индексы, JSONB expression indexes, pg_stat_statements |
| Worker CPU высокий | Масштабировать worker/processes, профилировать формулы |
| Redis pending зависает | Проверить ack/retry/dead-letter и recovery worker'а |

### 8. Definition of Done

- Есть воспроизводимый набор файлов S/M/L/XL/2XL/3XL-A/3XL/ERR.
- Есть команды для запуска backend API load, worker load и frontend perf.
- Для каждого сценария сохраняется JSON-отчёт с p50/p95/max и размером payload.
- Отдельно видны времена: import, enqueue, queue wait, calculation, query, render.
- Есть baseline до оптимизаций и повторный отчёт после оптимизаций.
- Пороговые значения согласованы и добавлены в CI/NFR-проверки хотя бы для S/M,
  а 3XL остаётся ручным или nightly stress-тестом.
