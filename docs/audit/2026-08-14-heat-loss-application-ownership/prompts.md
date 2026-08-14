# Промпты heat-loss application ownership

Каждый блок — отдельный запуск и отдельный commit. Слайсы не склеивать.
Актуальная очередь и контракты: `plan.md` рядом.

Это вынос тепла из чужих сервисов. Формулы и квартира уже в core /
`heat_loss_application`. Не начинай с переноса уравнений в пакет и не
чини electrical `(202, 423)`.

---

## Общий префикс для B0–BF

```text
Работай из корня TLT.
Прочитай AGENTS.md и
docs/audit/2026-08-14-heat-loss-application-ownership/plan.md полностью.

До действий:
1. git status --short;
2. git rev-parse HEAD;
3. предыдущий обязательный слайс этой очереди закоммичен;
4. не трогай чужой WIP. Незакоммиченный slice пакета (api.py, __all__,
   Dockerfile/CI) — STOP. Старт только с committed HEAD.

Один слайс. Characterization first. Не расширяй ALLOWED_SCOPE без STOP /
DECISION NEEDED. Не используй git add .; только адресные файлы слайса.

Запрещено:
- менять формулы, порядок, ranges, units;
- менять ключи успешного JSON и formula_model/version;
- менять pipe/tank rounding и hot-side литерал;
- переносить catalog/climate/Pydantic в heatcalc-heat-loss-core;
- унифицировать pipe и tank;
- чинить air-pipe empty thickness;
- чинить electrical concurrency / query counts / reports / spec generate;
- выносить _tank_heat_loss_without_double_safety;
- импортировать ProjectObject / SQLAlchemy в heat_loss_application;
- менять routes, query keys, UUID, схему БД;
- менять persist create/update 201/200;
- давать admin formula-check climate или admin K;
- менять docs/frontend/refactor-backlog.md;
- запускать незаявленный frontend refactor.

Незапущенная проверка = NOT RUN, не PASS.
Без frontend-diff: frontend NOT TOUCHED / NOT RUN.

Полный backend — B0, B3, B4b, B5, B6, B7, B8, BF. Всегда
--ignore live-worker файлов из plan.md.
Collection/setup/infrastructure error не записывать как baseline debt.

Failed nodeids сравниваются с B0 snapshot ЭТОЙ папки, не с A0
2026-08-14-heat-loss-application-boundary и не с 2026-08-13.

Ищи так: --glob '!**/mutants/**' --glob '!**/.git/**'

Перед commit: git diff --check, git status --short, полный diff слайса.
```

---

## B0 — baseline

```text
SLICE_ID: HL-OWN-B0
OWNER: backend formulas / audit
PRECONDITION: нет чужого package WIP. Документы этой очереди,
.gitignore allowlist и SUPERSEDED-указатель предыдущей папки — свои
файлы B0.
GOAL: Снять динамический baseline жилья, которое ещё гость.
Production-код не менять.

ALLOWED_SCOPE:
  docs/audit/2026-08-14-heat-loss-application-ownership/
  docs/audit/2026-08-14-heat-loss-application-boundary/plan.md
    (только статус/NEXT, уже может быть обновлён)
  .gitignore
NON-GOALS: production, frontend src, пакетные формулы, electrical lock.

Скопируй oracle-скрипты из
docs/audit/2026-08-14-heat-loss-application-boundary/evidence/
  facade_behavior_probe.py
  facade_benchmark.py
в evidence/ этой папки без правок. Не используй 2026-08-12 probes.

Запиши в snapshot.md:
1. git status, HEAD, UTC, контейнер.
2. Inventory гостей (файл:символ:роль):
   - calculation_service re-exports и calc_heat_loss wrappers;
   - try_recalculate шаги;
   - HeatLossRequest/Response/Batch* в calculation.py;
   - admin formula-check pipe/tank import;
   - catalog _catalog_error_code;
   - payload substring markers после typed-веток;
   - кто ещё импортирует тепло из calculation_service.
3. Package gate: pytest / ruff / mypy в packages/heat-loss-core;
   isolated wheel + import heatcalc_heat_loss_core.api.__all__ точными
   командами plan.md. Wheel и venv создаются только в /tmp.
4. Focused heat suite (канонический поток + facade + ranges + catalog +
   single-validation + housing + ratchet + structured errors).
5. Full backend без live-worker. Перечисли failed/error/collection IDs.
   423 electrical concurrency, если упадёт, — в comparison set, с
   пометкой «не тепло». Если не упадёт — в set не класть.
   Запускай полную docker-команду с SECRET_KEY / TEST_DATABASE_URL из
   plan.md, не host pytest. Setup/error/collection делает B0 незавершённым:
   очисти одноразовое состояние тестовой БД и повтори; повторяемый блокер
   → STOP / NOT RUN, не baseline debt и не commit B0.
6. Contract + benchmark командой plan.md. SHA обоих oracle-скриптов.
   Размер и SHA contract JSON. Медиана benchmark. Оба b0 JSON обязательно
   скопируй из container /tmp обратно в evidence/ до commit.
   Так как production после предыдущего AF не менялся, contract должен быть
   byte-identical его af-contract. Benchmark сравни с AF sanity threshold:
   первый результат > +15% → повторить exact run на idle container и
   записать оба; повторное превышение → STOP / DECISION NEEDED, не новый
   завышенный baseline.
7. Frontend: git diff --name-only <B0_parent>..HEAD -- frontend
   (должен быть пуст относительно этой очереди; очередь ещё не меняла
   код — зафиксируй NOT TOUCHED).

Не чини failed IDs. Не объявляй PASS WITH BASELINE DEBT на B0 —
это съёмка, не закрытие.

COMMIT: docs(heat-loss): snapshot application-ownership baseline
```

---

## B1 — characterization оставшихся гостей

```text
SLICE_ID: HL-OWN-B1
OWNER: backend tests
PRECONDITION: B0 committed.
GOAL: Заморозить текущее поведение гостей. Production не менять.

ALLOWED_SCOPE:
  backend/app/tests/unit/services/test_heat_loss_ownership_characterization.py
    (новый) и/или точечные добавления в уже существующие housing-тесты
NON-GOALS: production, массовый rewrite импортов, frontend.

Зафиксируй тестами (не меняя код):
1. apply_climate_policy, build_heat_loss_error_payload,
   pipe_params_with_effective_safety_factor и effective_pipe_safety_factor определены в
   heat_loss_application и реэкспортируются calculation_service
   (is / same object).
2. try_recalculate: climate → canonicalize → calc; при ошибке
   results is None, is_valid is False, validation_errors из payload
   builder; obj.params после climate может измениться — снимок ключей
   K, не «улучшать». Отдельно зафиксируй границы:
   - invalid report до formula не вызывает get_coefficients;
   - переданные coefficients не вызывают get_coefficients;
   - исключение get_coefficients после успешной canonical validation
     возвращает Err, сохраняет canonical obj.params и пишет текущий payload;
   - исключение normalize/climate до присваивания оставляет исходный
     obj.params, а formula/catalog exception после присваивания оставляет
     canonical obj.params.
3. Admin formula_check pipe/tank зовёт evaluate_validated_heat_loss
   без coefficients и без apply_climate_policy.
4. HeatLossRequest / HeatLossResponse / HeatLossBatchJobRequest /
   BatchCalcResponse живут в app.schemas.calculation
   (__module__ или явная привязка).
5. _catalog_error_code: неизвестный материал / missing interval /
   unselectable — текущие code + path + message литералы.
6. Payload: HeatLossPreparationError не идёт в substring-маркеры
   (уже есть). Зафиксируй отдельными cases текущие payload для:
   - ProjectObjectParamsError: OBJECT_TYPE_UNSUPPORTED,
     OBJECT_REQUIRED_FIELDS_MISSING, OBJECT_PARAMS_INVALID и обе
     process_temperature_not_above_* reason;
   - ValidationError с process-T formula_code, с другим formula_code
     и обычной schema error;
   - generic Exception с «неподдерживаемый тип объекта», «неизвестная
     форма» и русским «должен».
   Последний сейчас даёт invalid_object_params — B7 меняет это явно.
7. Application не импортирует app.models и calculation_service.

FOCUSED_PROOF:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/services/test_heat_loss_ownership_characterization.py \
      app/tests/unit/formulas/test_heat_loss_application_housing_characterization.py \
      app/tests/unit/services/test_heat_loss_error_payload_characterization.py \
      app/tests/unit/formulas/test_heat_loss_structured_error_channel.py \
      -q --tb=line --no-cov
  ruff по новым тестам; git diff --check.
Frontend: NOT TOUCHED / NOT RUN.
COMMIT: test(heat-loss): characterize remaining application guests
```

---

## B2 — снять тепловые aliases с CalculationService

```text
SLICE_ID: HL-OWN-B2
OWNER: backend services
PRECONDITION: B1 committed.
GOAL: calculation_service не реэкспортирует climate / payload / K.
Production и тесты, которые брали эти имена с сервиса, импортируют
heat_loss_application.

ALLOWED_SCOPE:
  backend/app/services/calculation_service.py
    (удалить import-as aliases и _apply_climate_policy =
     apply_climate_policy / staticmethod alias)
  точечные test import rewrites только для этих символов
  backend/app/tests/unit/services/test_calculation_service_unit.py
  backend/app/tests/unit/test_pipe_slice2_contract.py
    (все CalculationService._apply_climate_policy перевести на прямой
     import application-функции)
  ratchet: расширить или добавить проверку, что production app.*
    (кроме tests/mutants) не делает
    from app.services.calculation_service import
      apply_climate_policy|build_heat_loss_error_payload|
      pipe_params_with_effective_safety_factor|
      effective_pipe_safety_factor
NON-GOALS: перенос try_recalculate (это B3); удаление
calc_heat_loss на сервисе; HTTP-схемы; frontend.

calc_heat_loss / _calc_heat_loss_with_coefficients могут остаться
как get_coefficients + heat_loss_application.calc_heat_loss.
Не добавляй туда логики.

Не оставляй «from heat_loss_application import X as X» на сервисе
для climate/payload/K — цель слайса убрать гостя, не спрятать его.
Пока B3 не сделан, внутренние вызовы try_recalculate используют
module-qualified heat_loss_application.apply_climate_policy /
build_heat_loss_error_payload; это не re-export имени с сервиса.

FOCUSED_PROOF:
  поиск: символы больше не определены/не реэкспортируются в
    calculation_service.py;
  docker exec ... pytest \
    app/tests/unit/formulas/test_heat_loss_application_housing_characterization.py \
    app/tests/unit/services/test_heat_loss_ownership_characterization.py \
    app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
    app/tests/unit/formulas/test_pipe_heat_loss.py \
    app/tests/unit/formulas/test_heat_loss_structured_error_channel.py \
    app/tests/unit/services/test_heat_loss_error_payload_characterization.py \
    app/tests/unit/services/test_calculation_service_unit.py \
    app/tests/unit/test_pipe_slice2_contract.py \
    -q --tb=line --no-cov
  поиск по backend/app/tests: CalculationService._apply_climate_policy
    отсутствует;
  collect-only backend без live-worker. Ошибка collect — FAIL.
  ruff; git diff --check.
Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): stop reexporting application from service
```

---

## B3 — persist outcome в application

```text
SLICE_ID: HL-OWN-B3
OWNER: backend services
PRECONDITION: B2 committed.
GOAL: climate + canonicalize + calc + payload для объекта живут в
heat_loss_application. CalculationService.try_recalculate только
передаёт готовые coefficients либо injected provider, вызывает
application, пишет поля obj, возвращает Ok/Err.

ALLOWED_SCOPE:
  backend/app/services/heat_loss_application.py
  backend/app/services/calculation_service.py
    (try_recalculate и heat-batch, если он дублирует те же шаги)
  тесты ownership / single-validation / pipe_slice2 persist /
    calculation_service heat recalc
NON-GOALS: ORM в application; electrical batch; task_service;
изменение 201/200 persist-invalid; frontend.

Новый async-вход (имя может быть evaluate_project_object_heat):
  (object_type, params, *, coefficients=None, load_coefficients=None)
    → структура
    params_to_persist: dict | None
      # None = оставить obj.params как есть при ранней normalize/climate ошибке
    is_valid: bool
    results: dict | None
    validation_errors: dict | None
    error_message: str | None

Не передавать и не импортировать ProjectObject.
normalize / validate_and_canonicalize остаются в
project_object_params; application их вызывает.

Контракт коэффициентов и ошибок обязателен:
- application завершает normalize + climate + canonical validation до
  вызова load_coefficients;
- invalid report возвращается без вызова provider;
- готовые coefficients имеют приоритет и provider не вызывается;
- если coefficients не переданы, CalculationService передаёт bound
  self.get_coefficients как injected async provider;
- исключение provider ловится внутри application и превращается тем же
  payload builder в invalid outcome;
- provider не раскрывает application реализацию DB/Redis;
- error_message при is_valid=false не None;
- obj.params пишется только когда params_to_persist не None. Тем самым
  ранняя ошибка сохраняет исходные params, а validation/formula/provider
  error после canonicalization сохраняет canonical params, как до слайса.

Heat batch, который сейчас зовёт _calc_heat_loss_with_coefficients
по одному объекту, переводится на тот же outcome, если иначе
останется вторая копия шагов. Не переписывать progress/DB цикл.

FOCUSED_PROOF:
  docker exec ... pytest \
    app/tests/unit/services/test_heat_loss_ownership_characterization.py \
    app/tests/unit/services/test_heat_loss_single_validation_boundary.py \
    app/tests/unit/test_pipe_slice2_contract.py \
    app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
    app/tests/unit/formulas/test_heat_loss_facade_input_boundary.py \
    app/tests/unit/formulas/test_heat_loss_structured_error_channel.py \
    app/tests/unit/services/test_calculation_service_unit.py \
    app/tests/unit/services/test_calculation_service.py \
    -q --tb=line --no-cov
  поиск: apply_climate_policy / build_heat_loss_error_payload /
    normalize_project_object_params не вызываются из тела
    try_recalculate (только через application).
  Затем full backend командой B0. IDs vs B0.
Frontend: NOT TOUCHED / NOT RUN, если payload field/fields не менялись.
COMMIT: refactor(heat-loss): move object evaluation out of CalculationService
```

---

## B4 — HTTP-конверты в heat_loss schemas

```text
SLICE_ID: HL-OWN-B4
OWNER: backend schemas
PRECONDITION: B3 committed.
GOAL: HeatLossRequest, HeatLossResponse, BatchCalcResponse,
HeatLossBatchJobRequest определены в app.schemas.heat_loss
(или app.schemas.heat_loss_http, реэкспорт из heat_loss).
calculation.py только identity re-export.

ALLOWED_SCOPE:
  backend/app/schemas/heat_loss.py
    и/или backend/app/schemas/heat_loss_http.py
  backend/app/schemas/calculation.py
  точечные тесты housing __module__ / identity
NON-GOALS: смена полей конвертов; production import rewrite (B4b);
снятие formula re-export (B8); frontend.

Не ломай from app.schemas.calculation import HeatLossRequest
в том же слайсе. Объекты те же (X as X).

FOCUSED_PROOF:
  identity: calculation.HeatLossRequest is heat_loss.HeatLossRequest
    (и остальные три);
  collect-only backend без live-worker;
  docker exec ... pytest \
    app/tests/unit/schemas/test_heat_loss_schema_housing_characterization.py \
    app/tests/unit/schemas/test_calculation_schemas.py \
    app/tests/unit/services/test_task_service_unit.py \
    -q --tb=line --no-cov
  ruff; git diff --check.
Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): move HTTP envelopes to heat_loss schemas
```

---

## B4b — production-импорты HTTP-конвертов

```text
SLICE_ID: HL-OWN-B4B
OWNER: backend schemas
PRECONDITION: B4 committed.
GOAL: Production импортирует тепловые HTTP-типы из
app.schemas.heat_loss, не из тела calculation.py.

ALLOWED_SCOPE:
  backend/app/api/v1/calculations.py
  backend/app/api/v1/calc_jobs.py
  backend/app/api/v1/objects.py
  backend/app/services/task_service.py
  ratchet (расширить HEAT_NAMES или отдельный набор HTTP-имён)
  точечные test import rewrites только если collect ломается
NON-GOALS: массовый rewrite тестов; снятие formula re-export;
смена полей.

Тесты могут продолжать импортировать конверты из calculation.

Ratchet: AST production (кроме tests/mutants, calculation.py,
heat_loss.py, heat_loss_http.py) не содержит
  from app.schemas.calculation import HeatLossRequest|HeatLossResponse|
    BatchCalcResponse|HeatLossBatchJobRequest
  и import-module + attribute тех же имён.

FOCUSED_PROOF:
  ratchet PASS;
  docker exec ... pytest \
    app/tests/unit/formulas/test_heat_loss_schema_import_ratchet.py \
    app/tests/integration/api/test_calculations.py \
    app/tests/integration/api/test_calc_jobs.py \
    app/tests/unit/services/test_task_service_unit.py \
    -q --tb=line --no-cov
  collect-only; затем full backend vs B0.
  ruff; git diff --check.
Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): import HTTP envelopes from heat_loss
```

---

## B5 — admin heat preview через application

```text
SLICE_ID: HL-OWN-B5
OWNER: backend api / application
PRECONDITION: B4b committed.
GOAL: Admin pipe/tank formula-check не импортирует
app.formulas.heat_loss. Вызов идёт в application.
Контракт: 422, без climate, без admin K, тот же JSON результата.

ALLOWED_SCOPE:
  backend/app/services/heat_loss_application.py
    (preview_validated_heat_formula или эквивалент)
  backend/app/api/v1/admin.py
    (только heat-ветки; electrical_tt / tank_cable_geometry не трогать)
  housing / admin formula-check тесты
NON-GOALS: применять coefficients в admin; менять 422 на persist;
электро-ветки.

Application принимает уже выбранный formula_type + params dict,
строит Pipe/TankHeatLossParams, зовёт evaluate_validated_heat_loss.
Не ходит в get_coefficients. Не зовёт apply_climate_policy.

HeatLossPreparationError по-прежнему 422 с тем же detail.

FOCUSED_PROOF:
  поиск: admin.py не импортирует formulas.heat_loss
    (evaluator, catalog_preparation) — electrical не должен начать
    импортировать тепловой фасад;
  docker exec ... pytest \
    app/tests/unit/formulas/test_heat_loss_application_housing_characterization.py \
    app/tests/unit/services/test_heat_loss_ownership_characterization.py \
    app/tests/integration/api/test_admin.py \
    -q --tb=line --no-cov
  Затем full backend vs B0.
Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): route admin formula-check through application
```

---

## B6 — catalog говорит code

```text
SLICE_ID: HL-OWN-B6
OWNER: backend reference / formulas
PRECONDITION: B5 committed.
GOAL: Тепловой insulation loader поднимает typed error с code.
catalog_preparation больше не восстанавливает code префиксом сообщения.
Литералы сообщений байт-в-байт те же.

ALLOWED_SCOPE:
  backend/app/reference_data/loader.py
    (только resolve_reference_insulation / selectable / missing interval
     для изоляции; не электрический catalog)
  backend/app/formulas/heat_loss/catalog_preparation.py
  тесты loader / catalog_preparation / structured errors / ownership
NON-GOALS: перенос каталога в core; смена path; смена русских текстов;
pipe material lambda ValueError «заодно».

Typed error наследует ValueError (совместимость). Обязательные поля:
code, message. path ставит catalog_preparation, как сейчас.

После слайса _catalog_error_code удалён. Loader без code — STOP
в resolve_reference_layer, не insulation_catalog_error-угадайка.

Коды те же:
  unknown_insulation_material
  missing_insulation_interval
  unselectable_insulation_material
  (прочие — только если уже существовали)

FOCUSED_PROOF:
  docker exec ... pytest \
    app/tests/unit/reference_data/test_loader.py \
    app/tests/unit/formulas/test_heat_loss_catalog_preparation.py \
    app/tests/unit/formulas/test_heat_loss_structured_error_channel.py \
    app/tests/unit/services/test_heat_loss_error_payload_characterization.py \
    app/tests/unit/formulas/test_heat_loss_application_housing_characterization.py \
    -q --tb=line --no-cov
  поиск: _catalog_error_code отсутствует;
  сообщения неизвестного материала / interval / reselection —
    посимвольно как в B1.
  Затем full backend vs B0.
  Если field/fields payload не менялись: frontend NOT TOUCHED / NOT RUN.
  Если менялись — frontend proof vitest из plan.md.
COMMIT: fix(heat-loss): give insulation catalog a structured code
```

---

## B7 — payload без русских маркеров на leftover

```text
SLICE_ID: HL-OWN-B7
OWNER: backend services
PRECONDITION: B6 committed.
GOAL: build_heat_loss_error_payload не классифицирует unknown
Exception списком «требует/долж/диапазон/…».
Typed-ветки не трогать по смыслу.

ALLOWED_SCOPE:
  backend/app/services/heat_loss_application.py
    (только payload builder)
  characterization / structured error / persist-invalid тесты
NON-GOALS: catalog prefix (уже B6); смена persist 201/200;
смена field для HeatLossPreparationError.

Порядок после слайса:
1. HeatLossPreparationError → structured (path обязателен);
2. ProjectObjectParamsError → только reason/code/fields, без русского
   parse. OBJECT_TYPE_UNSUPPORTED явно маппится в
   unsupported_object_type / object_type; required/invalid и обе
   process-T reason сохраняют B1 payload;
3. ValidationError → обе process-T ошибки определяются по structured
   formula_code из errors()[].ctx; любой другой formula_code и обычная
   schema error сохраняют schema_validation_error. Message substring
   не читать;
4. else → category=formula, error_code=heat_loss_formula_error.

Удалить marker list и generic ветку «неподдерживаемый тип/неизвестная
форма» по строке. Generic message-only exception теперь formula error.
Не вводить новых error_code.

B1-снимок unknown Exception с «должен»: после B7 это
heat_loss_formula_error, не invalid_object_params. Обнови
characterization в том же слайсе.

FOCUSED_PROOF:
  docker exec ... pytest \
    app/tests/unit/services/test_heat_loss_error_payload_characterization.py \
    app/tests/unit/formulas/test_heat_loss_structured_error_channel.py \
    app/tests/unit/services/test_heat_loss_ownership_characterization.py \
    app/tests/unit/test_pipe_slice2_contract.py \
    -q --tb=line --no-cov
  поиск: в heat_loss_application.py нет маркеров
    требует/долж/диапазон/положитель как классификаторов payload.
  Затем full backend vs B0.
  Frontend: если fields/field не менялись для catalog/hot-side —
    NOT TOUCHED / NOT RUN; иначе vitest highlight.
COMMIT: fix(heat-loss): drop leftover payload substring markers
```

---

## B8 — снять formula re-export из calculation.py

```text
SLICE_ID: HL-OWN-B8
OWNER: backend schemas
PRECONDITION: B7 committed.
GOAL: calculation.py больше не импортирует восемь formula-имён из
heat_loss. Тесты, которые брали их из calculation, переводятся на
app.schemas.heat_loss.

ALLOWED_SCOPE:
  backend/app/schemas/calculation.py
  test import rewrites восьми имён
  ratchet: ALLOWED_FILES больше не включает calculation.py для
    этих восьми имён (HTTP-конверты — отдельный набор, уже B4b)
NON-GOALS: удаление HTTP re-export, если он ещё нужен тестам
(HTTP-типы уже в heat_loss; re-export конвертов можно снять в
этом же слайсе ТОЛЬКО если ratchet и тесты переведены — иначе
оставь HTTP re-export и сними только formula-имена).
Не менять поля моделей.

Восемь имён:
  InsulationLayer, InsulationLayerApplied,
  PipeHeatLossParams, StoredPipeHeatParams, PipeHeatLossResult,
  TankHeatLossParams, StoredTankHeatParams, TankHeatLossResult.

FOCUSED_PROOF:
  ratchet PASS (включая attribute / from app.schemas import calculation);
  collect-only;
  docker exec ... pytest \
    app/tests/unit/formulas/test_heat_loss_schema_import_ratchet.py \
    app/tests/unit/schemas/test_heat_loss_schema_housing_characterization.py \
    app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
    app/tests/unit/schemas/test_heat_loss_range_characterization.py \
    -q --tb=line --no-cov
  Затем full backend vs B0.
Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): drop formula reexports from calculation
```

---

## BF — финальная регрессия

```text
SLICE_ID: HL-OWN-BF
OWNER: qa / formulas
PRECONDITION: B8 committed; clean worktree.
GOAL: Доказать критерии закрытия plan.md на final HEAD.
Production/test code не менять; только snapshot/evidence.

ALLOWED_SCOPE:
  docs/audit/2026-08-14-heat-loss-application-ownership/snapshot.md
  docs/audit/2026-08-14-heat-loss-application-ownership/evidence/bf-*.json|md|log
NON-GOALS: чинить дефекты внутри BF. Новая регрессия → точечный
corrective slice, затем повторить BF.

Проверь и запиши:
1. git status, HEAD, UTC.
2. Architecture (поиск + цитаты file:line):
   - нет production import climate/payload/K из calculation_service;
   - try_recalculate не вызывает climate/payload/normalize напрямую;
   - HTTP-конверты тепла из app.schemas.heat_loss в production;
   - admin.py не импортирует app.formulas.heat_loss;
   - _catalog_error_code отсутствует;
   - payload без русских marker-классификаторов;
   - calculation.py без восьми formula-имён;
   - application без app.models / calculation_service;
   - пакет без app.*; нет shim formulas.heat_loss.core;
   - calc_* без coefficients.
3. Package pytest / ruff / mypy + isolated wheel + __all__ import.
4. Focused heat suite как в B0 плюс ownership / ratchet.
5. Full backend командой B0. Failed IDs ⊆ B0. Новый failed —
   BLOCKER. error/collection — FAIL, не debt.
6. Oracle SHA = B0 до запуска probes. Contract size+SHA = B0.
   Benchmark: все раунды, обе медианы, отношение BF/B0.
   BF.median > 1.15 × B0.median — FAIL.
7. Persist 201/200 invalid pipe; admin 422; hot-side литерал;
   K matrix characterization.
8. Frontend diff B0_HEAD..HEAD пуст → NOT TOUCHED / NOT RUN.
9. docs/frontend/refactor-backlog.md не менялся.

Verdict только один:
  PASS
  PASS WITH BASELINE DEBT — только те же B0 assertion-failed IDs
  FAIL — новый failed; error/collection; contract/oracle SHA;
         benchmark > +15%; NOT RUN выдан за PASS

COMMIT: docs(heat-loss): record application-ownership regression proof
```
