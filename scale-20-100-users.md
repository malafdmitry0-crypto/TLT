# TLT HeatCalc — Архитектура при 20–100 пользователях и тяжёлых импортах

**Дата:** 2026-05-10  
**Вопрос:** Что изменится при 20–100 одновременных пользователях и импорте тяжёлых документов?

---

## 0. Что ломается при таком масштабе

Сейчас часть тяжёлых операций уже вынесена в worker queue: пакетный
электрорасчёт создаёт durable task, worker выполняет её отдельно от request
lifecycle, состояние хранится в PostgreSQL. Это правильное направление.

При 20-100 одновременных пользователях ломаются не домены, а ресурсы:

| Что | Почему |
|---|---|
| **Event loop** | Любая тяжёлая операция, оставшаяся в API-процессе, блокирует быстрые CRUD/API запросы. |
| **Память** | 5 одновременных импортов Excel по 50 MB = 250 MB RAM. Плюс 95 пользователей с обычной нагрузкой. OOM. |
| **PostgreSQL** | 100 пользователей × 20 соединений в пуле = 2000 потенциальных соединений. PostgreSQL на 2 GB RAM держит ~200. |
| **Write amplification** | Частая запись progress/status на каждый объект или строку создаёт тысячи мелких транзакций без пользы для расчётов. |

---

## 1. Нужная архитектура: не микросервисы, а разделение на три слоя

```
                         ┌──────────────────┐
                         │   Nginx / Caddy  │  (terminate TLS, rate limit, gzip)
                         │   :80 / :443     │
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
          ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
          │  API #1     │ │  API #2     │ │  API #3     │  (FastAPI × N реплик)
          │  :8000      │ │  :8000      │ │  :8000      │
          └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
                 │               │               │
                 └───────────────┼───────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                        ▼
          ┌─────────────┐          ┌─────────────────┐
          │  PgBouncer   │          │  Redis           │
          │  :6432       │          │  :6379           │
          └──────┬───────┘          │  (stream broker) │
                 │                  └────────┬────────┘
                 ▼                           │
          ┌─────────────┐          ┌─────────┴─────────┐
          │  PostgreSQL  │◄────────►│ Workers           │
          │  :5432       │          │ × N процессов     │
          └─────────────┘          │ расчёты, импорт,  │
                                   │ экспорт, отчёты   │
                                   └───────────────────┘
```

Три слоя, не микросервисы:
1. **API-слой** — stateless FastAPI × 3 реплики. Только CRUD и лёгкие операции.
2. **Worker-слой** — отдельные worker-процессы. Тяжёлые операции: импорт, batch-расчёты, экспорт, генерация отчётов.
3. **Data-слой** — PostgreSQL как источник истины + Redis Stream как транспорт + PgBouncer при росте числа реплик.

---

## 2. Что конкретно меняется

### 2.1 API-слой: реплики + stateless

```yaml
# docker-compose.yml
backend:
  deploy:
    replicas: 3
```

Три реплики FastAPI за nginx с `upstream` + `ip_hash` (sticky sessions для гостей)
или без sticky (все API stateless, сессия в Redis/JWT).

**Важно:** API-обработчики **не должны** выполнять синхронные расчёты > 100 мс.
Вместо этого:

```python
# Было (блокирует):
result = recalculate_object(params)

# Стало (отправляет в worker):
task_id = await task_service.enqueue("recalculate_object", {"object_id": str(obj.id)})
return JSONResponse(status_code=202, content={"task_id": task_id})
```

### 2.2 Worker-слой: durable tasks + Redis Stream

Тяжёлые операции выносятся из API в фоновые задачи:

| Операция | Время | Воркер |
|---|---|---|
| `POST /objects/import-excel` (50 MB файл) | 5–30 сек | Worker |
| `POST /calc/electrical/batch` (400 объектов) | 0.5–2 сек | Worker |
| `GET /reports/{id}/export/pdf` | 2–10 сек | Worker |
| `POST /projects/{id}/duplicate` | 1–5 сек | Worker |

API немедленно возвращает `202 Accepted` с `task_id`. Фронтенд поллит
`GET /tasks/{task_id}`. SSE/WebSocket сейчас не добавляем: для масштаба
20-100 пользователей важнее убрать частые записи прогресса в БД, чем
заменять простой polling на live-канал.

Redis не является источником истины. Источник истины — таблица фоновых задач в
PostgreSQL. Redis Stream только доставляет `task_id` worker'ам. Если enqueue в
Redis не удался, задача остаётся в БД в статусе `queued` и должна быть повторно
поставлена в очередь recovery-процессом.

```python
# backend/app/services/task_service.py (уже частично реализован)
@router.post("/import-excel")
async def import_excel(file: UploadFile, project_id: UUID):
    upload_ref = await upload_storage.save_stream(file)
    task_id = await task_service.enqueue(
        "import_excel",
        {"project_id": str(project_id), "upload_ref": upload_ref},
    )
    return {"task_id": task_id, "status": "pending"}

@router.get("/tasks/{task_id}")
async def task_status(task_id: str):
    task = await task_service.get(task_id)
    return {
        "status": task.status,       # pending | running | done | failed
        "progress": task.progress,   # {"current": 28, "total": 100}
        "result": None,              # тяжёлый результат лучше читать отдельным endpoint
        "error": task.error,
    }
```

Для тяжёлых файлов нельзя класть `raw_base64` в payload задачи: это раздувает
память, БД и Redis. Payload должен содержать ссылку на файл (`upload_ref`,
`storage_key`, путь в shared volume или object storage), а worker должен читать
файл потоково.

### 2.3 Progress: throttling/batching вместо записи на каждый объект

**Статус:** базовый `ProgressThrottler` для электрорасчёта реализован. Настройки
вынесены в env: `WORKER_PROGRESS_MIN_INTERVAL_MS` и
`WORKER_PROGRESS_MIN_PERCENT_DELTA`.

SSE не нужен как первый шаг. Он ускоряет доставку прогресса в браузер, но не
уменьшает количество записей в БД. Если worker будет сохранять progress после
каждого объекта, SSE только покажет пользователю дорогой процесс в real time.

Текущий риск:

```text
1 batch на 400 объектов = до 400 progress-update транзакций
10 параллельных batch = до 4000 progress-update транзакций
```

Это лишняя write-нагрузка. Пользователю не нужна точность прогресса до каждого
объекта, ему нужен стабильный индикатор и точный финальный результат.

**Политика записи прогресса:**

| Событие | Писать в БД? | Почему |
|---|---:|---|
| `queued`, `enqueued`, `running` | Да | Это durable state задачи. |
| Смена phase (`prepare`, `calculate`, `commit`, `done`) | Да | UI должен видеть этап. |
| `calculate` на каждом объекте | Нет | Слишком много мелких транзакций. |
| Последний известный progress раз в `500 ms` | Да | Достаточно плавно для UI, но не шумит в БД. |
| Изменение progress меньше чем на `1%` | Нет | Визуально почти незаметно. |
| `succeeded`, `failed`, `cancelled` | Да всегда | Финальное состояние должно быть точным. |

Практическое правило:

```text
flush progress if:
  phase changed
  OR task finished / failed / cancelled
  OR now - last_progress_write >= 500 ms AND percent changed >= 1%
```

Для быстрых batch-задач это означает, что в БД попадут только `prepare`,
несколько промежуточных значений, `commit` и `done`. Для долгих импортов
индикатор останется живым, но без записи каждой строки.

**Как реализовать:**

1. `ProgressThrottler` работает внутри `TaskService._run_electrical_batch`.
2. `progress_callback` принимает все события от `CalculationService`, но в БД
   пишет только последнее событие, прошедшее throttle-правило.
3. Перед завершением задачи делать обязательный final flush.
4. Postgres остаётся источником истины: status/result/progress всегда можно
   восстановить после перезагрузки страницы или worker.
5. Redis/SSE не использовать для истины. Если позже появится SSE, Redis может
   быть только live-каналом, а не хранилищем состояния.

Минимальный контракт:

```python
@dataclass
class ProgressWritePolicy:
    min_interval_ms: int = 500
    min_percent_delta: float = 1.0


class ProgressThrottler:
    async def offer(self, progress: BatchProgress) -> None:
        """Accept every progress event, persist only meaningful checkpoints."""

    async def flush(self) -> None:
        """Persist the latest buffered progress before terminal state."""
```

`ProgressThrottler` не должен менять бизнес-расчёт. `CalculationService`
продолжает эмитить подробный progress на каждый объект, а worker решает, какие
события достаточно важны для записи в БД.

Псевдологика:

```text
on progress:
  if no previous persisted progress:
    persist
  elif phase changed:
    persist
  elif progress.phase != "calculate":
    persist
  elif elapsed >= 500 ms and percent_delta >= 1%:
    persist
  else:
    keep as buffered latest progress

before terminal state:
  flush latest buffered progress
  persist terminal status/result
```

Нужно избегать двух ошибок:

- Не `sleep()` внутри расчёта ради throttling. Расчёт должен идти с полной
  скоростью.
- Не терять финальный progress. Если задача завершилась быстро, UI всё равно
  должен увидеть `done`/`succeeded`.

**Важно для batch-записей:**

- Для электрорасчёта результаты уже нужно писать bulk-upsert'ом, не по одному
  объекту. Часто писать в БД нельзя именно progress/state.
- Для тяжёлого импорта нужно батчить и данные, и progress: например сохранять
  строки пачками по 100-500, а progress писать по тому же throttle-правилу.
- Для маленьких задач progress можно писать только на смене phase и в финале.

**Polling на фронте остаётся, но становится умнее:**

| Состояние | Интервал polling |
|---|---:|
| `queued`, `enqueued` | 1500-2500 ms |
| `running` | 1000 ms |
| Вкладка браузера неактивна | 5000-10000 ms |
| `succeeded`, `failed`, `cancelled` | Остановить polling |

Критерий успеха:

```text
progress writes <= 2 regular updates/sec per running task
terminal states are always persisted immediately
UI progress remains responsive enough for humans
load test confirms DB write pressure does not grow linearly with object count
```

Тесты:

| Уровень | Что проверить |
|---|---|
| Unit | `ProgressThrottler` пишет первый progress, смену phase, финальный flush. |
| Unit | 400 progress-событий за короткое время дают не 400 DB writes. |
| Unit | При изменении меньше `1%` запись пропускается. |
| Integration | Batch-задача всё равно завершается `succeeded`, progress `done`, result доступен. |
| Load | 3-5 параллельных batch на 400 объектов: p95 API не растёт, progress writes ограничены. |

Нужные метрики:

```text
task_progress_write_count
task_progress_write_skipped_count
task_duration_seconds
task_queue_wait_seconds
task_poll_requests_count
postgres_commits_per_second
```

### 2.4 PgBouncer: пул соединений

При 3 репликах × `pool_size=20` = 60 постоянных соединений + пиковые до
`max_overflow=10` каждая = до 90. PostgreSQL на 2 GB RAM держит 200.
Пока без PgBouncer.

При 10 репликах (100 пользователей) — нужно PgBouncer в transaction pooling mode:

```yaml
pgbouncer:
  image: edoburu/pgbouncer:latest
  environment:
    DB_HOST: db
    DB_USER: heatcalc
    DB_PASSWORD: heatcalc_pass
    POOL_MODE: transaction
    DEFAULT_POOL_SIZE: 50
    MAX_CLIENT_CONN: 500
```

PgBouncer принимает 500 клиентских соединений от 10 реплик, мультиплексирует
в 50 реальных соединений к PostgreSQL.

### 2.5 Импорт тяжёлых файлов: потоковая обработка

Текущий импорт (`excel_import_service.py`) загружает файл целиком в память.
При 50 MB Excel × 5 одновременных импортов = 250 MB RAM на воркере.

**Решение — потоковое чтение:**

```python
# Вместо:
raw = await file.read()  # 50 MB в памяти
workbook = openpyxl.load_workbook(BytesIO(raw))

# Потоковое (openpyxl read_only):
workbook = openpyxl.load_workbook(file.file, read_only=True, data_only=True)
for row in workbook.active.iter_rows(min_row=2):
    obj = parse_row(row)
    await save_object(obj)
    await progress_callback(current=idx, total=total)
```

`read_only=True` не загружает весь файл в память — строки читаются итеративно.
Память: 50 MB → ~5 MB на импорт.

### 2.6 Rate limiting на импорт

Чтобы 10 пользователей не запустили импорт одновременно и не положили воркеров:

```python
# В API-обработчике:
if not import_limiter.is_allowed(user_id):
    raise HTTPException(
        status_code=429,
        detail="Импорт уже выполняется. Дождитесь завершения предыдущего.",
    )

# Не более 2 одновременных импортов на пользователя
import_limiter = SlidingWindowRateLimiter(max_concurrent=2, per_user=True)
```

---

## 3. План внедрения (от текущего состояния к 100 пользователям)

| Этап | Пользователей | Что меняется |
|---|---|---|
| **Сейчас** | 1–5 | API + worker queue для электрорасчёта. Остальные тяжёлые операции ещё нужно выносить. |
| **Этап 1** | 5–20 | Worker queue для batch-расчётов. Throttling progress-записей. Умный polling. |
| **Этап 2** | 20–50 | Worker-задачи для импорта и отчётов. API только 202 + poll. |
| **Этап 3** | 50–100 | 3 реплики API + nginx upstream. PgBouncer. Потоковый импорт. Rate limiting. |
| **Этап 4** | 100+ | Kubernetes × 5–10 реплик. Go-сервис для F-02/F-03. TimescaleDB для телеметрии. |

**Ключевое:** микросервисы (разделение по доменам) не появляются ни на одном этапе.
Разделение — по **типу нагрузки** (API vs worker), а не по **домену** (projects vs calculations).

---

## 4. Ответ на вопрос

> А если будет работать 20–100 человек и импортировать тяжёлые документы?

**Тогда нужно не микросервисы, а четыре вещи:**

1. **Worker-процессы** — вынести импорт, batch-расчёты и экспорт отчётов из API-процесса в фоновые задачи. API немедленно возвращает `202 Accepted` с `task_id`.
2. **Реплики API** — 3+ контейнера FastAPI за nginx. Stateless (сессия в JWT/Redis).
3. **PgBouncer** — на этапе 50+ пользователей, чтобы не исчерпать соединения PostgreSQL.
4. **Редкие progress-записи** — не писать состояние задачи в БД на каждый объект/строку. Использовать throttling и batch-записи.

Микросервисы (разделение по доменам) **не нужны** — они не решают проблему
конкурентного доступа и тяжёлых импортов. Проблему решает разделение по
**типу нагрузки** (API vs background worker) + горизонтальное масштабирование.

---

*Документ подготовлен: 2026-05-10  
Основан на: анализе ограничений монолита (event loop, память, соединения БД), паттернах horizontal scaling + background workers.*
