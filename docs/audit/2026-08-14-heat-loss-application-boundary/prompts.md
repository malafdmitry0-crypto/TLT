# Промпты heat-loss application boundary

Каждый блок ниже — отдельный запуск и отдельный commit. Слайсы не склеивать.
Актуальная очередь и контракты: `plan.md` рядом.

Это вынос **прикладного жилья** теплопотерь. Формулы уже в
`heatcalc-heat-loss-core`. Не начинай с переноса уравнений в пакет.

---

## Общий префикс для A0–AF

```text
Работай из корня TLT.
Прочитай AGENTS.md и
docs/audit/2026-08-14-heat-loss-application-boundary/plan.md полностью.

До действий:
1. git status --short;
2. git rev-parse HEAD;
3. убедись, что предыдущий обязательный слайс этой очереди закоммичен;
4. не трогай чужой WIP. Если в дереве есть незакоммиченный slice пакета
   (api.py, сужение __all__, Dockerfile/CI пакета) — STOP. Эта очередь
   стартует только на committed HEAD без чужих файлов в commit.

Один слайс. Characterization first. Не расширяй ALLOWED_SCOPE без STOP /
DECISION NEEDED. Не используй git add .; добавляй только адресные файлы
слайса обычным git add (эта audit-папка больше не в /docs/* ignore).

Запрещено:
- менять формулы, порядок операций, ranges, units;
- менять ключи успешного JSON результата и formula_model/version;
- менять pipe/tank rounding;
- менять hot-side ValueError/message литерал;
- переносить catalog/climate/Pydantic в heatcalc-heat-loss-core;
- унифицировать физику pipe и tank;
- добавлять температуры границ слоёв в API JSON;
- чинить air-pipe empty thickness tuple;
- менять routes, query keys, UUID, схему БД;
- трогать электротехнический расчёт кроме вынужденной смены import path;
- выносить _tank_heat_loss_without_double_safety в тепловой модуль;
- менять docs/frontend/refactor-backlog.md;
- запускать незаявленный frontend refactor.

Незапущенная проверка = NOT RUN, не PASS.

Для слайсов без frontend-diff: frontend NOT TOUCHED / NOT RUN.
Не запускай test:agent-dod:dual-safe без отдельного прямого запроса.
Полный backend suite — A0, A3, A4, A5b, A6, AF. Команда всегда с
--ignore live-worker файлов из plan.md. Collection/setup/infrastructure
error не записывать как baseline debt.

Failed nodeids сравниваются с A0 snapshot этой папки, не со старыми
числами 2026-08-13.

Исключая generated mutation sandboxes, ищи так:
  --glob '!**/mutants/**' --glob '!**/.git/**'

Перед commit: git diff --check, git status --short, полный diff своего
слайса. Commit содержит только файлы слайса.
```

---

## A0 — актуальный baseline

```text
SLICE_ID: HL-APP-A0
OWNER: backend formulas / audit
PRECONDITION: нет чужого package WIP (api.py, __all__, Dockerfile/CI
пакета). Документы этой очереди, .gitignore allowlist и CLOSED-указатель
2026-08-13 — свои файлы A0, не чужой WIP.
GOAL: Переснять динамический baseline жилья приложения. Production-код
формул не менять.

ALLOWED_SCOPE:
  docs/audit/2026-08-14-heat-loss-application-boundary/
  docs/audit/2026-08-13-heat-loss-canonical-flow/cleanup-plan.md
  .gitignore
NON-GOALS: production formulas, A1–AF логика, frontend src, пакетные
формулы. Probe-скрипты уже лежат в evidence/; A0 их запускает, не
переписывает под старый 2026-08-12 probe.

Запиши в snapshot:
1. Полный commit hash, UTC, host/container/Python, clean/dirty.
2. Focused contract suite:
   docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
     -w /app heatcalc_backend pytest \
       app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
       app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
       app/tests/unit/formulas/test_heat_loss_validation_entrypoint_characterization.py \
       app/tests/unit/schemas/test_heat_loss_range_characterization.py \
       app/tests/unit/formulas/test_heat_loss_formula_ownership.py \
       app/tests/unit/formulas/test_heat_loss_catalog_preparation.py \
       app/tests/unit/services/test_heat_loss_single_validation_boundary.py \
       -q --tb=line --no-cov
3. Package gate, cwd=/app/packages/heat-loss-core в heatcalc_backend:
   python -m pytest tests -q --no-cov
   ruff check src tests
   mypy src tests
4. Full backend suite без live-worker gate:
   docker exec \
     -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
     -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
     -w /app heatcalc_backend \
     pytest app/tests --no-cov -q --tb=no --override-ini='addopts=' \
       --ignore=app/tests/integration/worker/test_worker_redis_live.py \
       --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
   Запиши отдельно:
   - failed nodeids (assertion);
   - error nodeids (если есть — A0 FAIL, не debt);
   - collection errors (если есть — A0 FAIL / NOT RUN);
   - skipped.
   Live-worker файлы в этот прогон не входят. Если кто-то запустил их
   без WORKER_LIVE_REDIS_URL — это NOT RUN отдельного chaos gate,
   не baseline. Не добавляй их failed/error в A0 comparison set.
5. Read-only housing inventory (executable code, не исторические docs):
   - какие тепловые классы живут в app/schemas/calculation.py
     (от ranges/InsulationLayer до HeatLossRequest/Response/BatchCalc);
   - какие тепловые символы живут в app/schemas/json_shapes.py;
   - методы и свободные функции в calculation_service.py:
     build_heat_loss_error_payload, calc_heat_loss,
     _calc_heat_loss_with_coefficients, _apply_climate_policy
     и их callers (API, excel import, admin, tests);
   - живые production-вызовы calc_pipe_heat_loss(..., coefficients=);
   - живые production-вызовы calc_alpha_vnesh и tank._calc_alpha;
   - места, где build_heat_loss_error_payload парсит русский текст
     (подстроки, marker-списки);
   - импорт-граф: кто берёт PipeHeatLossParams/Result из calculation.py.
6. Ссылки на уже существующие тесты, которые фиксируют:
   - facade JSON и разное округление pipe/tank;
   - K matrix (user > admin > profile; 0 передано; tank ignores coefficients);
   - HeatLossPreparationError.code/path;
   - hot-side литерал;
   - process-T pre-check;
   - import invalid → is_valid=false/results=null;
   - admin formula-check 422;
   - create 201 / update 200 при невалидной формуле (persist-invalid).
7. Локальные probe этой очереди, не 2026-08-12 scripts.
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
   Запиши SHA-256 обоих oracle-скриптов, а также размер и SHA-256 contract
   JSON. Медиану бенчмарка — только в snapshot. После A0 oracle-скрипты
   immutable: их SHA должен совпасть в AF.
   Не запускай heat_loss_differential_probe.py / heat_loss_benchmark.py
   из 2026-08-12.

Если контейнер или БД недоступны — STOP и NOT RUN. Не сочиняй baseline
по snapshot 2026-08-13.
Frontend: NOT TOUCHED / NOT RUN.
COMMIT: docs(heat-loss): snapshot application-boundary baseline
```

---

## A1 — characterization жилья

```text
SLICE_ID: HL-APP-A1
OWNER: backend formulas
PRECONDITION: A0 committed.
GOAL: Зафиксировать текущее поведение жилья так, чтобы A2–A6 не гадали.
Production-код не менять.

ALLOWED_SCOPE:
  новые или дополненные characterization-тесты только в
    backend/app/tests/unit/formulas/
    backend/app/tests/unit/services/
    backend/app/tests/unit/schemas/
  docs/audit/2026-08-14-heat-loss-application-boundary/snapshot.md
    (ссылки на новые тесты, без новых нормативных правил)
NON-GOALS: production, удаление хелперов, смена сигнатур, frontend.

Дописать, если ещё не зафиксировано отдельным тестом:

1. Канал ошибок после успешного Pydantic:
   - catalog/process-T → HeatLossPreparationError с code и
     insulation_layers.{index}.material;
   - hot-side → ValueError с точным литералом;
   - domain/range из фасада → ValueError;
   - build_heat_loss_error_payload для HeatLossPreparationError
     заполняет field и fields без parse текста;
   - build_heat_loss_error_payload для hot-side/domain ValueError
     сейчас восстанавливает code/field из message — снять золотой
     payload as-is, не «улучшать» его в этом слайсе.
2. Сигнатура фасада:
   calc_pipe_heat_loss(params, coefficients=) читает только
   coefficients["safety_factor"];
   calc_tank_heat_loss принимает coefficients и игнорирует их.
3. Жильё символов:
   identity-тест или явный список: какие имена теплового контракта
   импортируются из app.schemas.calculation сегодня.
4. CalculationService.calc_heat_loss и admin formula-check зовут
   один evaluate_validated_heat_loss.
5. Persist: create 201 / update 200 при невалидной формуле уже
   покрыты существующими object/import тестами — сошлись на них в
   snapshot, не выдумывай новый rollback.

Не плоди второй набор range-тестов. Не копируй C0/C5 characterization.
Если факт уже покрыт — сошлись на существующий тест в snapshot.

FOCUSED_PROOF:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
      app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
      app/tests/unit/formulas/test_heat_loss_catalog_preparation.py \
      <новые characterization файлы слайса> \
      -q --no-cov
  git diff --check.
Full backend: NOT RUN. Frontend: NOT TOUCHED / NOT RUN.
COMMIT: test(heat-loss): characterize application housing
```

---

## A2 — удалить мёртвые α-обёртки

```text
SLICE_ID: HL-APP-A2
OWNER: backend formulas
PRECONDITION: A1 committed.
GOAL: Фасад не содержит неиспользуемых обёрток resolve_external_alpha.

ALLOWED_SCOPE:
  backend/app/formulas/heat_loss/pipe.py
  backend/app/formulas/heat_loss/tank.py
  тесты, которые импортируют calc_alpha_vnesh или tank._calc_alpha
NON-GOALS: coefficients, ошибки, схемы, сервис, frontend, пакет.

До удаления докажи отсутствие живых production-consumers поиском:
  calc_alpha_vnesh
  _calc_alpha
по backend/app, backend/packages, scripts, frontend, e2e, qa-agent, CI,
исключая **/mutants/** и сам удаляемый символ.

Совпадения в тестах перечисли. Тестовые импорты _calc_alpha /
calc_alpha_vnesh переведи на:
  heatcalc_heat_loss_core.profile.resolve_external_alpha
или на поля результата (alpha_vnesh_applied). Не оставляй тест, который
держится только за мёртвую обёртку.

pipe.calc_alpha_vnesh и tank._calc_alpha удалить, если production
вызовов нет. resolve_insulation_tm в insulation.py не трогать: это
не α-обёртка фасада и у неё могут быть живые callers.

Поведение α не менять. Не копировать формулу ветра обратно в фасад.

FOCUSED_PROOF:
  повторный consumer search;
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/formulas/test_pipe_heat_loss.py \
      app/tests/unit/formulas/test_tank_heat_loss.py \
      app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
      -q --no-cov
  docker exec -w /app heatcalc_backend ruff check \
    app/formulas/heat_loss/pipe.py app/formulas/heat_loss/tank.py
  git diff --check.
Full backend: NOT RUN. Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): remove dead facade alpha wrappers
```

---

## A3 — выбрать K до фасада

```text
SLICE_ID: HL-APP-A3
OWNER: backend formulas
PRECONDITION: A2 committed.
GOAL: Фасад больше не принимает admin-словарь и не выбирает K.
Окончательный K выбирает application-слой.

ALLOWED_SCOPE:
  backend/app/formulas/heat_loss/pipe.py
  backend/app/formulas/heat_loss/pipe_preparation.py
  backend/app/formulas/heat_loss/tank.py
  backend/app/formulas/heat_loss/tank_preparation.py
  backend/app/formulas/heat_loss/evaluator.py
  backend/app/services/calculation_service.py
    (применить выбранный K на копии params до evaluate_validated_heat_loss)
  backend/app/api/v1/admin.py
    (только если admin preview передаёт coefficients в тепло)
  backend/app/tests/unit/formulas/test_heat_loss_evaluator.py
  тесты, которые вызывают calc_*_heat_loss(..., coefficients=)
    или evaluate_validated_heat_loss(..., coefficients=)
NON-GOALS: канал ошибок, перенос схем, новый сервис, frontend, пакетные
формулы, климатическая матрица D≥100 / D<100 (она уже в сервисе).

Контракт после слайса:

  def calc_pipe_heat_loss(params: PipeHeatLossParams) -> PipeHeatLossResult
  def calc_tank_heat_loss(params: TankHeatLossParams) -> TankHeatLossResult

Фасад читает только params.safety_factor. Нельзя оставить второй
аргумент safety_factor «на всякий случай»: тогда precedence снова
окажется в фасаде.

Application до вызова:
  1. климат уже мог записать K в params (не менять это);
  2. если pipe K всё ещё None и в admin coefficients есть
     safety_factor — model_copy / эквивалент только для вызова формулы;
  3. persisted obj.params не получает admin K от этого copy.
Tank: coefficients и раньше игнорировались; dict просто исчезает.

effective_pipe_safety_factor живёт в application/service, не в фасаде.
Не тащи словарь coefficients внутрь pipe_preparation.

Сохрани байт-в-байт facade JSON и K-matrix тесты:
  user/climate K побеждает admin;
  admin только если user K нет;
  profile 1.1 если обоих нет;
  admin 0 на новом пути отклоняется диапазоном;
  tank требует safety_factor;
  admin ground_conductivity не меняет Q.

Вызовы calc_pipe_heat_loss(..., coefficients=) и
evaluate_validated_heat_loss(..., coefficients=) переписать: K
подставляется в копию params до вызова, либо тем же application
helper. Сигнатура evaluate_validated_heat_loss тоже без coefficients.
Не оставлять dict-kwargs на фасаде и на evaluator.

FOCUSED_PROOF:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
      app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
      app/tests/unit/formulas/test_pipe_heat_loss.py \
      app/tests/unit/formulas/test_mutation_resilience.py \
      app/tests/unit/formulas/test_heat_loss_evaluator.py \
      -q --no-cov
  rg по backend/app backend/app/tests scripts --glob '!**/mutants/**':
    у calc_pipe_heat_loss / calc_tank_heat_loss /
    evaluate_validated_heat_loss нет параметра coefficients и нет
    отдельного safety_factor= в сигнатуре фасада/evaluator.
Затем full backend той же командой A0. IDs vs A0.
Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): resolve safety factor before facade
```

---

## A4 — structured errors без разбора текста

```text
SLICE_ID: HL-APP-A4
OWNER: backend formulas / API errors
PRECONDITION: A3 committed.
GOAL: После успешного Pydantic тепловая ошибка доходит до
validation_errors / admin 422 как structured объект. Сервис не парсит
русский текст, чтобы узнать code и field.

ALLOWED_SCOPE:
  backend/app/formulas/heat_loss/outcome_errors.py
  backend/app/formulas/heat_loss/catalog_preparation.py
    (только если нужен общий тип ошибки; не менять resolver)
  backend/app/formulas/heat_loss/pipe.py
    (перевод report/domain → structured error; не map результата)
  backend/app/formulas/heat_loss/tank.py
    (то же)
  backend/app/services/calculation_service.py
    (build_heat_loss_error_payload: ветка structured heat error)
  backend/app/api/v1/admin.py
    (тот же тип, 422, тот же пользовательский detail)
  characterization/wiring tests, которые фиксируют payload
NON-GOALS: новые ключи успешного JSON, frontend production, пакет,
перенос схем, collect-all наружу, смена hot-side литерала.

Канонический тип — уже существующий HeatLossPreparationError
(code, message, path, category) либо один новый рядом с ним, если
подкласс/алиас нужен, чтобы не смешивать catalog и formula. Не плоди
третий параллельный payload. path обязателен; path=None запрещён.

Правила маппинга — таблица code → path в plan.md. Кратко:
1. FormulaValidationReport → structured error по issues[0]
   (fail-fast наружу). path только из таблицы, не свободный join,
   кроме range / not_finite / conductivity_law_required.
2. temperature_outside_interval: path=insulation_layers.{i}
   (без .material). Литерал hot-side посимвольно тот же, :g и номер
   слоя 1-based в тексте.
3. FormulaDomainError conductivity_* → unavailable_conductivity_error
   как сейчас, path=insulation_layers.{i}.material.
4. wall_exceeds_* / ground_centerline / process_temperature_not_above_*
   / invalid_buried_height — коды и path из таблицы, тексты как в
   нынешних ValueError.
5. Неизвестный issue.code / domain code — STOP / DECISION NEEDED.
   Не глотай в generic heat_loss_formula_error и не ставь path="".

Не входит в A4: catalog_preparation._catalog_error_code и тексты
loader. Resolver оставить. Запрет substring — только фасад и
build_heat_loss_error_payload / admin handler.

build_heat_loss_error_payload:
  если это structured heat error — вернуть code/category/message/field/
  fields ровно как для текущего HeatLossPreparationError;
  не заходить в substring/marker-ветку для этих исключений.
  Ветки ProjectObjectParamsError и Pydantic ValidationError не ломать.

Admin formula-check ловит тот же тип и отвечает 422 с тем же detail
(исходное русское message). Не оставляй generic 400 на этих путях.

Frontend production не менять. Consumer proof с хоста, из корня TLT:
  npm --prefix frontend run test:run -- --project integration \
    src/__tests__/integration/components/ObjectWizardDependencies.validation-highlight.test.tsx
Кейсы field и fields.insulation_layers.1.material.
heatcalc_frontend — nginx, vitest там не запускать.
Красный тест = ломаный payload, чинить адаптер.
Browser и dual-safe не запускать.
Если понадобится менять production frontend — STOP, отдельный слайс.

Сними золотые payload из A1: после A4 message и field известных
случаев совпадают; code больше не из substring в сервисе.

FOCUSED_PROOF:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
      app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
      app/tests/unit/formulas/test_heat_loss_catalog_preparation.py \
      app/tests/unit/formulas/test_heat_loss_material_validation_wiring.py \
      app/tests/unit/services/test_heat_loss_single_validation_boundary.py \
      app/tests/unit/formulas/test_heat_loss_validation_entrypoint_characterization.py \
      <A1 error-payload tests> \
      -q --no-cov
  Докажи, что build_heat_loss_error_payload больше не использует
  подстроки "долж"/"диапазон"/hot-side литерал, чтобы классифицировать
  тепловую formula/catalog ошибку после фасада. Pydantic/object-params
  ветки могут остаться. _catalog_error_code в resolver не трогать и
  не требовать его удаления.
  Из корня TLT, если production frontend не менялся:
    npm --prefix frontend run test:run -- --project integration \
      src/__tests__/integration/components/ObjectWizardDependencies.validation-highlight.test.tsx
Затем full backend командой A0 (с ignore live-worker). IDs vs A0.
Frontend production: NOT TOUCHED.
COMMIT: fix(heat-loss): keep formula errors structured
```

---

## A5 — перенести тепловые схемы формулы

```text
SLICE_ID: HL-APP-A5
OWNER: backend schemas
PRECONDITION: A4 committed.
GOAL: Formula/stored/result модели тепла живут в app/schemas/heat_loss.py.
calculation.py только реэкспортирует те же объекты.

ALLOWED_SCOPE:
  backend/app/schemas/heat_loss.py          (новый)
  backend/app/schemas/calculation.py        (вырезать + re-export)
  backend/app/schemas/heat_loss_core_validation.py
    (только если иначе цикл импорта; не менять семантику)
  минимальный тест identity re-export
NON-GOALS: смена полей, переписывание всех импортов, json_shapes,
сервис, frontend, пакет.

Перенести как есть, без правок контракта:
  range aliases, нужные только теплу;
  InsulationLayer, InsulationLayerApplied;
  PipeHeatLossParams, StoredPipeHeatParams, PipeHeatLossResult;
  TankHeatLossParams, StoredTankHeatParams, TankHeatLossResult.

Не переносить в этом слайсе:
  HeatLossRequest / HeatLossResponse / BatchCalcResponse —
  это HTTP envelope, не formula schema;
  любые Electrical* / SelfRegulating* / report типы.

В calculation.py оставить:

  from app.schemas.heat_loss import (
      InsulationLayer as InsulationLayer,
      ...
  )

Каждый перенесённый символ должен быть `is` identical, не копией.
Если перенос рождает import cycle — STOP и вынеси общий кусок в
уже существующий heat_loss_core_validation / insulation labels,
не создавай schemas/heat_loss_base.py «на всякий случай».

FOCUSED_PROOF:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/schemas/test_heat_loss_range_characterization.py \
      app/tests/unit/schemas/test_calculation_schemas.py \
      app/tests/unit/formulas/test_heat_loss_formula_ownership.py \
      app/tests/unit/schemas/test_heat_loss_pipe_range_core_wiring.py \
      app/tests/unit/schemas/test_heat_loss_tank_range_core_wiring.py \
      -q --no-cov
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend python -c \
    "from app.schemas import calculation, heat_loss; names=('InsulationLayer','InsulationLayerApplied','PipeHeatLossParams','StoredPipeHeatParams','PipeHeatLossResult','TankHeatLossParams','StoredTankHeatParams','TankHeatLossResult'); assert all(getattr(calculation, n) is getattr(heat_loss, n) for n in names)"
  docker exec -w /app heatcalc_backend ruff check \
    app/schemas/heat_loss.py app/schemas/calculation.py
  docker exec \
    -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
    -w /app heatcalc_backend \
    pytest app/tests --collect-only -q --override-ini='addopts=' \
      --ignore=app/tests/integration/worker/test_worker_redis_live.py \
      --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
  Любая ошибка collect — FAIL слайса (перенос определений ловит cycle).
  git diff --check.
Full backend suite: NOT RUN (это A5b). Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): move formula schemas to heat_loss module
```

---

## A5b — production-импорты схем

```text
SLICE_ID: HL-APP-A5B
OWNER: backend schemas
PRECONDITION: A5 committed.
GOAL: Executable application code импортирует тепловые formula-модели
из app.schemas.heat_loss. calculation.py остаётся совместимым
re-export для тестов и внешнего кода.

ALLOWED_SCOPE:
  backend/app/**/*.py кроме tests — смена import path
  backend/app/tests/unit/formulas/test_heat_loss_core_package_imports.py
    или новый ratchet-тест импортов схем
  точечные test import rewrites, только если тест ломается из-за
  цикла/локации, не массовый rewrite всех тестов
NON-GOALS: удаление re-export, json_shapes, frontend, новые поля.

Production-модули, которые обязаны перейти:
  app/formulas/heat_loss/*
  app/services/project_object_params.py
  app/services/calculation_service.py
  app/api/v1/admin.py
  другие живые app.* callers из A0 inventory

Тесты могут продолжать импортировать из calculation — это
совместимость. Не устраивай косметический rewrite 40 тест-файлов.

Ratchet: AST по backend/app (исключая tests, mutants, schemas/calculation.py,
schemas/heat_loss.py) не содержит
  from app.schemas.calculation import <HeatName>
  и
  import app.schemas.calculation + attribute HeatName
для перенесённого набора имён.

FOCUSED_PROOF:
  ratchet test PASS;
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/formulas/test_heat_loss_formula_ownership.py \
      app/tests/unit/services/test_heat_loss_single_validation_boundary.py \
      app/tests/unit/formulas/test_heat_loss_evaluator.py \
      -q --no-cov
  ruff по затронутым файлам; git diff --check.
Обязательно collect-only всего backend:
  docker exec \
    -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
    -w /app heatcalc_backend \
    pytest app/tests --collect-only -q --override-ini='addopts=' \
      --ignore=app/tests/integration/worker/test_worker_redis_live.py \
      --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
Любая ошибка collect — FAIL слайса, не «потом в A6».
Затем full backend:
  docker exec \
    -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
    -w /app heatcalc_backend \
    pytest app/tests --no-cov -q --tb=no --override-ini='addopts=' \
      --ignore=app/tests/integration/worker/test_worker_redis_live.py \
      --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
IDs vs A0.
Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): import formula schemas from heat_loss
```

---

## A6 — вынести application service

```text
SLICE_ID: HL-APP-A6
OWNER: backend services
PRECONDITION: A5b committed.
GOAL: Климат, выбор K, запуск формулы и сборка теплового
validation_errors живут в одном модуле. CalculationService
только делегирует.

ALLOWED_SCOPE:
  backend/app/services/heat_loss_application.py   (новый)
  backend/app/services/calculation_service.py
    (вырезать тепловые функции, оставить делегирование и электрику)
  backend/app/services/excel_import_service.py
    (import path build_heat_loss_error_payload)
  backend/app/api/v1/calculations.py
    (может продолжать звать service.calc_heat_loss)
  backend/app/api/v1/admin.py
    (тот же application entry, если preview дублирует сервис)
  тесты, которые импортируют build_heat_loss_error_payload
    или _apply_climate_policy из calculation_service
NON-GOALS: электротехнический pipeline, batch/stale кроме вызова
теплового entry, frontend, пакет, json_shapes, project_object_params
как таковой (нормализация объекта остаётся там).

Новый модуль владеет:
  apply_climate_policy
  resolve_pipe_admin_safety_factor / копия params с выбранным K
  calc_heat_loss(object_type, data, *, coefficients, apply_climate, stored)
    — coefficients остаются входом application-слоя, не фасада
  build_heat_loss_error_payload

Не владеет:
  mark_electrical_calculations_stale
  cable catalog
  _tank_heat_loss_without_double_safety
  persist ProjectObject — try_recalculate остаётся на сервисе объекта
  и вызывает новый модуль.

CalculationService.calc_heat_loss и try_recalculate сохраняют внешние
сигнатуры. HTTP /heat-loss не меняется.

Климатическая матрица D≥100 → 1.1 / D<100 → 1.12 переносится
байт-в-байт. Не «улучшать» и не дублировать её в ядре.

heat_contract.py не удалять и не сливать, если он уже реестр ключей
params. Новый модуль может его импортировать.

FOCUSED_PROOF:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/services/test_heat_loss_single_validation_boundary.py \
      app/tests/unit/formulas/test_heat_loss_catalog_preparation.py \
      app/tests/unit/formulas/test_heat_loss_validation_entrypoint_characterization.py \
      app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
      app/tests/unit/services/test_heat_contract.py \
      -q --no-cov
  Докажи поиском: build_heat_loss_error_payload и _apply_climate_policy
  больше не определены в calculation_service.py; там только import/delegate
  если нужен совместимый атрибут.
Затем full backend командой A0. IDs vs A0.
Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): isolate application calculation service
```

---

## AF — финальная регрессия

```text
SLICE_ID: HL-APP-AF
OWNER: qa / formulas
PRECONDITION: A6 committed; clean worktree.
GOAL: Доказать критерии закрытия plan.md на final HEAD.
Production/test code не менять; только snapshot/evidence.

ALLOWED_SCOPE:
  docs/audit/2026-08-14-heat-loss-application-boundary/snapshot.md
  docs/audit/2026-08-14-heat-loss-application-boundary/evidence/af-*.json|md|log
NON-GOALS: чинить дефекты внутри AF. Новая регрессия → точечный
corrective slice, затем повторить AF.

Проверь и запиши:
1. git status, final HEAD, UTC.
2. Architecture:
   - production app.* (кроме tests, calculation.py re-export) импортирует
     formula-модели из app.schemas.heat_loss;
   - calc_* не принимают coefficients;
   - calc_alpha_vnesh / tank._calc_alpha отсутствуют;
   - build_heat_loss_error_payload и climate живут в heat_loss_application;
   - тепловые formula/catalog ошибки после фасада не классифицируются
     substring-маркерами в heat_loss_application / бывшем
     calculation_service; _catalog_error_code в resolver не входит
     в этот запрет;
   - пакет dependency-free; shim app.formulas.heat_loss.core отсутствует.
3. Package: pytest / ruff / mypy в packages/heat-loss-core;
   isolated wheel + __all__ import.
4. Focused facade + canonical-flow + catalog + single-validation suite.
5. Full backend командой A0 (без live-worker). Сравнивать только
   assertion-failed nodeids с A0. Fewer допустимо. Новый failed ID —
   BLOCKER. Любой error / collection / setup ID — FAIL, не debt.
6. Два артефакта локальными скриптами очереди (не 2026-08-12):
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
   Сравни SHA обоих oracle-скриптов с A0 до запуска. Любое расхождение —
   FAIL: baseline oracle нельзя менять между A0 и AF.
   docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
     -e PYTHONPATH=/app:/app/packages/heat-loss-core/src -w /tmp heatcalc_backend \
     python facade_behavior_probe.py /tmp/af-facade-contract.json
   docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
     -e PYTHONPATH=/app:/app/packages/heat-loss-core/src -w /tmp heatcalc_backend \
     python facade_benchmark.py /tmp/af-facade-benchmark.json --rounds 9 --loops 20
   docker cp heatcalc_backend:/tmp/af-facade-contract.json \
     docs/audit/2026-08-14-heat-loss-application-boundary/evidence/af-facade-contract.json
   docker cp heatcalc_backend:/tmp/af-facade-benchmark.json \
     docs/audit/2026-08-14-heat-loss-application-boundary/evidence/af-facade-benchmark.json
   Сравни contract с A0: размер и SHA-256. Расхождение — FAIL (полный
   diff ключей в snapshot). Это главная защита от тихой смены
   результата. Сигнатуры и классы исключений в JSON нет.
   Benchmark: все раунды, обе медианы, отношение AF/A0. Если
   AF.median_seconds > 1.15 × A0.median_seconds на том же классе
   окружения — FAIL. Иначе записать и не блокировать. Другое
   окружение — сравнение скорости NOT RUN.
7. Facade characterization: JSON, hot-side литерал, K matrix,
   process-T, import invalid, persist 201/200 при невалидной формуле.
8. Diff A0_HEAD..HEAD по frontend:
   нет файлов → NOT TOUCHED / NOT RUN;
   есть → STOP: эта очередь не должна была менять frontend без отдельного
   решения.
9. docs/frontend/refactor-backlog.md не менялся этой очередью.

Verdict только один:
  PASS — обязательные proofs запущены, contract SHA совпал, failed
         IDs ⊆ A0 failed, error/collection пусты, benchmark ≤ +15%
  PASS WITH BASELINE DEBT — то же, и остались только те же A0
         assertion-failed IDs, перечислены явно. Нельзя включать
         live-worker setup, collection errors, missing env.
  FAIL — новый failed ID; любой error/collection; contract JSON
         разошёлся; oracle script SHA изменился; benchmark > +15%;
         или обязательный proof NOT RUN выдан за PASS

COMMIT: docs(heat-loss): record application-boundary regression proof
```
