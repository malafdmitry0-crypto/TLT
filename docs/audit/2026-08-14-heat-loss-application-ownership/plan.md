# Heat-loss application ownership — актуальная очередь

**Статус:** ACTIVE — выносим оставшееся владение теплом из чужих сервисов

**Дата:** 2026-08-14

**Предыдущая очередь:** `docs/audit/2026-08-14-heat-loss-application-boundary/`
вынесла квартиру формул (A0–A6). AF там FAIL из‑за electrical
`test_concurrent_enqueue_and_delete_never_orphans_task` `(202, 423)` —
это project lock, не тепло. Эту очередь тем ID не чинит.

**Промпты:** `prompts.md` рядом

**Динамические данные:** только `snapshot.md`, который снимает B0

Единственная ACTIVE frontend-очередь остаётся в
`docs/frontend/refactor-backlog.md`. Эта очередь её не меняет.

Папка allowlist в корневом `.gitignore` рядом с предыдущей audit-папкой.
Новые файлы — обычный `git add <file>`. `git add .` и `git add -f`
не нужны. B0 также берёт `.gitignore` и SUPERSEDED-указатель в
`docs/audit/2026-08-14-heat-loss-application-boundary/plan.md`.

## Что уже не гость — не трогать как «ещё не вынесено»

Уже свои:

- уравнения, ranges, `FormulaOutcome` — `heatcalc-heat-loss-core`;
- фасад `calc_pipe_heat_loss(params)` / `calc_tank_heat_loss(params)`
  без `coefficients`;
- климат, выбор K, `calc_heat_loss`, `build_heat_loss_error_payload` —
  `app.services.heat_loss_application`;
- formula-модели — `app.schemas.heat_loss`;
- `CalculationError` — `app.services.calculation_errors`;
- import persist — `excel_import_service` уже берёт payload из application.

Повторять extract формул в пакет **запрещено**.

## Где тепло ещё гость

```text
calculation_service.py
  re-export climate / payload / pipe K
  calc_heat_loss + _calc_heat_loss_with_coefficients — тонкие обёртки
  try_recalculate — climate + validate + calc + запись ProjectObject

schemas/calculation.py
  HeatLossRequest / HeatLossResponse / BatchCalcResponse
  HeatLossBatchJobRequest
  identity re-export formula-моделей

api/v1/admin.py
  pipe/tank formula-check импортирует фасад напрямую
  (без climate / без admin K — это контракт, не баг)

api/v1/calculations.py
  POST /heat-loss зовёт CalculationService.calc_heat_loss

catalog_preparation._catalog_error_code
  код ошибки из префикса ValueError loader'а

build_heat_loss_error_payload
  после typed-веток — русские substring-маркеры на leftover Exception
```

Целевой контур:

```text
HTTP / persist / import / admin / task
        ↓  только I/O, коэффициенты из БД, запись строки
app.services.heat_loss_application
  ├─ climate, K, calc, payload
  ├─ evaluate_project_object_heat → результат для persist
  └─ preview_validated_heat_formula → admin 422, без climate
        ↓
app.formulas.heat_loss
        ↓
heatcalc_heat_loss_core
```

`CalculationService` после очереди не владеет тепловой логикой и не
реэкспортирует её. Он может: прочитать admin coefficients, вызвать
application, записать `obj.params/results/is_valid/validation_errors`,
гнать heat batch (цикл + progress). Не может: выбирать K, собирать
payload, парсить русский текст, знать фасад.

Для persist-входа коэффициенты загружаются лениво: только после успешных
normalize + climate + canonical validation. Ошибка загрузки коэффициентов,
как и сейчас, превращается application-слоем в invalid outcome, а не выходит
из `try_recalculate`. Допустим injected async provider; application при этом
не знает DB/Redis и не импортирует их реализации.

## Что остаётся в чужих модулях намеренно

Это не гости, это чужие владельцы:

| Что | Хозяин | Почему не переезжает |
|---|---|---|
| `get_coefficients()` | CalculationService / admin CRUD | чтение БД + Redis cache |
| мутация `ProjectObject` | CalculationService / object persist | application не импортирует ORM |
| `normalize_*` / stored params | `project_object_params` | каноника JSONB объекта |
| heat batch enqueue | `task_service` | очередь, не формула |
| `_tank_heat_loss_without_double_safety` | электрика | политика над готовым JSON |
| `mark_electrical_*` / cable / TT | электрика | не тепло |
| electrical_tt ветка admin formula-check | электрика | не трогать |

## Принятые решения

### Не второй extract ядра

Нельзя:

- переносить catalog/climate/Pydantic в `heatcalc-heat-loss-core`;
- менять уравнения, порядок, ranges, units;
- менять ключи успешного JSON, `formula_model` / version, rounding;
- менять hot-side литерал;
- унифицировать pipe и tank;
- чинить air-pipe empty thickness;
- чинить electrical `(202, 423)`, query counts, reports, spec generate;
- выносить `_tank_heat_loss_without_double_safety`;
- менять routes, query keys, UUID, схему БД;
- трогать frontend production и `docs/frontend/refactor-backlog.md`.

### Application не знает ORM

`heat_loss_application` не импортирует `ProjectObject`, SQLAlchemy,
`CalculationService`. Persist-слой передаёт `object_type`, `params` и
либо готовые `coefficients`, либо injected async provider, затем забирает
структуру для записи.

### HTTP preview и persist-invalid не меняются

- `POST /heat-loss` — тот же JSON in/out.
- create/update при formula/catalog ошибке: **201/200**, строка
  сохранена, `is_valid=false`, `results=null`, `validation_errors`
  заполнены.
- Admin formula-check: **422**, без climate, без admin K. Меняется
  только import path: admin не импортирует фасад.
- Frontend save gate не переносится на backend.

### Re-export

B2 снимает тепловые re-export из `calculation_service`.
`calc_heat_loss` на сервисе либо удаляется, либо остаётся однострочным
`get_coefficients` + `heat_loss_application.calc_heat_loss` — без
алиасов climate/payload/K. Тесты, которые импортировали aliases из
сервиса, переписываются точечно.

B4 переносит HTTP-конверты в `app.schemas.heat_loss` (или
`heat_loss_http.py` в том же пакете схем). `calculation.py` один слайс
только реэкспортирует. B4b переводит production-импорты.

B8 снимает identity re-export **formula-моделей** из `calculation.py`.
HTTP-конверты к тому моменту уже живут в heat_loss. Тесты могут
перейти на `app.schemas.heat_loss`. Это отдельный commit, не смешивать
с логикой.

### Каталог

После B6 loader тепловой изоляции поднимает typed error с `code`.
Сообщения байт-в-байт те же. `_catalog_error_code` по префиксу строки
удаляется. Нет `code` — STOP, не generic-fallback.

Электрический catalog `ValueError` в loader не входит.

Таблица `code → path` та же, что в предыдущей очереди
(`unknown_insulation_material` → `insulation_layers.{i}.material`,
hot-side без суффикса `.material`).

### Payload leftover

B7: после `HeatLossPreparationError`, `ProjectObjectParamsError`
(reason/code, не русский parse) и `ValidationError` неизвестный
`Exception` → `category=formula`, `error_code=heat_loss_formula_error`.
Список маркеров `требует` / `долж` / `диапазон` / … удаляется.
B1 заранее фиксирует текущие payload для каждой ветки. Расхождение
persist-invalid / highlight после B7 — FAIL слайса, чинить адаптер.

`process_temperature_not_above_*` в message остаётся только если
исключение ещё не typed. Если B1 покажет, что эти строки приходят
только из `ProjectObjectParamsError.reason` или
`HeatLossPreparationError.code` — substring-ветки удалить в B7.

`ProjectObjectParamsError` классифицируется только по `code`, `reason` и
`fields`. В частности, `OBJECT_TYPE_UNSUPPORTED` сохраняет текущие
`unsupported_object_type` / `object_type` без разбора русского сообщения.
Message-only `Exception`, включая текст про неподдерживаемый тип/форму,
после B7 является generic formula error, если источник не дал typed code.

### Facade contract

Локальные oracle этой очереди — копии
`facade_behavior_probe.py` / `facade_benchmark.py` из предыдущей
папки. Старые скрипты `2026-08-12` не использовать.

В contract JSON и SHA: успешные результаты / `tm` / `alpha` / λ /
versions; у ошибок — `status`, `message`, pydantic `errors`.
Не входят сигнатуры, JSON Schema, `exception_type`.

B0 фиксирует SHA скриптов. BF до запуска сверяет те же SHA.
Расхождение скрипта — FAIL, не новый baseline.

Benchmark: медиана > `1.15 × B0.median` на том же контейнере — FAIL.

До B0 production-код после предыдущего AF не менялся. Поэтому B0 contract
обязан быть byte-identical предыдущему `af-facade-contract.json`. Benchmark
B0 служебно сравнивается с предыдущим AF: если первый idle-run выше AF более
чем на 15%, повторить exact 9×20 на свободном контейнере и записать оба
результата. Повторное превышение — STOP / DECISION NEEDED, а не завышенный
новый baseline.

### Full backend и debt

Команда без live-worker:

```text
pytest app/tests --no-cov -q --tb=no --override-ini='addopts=' \
  --ignore=app/tests/integration/worker/test_worker_redis_live.py \
  --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
```

Сравнивать только assertion-failed nodeids с **B0 этой папки**, не с
A0 предыдущей очереди и не с 2026-08-13.

`(202, 423)` electrical concurrency, query counts, reports helpers,
task enqueue unit — если упали в B0, это debt. Если в B0 не упали,
а в BF упали — BLOCKER, не «известный flake». Collection / setup /
missing env — не debt.

B0 не считается снятым при setup/error/collection failure. После устранения
одноразового состояния тестовой БД полный прогон повторяется; повторяемый
инфраструктурный блокер означает STOP / NOT RUN, а не commit неполного
baseline.

Frontend proof, если слайс трогает `field` / `fields` payload:

```text
npm --prefix frontend run test:run -- --project integration \
  src/__tests__/integration/components/ObjectWizardDependencies.validation-highlight.test.tsx
```

Иначе frontend NOT TOUCHED / NOT RUN.

## Очередь

| # | Слайс | Суть | Full backend |
|---|---|---|---|
| **B0** | Baseline | HEAD, failed IDs, inventory гостей, contract/benchmark | да |
| **B1** | Characterization | Зафиксировать re-export, try_recalculate, admin, catalog prefix, payload ветки | нет |
| **B2** | Сервис без тепловых aliases | Импорты из `heat_loss_application`; сервис не реэкспортирует climate/payload/K | collect-only |
| **B3** | Persist outcome | `evaluate_project_object_heat`; сервис только пишет поля объекта | да |
| **B4** | HTTP-конверты | `HeatLossRequest` / Response / Batch* в heat_loss + re-export | collect-only |
| **B4b** | Импорты конвертов | Production больше не берёт тепловые HTTP-типы из тела calculation | collect-only + да |
| **B5** | Admin preview | Admin pipe/tank не импортирует фасад; без climate / без admin K | да |
| **B6** | Catalog code | Loader → typed `code`; prefix-parse удалён | да |
| **B7** | Payload leftover | Нет русских маркеров на unknown Exception | да |
| **B8** | Снять formula re-export | `calculation.py` без восьми formula-имён | collect-only + да |
| **BF** | Финальная регрессия | Сравнение с B0 | да |

Слайсы строго по порядку. B4 и B4b — отдельные коммиты. B6 не смешивать
с B7. B2 не смешивать с B3.

## Инварианты

- Facade JSON байт-в-байт с B0 characterization.
- Hot-side литерал посимвольно тот же.
- Create/update persist-invalid 201/200.
- Admin heat formula-check 422, без climate, без admin K.
- Один reference layer = один `resolve_reference_insulation`.
- Application без `app.models` / `CalculationService`.
- Пакет dependency-free.
- Frontend production по умолчанию NOT TOUCHED.

## Критерий закрытия

1. Production не импортирует из `calculation_service` тепловые
   `apply_climate_policy`, `build_heat_loss_error_payload`,
   `pipe_params_with_effective_safety_factor`,
   `effective_pipe_safety_factor`. Aliases на сервисе отсутствуют.
2. `try_recalculate` не содержит climate/calc/payload — только
   coefficients + вызов application + запись полей.
3. HTTP-конверты тепла живут в `app.schemas.heat_loss` (или
   `heat_loss_http` рядом). Production не берёт их из тела
   `calculation.py`.
4. Admin pipe/tank formula-check не импортирует
   `app.formulas.heat_loss`.
5. Catalog prefix-parse отсутствует. Loader тепловой изоляции даёт
   `code`.
6. `build_heat_loss_error_payload` не классифицирует leftover
   Exception русскими маркерами.
7. Восемь formula-имён не реэкспортируются из `calculation.py`.
8. BF contract SHA = B0; SHA oracle-скриптов = B0; failed IDs ⊆ B0;
   error/collection пусты; benchmark ≤ +15%.
9. Frontend backlog не менялся.

## Канонические команды

Focused backend:

```text
docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -w /app heatcalc_backend pytest \
    <files> \
    -q --tb=line --no-cov
```

Collect-only / full backend — те же ignore live-worker, что выше.

Collect-only backend:

```text
docker exec \
  -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  -w /app heatcalc_backend \
  pytest app/tests --collect-only -q --tb=no --override-ini='addopts=' \
    --ignore=app/tests/integration/worker/test_worker_redis_live.py \
    --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
```

Full backend:

```text
docker exec \
  -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  -w /app heatcalc_backend \
  pytest app/tests --no-cov -q --tb=no --override-ini='addopts=' \
    --ignore=app/tests/integration/worker/test_worker_redis_live.py \
    --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
```

Package gate + isolated wheel (повторяет CI; wheel/venv только в `/tmp`;
версия wheel зафиксирована текущим неизменяемым package `0.2.0`):

```text
docker exec -w /app/packages/heat-loss-core heatcalc_backend \
  python -m pytest tests -q --no-cov
docker exec -w /app/packages/heat-loss-core heatcalc_backend \
  ruff check src tests
docker exec -w /app/packages/heat-loss-core heatcalc_backend \
  mypy src tests
docker exec -w /app/packages/heat-loss-core heatcalc_backend \
  python -m pip wheel --no-deps --no-build-isolation \
    --wheel-dir /tmp/hl-own-wheel .
docker exec heatcalc_backend \
  python -m venv --clear /tmp/hl-own-venv
docker exec heatcalc_backend \
  /tmp/hl-own-venv/bin/pip install --force-reinstall --no-deps \
    /tmp/hl-own-wheel/heatcalc_heat_loss_core-0.2.0-py3-none-any.whl
docker exec -e PYTHONPATH= heatcalc_backend \
  /tmp/hl-own-venv/bin/python -I -c \
    'import heatcalc_heat_loss_core as core; import heatcalc_heat_loss_core.api as api; removed={"evaluate_pipe","evaluate_resolved_air_tank","evaluate_resolved_buried_tank","resolve_safety_factor"}; assert core.__all__ == api.__all__; assert all(hasattr(core, name) for name in core.__all__); assert all(not hasattr(core, name) for name in removed)'
```

Behavior probe + benchmark (B0/BF):

```text
docker cp docs/audit/2026-08-14-heat-loss-application-ownership/evidence/facade_behavior_probe.py \
  heatcalc_backend:/tmp/facade_behavior_probe.py
docker cp docs/audit/2026-08-14-heat-loss-application-ownership/evidence/facade_benchmark.py \
  heatcalc_backend:/tmp/facade_benchmark.py
docker exec -w /app heatcalc_backend ruff check \
  /tmp/facade_behavior_probe.py /tmp/facade_benchmark.py
docker exec -w /app heatcalc_backend ruff format --check \
  /tmp/facade_behavior_probe.py /tmp/facade_benchmark.py
docker exec heatcalc_backend sha256sum \
  /tmp/facade_behavior_probe.py /tmp/facade_benchmark.py
docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e PYTHONPATH=/app:/app/packages/heat-loss-core/src -w /tmp heatcalc_backend \
  python facade_behavior_probe.py /tmp/b0-facade-contract.json
docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e PYTHONPATH=/app:/app/packages/heat-loss-core/src -w /tmp heatcalc_backend \
  python facade_benchmark.py /tmp/b0-facade-benchmark.json --rounds 9 --loops 20
docker cp heatcalc_backend:/tmp/b0-facade-contract.json \
  docs/audit/2026-08-14-heat-loss-application-ownership/evidence/b0-facade-contract.json
docker cp heatcalc_backend:/tmp/b0-facade-benchmark.json \
  docs/audit/2026-08-14-heat-loss-application-ownership/evidence/b0-facade-benchmark.json
```

Для BF имена `bf-facade-*.json`; оба результата также копируются из
контейнера в `evidence/` перед сравнением и commit.

## NEXT

**B0 — снять snapshot на committed HEAD без чужого WIP.**
Документы этой очереди, `.gitignore` и SUPERSEDED предыдущей папки
входят в B0.
