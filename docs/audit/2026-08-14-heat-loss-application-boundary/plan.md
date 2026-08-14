# Heat-loss application boundary — актуальная очередь

**Статус:** SUPERSEDED — квартиру формул вынесли (A0–A6 + CalculationError).
AF записан как FAIL из‑за electrical lock-race, не тепла. Дальше тепло
не гостить в чужих сервисах:
`docs/audit/2026-08-14-heat-loss-application-ownership/plan.md`.

**Дата:** 2026-08-14

**Предыдущая очередь:** `docs/audit/2026-08-13-heat-loss-canonical-flow/`
закрыта по формульному cleanup (CF PASS WITH BASELINE DEBT). Этот файл
заменяет её как NEXT для теплопотерь.

**Промпты:** `prompts.md` рядом

**Динамические данные:** только `snapshot.md`, который снимает A0

Единственная ACTIVE frontend-очередь остаётся в
`docs/frontend/refactor-backlog.md`. Эта очередь её не меняет.

Эта папка снята с `/docs/*` точечным исключением в корневом `.gitignore`.
Новые файлы очереди добавляются обычным `git add <file>`. `git add .` и
`git add -f` не нужны. Первый commit очереди (A0) также берёт
`.gitignore` и CLOSED-указатель в
`docs/audit/2026-08-13-heat-loss-canonical-flow/cleanup-plan.md`.
Остальной `/docs/` по-прежнему игнорируется.

## Что уже вынесено — не трогать как «ещё не вынесено»

`heatcalc-heat-loss-core` уже владеет:

- уравнениями `calculate_*`;
- catalog-free контрактами и диапазонами;
- `tm`, `α`, законами `λ`;
- одним execution kernel;
- `FormulaOutcome` (result XOR report).

Пакет не знает приложение, каталог, климат, FastAPI, БД и UI. Это
завершённый extract. Повторять вынос формул в пакет **запрещено**.

В пакет **правильно не входят** и в этой очереди не переезжают:

- справочник изоляции и материалов трубы;
- климат и `K` по диаметру;
- Pydantic API / stored / JSONB-модели;
- русские сообщения и округление pipe facade;
- admin `coefficients` как источник политики.

## Что ещё не обособлено

Обособлены формулы. Не обособлена **квартира приложения** вокруг них.

Сейчас тепловой адаптер живёт гостем в чужих складах:

```text
app/schemas/calculation.py          тепловые Pydantic + электрические API
app/services/calculation_service.py климат, calc_heat_loss, разбор ошибок,
                                    кабели, batch, stale
app/formulas/heat_loss/*.py         тонкий фасад + мёртвые α-обёртки
                                    + coefficients: dict в сигнатуре
```

Целевой прикладной контур:

```text
HTTP / persist / import / admin
        ↓
app.services.heat_loss_application
  ├─ климат и выбор K (pipe: user/climate → admin → None)
  ├─ один catalog resolve на reference-слой
  ├─ вызов фасада с уже выбранным K
  └─ structured error → validation_errors / 422
        ↓
app.formulas.heat_loss
  └─ assemble_prepared_* + evaluate_prepared_* + map result
        ↓
heatcalc_heat_loss_core
  └─ run/assemble/execute, без app.*
```

Схемы формулы живут в `app/schemas/heat_loss.py`.
`calculation.py` после переезда только реэкспортирует их для совместимости,
пока A5b не переведёт production-импорты.

## Принятые решения

### Это не второй extract ядра

Нельзя:

- переносить catalog/climate/Pydantic в `heatcalc-heat-loss-core`;
- менять уравнения, порядок операций, ranges, units;
- менять ключи успешного JSON результата;
- менять `formula_model` / `formula_model_version`;
- унифицировать физику pipe и tank;
- добавлять в JSON температуры границ слоёв — это отдельный trace-контракт;
- чинить air-pipe empty thickness tuple;
- трогать электротехнический расчёт, кроме смены import path;
- выносить `_tank_heat_loss_without_double_safety` в тепловой модуль —
  это политика электрики над готовым JSON.

### Ошибки

Структура `FormulaValidationReport` и `HeatLossPreparationError` уже есть.
Фасад не должен уничтожать её в голый `ValueError`, а сервис не должен
восстанавливать `error_code` разбором русского текста.

Пользовательские литералы, включая точный hot-side текст, сохраняются.
Меняется канал, не формулировка.

`HeatLossPreparationError.path` обязателен. `path=None` не разрешён:
payload всегда делает `field = path` и `fields = {path: message}`.
Неизвестный `issue.code` / `FormulaDomainError.code` — STOP, не
generic-fallback.

Таблица `code → path` (индекс слоя — zero-based, как в
`layer_material_path`):

| code | path |
|---|---|
| `unknown_insulation_material` | `insulation_layers.{i}.material` |
| `missing_insulation_interval` | `insulation_layers.{i}.material` |
| `unselectable_insulation_material` | `insulation_layers.{i}.material` |
| `insulation_catalog_error` | `insulation_layers.{i}.material` |
| `process_temperature_outside_interval` | `insulation_layers.{i}.material` |
| `unavailable_conductivity_branch` | `insulation_layers.{i}.material` |
| `temperature_outside_interval` | `insulation_layers.{i}` |
| `wall_exceeds_pipe_radius` | `wall_thickness` |
| `wall_exceeds_tank_radius` | `wall_thickness` |
| `process_temperature_not_above_ambient` | `process_temperature` |
| `process_temperature_not_above_ground` | `process_temperature` |
| `ground_centerline_inside_pipe` | `pipe_centerline_depth` |
| `invalid_buried_height` | `tank_buried_height` |
| range / `not_finite` / `conductivity_law_required` | `".".join(issue.path)` |

Hot-side не получает суффикс `.material`: это температура слоя, не ошибка
справочника. Frontend-якорь справочника остаётся
`fields.insulation_layers.1.material` для второго слоя.

Запрет substring-классификации в A4/AF относится только к фасаду →
`build_heat_loss_error_payload` / `calculation_service` / admin 422.
`catalog_preparation._catalog_error_code` (префиксы сообщений loader) в
эту очередь не входит: loader ещё бросает голый `ValueError`. Переписывать
resolver «заодно» нельзя.

`assemble_prepared_*` на этой очереди не переписывается на «только report».
Если всплывёт `ValueError` инварианта, фасад мапит его в structured
application error, а не чинит пакет.

### Коэффициент запаса

Окончательный выбор K принадлежит application-слою, не фасаду.

Порядок pipe (один раз, до вызова формулы):

1. уже лежащий на params user/climate `safety_factor`;
2. иначе admin `coefficients["safety_factor"]`, если ключ есть;
3. иначе `None` → профиль `1.1` внутри ядра.

`0.0` — переданное число, затем диапазон `1.0…1.7`. Tank игнорирует
admin coefficients; K обязателен на params.

Application передаёт в фасад **копию** params, на которой уже стоит
выбранный K. Persisted `obj.params` эта копия не меняет: admin K не
записывается как пользовательский ввод. Климат по-прежнему может писать
K в params — это существующее поведение `_apply_climate_policy`, его
не расширять.

Фасад после A3: `calc_pipe_heat_loss(params)` и `calc_tank_heat_loss(params)`.
Нет `coefficients`, нет второго аргумента K, нет повторного user-vs-admin.

### Persist create/update/import

Backend не отклоняет тепловую formula/catalog ошибку HTTP 422 на
create/update. Контракт, который нельзя менять:

- create: **201**, строка сохранена;
- update: **200**, строка сохранена;
- `is_valid=false`, `results=null`, `validation_errors` заполнены.

422 до записи остаётся только у уже существующих object-level отказов
(`ProjectValidationError`: forbidden keys, legacy spec params, лимиты).
Импорт по-прежнему сохраняет невалидный объект с тем же JSONB-смыслом.

Фраза «frontend save gate» здесь означает только клиентский запрет
отправки невалидной формы. Эту очередь его не меняет и не переносит на
backend. Frontend production по умолчанию NOT TOUCHED.

Доказательство consumer payload — с хоста, из корня репозитория:

```text
npm --prefix frontend run test:run -- --project integration \
  src/__tests__/integration/components/ObjectWizardDependencies.validation-highlight.test.tsx
```

Подсветка `field` и `fields.insulation_layers.1.material`. Контейнер
`heatcalc_frontend` — nginx, vitest там не запускать. Browser не нужен,
пока production frontend не менялся. Красный тест — чинить адаптер, не UX.

### Full backend и baseline debt

Каноническая команда полного backend **исключает** live-worker gate:

```text
pytest app/tests --no-cov -q --tb=no --override-ini='addopts=' \
  --ignore=app/tests/integration/worker/test_worker_redis_live.py \
  --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
```

Эти файлы требуют `WORKER_LIVE_REDIS_URL` и при его отсутствии делают
`pytest.fail` на setup. Они — отдельный chaos gate, не часть A0/AF.

Collection / setup / infrastructure errors (нет Redis URL, нет БД,
ошибка импорта при collect) **нельзя** класть в PASS WITH BASELINE DEBT.
Это FAIL текущего прогона или NOT RUN соответствующего gate.

PASS WITH BASELINE DEBT разрешён только для одинакового множества
**assertion failed** nodeids, явно перечисленных в A0. Новый failed ID,
любой error ID, любой collection error — FAIL.

### Facade contract и benchmark

Старые скрипты `docs/audit/2026-08-12-heat-loss-core-regression/evidence/`
**не использовать**. Они импортируют `calc_alpha_vnesh`, передают
`coefficients` в фасад и кладут в JSON сигнатуры и классы исключений —
всё это A2–A4 меняют намеренно.

Локальные скрипты очереди:

| Файл | Скрипт | Смысл |
|---|---|---|
| `a0-facade-contract.json` / `af-facade-contract.json` | `evidence/facade_behavior_probe.py OUTPUT` | поведение; **без** `--rounds` |
| `a0-facade-benchmark.json` / `af-facade-benchmark.json` | `evidence/facade_benchmark.py OUTPUT --rounds 9 --loops 20` | микробенчмарк |

Оба скрипта зовут фасад через адаптер `call_pipe` / `call_tank` /
`call_alpha`: старый `coefficients=` или новая копия params с выбранным
K; α через `resolve_external_alpha` с той же семантикой обёртки, без
импорта `calc_alpha_vnesh`.

В contract JSON и его SHA входят только:

- успешные `pipe_results` / `tank_results` / `tm` / `alpha` /
  `pipe_material_lambda` / `insulation_conductivity` / `versions`;
- у ошибок — `status`, `message` и pydantic `errors` (loc/msg).

Не входят сигнатуры, JSON Schema и `exception_type` / класс исключения.

AF сравнивает contract JSON целиком (размер + SHA-256). Расхождение
успешного результата или защищённого сообщения — FAIL.

A0 отдельно фиксирует SHA-256 обоих oracle-скриптов. AF до запуска
проверяет те же SHA; изменение `facade_behavior_probe.py` или
`facade_benchmark.py` после baseline — FAIL, а не новый baseline.

Benchmark сам по себе не доказывает численную совместимость.

Порог AF по скорости, тот же контейнер/протокол, что A0: медиана
`median_seconds` > `1.15 × A0.median_seconds` — FAIL. Ниже 15% записать
и не блокировать. Другой класс окружения — сравнение NOT RUN, не PASS.

### Совместимость импортов

A5 сначала переносит модели и оставляет identity re-export в
`app.schemas.calculation`. Ломать внешние `from app.schemas.calculation
import PipeHeatLossParams` в том же слайсе нельзя. A5b переводит
production-импорты приложения и ставит ratchet.

### Чужая очередь

В рабочем дереве может лежать незакоммиченный slice публичного API пакета
(`api.py`, сужение `__all__`). Эту очередь с ним не смешивать. A0
стартует только с committed HEAD и без чужого WIP в commit.

## Очередь

| # | Слайс | Суть | Full backend |
|---|---|---|---|
| **A0** | Baseline | HEAD, failed IDs, housing inventory, benchmark | да |
| **A1** | Characterization жилья | Зафиксировать канал ошибок, K, импорты; production нет | нет |
| **A2** | Мёртвые α-обёртки | Удалить `calc_alpha_vnesh` / неиспользуемый `_calc_alpha` | нет |
| **A3** | K до фасада | Фасад без `coefficients: dict` | да |
| **A4** | Structured errors | Report/domain → application error без parse текста | да |
| **A5** | Схемы формулы | `app/schemas/heat_loss.py` + re-export | collect-only |
| **A5b** | Импорты схем | Production больше не берёт тепло из `calculation.py` | collect-only + да |
| **A6** | Application service | Климат + calc + error payload вне CalculationService | да |
| **AF** | Финальная регрессия | Сравнение с A0 | да |

Слайсы строго по порядку. A2 — shrink-only. A3 и A4 — отдельные коммиты:
выбор K и канал ошибок нельзя смешивать. A5 и A5b — отдельные коммиты:
перенос файла и смена импортов нельзя смешивать с логикой.

## Инварианты всей очереди

- Успешный facade JSON байт-в-байт с characterization (ключи, округление,
  pipe vs tank).
- Hot-side русский литерал посимвольно тот же.
- Process-T pre-check остаётся до формулы; hot-side — после.
- Fail-fast/order не превращается в collect-all наружу.
- Create/update при formula/catalog ошибке: 201/200, строка сохранена,
  `is_valid=false`, `results=null`, `validation_errors` заполнены.
  Импорт — тот же persist-invalid. 422 только у прежних object-level
  отказов до записи.
- Admin formula-check на input/catalog/formula failure остаётся 422.
- Один reference layer = один `resolve_reference_insulation`.
- `heatcalc-heat-loss-core` остаётся dependency-free.
- Frontend production по умолчанию NOT TOUCHED. Consumer payload
  проверяется тестом `ObjectWizardDependencies.validation-highlight`.
- `docs/frontend/refactor-backlog.md` не меняется.
- Full backend этой очереди не включает live-worker файлы.

## Критерий закрытия

1. Production-код приложения импортирует тепловые formula-модели из
   `app.schemas.heat_loss`, не из тела `calculation.py`.
2. Климат, выбор K, `calc_heat_loss` и сборка `validation_errors` для тепла
   живут в одном application-модуле; `CalculationService` только делегирует.
3. `calc_pipe_heat_loss` / `calc_tank_heat_loss` не принимают admin-словарь.
4. Тепловые ошибки после Pydantic не восстанавливаются regex/substring по
   русскому тексту.
5. Фасад не содержит мёртвых α-обёрток.
6. Пакет, формулы, JSON результата, ranges и hot-side литерал не изменены.
   AF contract JSON совпадает с A0 (SHA-256); SHA обоих oracle-скриптов
   также совпадают с записанными в A0.
7. Full backend без live-worker: нет новых **failed** nodeids относительно
   A0; error/collection/setup IDs не являются debt.
8. Benchmark записан. Медиана > 15% к A0 на том же окружении — FAIL.
9. Frontend backlog не менялся.

## Канонические команды

Focused backend (подставить список файлов слайса):

```text
docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -w /app heatcalc_backend pytest \
    <files> \
    -q --tb=line --no-cov
```

Collect-only backend без live-worker:

```text
docker exec \
  -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  -w /app heatcalc_backend \
  pytest app/tests --collect-only -q --override-ini='addopts=' \
    --ignore=app/tests/integration/worker/test_worker_redis_live.py \
    --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
```

Full backend без live-worker:

```text
docker exec \
  -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  -w /app heatcalc_backend \
  pytest app/tests --no-cov -q --tb=no --override-ini='addopts=' \
    --ignore=app/tests/integration/worker/test_worker_redis_live.py \
    --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
```

Behavior probe + benchmark (A0/AF):

```text
docker cp docs/audit/2026-08-14-heat-loss-application-boundary/evidence/facade_behavior_probe.py \
  heatcalc_backend:/tmp/facade_behavior_probe.py
docker cp docs/audit/2026-08-14-heat-loss-application-boundary/evidence/facade_benchmark.py \
  heatcalc_backend:/tmp/facade_benchmark.py
docker exec -w /app heatcalc_backend ruff check \
  /tmp/facade_behavior_probe.py /tmp/facade_benchmark.py
docker exec -w /app heatcalc_backend ruff format --check \
  /tmp/facade_behavior_probe.py /tmp/facade_benchmark.py
docker exec heatcalc_backend sha256sum \
  /tmp/facade_behavior_probe.py /tmp/facade_benchmark.py
docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e PYTHONPATH=/app:/app/packages/heat-loss-core/src -w /tmp heatcalc_backend \
  python facade_behavior_probe.py /tmp/a0-facade-contract.json
docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e PYTHONPATH=/app:/app/packages/heat-loss-core/src -w /tmp heatcalc_backend \
  python facade_benchmark.py /tmp/a0-facade-benchmark.json --rounds 9 --loops 20
docker cp heatcalc_backend:/tmp/a0-facade-contract.json \
  docs/audit/2026-08-14-heat-loss-application-boundary/evidence/a0-facade-contract.json
docker cp heatcalc_backend:/tmp/a0-facade-benchmark.json \
  docs/audit/2026-08-14-heat-loss-application-boundary/evidence/a0-facade-benchmark.json
```

Для AF те же команды, имена `af-facade-*.json`.

## NEXT

Эта очередь больше не ACTIVE. Electrical `(202, 423)` не чинить отсюда.

Дальше: `docs/audit/2026-08-14-heat-loss-application-ownership/plan.md`.
