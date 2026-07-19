# ElecCalcPage Safe Split Nightly Prompt

Этот prompt предназначен для ночного запуска Codex в агентском режиме. Цель -
за один автономный проход сделать анализ `ElecCalcPage`, зафиксировать текущее
поведение тестами и выполнить один маленький безопасный refactor slice без
изменения бизнес-поведения электрорасчёта.

## Как запускать

Скопируй блок ниже в Codex agent mode из корня репозитория.

```text
Работай в режиме /fix-focused, максимально консервативно и агентно.

Primary target:
- ElecCalcPage only.
- Не редактируй HeatCalcPage в этом запуске.
- Не создавай shared abstraction для HeatCalcPage и ElecCalcPage.
- Не меняй формулы электрорасчёта, backend API, DB, спецификацию или отчёт,
  если это не обязательный finding текущего slice.

Goal:
1. Проанализировать ElecCalcPage как god-component.
2. Прочитать decomposition roadmap и progress ledger.
3. Добавить или усилить characterization tests для текущего поведения.
4. Сделать ровно один маленький refactor slice, только если tests/evidence
   позволяют доказать неизменность поведения.
5. Обновить progress ledger после успешного slice.
6. Дать Functional Accuracy Report с docs -> backend -> frontend -> tests
   evidence.

Agent routing:
- Сначала прочитай AGENTS.md.
- Затем прочитай .agents/routing.yaml.
- Primary role: frontend_ui_proof.
- Supporting mental roles: functional_accuracy, formula_oracle,
  backend_business, qa_regression.
- Режим /fix-focused намеренно перекрывает default_mode роли frontend_ui_proof,
  потому что запуск должен сделать один bounded code slice.
- Если выбранный slice меняет JSX/CSS/видимый UI, дополнительно применяй
  /ui-proof evidence requirements.
- Если slice касается payload, cable selection, candidates, variant persistence,
  specification handoff, result categories, formulas or units, применяй
  formula_oracle/backend_business evidence locally.
- Если runtime или пользователь не разрешил sub-agents/delegation, применяй эти
  роли локально.
- Если delegation явно разрешен, можно дать sidecar read-only задачи:
  docs_contract для требований, qa_regression для test inventory,
  formula_oracle для formula/payload risk. Code-edit owner только один.

Hard safety rules:
- Не делай широкий рефакторинг.
- Не переписывай архитектуру целиком.
- Не меняй formulas, expected/golden values, API contracts, units, ER variant
  semantics, candidate apply semantics or specification handoff без
  независимого источника правды.
- Не ослабляй assertions ради green tests.
- Не удаляй существующий код без доказательства, что он больше не используется.
- Не делай git commit.
- Не трогай unrelated dirty files.
- Перед правками выполни git status --short. Если ElecCalcPage или релевантные
  test files уже dirty, прочитай diff и работай поверх него, не откатывая
  чужие изменения.
- Если появляется риск сломать поведение, остановись и оформи finding.
- Если in-scope тест/Playwright/browser/DB недоступен, это blocked или needs
  verification, а не pass.

Change budget:
- greenfield extraction: можно добавить максимум 1 production file и 1 test file;
- existing module extraction: можно править максимум 1 existing production helper
  file и 1 existing test file;
- максимум 1 page file edited: frontend/src/pages/ElecCalcPage.tsx;
- максимум 2 test files edited;
- namespace для route-level helpers/hooks: frontend/src/pages/electrical/;
- namespace для reusable electrical UI: frontend/src/components/electrical/;
- reusable pure utilities только если они уже не page-specific:
  frontend/src/utils/electrical*.ts;
- tests по существующему паттерну: frontend/src/__tests__/unit/pages/electrical/
  или existing nearest `ElecCalcPage.test.tsx`;
- не менять backend, если не обнаружен обязательный backend finding;
- не менять HeatCalcPage;
- если нужно больше файлов, остановись и оформи Recommended next safe slice.

Обязательный старт:
Всегда прочитай:
- codex-docs/README.md
- codex-docs/project-map.md
- codex-docs/requirements-map.md
- codex-docs/testing.md
- docs/playbooks/agent-proof-modes.md
- docs/playbooks/eleccalc-page-decomposition-prompts.md
- docs/playbooks/eleccalc-safe-split-nightly-prompt.md
- docs/api.md
- docs/analysis/business-rules.md
- docs/srs.md
- docs/tz-compliance.md
- docs/qa/test-cases-electrical.md
- docs/srs/ui/employee/04-screen-workspace-electrical.html
- docs/srs/ui/guest/03-screen-workspace-electrical.html, если существует
- relevant e2e/tests/elec-calculation.spec.ts
- relevant e2e/tests/electrical-candidate-selection.spec.ts
- relevant e2e/tests/electrical-candidate-glide-default.spec.ts

Условно прочитай только если выбранный slice затрагивает formulas, cable
selection, payload, result diagnostics, specification handoff, catalogs or
traceability:
- codex-docs/business-formula-contracts.json
- formules.md
- coefficients.MD
- docs/context/formulas-summary.md
- docs/playbooks/formula-validation-agent.md
- docs/tnp/algorithms/self-regulating-pipe-selection.md
- docs/tnp/algorithms/winding.md
- docs/business-logic-contract.md

Discovery через rg:
- ElecCalcPage implementation;
- extracted electrical components in frontend/src/components/electrical/;
- electrical utils in frontend/src/utils/electrical*.ts;
- useState/useEffect/useMemo/useCallback;
- React Query calls and mutations;
- project/object query and backend pagination path;
- UUID ER controller/query identity и transitional `variant_number=1…5` propagation;
- cable source/type controls and feature flags;
- batch calculation submit/cancel/polling paths;
- manual cable mark modal and save-to-ER path;
- candidate sizing modal: auto/manual run, apply, exclude, favorite/folders;
- main table column render/copy/filter/sort/pagination state;
- candidate table column render/copy/filter/sort/compare state;
- result status/error/unsupported/stale diagnostics;
- specification navigation and totals handoff;
- tests for ElecCalcPage, cable business flows, candidate flows;
- formula/backend contracts only if the candidate slice touches calculation
  mapping, result diagnostics, payload, units or traceability.

Before edits checkpoint:
Составь короткую карту:
Документация -> backend -> frontend -> tests

Прочитай `Progress Ledger` в
`docs/playbooks/eleccalc-page-decomposition-prompts.md`. Не повторяй пункты со
статусом Done. Затем выбери ровно один safe slice:
A. tests-only characterization, если нет надежного тестового каркаса;
B. следующий unfinished pure/helper/renderer slice из ledger, если он легко
   покрывается unit tests;
C. tiny presentational extraction, только если UI proof можно сделать без
   большого prop chain;
D. stop with finding, если safe slice превышает Change budget.

Предпочтительный выбор для первого ночного запуска:
1. Заполнить `Prompt 1. Результат аудита` и baseline metrics ledger.
2. Добавить tests-only characterization для `buildElectricalQueryRequest` или
   candidate compare/value helpers, если их можно тестировать без JSX.
3. Вынести только pure helpers после characterization.
4. Не начинать toolbar/candidate modal extraction в первом запуске.

Phase 1: ElecCalcPage Audit And Safety Map
Составь таблицу:
- файл и размер;
- количество useState/useEffect/useMemo/useCallback;
- крупные responsibility clusters;
- API calls and mutations;
- object/electrical query path;
- ER UUID/compatibility-slot propagation path;
- batch calculation submit/cancel/polling path;
- manual mark save path;
- candidate auto/manual/apply path;
- candidate folder/favorite/exclude path;
- result rendering and diagnostics path;
- specification transition path;
- main table/filter/sort/pagination state;
- candidate table/filter/sort/compare state;
- preferences/settings state;
- existing tests and gaps;
- proposed first safe extraction.

Phase 2: Characterization Tests First
Добавь или усили focused tests, которые фиксируют текущее поведение
ElecCalcPage или вынесенного pure helper.

P0 test cases: выбери только релевантные выбранному slice. Нерелевантные P0
явно отметь как not applicable в финальном отчете, а не реализуй ради галочки.
- batch submit формирует payload с правильными `variant_number`, cable_source,
  cable_type, selection_policy, overwrite/skip manual semantics;
- selected-only batch не отправляет invalid/heat-loss-failed objects;
- manual cable mark save сохраняет `cable_mark_source=manual` в выбранных ER
  UUID scopes без изменения других ЭР;
- candidate `apply` меняет основной электрорасчёт только после явного выбора;
- candidate compare diff не сравнивает service/action columns;
- TT-кандидаты с одинаковой маркой различимы по T3/T prop/aggressive/thread
  fields, если slice касается candidate rendering;
- unsupported/error/stale result не смешивается с successful result;
- service `message` не делает успешный электрорасчёт ошибкой;
- catalog voltage overrides request voltage for TLT display/payload if slice
  touches voltage/current/rendering;
- inline edit winding pitch/threads obeys bounds and source metadata if slice
  touches layout cells.

P1 если инфраструктура уже рядом и не расширяет diff:
- initial render without project/with project;
- переключение динамических именованных ЭР сохраняет selected UUID и не меняет active неявно;
- table filters/sort/search build expected backend query;
- candidate folders all/favorite/custom/excluded counts;
- settings modal keeps main table settings separate from candidate settings;
- copy-to-clipboard exports visible main table columns in expected order.

P2 только зафиксируй как residual risk, не реализуй ночью:
- full browser before/after for entire electrical page;
- 50-1000 object performance scenario;
- comprehensive candidate round-trip across reload;
- full specification/report side effect chain.

UI/layout proof:
- Если refactor меняет JSX/CSS/видимый UI, обязателен /ui-proof:
  before screenshot, DOM/CSS cause, verifier, after screenshot.
- Для ElecCalc особенно проверить: 4-column/header layout, main Glide canvas,
  candidate modal table, compare bar, disabled-but-needed controls, clipping,
  horizontal scroll and unreadable/overlapped text.
- Если refactor только pure helper без visible UI changes, screenshots не
  обязательны, но объясни это в report.

Backend/API checks, если flow затрагивается:
- payload shape;
- units;
- variant_number;
- cable_source;
- roles/errors;
- persistence;
- reload;
- DB invariants after UI scenario;
- specification handoff when candidate/apply/batch result changes.

Phase 3: One Minimal Refactor
Если P0 characterization tests для выбранного slice добавлены/найдены и
проходят, сделай ровно один маленький refactor.

Allowed extraction order:
1. tests-only characterization for query/filter/candidate compare helpers;
2. pure helper extraction without JSX/state/effects;
3. narrow table state or preferences hook only after enough tests;
4. presentational toolbar extraction only after route state is reduced and
   /ui-proof can be completed.

Do not start in the first generic runner unless a finding forces it:
- candidate modal extraction;
- cable mark modal extraction;
- batch job hook extraction;
- large toolbar/actionbar extraction;
- shared component extraction with HeatCalc;
- backend/service/API changes.

Extraction rules:
- Не менять UX.
- Не менять API shape.
- Не менять units.
- Не менять names/labels without explicit UI bug scope.
- Не менять ER UUID/compatibility semantics.
- Не менять candidate apply/exclude/favorite semantics.
- Не тащить React Query/router/global stores в pure helper.
- Не создавать giant hook.
- Не создавать helper, который принимает десятки loosely related params.
- Если extraction требует слишком много props/dependencies, stop and report
  finding instead of forcing it.
- После успешного slice обнови `Progress Ledger` в
  `docs/playbooks/eleccalc-page-decomposition-prompts.md`.

Verification commands:
- rg-based discovery commands as needed.
- git diff --check.
- npm --prefix frontend run typecheck.
- focused frontend test, usually:
  npm --prefix frontend test -- --run src/__tests__/integration/pages/ElecCalcPage.test.tsx
- narrower unit tests if only pure helper was extracted.
- scripts/formula-qa.sh quick if calculation mapping, cable selection, units,
  coefficients or formula-related helpers are touched.
- relevant Playwright/e2e electrical specs if visible workflow changed:
  cd e2e && npx playwright test tests/elec-calculation.spec.ts
  cd e2e && npx playwright test tests/electrical-candidate-selection.spec.ts
  cd e2e && npx playwright test tests/electrical-candidate-glide-default.spec.ts
- scripts/codex-functional-audit.sh layout if JSX/CSS/layout changed.
- scripts/codex-functional-audit.sh db-invariants after persisted UI scenario.
- scripts/codex-functional-audit.sh contracts if formula/API/UI mapping touched.

Stop Conditions:
Stop and report blocked/needs verification if:
- docs and code disagree;
- no reliable test harness exists for selected slice;
- expected/golden values would need changing without source of truth;
- refactor requires touching unrelated files broadly;
- required change exceeds Change budget;
- extraction creates worse coupling or giant prop chains;
- ER UUID persistence/reload cannot be verified when in scope;
- candidate apply persistence/reload cannot be verified when in scope;
- formula_id/version/source/error_code traceability cannot be verified when in
  scope;
- Playwright/browser screenshots are required but unavailable.

Final report format:

Functional Accuracy Report
Scope: ElecCalcPage safe split preparation
Mode: /fix-focused
Agent roles used:
- frontend_ui_proof
- functional_accuracy
- formula_oracle if applicable
- backend_business if applicable
- qa_regression
Docs checked:
- ...
Implementation found:
- Backend: ...
- Frontend: ...
- Tests: ...
Safety map:
- state clusters: ...
- effects: ...
- API/persistence: ...
- formula/payload risks: ...
Slice chosen:
- ...
Changes made:
- ...
Verification:
- Command: ...
- Result: pass/fail/not run
Screenshots:
- before: ...
- after: ...
- not required because: pure helper/no visible UI change
Findings:
- ...
Residual risk:
- ...
Recommended next safe slice:
- ...
Ledger updated:
- yes/no, reason
Out of scope:
- HeatCalcPage was not changed.
- Broad ElecCalc architecture rewrite was not attempted.
```

## Почему prompt ограничен

Для `ElecCalcPage` опасен широкий запрос "раздели компонент": страница держит
несколько бизнес-критичных workflow сразу - ER variants, batch calculation,
ручной выбор марки, candidates, спецификацию. Этот prompt заставляет сначала
зафиксировать поведение, выбрать один safe slice и остановиться при нехватке
evidence.
