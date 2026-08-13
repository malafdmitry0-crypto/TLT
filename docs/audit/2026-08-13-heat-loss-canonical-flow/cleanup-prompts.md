# Промпты heat-loss cleanup

Один блок = один запуск. Не склеивать слайсы.
План: `cleanup-plan.md` рядом. Решение C6a уже в плане: legacy API остаётся
тонким адаптером единого kernel.

Cwd указан в каждой команде. Из корня репозитория не запускать `pytest unit/...`
и не запускать `npm run` без `cd frontend`.

Общий префикс:

```text
Работай из корня репозитория TLT.
Прочитай AGENTS.md и
docs/audit/2026-08-13-heat-loss-canonical-flow/cleanup-plan.md.
Перед правками: git status --short. Не трогай чужой WIP.
Один слайс. Characterization first.
Не меняй формулы, ranges, units, routes, query keys, ER UUID, UX,
ключи JSON результатов, литерал hot-side ValueError
(кроме C5, если план явно велит и фронт в том же commit).
Незапущенное = NOT RUN.
Не запускай frontend test:agent-dod:dual-safe без явного запроса.
agent:scope --changed только если слайс реально меняет frontend (C5).
Для C1–C4 и C6 frontend: NOT RUN.
Полный backend suite только если слайс это велит (C4, C5, CF).
Сравнивать failing IDs с snapshot.md, который обновил C0, не с 03f6ef3.
Commit: только файлы слайса, не git add .
Документы очереди коммить через git add -f
docs/audit/2026-08-13-heat-loss-canonical-flow/<file>
```

---

## C0 — актуализировать baseline

```text
SLICE_ID: HL-CLEAN-C0
OWNER: backend formulas (docs/tests only)
GOAL: Переснять динамический baseline на текущем HEAD (ожидается ac7af10
или новее). Не дублировать уже зелёные facade JSON, hot-side, K-матрицу
и lookup-count тесты.
USER_VISIBLE_SUCCESS: Нет UX. Есть новый snapshot.md с HEAD, командами,
UTC и failing IDs. Зафиксированы контракты ac7af10.
ALLOWED_SCOPE:
  docs/audit/2026-08-13-heat-loss-canonical-flow/snapshot.md
  минимальные package-тесты только если какого-то инварианта ac7af10
  ещё нет в дереве (не копировать facade characterization)
NON-GOALS: production, C1–C5, новый параллельный набор JSON-снимков.
INVARIANTS: существующие characterization остаются источником facade JSON.

Зафиксируй в snapshot (команда + результат), не в плане:
1. git rev-parse HEAD, дата UTC, dirty worktree.
2. Полный backend suite:
   cwd=backend/ (в контейнере /app):
   pytest app/tests --no-cov -q --tb=no --override-ini=addopts=
   с TEST_DATABASE_URL как в formula-qa.sh
   Записать failed + error nodeids целиком.
3. Package:
   cwd=backend/packages/heat-loss-core:
   pytest tests -q --no-cov
4. Наличие (ссылка на тест или 10-строчная выписка), без дубля:
   - validate_heat_loss_formula_profile на assemble/prepare;
   - типизированные environment-ветки;
   - FormulaOutcome: result XOR report;
   - late-bound K (0 → range, не resolve_safety_factor).
5. Список production-импортов app.formulas.heat_loss.core и .common
   по всему репо, исключая mutants/ и .git.

FOCUSED_PROOF: команды выше. Frontend NOT RUN.
Commit: snapshot (+ крошечный тест только если дыра в ac7af10).
```

---

## C1 — удалить common.py

```text
SLICE_ID: HL-CLEAN-C1
OWNER: backend formulas
GOAL: Удалить мёртвый common.py и его unit-тест.
ALLOWED_SCOPE:
  backend/app/formulas/heat_loss/common.py
  backend/app/tests/unit/formulas/test_heat_loss_common.py
  устаревший docstring calc_pipe_heat_loss про DEFAULT_COEFFICIENTS /
  ground_conductivity в coefficients — поправить, если он врёт
NON-GOALS: шимы, evaluators, frontend.

Поиск потребителей — не rg DEFAULT_COEFFICIENTS (поймает docstring).
Ищи импорты и обращения:
  from app.formulas.heat_loss.common
  apply_coefficients(  merge_coefficients(
по backend/app, backend/packages, frontend, e2e, scripts.
mutants/ игнорировать.

FOCUSED_PROOF:
  cwd=/app или backend/:
  pytest app/tests/unit/formulas/test_heat_loss_facade_characterization.py
         app/tests/unit/formulas/test_pipe_heat_loss.py
         app/tests/unit/formulas/test_tank_heat_loss.py
         -q --no-cov
  git diff --check
Frontend: NOT RUN.
Стоп, если живой production-импорт — FILE / EVIDENCE.
```

---

## C2 — убрать шимы

```text
SLICE_ID: HL-CLEAN-C2
OWNER: backend formulas
GOAL: Production и тесты (кроме mutants) импортируют heatcalc_heat_loss_core.
      app/formulas/heat_loss/core/ удалён.
ALLOWED_SCOPE:
  замена from app.formulas.heat_loss.core.*
  удаление каталога core/
  test_heat_loss_core_package_imports.py → ratchet «этот namespace красный»
NON-GOALS: InsulationLayer lookup, C4 kernel, frontend, __all__.

Поиск по всему репозиторию, не только backend/app:
  rg "app\\.formulas\\.heat_loss\\.core" --glob '!mutants/**' --glob '!.git/**'
включая packages, scripts, docs, frontend, e2e, qa-agent, CI.

INVARIANTS: Pydantic errors() loc/type/msg/input как в range characterization.
Не менять facade ValueError.

FOCUSED_PROOF:
  cwd=/app:
  pytest app/tests/unit/schemas/test_heat_loss_range_characterization.py
         app/tests/unit/formulas/test_heat_loss_material_validation_wiring.py
         app/tests/unit/formulas/test_heat_loss_formula_ownership.py
         app/tests/unit/formulas/test_heat_loss_facade_characterization.py
         app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py
         -q --no-cov
  Import smoke: python -c "import app.formulas.heat_loss.pipe, app.schemas.calculation"
  Package/wheel smoke:
  cwd=backend/packages/heat-loss-core
  python -c "import heatcalc_heat_loss_core as c; assert c.evaluate_pipe"
  (если в CI есть isolated venv-команда — та же)
Frontend: NOT RUN.
```

---

## C3 — снять _COMPAT с фасадов

```text
SLICE_ID: HL-CLEAN-C3
OWNER: backend formulas
GOAL: pipe.py и tank.py не re-exportят legacy evaluators/DTO.
ALLOWED_SCOPE: эти два фасада + тесты, которые импортируют имена из _COMPAT
  через app.formulas.heat_loss.pipe / .tank
NON-GOALS: удаление evaluate_pipe из пакета, C4, frontend.

Перед правкой выпиши фактический _COMPAT целиком и закрой каждый символ:
  rg того имени как импорта из фасада.
Недостаточно проверить только evaluate_pipe.

INVARIANTS: сигнатуры calc_*_heat_loss, JSON, hot-side литерал.

FOCUSED_PROOF:
  cwd=/app:
  pytest app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py
         app/tests/unit/formulas/test_heat_loss_facade_characterization.py
         app/tests/unit/formulas/test_pipe_heat_loss.py
         app/tests/unit/formulas/test_tank_heat_loss.py
         -q --no-cov
Frontend: NOT RUN.
```

---

## C6a — решение уже в плане

```text
SLICE_ID: HL-CLEAN-C6A
OWNER: docs
GOAL: Убедиться, что cleanup-plan.md и этот файл tracked (git add -f).
      Решение: legacy API сохраняется, после C4 — тонкий адаптер kernel.
Код не менять. Если документы уже в индексе — слайс пустой, отметь done.
```

---

## C4 — единый execution kernel

```text
SLICE_ID: HL-CLEAN-C4
OWNER: backend formulas
GOAL: Одна реализация orchestration (λ/tm/alpha, выбор ветки, post-formula
hot-side, metadata/report). Prepared API и legacy evaluators зовут её.
Запрещено копировать orchestration в pipe_formula.py и pipe_evaluation.py
(и tank-аналоги).
USER_VISIBLE_SUCCESS: facade model_dump() и hot-side литерал как в
существующих characterization, не как в новом дубле.

ALLOWED_SCOPE:
  backend/packages/heat-loss-core/src/heatcalc_heat_loss_core/
    pipe_formula.py, tank_formula.py,
    pipe_evaluation.py, tank_evaluation.py,
    новый модуль kernel только если без него нельзя избежать дубля
  их package tests
NON-GOALS: удалить pipe_evaluation.py; менять __all__; frontend;
  InsulationLayer; шимы; формулы calculate_*.

INVARIANTS (включая ac7af10):
  - profile validation на сборке prepared;
  - типизированные environment-ветки, без второй копии скаляров;
  - FormulaOutcome: result XOR report;
  - late-bound K: 0 не идёт в resolve_safety_factor;
  - backend assemble не зовёт полный validate_*_contract;
  - арифметика только в calculate_*;
  - pipe округляет в фасаде, tank нет.

Проектирование до кода: назови одну функцию/модуль kernel и покажи, что
evaluate_pipe и evaluate_prepared_pipe оба входят в неё. Если не получается
без дубля — STOP / DECISION NEEDED.

FOCUSED_PROOF:
  cwd=backend/packages/heat-loss-core: pytest tests -q --no-cov
  cwd=/app:
  pytest app/tests/unit/formulas/test_heat_loss_facade_characterization.py
         app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py
         app/tests/unit/formulas/test_pipe_heat_loss.py
         app/tests/unit/formulas/test_tank_heat_loss.py
         -q --no-cov
  Затем полный backend suite, IDs vs C0 snapshot.
Frontend: NOT RUN. В отчёте сверь ключи FormulaCalcResult.
Стоп, если JSON snapshot или hot-side литерал изменился.
```

---

## C5 — каталог только в application preparation

```text
SLICE_ID: HL-CLEAN-C5
OWNER: backend formulas + frontend heat (один commit, если меняются
  field paths / messages, которые ест форма)
GOAL: Реализовать контракт C5 из cleanup-plan.md. Не выбирать другой
  контракт постфактум.

Целевой контракт (обязателен):
  1 InsulationLayer: типы/структура/manual rules, без каталога.
  2 Родительские Pydantic: без каталога.
  3 Preparation один раз: resolve_reference_insulation → law + interval.
  4 Ошибки resolver: structured path insulation_layers.{i}.material
     (и thickness/conductivity/temperature_range по смыслу).
  5 Тот же путь: create/update/import/recalculate/admin preview.
  6 Import invalid: is_valid=false, results=null.
  7 Форма подсвечивает слой/поле.

Главный frontend mapping:
  frontend/src/components/wizard/objectWizardValidationModel.ts
  (normalizeFieldErrorsForForm, insulationLayerFieldNamesFromMessage,
   путь insulation_layers.N.field).
Также: ObjectWizardDependencies.validation-highlight.test.tsx
heatCalcPageUtils hot-side regex НЕ относится к переносу catalog lookup,
если литерал hot-side (post-formula) не меняется — не трогай его.

ALLOWED_SCOPE:
  schemas/calculation.py InsulationLayer + parent validators
  pipe_preparation.py / tank_preparation.py
  error payload builder, если нужен fields["insulation_layers.0.material"]
  wizard validation model + его тесты
NON-GOALS: формулы, JSON results, electrical, CSS, Help, C4 kernel.

FOCUSED_PROOF:
  cwd=/app:
  pytest app/tests/unit/schemas/test_heat_loss_range_characterization.py
         app/tests/unit/formulas/test_heat_loss_material_validation_wiring.py
         app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py
         app/tests/unit/formulas/test_heat_loss_facade_input_boundary.py
         app/tests/unit/services/test_heat_loss_single_validation_boundary.py
         -q --no-cov
  cwd=frontend:
  npm run agent:scope -- src/components/wizard/objectWizardValidationModel.ts
  focused vitest этого файла + validation-highlight
  Browser только если видимый текст/подсветка меняется:
    1000 / 1280 / 1440, invalid layer material, console чистый.
  Затем полный backend suite vs C0 snapshot.

Стоп, если не можешь сохранить подсветку слоя — DECISION NEEDED,
не ослабляй assertions.
```

---

## C6b — README и корневые entrypoints

```text
SLICE_ID: HL-CLEAN-C6B
OWNER: backend formulas
GOAL: README больше не называет только старые evaluators «main API».
      Можно добавить run_pipe_formula / run_tank_formula / Prepared* в __all__.
      Не удалять legacy имена (решение C6a).
ALLOWED_SCOPE:
  backend/packages/heat-loss-core/README.md
  backend/packages/heat-loss-core/src/heatcalc_heat_loss_core/__init__.py
NON-GOALS: удаление evaluate_pipe, frontend.
FOCUSED_PROOF:
  cwd=backend/packages/heat-loss-core
  python -c "import heatcalc_heat_loss_core as c; assert c.evaluate_pipe; assert c.run_pipe_formula"
  pytest tests -q --no-cov
Frontend: NOT RUN.
```

---

## CF — финальная регрессия

```text
SLICE_ID: HL-CLEAN-CF
OWNER: qa / formulas
GOAL: На clean HEAD после C6b сравнить backend failing IDs с C0 snapshot.
      Package tests + facade characterization зелёные.
Код не менять, кроме обновления snapshot датой прогона.
Frontend: NOT RUN, если дерево frontend чистое.
```

---

## Отчёт слайса

```text
Slice:
HEAD:
Backend before → after:
Frontend before → after | NOT TOUCHED:
Files:
cwd + commands run:
Suite failing IDs vs C0 snapshot (или NOT RUN):
Residual:
Next:
```
