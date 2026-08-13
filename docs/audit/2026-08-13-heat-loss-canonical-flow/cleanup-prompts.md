# Промпты heat-loss cleanup

Каждый блок ниже — отдельный запуск и отдельный commit. Слайсы не склеивать.
Актуальная очередь и контракты находятся в `cleanup-plan.md` рядом.

## Общий префикс для C0–CF

```text
Работай из корня TLT.
Прочитай AGENTS.md и
docs/audit/2026-08-13-heat-loss-canonical-flow/cleanup-plan.md полностью.

До действий:
1. git status --short;
2. git rev-parse HEAD;
3. проверь, что предыдущий обязательный слайс завершён;
4. не трогай чужой WIP.

Один слайс. Characterization first. Не расширяй ALLOWED_SCOPE без STOP /
DECISION NEEDED. Не используй git add .; добавляй только адресные файлы слайса.
Документы уже tracked, git add -f не нужен.

Запрещено менять формулы, порядок операций, ranges, units, result keys,
formula_model/version, routes/query keys/UUID, схему БД, pipe/tank rounding,
hot-side ValueError literal и несвязанный UX. Не унифицируй pipe и tank.
Незапущенная проверка = NOT RUN, не PASS.

Для C1–C4, C6 и CF без frontend-diff: frontend NOT TOUCHED / NOT RUN.
Не запускай test:agent-dod:dual-safe без отдельного прямого запроса.
Полный backend suite запускается только в C0, C4, C5 и CF.
Failed/error nodeids сравниваются с C0 snapshot, а не со старыми числами.

Исключая generated mutation sandboxes, используй glob
--glob '!**/mutants/**' --glob '!**/.git/**'.

Перед commit: git diff --check, git status --short, просмотр полного diff своего
слайса. Commit содержит только файлы слайса.
```

---

## C0 — актуальный baseline

```text
SLICE_ID: HL-CLEAN-C0
OWNER: backend formulas / audit
PRECONDITION: clean worktree, кроме заранее объявленного docs-only WIP.
GOAL: Переснять динамический baseline на фактическом execution HEAD. Ничего не
исправлять и не дублировать существующую characterization.

ALLOWED_SCOPE:
  docs/audit/2026-08-13-heat-loss-canonical-flow/snapshot.md
  docs/audit/2026-08-13-heat-loss-canonical-flow/evidence/c0-*.json
NON-GOALS: production, tests, C1–C6, frontend.

Запиши в snapshot:
1. Полный commit hash, UTC, host/container/Python, clean/dirty status.
2. Результат focused contract suite:
   docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
     -w /app heatcalc_backend pytest \
       app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
       app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
       app/tests/unit/formulas/test_heat_loss_validation_entrypoint_characterization.py \
       app/tests/unit/schemas/test_heat_loss_range_characterization.py \
       app/tests/unit/formulas/test_heat_loss_formula_ownership.py \
       -q --tb=line --no-cov
3. Package gate:
   cwd=/app/packages/heat-loss-core в heatcalc_backend:
   python -m pytest tests -q --no-cov
   ruff check src tests
   mypy src tests
4. Full backend suite той же точной командой:
   docker exec \
     -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
     -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
     -w /app heatcalc_backend \
     pytest app/tests --no-cov -q --tb=no --override-ini='addopts='
   Запиши все failed и error nodeids, не только counts.
5. Read-only inventory executable code:
   - imports app.formulas.heat_loss.common;
   - imports app.formulas.heat_loss.core;
   - весь _COMPAT pipe/tank и его consumers;
   - call graph run/evaluate_prepared/evaluate legacy;
   - catalog calls из InsulationLayer, parent validators и preparation.
   Исторические docs-упоминания не считать production consumers.
6. Ссылки на уже существующие tests, которые фиксируют:
   - facade JSON и разное округление pipe/tank;
   - K matrix и tank ignores coefficients;
   - FormulaOutcome result XOR report;
   - typed environments и profile validation;
   - process-temperature pre-check и hot-side post-check;
   - import invalid → is_valid=false/results=null;
   - lookup counts.
7. Performance baseline. Повтори существующий audit benchmark без изменения
   сценариев: скопируй read-only scripts
   docs/audit/2026-08-12-heat-loss-core-regression/evidence/
   {heat_loss_benchmark.py,heat_loss_differential_probe.py} в /tmp контейнера и
   запусти 9 rounds × 20 loops. JSON положи в evidence/c0-facade-benchmark.json.
   Число/процент записывай только в snapshot, не в plan/prompts.

Если контейнер или БД недоступны — STOP и зафиксируй NOT RUN; не сочиняй
baseline по старому snapshot.
Frontend: NOT TOUCHED / NOT RUN.
COMMIT: docs(heat-loss): refresh cleanup baseline
```

---

## C1 — удалить мёртвый `common.py`

```text
SLICE_ID: HL-CLEAN-C1
OWNER: backend formulas
PRECONDITION: C0 committed.
GOAL: Удалить неиспользуемые legacy helpers и перестать документировать
несуществующее поведение coefficients.

ALLOWED_SCOPE:
  backend/app/formulas/heat_loss/common.py (delete)
  backend/app/tests/unit/formulas/test_heat_loss_common.py (delete)
  docstring calc_pipe_heat_loss в backend/app/formulas/heat_loss/pipe.py
NON-GOALS: shims, _COMPAT, evaluators, coefficients behavior, frontend.

Перед удалением докажи отсутствие живых consumers поиском import/attribute/call:
  app.formulas.heat_loss.common
  apply_coefficients
  merge_coefficients
  DEFAULT_COEFFICIENTS
по backend/app, backend/packages, scripts, frontend, e2e, qa-agent и CI,
исключая **/mutants/**. Совпадения в самом удаляемом файле/тесте и исторических
docs перечисли отдельно. При живом production consumer — STOP.

Исправь только фактически неверный docstring: coefficients у pipe сейчас несёт
только fallback safety_factor; ground_conductivity из этого dict не применяется.
Никакого нового поведения не добавляй.

FOCUSED_PROOF:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
      app/tests/unit/formulas/test_pipe_heat_loss.py \
      app/tests/unit/formulas/test_tank_heat_loss.py \
      -q --no-cov
  docker exec -w /app heatcalc_backend ruff check app/formulas/heat_loss/pipe.py
  повторный consumer search; git diff --check.
Full backend: NOT RUN. Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): remove dead coefficient helpers
```

---

## C2 — удалить внутренний shim namespace

```text
SLICE_ID: HL-CLEAN-C2
OWNER: backend formulas / package boundary
PRECONDITION: C1 committed.
GOAL: Executable code импортирует canonical heatcalc_heat_loss_core напрямую;
backend/app/formulas/heat_loss/core/ полностью удалён.

ALLOWED_SCOPE:
  backend/app и backend tests: только import rewrite
  backend/app/formulas/heat_loss/core/ (delete entire directory)
  backend/app/tests/unit/formulas/test_heat_loss_core_package_imports.py
    (удалить identity compatibility assertions или заменить architecture ratchet)
  backend/app/tests/unit/formulas/test_heat_loss_core_import_boundary.py
  минимальные scripts/CI import rewrites, только если найдены живые consumers
NON-GOALS: package public API, _COMPAT, C4, Pydantic/catalog, frontend behavior.

Это удаление внутреннего app namespace, а не legacy API самого wheel. Не создавай
новый alias namespace и не добавляй fallback imports.

До правки собери полный список executable consumers. После правки rg по
backend/app, backend/packages, scripts, .github, frontend, e2e, qa-agent должен
быть пустым для app.formulas.heat_loss.core (кроме текста этого audit-плана).

Ratchet должен проверять архитектуру, а не импортировать заведомо отсутствующий
module ради ModuleNotFoundError:
  - shim directory отсутствует;
  - AST executable Python не содержит forbidden import prefix;
  - canonical package import boundary остаётся stdlib-only;
  - root __all__ objects доступны.

INVARIANTS: Pydantic errors().loc/type/msg/ctx/input, facade ValueError и JSON
не меняются.

FOCUSED_PROOF:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/formulas/test_heat_loss_core_import_boundary.py \
      app/tests/unit/schemas/test_heat_loss_range_characterization.py \
      app/tests/unit/formulas/test_heat_loss_material_validation_wiring.py \
      app/tests/unit/formulas/test_heat_loss_formula_ownership.py \
      app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
      app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
      -q --no-cov
  docker exec -w /app heatcalc_backend python -c \
    "import app.formulas.heat_loss.pipe, app.formulas.heat_loss.tank, app.schemas.calculation"
  В backend/packages/heat-loss-core повтори CI recipe:
    wheel build в /tmp → fresh temp venv в /tmp → install wheel --no-deps →
    env без PYTHONPATH, python -I, assert каждый __all__ name.
  ruff по всем изменённым Python-файлам; git diff --check.
Full backend: NOT RUN. Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): remove backend core shims
```

---

## C3 — удалить facade `_COMPAT`

```text
SLICE_ID: HL-CLEAN-C3
OWNER: backend formulas
PRECONDITION: C2 committed.
GOAL: pipe.py и tank.py больше не re-exportят package DTO/evaluators через
_COMPAT, а tests импортируют library objects из canonical package.

ALLOWED_SCOPE:
  backend/app/formulas/heat_loss/pipe.py
  backend/app/formulas/heat_loss/tank.py
  tests, которые импортируют конкретные _COMPAT names из этих фасадов
NON-GOALS: удалить package legacy API; удалить реально используемые facade
helpers; C4; frontend.

Перед правкой выпиши tuple _COMPAT целиком. Для каждого имени отдельно покажи:
  - используется facade implementation;
  - импортируется внешним production consumer;
  - импортируется только characterization/test;
  - полностью мёртвое.
Удаляй alias/import только если он нужен исключительно _COMPAT. Реальный helper
dependency оставь. Test imports перенеси на heatcalc_heat_loss_core.*.

После правки:
  - `_COMPAT` отсутствует;
  - нет `from app.formulas.heat_loss.pipe|tank import <бывший alias>`;
  - calc_pipe_heat_loss/calc_tank_heat_loss и настоящие facade helpers сохранены.

FOCUSED_PROOF:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
      app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
      app/tests/unit/formulas/test_heat_loss_material_validation_wiring.py \
      app/tests/unit/formulas/test_pipe_heat_loss.py \
      app/tests/unit/formulas/test_tank_heat_loss.py \
      -q --no-cov
  ruff + mypy на двух фасадах и изменённых tests; повторный rg; git diff --check.
Full backend: NOT RUN. Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss): remove facade compatibility exports
```

---

## C6a — DONE, не запускать

Legacy package evaluators сохраняются и после C4 становятся thin adapters того
же domain kernel. Никакого отдельного docs-only слайса больше нет.

---

## C4 — один execution kernel на домен

```text
SLICE_ID: HL-CLEAN-C4
OWNER: heat-loss-core package
PRECONDITION: C3 committed; C6a decision read from cleanup-plan.
GOAL: Для pipe существует одна orchestration implementation; для tank — одна.
Prepared API и legacy evaluators входят в соответствующий domain kernel, не
пересылают Prepared → legacy DTO → duplicate orchestration.

ALLOWED_SCOPE:
  backend/packages/heat-loss-core/src/heatcalc_heat_loss_core/
    pipe_formula.py, pipe_evaluation.py,
    tank_formula.py, tank_evaluation.py,
    один нейтральный execution/internal-types module на домен при необходимости
  соответствующие package tests
  только implementation-spy backend tests, если они фиксируют удаляемую private
    прослойку вместо поведения
  docs/audit/2026-08-13-heat-loss-canonical-flow/snapshot.md
  docs/audit/2026-08-13-heat-loss-canonical-flow/evidence/c4-*.json
NON-GOALS: C5 catalog/Pydantic, app facades, __all__/README, formulas calculate_*,
result serialization, frontend.

До кода нарисуй фактический before/after call graph и назови ровно один internal
execution entrypoint для pipe и один для tank. Предпочти существующий Prepared*
как canonical resolved input. Не вводи третий набор тех же скаляров. Если для
устранения import cycle тип нужно перенести, сохрани старый module import через
обычный re-export и identity.

Обязательная семантика:
1. Kernel принимает resolved/concrete input и сам не повторяет input/profile
   validation.
2. Prepared assembly сохраняет validate_heat_loss_formula_profile.
3. Legacy evaluate_pipe сам применяет старый resolve_safety_factor semantics,
   затем зовёт kernel с concrete K. Сам resolve_safety_factor не меняй.
4. Legacy tank APIs не получают coefficients/default-K semantics.
5. На один execution: один tm, одна wall λ, одна λ каждого слоя, один alpha и
   ровно одна calculate_* branch.
6. Формулы сопротивлений/теплового баланса не копируются из calculate_*.
7. Process-T validation не переносится сюда; hot-side и finite-result guards
   остаются активны.
8. Pipe issues — layer order; tank issues — air layers, затем ground layers.
9. FormulaOutcome = result XOR report. Legacy API продолжает возвращать свой
   прежний result с report field согласно старому контракту.
10. Exact unrounded numbers, FormulaDomainError code/details, model/version,
    assumptions/corrections и signed-zero edge cases совпадают.
11. Air-pipe domain thickness quirk не исправлять.

Добавь structural/call-count tests, которые ломаются при появлении второго
execution path или повторной λ/tm/alpha/calculate_* evaluation. Сравни public
legacy и prepared results на indoor/outdoor/underground, 1–3 layers,
manual/reference, cylindrical/rectangular/buried tank.

FOCUSED_PROOF:
  cwd=/app/packages/heat-loss-core:
    python -m pytest tests -q --no-cov
    ruff check src tests
    mypy src tests
  cwd=/app:
    pytest \
      app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
      app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
      app/tests/unit/formulas/test_pipe_heat_loss.py \
      app/tests/unit/formulas/test_tank_heat_loss.py \
      app/tests/unit/formulas/test_heat_loss_critical_edges.py \
      -q --no-cov
  Полный backend suite точной командой C0; множество IDs vs C0.

Повтори тот же benchmark protocol C0 и сохрани c4-facade-benchmark.json.
Цель — убрать Prepared→legacy DTO overhead; не объявляй случайный единичный
тайминг улучшением. Покажи medians всех rounds. Любое устойчивое ухудшение
относительно C0 — BLOCKER или явное решение пользователя, не молчаливый PASS.

Frontend: NOT TOUCHED / NOT RUN.
COMMIT: refactor(heat-loss-core): unify formula execution kernels
```

---

## C5 — catalog только в application preparation

```text
SLICE_ID: HL-CLEAN-C5
OWNER: heat (один вертикальный backend→frontend contract owner)
PRECONDITION: C4 committed and green.
GOAL: Pydantic остаётся catalog-free; application один раз разрешает reference
material, выполняет недостающую interval validation и возвращает структурированную
ошибку, понятную всем entrypoints и форме.

Этот слайс не является новой frontend queue и не меняет
docs/frontend/refactor-backlog.md. Если затрагивается frontend, сначала полностью
прочитай frontend/AGENTS.md, agent-development-standard.md, pr-budget.md и
ближайшие code/tests. Frontend budget: один owner heat, максимум 2 production
helper/CSS + 2 test files; CSS здесь не ожидается.

ALLOWED_SCOPE:
  backend/app/schemas/calculation.py
  backend/app/formulas/heat_loss/pipe_preparation.py
  backend/app/formulas/heat_loss/tank_preparation.py
  один shared application error/resolver adapter под app/formulas/heat_loss/
  backend/app/formulas/heat_loss/outcome_errors.py при необходимости
  backend/app/services/calculation_service.py error payload mapping
  backend/app/api/v1/admin.py только для одинаковой 422 classification
  backend tests: schema, preparation, facade, service, import, admin preview
  frontend/src/components/wizard/objectWizardValidationModel.ts только если
    target consumer test докажет реальную дыру
  frontend/src/__tests__/integration/components/
    ObjectWizardDependencies.validation-highlight.test.tsx
NON-GOALS: C4 kernel, formulas/ranges/results, hot-side literal/regex, CSS,
electrical/specification, API route shape, DB/migration, frontend backlog.

CHARACTERIZATION FIRST — до production изменений:
1. Зафиксируй current user-visible Russian messages и application outcomes для:
   unknown material, deprecated/unselectable material, missing interval,
   unavailable warm/cold λ branch, process T outside interval, hot-side outside
   interval.
2. Зафиксируй process-T failure до calculate_* spy и hot-side failure после.
3. Зафиксируй lookup counts pipe/tank 1–3 reference layers.
4. Добавь frontend target case:
   validation_errors.fields = {
     "insulation_layers.1.material": "<message>"
   }
   Он должен подсветить material второго слоя. Сначала запусти этот test на
   неизменённом frontend. Если зелёный — production frontend не менять.

IMPLEMENTATION CONTRACT:
1. Удали loader calls из InsulationLayer и parent Pipe/Tank Pydantic validators.
   Pydantic продолжает один раз вызывать catalog-free core contracts: ranges,
   cross-field, placement, geometry, manual-layer rules.
2. Для reference layer parent contract получает interval=None и не притворяется,
   что material уже разрешён. Не добавляй fallback lookup.
3. Pipe/tank preparation вызывает один existing resolver, возвращающий law +
   interval из одной catalog record. Не делай отдельные get-law/get-range calls.
4. Сразу после resolve вызови pure library interval predicate для
   process_temperature. Это отдельная pre-formula проверка. Не запускай повторно
   полный validate_pipe_contract/validate_tank_contract.
5. Post-formula hot-side validation остаётся в kernel без изменений.
6. Expected catalog/input failures не должны уходить raw ValueError без path.
   Введи одну application-level structured representation (не в pure package),
   которая несёт code, path, message/category и не требует parsing текста.
7. Для reference material/law errors canonical path:
   insulation_layers.{zero_based_index}.material.
   Manual conductivity/range paths остаются на своих полях.
8. CalculationService/build_heat_loss_error_payload заполняет field при одной
   ошибке и fields mapping при структурированных ошибках. Сохрани message/hint.
9. Admin formula-check использует тот же preparation/resolver adapter и отвечает
   422 на input/catalog failure; не оставляй generic 400 только для admin path.
10. Create/update/recalculate/import/admin preview не расходятся по resolver и
    классификации. Импорт может сохранить невалидный объект:
    is_valid=false, results=null, validation_errors с layer path.
11. Ручная frontend-форма сохраняет существующий запрет на невалидный save.
12. Fail-fast/order не менять и не переходить на collect-all.

BACKEND PROOF:
  - direct InsulationLayer reference validation не вызывает loader;
  - parent Pipe/Tank validation не вызывает loader;
  - manual-layer schema loc/type/msg/ctx/input сохранены;
  - one resolver call per reference layer, including error paths;
  - process T outside interval blocks formula;
  - hot-side literal exact;
  - facade JSON exact;
  - create/update/recalculate and Excel import persistence;
  - admin formula-check success + every catalog failure gives 422;
  - invalid imported object survives with null result and structured fields.

Минимальный focused backend набор должен включать существующие:
  test_heat_loss_range_characterization.py
  test_heat_loss_material_validation_wiring.py
  test_heat_loss_canonical_flow_characterization.py
  test_heat_loss_facade_input_boundary.py
  test_heat_loss_single_validation_boundary.py
  test_import_excel.py (релевантные cases)
  test_admin.py (formula-check cases)
и новые точечные resolver/entrypoint tests. Запускай из /app с --no-cov.
После focused — полный backend suite точной командой C0, IDs vs C0.

FRONTEND PROOF:
  Если frontend production/test touched, из frontend/:
    npm run agent:scope -- src/components/wizard/objectWizardValidationModel.ts
    npm run agent:scope -- --changed --json
    npm run agent:proof-plan -- --json
    npm run agent:proof-run --
    npm run agent:proof-check --
  Не подменяй content-bound proof произвольным vitest и не запускай dual-safe.
  Если production frontend не понадобился, оставь его нетронутым и запусти только
  target integration test, который доказывает существующий consumer contract.
  Если видимое поведение production frontend изменилось, browser proof обязателен
  на 1000×768, 1280×800 и 1440×900: неверный material второго слоя подсвечен,
  first layer не подсвечен, console без новых errors. Артефакты — только в
  датированной audit folder.

STOP, если единый structured path нельзя провести через один из entrypoints без
изменения публичного API: не возвращайся к строковому regex/fallback.
COMMIT: fix(heat-loss): centralize catalog preparation errors
```

---

## C6b — recommended root API и README

```text
SLICE_ID: HL-CLEAN-C6B
OWNER: heat-loss-core package
PRECONDITION: C5 committed.
GOAL: Desktop/backend callers видят рекомендуемый validate+run API, не выбирают
случайно legacy resolved evaluator как единственный main path.

ALLOWED_SCOPE:
  backend/packages/heat-loss-core/README.md
  backend/packages/heat-loss-core/src/heatcalc_heat_loss_core/__init__.py
  package public-import tests
NON-GOALS: сужать широкий __all__, удалять/менять legacy names, formulas,
backend/frontend.

Корневой recommended API добавляет и документирует минимум:
  PipePreparationInput, PipePreparationLayer, PipeFormulaOutcome, run_pipe_formula
  TankPreparationInput, TankPreparationLayer, TankFormulaOutcome, run_tank_formula

Prepared* и evaluate_prepared_* могут оставаться advanced module-level API; не
обязательно объявлять их основным root entrypoint. README разделяет:
  1 recommended preparation + validate/run;
  2 legacy resolved evaluators (совместимость);
  3 low-level calculate_*/validators/primitives (advanced use).

Явно опиши границу: package не знает app/catalog/DB; caller передаёт resolved
ConductivityLaw/interval/profile. Standard profile используется только когда
custom profile не передан.

FOCUSED_PROOF:
  cwd=/app/packages/heat-loss-core:
    python -m pytest tests -q --no-cov
    ruff check src tests
    mypy src tests
  Повтори CI wheel recipe в fresh temp venv без PYTHONPATH и через python -I:
    assert core.__all__ и hasattr для каждого имени;
    assert legacy и new recommended entrypoints импортируются.
Frontend: NOT TOUCHED / NOT RUN. Full backend: NOT RUN.
COMMIT: docs(heat-loss-core): publish canonical formula API
```

---

## CF — финальная регрессия

```text
SLICE_ID: HL-CLEAN-CF
OWNER: qa / formulas
PRECONDITION: C6b committed; clean worktree.
GOAL: Доказать критерии закрытия cleanup-plan на final HEAD. Production/test code
не менять; допускаются только snapshot/evidence.

ALLOWED_SCOPE:
  docs/audit/2026-08-13-heat-loss-canonical-flow/snapshot.md
  docs/audit/2026-08-13-heat-loss-canonical-flow/evidence/cf-*.json|md|log
NON-GOALS: чинить найденные дефекты внутри CF. При новой регрессии открыть
точечный corrective slice, затем повторить CF.

Проверь и запиши команды/результаты:
1. git status, final HEAD, UTC.
2. Architecture searches:
   common.py/shim directory/_COMPAT отсутствуют;
   executable imports не используют удалённые namespaces;
   Pydantic не импортирует/не вызывает insulation catalog;
   package остаётся dependency-free.
3. Package:
   pytest tests -q --no-cov; ruff check src tests; mypy src tests;
   isolated wheel install + every __all__ import.
4. scripts/formula-qa.sh full.
5. scripts/formula-qa.sh heat-loss-core-mutation.
   Если mutmut/environment недоступен — NOT RUN и нельзя заявлять mutation PASS.
6. Полный backend suite точной командой C0. Сравни множества failed/error
   nodeids. Fewer is acceptable; любой новый ID — BLOCKER до классификации.
7. Повтори benchmark protocol C0 на том же классе окружения и сохрани
   cf-facade-benchmark.json. Покажи все round medians и абсолютную разницу.
8. Facade characterization: exact JSON, hot-side literal, K matrix, process-T
   pre-check, hot-side post-check, import invalid, lookup counts.
9. Diff `C0_HEAD..final HEAD` по frontend:
   - если frontend файлов нет: evidence + NOT RUN;
   - если есть: из frontend/ выполнить
       npm run agent:scope -- --changed --base <C0_HEAD> --json
       npm run agent:proof-plan -- --base <C0_HEAD> --json
       npm run agent:proof-run -- --base <C0_HEAD>
       npm run agent:proof-check -- --base <C0_HEAD>
     и сослаться на browser evidence C5, если менялось видимое поведение.
10. Подтверди, что docs/frontend/refactor-backlog.md не менялся этим cleanup.

Финальный verdict только один из:
  PASS — все обязательные proofs запущены, новых регрессий нет;
  PASS WITH BASELINE DEBT — только те же C0 IDs, перечислены явно;
  FAIL — новый defect/ID, архитектурный критерий или обязательный proof не закрыт.

COMMIT: docs(heat-loss): record canonical cleanup regression proof
```

---

## Формат отчёта каждого слайса

```text
Slice / HEAD:
Outcome:
Files changed:
Behavior before → after:
Commands (cwd included) and exact results:
Full backend IDs vs C0 | NOT RUN:
Frontend touched? owner/scope/proof receipt/browser | NOT TOUCHED:
Performance evidence | NOT RUN:
Residual risks:
Next slice:
```
