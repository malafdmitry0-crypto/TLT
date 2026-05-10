# Prompt: современная worker-система для CPU-bound batch-расчётов HeatCalc

## Роль

Ты senior backend/fullstack engineer в проекте TLT HeatCalc. Твоя задача —
спроектировать и внедрить production-ready систему фоновых задач для крупных
batch-расчётов, не ломая текущий API, права доступа и расчётную бизнес-логику.

Работай в существующем репозитории. Сначала изучи текущий код и тесты, затем
вноси минимально достаточные изменения. Не переписывай формулы и не меняй
математический результат расчётов.

## Контекст проекта

- Backend: FastAPI, SQLAlchemy async, PostgreSQL, Alembic.
- Redis уже есть в `docker-compose.yml` и используется для rate limit/cache.
- Batch электрорасчёта сейчас синхронный:
  - endpoint: `POST /api/v1/calc/electrical/batch`;
  - сервис: `CalculationService.batch_calc_electrical(...)`;
  - текущий замер: 400 объектов за ~0.094s, SQL в миллисекундах.
- Узкое место не доказано прямо сейчас, но при 3-5 параллельных крупных batch
  CPU может начать занимать backend workers и ухудшать read endpoints.
- Уже есть server-side pagination для страницы электрорасчёта:
  `GET /api/v1/calc/electrical/page`.

## Цель

Добавить современную, наблюдаемую и безопасную worker-систему для batch-задач:

- API быстро возвращает `202 Accepted` + `task_id`;
- расчёт выполняется вне web-request lifecycle;
- пользователь видит статус, прогресс и итог задачи;
- read endpoints не блокируются крупными расчётами;
- результат batch остаётся тем же, что у текущего синхронного расчёта;
- систему можно масштабировать отдельными worker-процессами/контейнерами.

## Рекомендуемая архитектура

Используй Redis-backed async queue. Предпочтительный вариант для этого проекта:
`arq`, потому что backend уже async и Redis уже есть.

Базовая production-архитектура:

- PostgreSQL как durable source of truth для статуса задач.
- Redis/arq как очередь исполнения.
- Отдельный worker container/process, не web backend.
- API создаёт запись задачи в БД, кладёт job в Redis и возвращает `202`.
- Worker берёт job, обновляет статус/progress в БД, вызывает существующий
  `CalculationService`, сохраняет результат и завершает задачу.

Если при изучении кода станет ясно, что `arq` плохо ложится на проект,
можно выбрать Celery или Dramatiq, но обязательно объясни причину в кодовом
комментарии или отдельной секции changelog. Не добавляй RabbitMQ на первом
релизе: Redis уже есть и достаточен как брокер, при условии что Postgres
остаётся durable source of truth и есть recovery/requeue.

## Важное ограничение по CPU

Не используй threads как основную стратегию ускорения CPU-bound Python-кода:
GIL не даст нормального параллелизма для чистого Python.

Обязательная стартовая модель исполнения — отдельные worker processes:

- web backend не занят расчётом;
- worker можно масштабировать количеством контейнеров;
- для CPU-heavy очереди держать `max_jobs=1` на worker process, если иначе
  latency становится нестабильной.

Process pool внутри worker добавлять только если нагрузочный тест покажет,
что один job сам по себе CPU-heavy и его нужно распараллеливать внутри задачи.

## API-контракт

Сохрани существующий синхронный endpoint для обратной совместимости:

```http
POST /api/v1/calc/electrical/batch
```

Добавь новый async API:

```http
POST   /api/v1/calc/electrical/batch/jobs
GET    /api/v1/calc/jobs/{task_id}
GET    /api/v1/calc/jobs/{task_id}/result
POST   /api/v1/calc/jobs/{task_id}/cancel
```

Допускается другой route prefix, если он лучше совпадает с текущей структурой,
но endpoint должен быть очевидным и покрытым тестами.

### Enqueue request

Используй те же параметры, что у текущего batch:

```json
{
  "project_id": "uuid",
  "cable_source": "builtin",
  "variant_number": 1,
  "cable_type": "self_regulating",
  "electrical_params": {
    "supply_voltage": 220,
    "connection_type": "line_1ph",
    "winding_coefficient": 1,
    "heating_height": null,
    "laying_step": 0.1,
    "vapor_temperature": null,
    "aggressive_product": false
  },
  "skip_manual": false
}
```

### Enqueue response

```json
{
  "task_id": "uuid",
  "status": "queued",
  "type": "electrical_batch",
  "project_id": "uuid",
  "progress": {
    "current": 0,
    "total": null,
    "percent": 0
  },
  "links": {
    "status": "/api/v1/calc/jobs/{task_id}",
    "result": "/api/v1/calc/jobs/{task_id}/result",
    "cancel": "/api/v1/calc/jobs/{task_id}/cancel"
  }
}
```

HTTP status для enqueue: `202 Accepted`.

### Status response

```json
{
  "task_id": "uuid",
  "status": "queued|enqueued|running|succeeded|failed|cancelled",
  "type": "electrical_batch",
  "project_id": "uuid",
  "created_at": "iso",
  "started_at": "iso|null",
  "finished_at": "iso|null",
  "updated_at": "iso",
  "progress": {
    "current": 37,
    "total": 400,
    "percent": 9.25
  },
  "result": {
    "calculated": 37,
    "skipped": 0,
    "heat_loss_failed": 0
  },
  "error": null
}
```

`GET /result`:

- `200` если задача завершилась успешно;
- `202` если задача ещё `queued`, `enqueued` или `running`;
- `409` если задача `failed` или `cancelled`, с ошибкой/статусом;
- результат должен быть компактным summary, не огромным списком всех строк по
  умолчанию. Подробности читать через существующий paginated endpoint
  `/calc/electrical/page`.

## Модель данных

Добавь Alembic migration и SQLAlchemy model, например `BackgroundTask`.

Минимальные поля:

- `id UUID primary key`;
- `type string`, например `electrical_batch`;
- `status string`: `queued`, `enqueued`, `running`, `succeeded`, `failed`, `cancelled`;
- `project_id UUID nullable/indexed`;
- `user_id UUID nullable/indexed`;
- `session_id string nullable/indexed`;
- `request_payload JSONB`;
- `result_payload JSONB nullable`;
- `error_message text nullable`;
- `progress_current int default 0`;
- `progress_total int nullable`;
- `arq_job_id string nullable`;
- `idempotency_key string nullable`;
- `cancel_requested bool default false`;
- `attempts int default 0`;
- `enqueue_attempts int default 0`;
- `last_enqueue_error text nullable`;
- `next_retry_at timestamp nullable`;
- `locked_by string nullable`;
- `lock_expires_at timestamp nullable`;
- `created_at`, `started_at`, `finished_at`, `updated_at`, `heartbeat_at`.

Индексы:

- `(project_id, created_at desc)`;
- `(user_id, created_at desc)`;
- `(session_id, created_at desc)`;
- `(status, type)`;
- unique partial index на активную idempotency-группу, если реализуешь
  dedupe на уровне БД.

## Transactional enqueue и recovery

Redis/arq не является источником истины. Источник истины — Postgres task table.
Обязательное требование: система должна корректно переживать сбои между записью
task в БД и постановкой job в Redis, а также смерть worker во время `running`.

### Enqueue state machine

Рекомендуемые статусы:

- `queued` — task создана в БД, но Redis enqueue ещё может быть не подтверждён;
- `enqueued` — job успешно поставлен в Redis, `arq_job_id` записан;
- `running` — worker начал выполнение;
- `succeeded`;
- `failed`;
- `cancelled`;
- `stale` или `retryable` — опционально, если нужен отдельный статус для
  recovery-интерфейса.

Можно публично отображать `enqueued` как `queued`, если UI не хочет отдельного
состояния. В БД внутреннее состояние enqueue всё равно должно быть сохранено
через `status`, `arq_job_id`, `last_enqueue_error`, `enqueue_attempts`,
`next_retry_at`.

### Сценарий: task записан в БД, Redis enqueue упал

Нельзя оставлять такую task навсегда невыполнимой.

Сделай один из production-safe вариантов:

- enqueue выполняется после commit, при ошибке task остаётся `queued`, получает
  `last_enqueue_error`, `enqueue_attempts += 1`, `next_retry_at`;
- startup/recovery процесс или периодическая команда находит `queued` задачи без
  `arq_job_id` и повторяет enqueue;
- есть management command/API-only admin action для ручного requeue зависших
  задач.

Предпочтительно иметь автоматический recovery loop в worker startup или
отдельную periodic function: `recover_stuck_tasks()`.

### Сценарий: worker умер после `running`

Worker обязан обновлять `heartbeat_at`. Если `running` task не обновляла
heartbeat дольше `WORKER_STALE_AFTER_SECONDS`, recovery должен:

- если task не достигла необратимого commit-этапа — перевести её в `queued` и
  поставить заново;
- если task могла частично записать результаты — повторный запуск должен быть
  идемпотентен. Для электрических расчётов это значит использовать текущий
  upsert по `(object_id, variant_number)` и не создавать дубликаты;
- после превышения `WORKER_MAX_ATTEMPTS` перевести task в `failed` с понятной
  ошибкой.

Нужны тесты на оба сбоя:

- БД task создана, Redis enqueue выбрасывает исключение, recovery ставит job
  повторно;
- task в `running` со старым `heartbeat_at`, recovery requeue, повторный запуск
  не создаёт дубликатов `ElectricalCalculation`.

## Idempotency и дедупликация

Нельзя плодить одинаковые активные задачи при двойном клике.

Реализуй один обязательный механизм:

- поддержка header `Idempotency-Key`;
- или deterministic key из `principal + project_id + variant_number +
  cable_type + cable_source + electrical_params + skip_manual`.

Если задача с тем же ключом уже `queued` или `running`, вернуть существующий
`task_id` и `202`, а не создавать новую.

После `succeeded|failed|cancelled` можно создавать новую задачу с теми же
параметрами.

## Права доступа и безопасность

На enqueue:

- проверить доступ к проекту через существующий `ProjectService`;
- запретить `extended/all` catalog для guest, как в текущем sync endpoint;
- валидировать все параметры так же строго, как sync batch.

На `GET status/result/cancel`:

- пользователь видит только свои задачи;
- guest видит только задачи своей `session_id`;
- employee/admin видят задачи согласно текущей модели доступа к проекту;
- нельзя узнать существование чужого `task_id`.

## Поведение worker

Worker должен:

1. Загрузить задачу из БД.
2. Если задача уже завершена или отменена, выйти идемпотентно.
3. Перевести `queued -> running`, заполнить `started_at`, `heartbeat_at`.
4. Выполнить расчёт.
5. Обновлять progress между объектами или по крупным фазам.
6. Кооперативно проверять `cancel_requested`.
7. На успех записать компактный result summary.
8. На ошибку записать `failed`, `error_message`, traceback в лог.
9. На отмену записать `cancelled`.

Старайся переиспользовать существующую бизнес-логику:
`CalculationService.batch_calc_electrical(...)`.

## Контракт progress/cancel для CalculationService

Не ломай сервисный слой ad hoc-вызовами из worker. Перед внедрением worker
зафиксируй явный callback-контракт и покрой его тестами.

Добавь в `CalculationService.batch_calc_electrical(...)` опциональные параметры
без изменения поведения sync endpoint по умолчанию:

```python
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

@dataclass(frozen=True)
class BatchProgress:
    current: int
    total: int
    object_id: UUID | None = None
    phase: str = "calculate"
    calculated: int = 0
    skipped: int = 0
    heat_loss_failed: int = 0

ProgressCallback = Callable[[BatchProgress], Awaitable[None] | None]
CancelChecker = Callable[[], Awaitable[bool] | bool]
```

Сигнатура должна стать примерно такой:

```python
async def batch_calc_electrical(
    self,
    project_id: UUID,
    cable_source: CableSource = "builtin",
    variant_number: int = 1,
    cable_type: str = "self_regulating",
    electrical_params: dict[str, Any] | None = None,
    skip_manual: bool = False,
    return_calcs: bool = True,
    *,
    progress_callback: ProgressCallback | None = None,
    should_cancel: CancelChecker | None = None,
) -> tuple[int, int, int, list[dict[str, Any]], list[ElectricalCalculation]]:
```

Правила:

- если callbacks не переданы, поведение и результат полностью совпадают с
  текущим sync batch;
- `progress_callback` вызывается минимум:
  - после определения `total`;
  - после каждого обработанного объекта;
  - перед финальным commit;
  - после commit с финальными счётчиками;
- `should_cancel` проверяется перед началом обработки и между объектами;
- при cancel до commit сервис должен поднять typed exception, например
  `BatchCancelled`, а worker переведёт task в `cancelled`;
- если cancel пришёл после финального commit, task должна завершиться
  `succeeded`, потому что результаты уже сохранены;
- callback не должен коммитить расчётную транзакцию; обновление progress task
  делай через отдельную короткую сессию/transaction или через out-of-band
  helper, чтобы не ломать atomicity расчёта;
- callback exceptions не должны оставлять БД в полусостоянии: либо fail task,
  либо логировать и продолжать, но решение должно быть явным и покрытым тестом.

Нужны tests:

- без callbacks старые batch-тесты проходят без изменений;
- `progress_callback` получает монотонный `current` и корректный `total`;
- `should_cancel=True` до обработки приводит к `BatchCancelled` и не пишет
  новые расчёты;
- cancel между объектами не создаёт дубликатов и сохраняет консистентное
  состояние;
- exception в callback обрабатывается согласно выбранной политике.

## Frontend production scope

Realtime UI не обязателен, но пользовательский поток должен быть полноценным:
запуск, статус, прогресс, завершение, ошибка и отмена.

Обязательный frontend scope:

- API client methods:
  - `enqueueElectricalBatchJob`;
  - `getCalcJobStatus`;
  - `getCalcJobResult`;
  - `cancelCalcJob`.
- На странице электрорасчёта async job flow становится основным сценарием.
  Старый sync endpoint остаётся только для обратной совместимости и тестов.
- Кнопка запуска создаёт job.
- Показывается progress/status.
- Polling каждые 1-2 секунды.
- По success инвалидируются `electrical-page` и `objects/summary`.
- По failed показывается ошибка.
- Cancel доступен только пока `queued/enqueued/running`.

SSE/WebSocket не являются обязательными для worker-system релиза, если polling
закрывает продуктовый сценарий. Архитектурный extension point для realtime
обновлений оставь явно.

## Docker и запуск

Добавь отдельный service в `docker-compose.yml` и `docker-compose.dev.yml`,
например:

```yaml
worker:
  build:
    context: ./backend
    dockerfile: Dockerfile
  command: python -m app.worker
  environment:
    DATABASE_URL: ${DATABASE_URL:-postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_db}
    REDIS_URL: ${REDIS_URL:-redis://redis:6379/0}
  depends_on:
    db:
      condition: service_healthy
    redis:
      condition: service_healthy
```

Для dev использовать `Dockerfile.dev` и volume `./backend:/app`.

Конфигурация через env:

- `WORKER_QUEUE_NAME=cpu`;
- `WORKER_MAX_JOBS=1`;
- `WORKER_JOB_TIMEOUT_SECONDS=900`;
- `WORKER_RESULT_TTL_SECONDS=86400`;
- `WORKER_HEARTBEAT_SECONDS=10`;
- `WORKER_STALE_AFTER_SECONDS=60`;
- `WORKER_MAX_ATTEMPTS=3`;

## Observability

Добавь структурные логи:

- task enqueued;
- task started;
- progress milestones;
- task succeeded/failed/cancelled;
- duration seconds;
- project_id, task_id, type, status.

Метрики Prometheus не обязательны для первого релиза, но код не должен мешать их
добавить.

## Нагрузочные тесты

Добавь отдельный load/perf сценарий, который можно запускать вручную:

- создать или использовать проект на 400+ валидных объектов;
- запустить 3-5 параллельных electrical batch jobs;
- параллельно дергать read endpoints:
  - `GET /calc/electrical/page`;
  - `POST /projects/{project_id}/objects/query`;
- собрать p50/p95/max для enqueue, status polling, read endpoints и completion.

Критерии:

- enqueue отвечает быстро, целевой p95 < 200ms;
- read endpoints не деградируют кратно во время batch;
- jobs завершаются без дублей в `ElectricalCalculation`;
- повторный запуск с тем же idempotency key не создаёт второй активный job.

## Тесты

Обязательно добавить/обновить:

- unit tests для task model/status transitions;
- integration API tests:
  - enqueue возвращает `202` и `task_id`;
  - status доступен владельцу;
  - чужой пользователь/guest не видит task;
  - duplicate idempotency key возвращает тот же task;
  - cancel переводит active task в cancel_requested/cancelled;
  - failed job сохраняет error;
- worker integration tests:
  - job вызывает batch service и сохраняет result;
  - successful job создаёт/обновляет `ElectricalCalculation`;
  - repeat job не создаёт дубликаты расчётов;
  - progress обновляется;
  - cancel вызывает `should_cancel` и корректно завершает task;
  - stale `running` task requeue'ится recovery-процессом;
  - task с failed Redis enqueue повторно ставится recovery-процессом;
- regression tests на старый sync endpoint:
  - `POST /calc/electrical/batch` продолжает работать как раньше.

Если полноценный Redis worker неудобен в тестах, выдели runner-функцию, которую
можно вызвать напрямую с fake queue, а Redis покрыть одним smoke integration
test при доступном `REDIS_URL`.

## Проверки перед финалом

Запусти:

```bash
make lint-backend
make test-backend
npm run typecheck
npm run test:run
npm run build
git diff --check
```

Если frontend не менялся, всё равно запусти `npm run typecheck` и targeted тесты
API client/UI, либо явно объясни, почему frontend checks не нужны.

## Definition of Done

- Есть durable task table и migration.
- Есть отдельный worker process/container.
- Есть async job API с `202`, status, result, cancel.
- Старый sync endpoint не сломан.
- Worker переиспользует существующую расчётную логику.
- `CalculationService.batch_calc_electrical(...)` имеет явный
  `progress_callback`/`should_cancel` контракт.
- Есть recovery для task created-but-not-enqueued и stale running tasks.
- Повторный запуск после recovery не создаёт дубликаты расчётов.
- Права доступа соблюдены для employee/admin/guest.
- Idempotency защищает от двойного клика.
- Progress и финальный result доступны через API.
- Ошибки сохраняются в task и логируются.
- Есть тесты на happy path, access control, idempotency, failure, cancel.
- Есть нагрузочный сценарий на 3-5 параллельных batch jobs.

## Не входит в scope worker-system релиза

- Не добавлять RabbitMQ/Kafka.
- Не переносить все расчёты в микросервис.
- Не переписывать формулы на NumPy/SciPy в рамках worker-system релиза.
- Не удалять старый sync endpoint.
- Не делать WebSocket/SSE, пока polling достаточен.
- Не добавлять ProcessPoolExecutor без измерений.
- Не менять формат существующих `ElectricalCalculation.results`, если это не
  требуется для совместимости.
