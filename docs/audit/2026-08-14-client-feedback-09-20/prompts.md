# Промпты Client feedback 09–20

Каждый блок ниже — отдельный agent run и отдельный commit. Слайсы не склеивать.
План, решения и зависимости: [`plan.md`](./plan.md).

Чтобы запустить слайс, передай агенту **общий префикс** и ровно один блок
CFB-00…CFB-AF. Если пользователь отдельно запретил commit или задал другой
proof-контракт, его указание имеет приоритет.

---

## Общий префикс для всех слайсов

```text
Работай из корня /Users/dmalafey/Desktop/TLT.

Прочитай полностью:
1. корневой AGENTS.md;
2. docs/audit/2026-08-14-client-feedback-09-20/plan.md;
3. для любого frontend/e2e слайса — frontend/AGENTS.md и
   docs/frontend/agent-development-standard.md;
4. ближайший production-код и существующие тесты своего owner.

До изменений:
- git status --short;
- git rev-parse HEAD;
- не трогай, не форматируй и не добавляй в commit чужой WIP;
- если WIP пересекает ALLOWED_SCOPE — STOP с FILE / EVIDENCE / DECISION NEEDED;
- для каждого frontend production path выполни из frontend:
  npm run agent:scope -- <path>.

Это явно выбранная пользователем bugfix-инициатива, но не вторая ACTIVE
frontend-очередь. Не меняй docs/frontend/refactor-backlog.md.

Один запуск = один SLICE_ID, один owner, одна причина изменения, один commit.
Characterization first: сначала добавь/исправь тест, который красный на
исходном поведении, затем минимальный production patch. Не ослабляй assertions,
не используй any, @ts-ignore, широкие casts или baseline increase.

Общие инварианты:
- не менять формулы, units, ranges и BOM quantities;
- не менять ER UUID, routes и query keys вне явного scope;
- single create/update formula-invalid объекта остаётся persist-invalid;
- group update должен стать атомарным 422 только в CFB-06;
- machine codes SPEC_* остаются в API, но после CFB-05a/05b не видны пользователю;
- mobile/tablet <1000 px — N/A, не добавлять CSS и не включать в acceptance;
- E2E запускать только из e2e/;
- полный npm run test:agent-dod:dual-safe не запускать без отдельного прямого
  запроса пользователя;
- незапущенная проверка = NOT RUN, не PASS.

Перед commit:
- выполнить focused proof из prompt;
- для frontend diff: npm run agent:scope -- --changed --json, затем выполнить
  рассчитанный required proof через agent:proof-run / agent:proof-check;
- git diff --check;
- просмотреть полный diff и git status --short;
- добавлять только адресные файлы своего слайса, не использовать git add .;
- commit только после зелёного обязательного proof.

Финальный отчёт:
Slice / behavior before→after / files / focused proof / calculated proof /
browser states+viewports / console+network / NOT RUN / residual risk / commit.
```

---

## CFB-00 — актуализировать Specification E2E proof

```text
SLICE_ID: CFB-00
OWNER: qa
PRECONDITION: нет.
GOAL: Case 1 catalog E2E взаимодействует с текущими segmented controls
настроек спецификации и доходит до generate/candidate workflow.

ALLOWED_SCOPE:
  e2e/tests/specification-case1-demo-catalog.spec.ts
  при доказанной необходимости — только ближайший helper внутри этого файла
NON-GOALS:
  frontend/src, backend/app, изменение product UI, новые browser fixtures,
  исправление багов №9–20.

CHARACTERIZATION:
1. Запусти текущий spec и зафиксируй исходный FAIL: helper
   selectRequiredSetting ждёт combobox/ant-select для Ex, тогда как current UI
   использует button group «Да/Нет».
2. Сними accessibility snapshot текущих Ex/K1i/K2i/Kiu controls.
3. Не заменяй locator координатами, CSS nth-child или force-click.

IMPLEMENTATION:
- Перепиши helper на role/name/pressed semantics текущего публичного UI.
- Helper должен выбрать явное «Да»/«Нет» и проверить итоговый pressed state.
- Numeric L_K2i_m/R_gr продолжает заполняться по accessible spinbutton names.
- Тест обязан дойти до реального HTTP generate и каталожного выбора; PASS до
  этой точки недостаточен.
- readiness-recovery spec не менять, если он не сломан этим test-only helper.

FOCUSED_PROOF, cwd=e2e:
  PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
  E2E_BASE_URL=http://127.0.0.1:3003 \
    npx playwright test \
      tests/specification-case1-demo-catalog.spec.ts \
      tests/specification-readiness-recovery.spec.ts \
      --reporter=list
  npx playwright test --list tests/specification-case1-demo-catalog.spec.ts
  git diff --check

Browser launch, application assertion и timeout различай в отчёте. Если Chrome
не запускается в sandbox, повтори тот же command через разрешённую эскалацию;
не объявляй test green по manual browser вместо runner.

COMMIT:
  test(e2e): CFB-00 align specification settings locator
```

---

## CFB-01 — полный pending context после route/F5

```text
SLICE_ID: CFB-01
OWNER: specification
PRECONDITION: CFB-00 committed.
GOAL: После selection_required уход на другой ЭР/route и возврат или F5 не
теряет обязательные options. Если same-session context недоступен, UI не
отправляет неполный запрос, а требует открыть настройки.

ALLOWED_SCOPE:
  frontend/src/pages/specification/useSpecificationPageModel.ts
  один новый pure/session helper в frontend/src/pages/specification/
  frontend/src/__tests__/unit/pages/specification/specGenerationHydrateModel.test.ts
  frontend/src/__tests__/integration/pages/SpecificationPage.er-scope-write.test.tsx
NON-GOALS:
  backend schema/model/migration, generation_options API field,
  catalog-selection confirmation fix CFB-02, modal routing, copy, CSS.

CONTRACT DECISION:
- Не добавлять generation_options в SpecificationResponse/БД: текущие
  OpenAPI и migration tests явно запрещают это поле.
- Pending command является session-scoped UI workflow state.

CHARACTERIZATION FIRST:
1. Расширь existing test
   «hydrates selection_required after F5 and permits an ER tab round trip».
2. Заполни L_K2i_m и R_gr не-default значениями до первого generate.
3. После round trip выбери candidate и докажи, что сейчас второй request не
   содержит эти options или содержит пустые значения.
4. Отдельный unit case: spec=selection_required, persisted context отсутствует,
   текущие numeric options пусты — Apply не должен становиться executable.

IMPLEMENTATION:
- Введи versioned PendingGenerationContext:
  generateVariantIds + options + catalogSelections (пока `{}`).
- Adapter хранит context в sessionStorage, key scoped по projectId + ER UUID;
  JSON валидируется fail-closed, чужой/corrupt/version-mismatch игнорируется.
- Записывай context до первого mutate; сохраняй при selection/confirmation;
  очищай после generated, explicit workflow reset или terminal blocked.
- Rehydrate предпочитает валидный context. Не собирай pending options из
  пустых defaults.
- Без context оставь candidates видимыми, но покажи действие «Открыть
  настройки» и не разрешай Apply до полного buildSpecGenerateOptions.
- Не обращайся к sessionStorage из presentational view.
- useSpecificationPageModel.ts не должен вырасти: файл уже около hard cap;
  вынеси storage/validation logic в helper.

ACCEPTANCE:
- Same-tab ER switch, route switch и F5 сохраняют полный options payload.
- New tab/cleared storage даёт recoverable settings flow, не 422 dead-end.
- Context одного project/ER не применяется к другому.
- Corrupt JSON не роняет page.
- generated/blocked не rehydrate старый pending command.

FOCUSED_PROOF, cwd=frontend:
  npm run test:run -- \
    src/__tests__/unit/pages/specification/specGenerationHydrateModel.test.ts \
    src/__tests__/integration/pages/SpecificationPage.er-scope-write.test.tsx
  npm run lint
  npm run typecheck
  npm run agent:scope -- --changed --json
  npm run agent:proof-run -- --changed
  npm run agent:proof-check -- --changed

BROWSER_PROOF:
- 1000×768, 1280×800, 1440×900;
- selection_required → другой ЭР → обратно → candidate → request body;
- F5 с context и F5 без context;
- keyboard focus на recovery action;
- page overflow, console, failed requests.

E2E, cwd=e2e:
  PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
  E2E_BASE_URL=http://127.0.0.1:3003 \
    npx playwright test tests/specification-case1-demo-catalog.spec.ts \
      --reporter=list

COMMIT:
  fix(frontend): CFB-01 preserve specification pending context
```

---

## CFB-02 — не терять catalog selection при confirmation

```text
SLICE_ID: CFB-02
OWNER: specification
PRECONDITION: CFB-01 committed.
GOAL: Partial ER проходит selection → unassigned confirmation → generated без
возврата к выбору комплектующих.

ALLOWED_SCOPE:
  frontend/src/pages/specification/useSpecificationPageModel.ts
  pending-context helper/type из CFB-01
  frontend/src/__tests__/integration/pages/SpecificationPage.er-scope-write.test.tsx
  frontend/src/__tests__/unit/pages/specification/specGenerationHydrateModel.test.ts
  при необходимости e2e/tests/specification-case1-demo-catalog.spec.ts вместо
    нового третьего test file
NON-GOALS:
  backend preflight, zero-contributing ЭР, copy, modal layout/CSS,
  candidate selection formulas.

CHARACTERIZATION FIRST:
- Построй exact response sequence:
  1) selection_required + unassigned diagnostic;
  2) request с candidate → confirmation_required;
  3) confirm.
- Красный assertion: третий request сейчас содержит
  exclude_unassigned_confirmed=true и catalog_selections={}; поэтому backend
  снова возвращает selection_required.

IMPLEMENTATION:
- Один PendingGenerationContext владеет variantIds, options и selections.
- После candidate Apply запиши выбранные group/item в pending context до mutate.
- confirmation_required не очищает selections.
- confirmPartialGenerate берёт selections из pending context; меняет только
  excludeUnassignedConfirmed на true.
- Draft UI может очищаться только после успешного копирования в pending.
- Generated очищает pending/draft/candidates. Error оставляет recoverable state.
- Не добавляй второй параллельный source of truth.

ACCEPTANCE REQUEST BODIES:
1. initial: options complete, selections empty, exclude=false;
2. after choice: same options, selected group present, exclude=false;
3. after confirm: same options, same selected group, exclude=true;
4. response generated; excluded_unassigned_object_ids показаны пользователю.

FOCUSED_PROOF, cwd=frontend:
  npm run test:run -- \
    src/__tests__/integration/pages/SpecificationPage.er-scope-write.test.tsx \
    src/__tests__/unit/pages/specification/specGenerationHydrateModel.test.ts
  npm run lint
  npm run typecheck
  npm run agent:scope -- --changed --json
  npm run agent:proof-run -- --changed
  npm run agent:proof-check -- --changed

BROWSER_PROOF:
- ER с одним contributing и одним unassigned объектом;
- 1000×768, 1280×800, 1440×900;
- выбрать не первый candidate, подтвердить exclusion, увидеть generated items;
- network: три тела запросов и отсутствие повторного selection loop;
- console/failed requests: ожидаемые 409 preflight отделить от ошибок JS.

E2E, cwd=e2e:
  Если regression добавлен в разрешённый Case 1 spec, запусти его и
  readiness-recovery. Иначе existing Case 1 — consumer proof, а exact chain
  доказывают два frontend test files и browser network evidence.

COMMIT:
  fix(frontend): CFB-02 carry catalog selection through confirmation
```

---

## CFB-03 — zero-contributing ЭР сразу blocked

```text
SLICE_ID: CFB-03
OWNER: specification
LAYER: backend
PRECONDITION: нет; не объединять с CFB-04/05.
GOAL: Новый/пустой ЭР без contributing electrical results не предлагает
подтвердить исключение всех объектов, а сразу возвращает machine blocker.

ALLOWED_SCOPE:
  backend/app/services/specification_preflight_rules.py
  backend/app/services/specification_preflight_service.py
  backend/app/services/specification_readiness_service.py только при доказанной
    необходимости согласовать тот же result
  backend/app/tests/unit/services/test_specification_preflight_rules.py
  backend/app/tests/unit/services/test_specification_preflight_service.py
  backend/app/tests/unit/services/test_specification_readiness_service.py
  один ближайший integration test preflight/generation
NON-GOALS:
  frontend, русский copy CFB-05a/05b, BOM formulas, catalogs, DB schema.

CHARACTERIZATION FIRST:
Добавь матрицу:
- total>0, contributing=0, all unassigned → сейчас confirmation_required;
- total>0, contributing>0, есть unassigned → confirmation_required;
- contributing=total>0 → ready, если нет других blocker;
- no project objects / no result → зафиксировать действующий machine code.

IMPLEMENTATION:
- Правило no-contributing имеет precedence над unassigned confirmation.
- Возвращай status=blocked и code=SPEC_VARIANT_NOT_READY.
- Не проси exclude_unassigned_confirmed для пустого набора.
- Partial ER с хотя бы одним contributing result сохраняет confirmable path.
- Readiness и generate preflight не должны расходиться по status/code.
- Message literal не улучшать здесь: CFB-05a владеет generation copy.

FOCUSED_PROOF, cwd=root:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/services/test_specification_preflight_rules.py \
      app/tests/unit/services/test_specification_preflight_service.py \
      app/tests/unit/services/test_specification_readiness_service.py \
      app/tests/integration/db/test_specification_preflight_service.py \
      -q --tb=line --no-cov
  docker exec -w /app heatcalc_backend ruff check \
    app/services/specification_preflight_rules.py \
    app/services/specification_preflight_service.py \
    app/services/specification_readiness_service.py
  git diff --check

Full backend: NOT RUN, если пользователь отдельно не запросил.
Frontend: NOT TOUCHED / NOT RUN.

COMMIT:
  fix(backend): CFB-03 block zero-contributing specification scope
```

---

## CFB-04 — state-driven routing модалок Specification

```text
SLICE_ID: CFB-04
OWNER: specification
PRECONDITION: CFB-02 и CFB-03 committed.
GOAL: Selection, confirmation и blocked outcomes представлены своими UI
состояниями; diagnostic другого blocker не попадает в unassigned modal.

ALLOWED_SCOPE:
  frontend/src/pages/specification/useSpecificationPageModel.ts
  frontend/src/pages/specification/SpecPageChrome.tsx
  один новый pure outcome model в frontend/src/pages/specification/
  frontend/src/__tests__/unit/pages/specification/SpecPageChrome.kit.test.tsx
  frontend/src/__tests__/integration/pages/SpecificationPage.er-scope-write.test.tsx
NON-GOALS:
  wording/localization CFB-05a/05b, backend rules, CSS/redesign, number fields.

CHARACTERIZATION FIRST:
Зафиксируй каждый result отдельно и mixed multi-ER cases:
- selection_required → candidates, confirm modal closed;
- confirmation_required → unassigned modal, только confirmable diagnostics;
- blocked → modal closed, blocker alert;
- generated → workflow state cleared;
- generated + blocked после confirm → modal closed, generated data invalidated,
  blocker показан отдельно;
- selection_required + confirmation_required → selection step first, затем
  confirmation после нового response.

Если backend может вернуть комбинацию, для которой нет исполняемого product
решения, не угадывай: STOP с FILE / EVIDENCE / DECISION NEEDED.

IMPLEMENTATION:
- Вынеси pure reducer/selector из handleGenerateResult.
- Reducer возвращает candidate groups, confirm diagnostics, blocking diagnostics,
  pending transition и open/close flags.
- preflightSummary строится только из results/status=confirmation_required.
- blocked response всегда закрывает confirm modal, если confirmable results
  больше нет.
- Static title «Есть объекты без назначения» никогда не оборачивает catalog /
  not-ready blocker.
- Сохрани query invalidation generated ER и recoverable pending context.

FOCUSED_PROOF, cwd=frontend:
  npm run test:run -- \
    src/__tests__/unit/pages/specification/SpecPageChrome.kit.test.tsx \
    src/__tests__/integration/pages/SpecificationPage.er-scope-write.test.tsx
  npm run lint
  npm run typecheck
  npm run agent:scope -- --changed --json
  npm run agent:proof-run -- --changed
  npm run agent:proof-check -- --changed

BROWSER_PROOF:
- 1000×768, 1440×900, 1920×1080;
- пустой ЭР, partial ЭР, selection_required и terminal blocked;
- один dialog максимум; bounds внутри viewport; focus/close/keyboard;
- no page overflow; console и network классифицированы.

E2E, cwd=e2e:
  PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
  E2E_BASE_URL=http://127.0.0.1:3003 \
    npx playwright test \
      tests/specification-case1-demo-catalog.spec.ts \
      tests/specification-readiness-recovery.spec.ts \
      --reporter=list

COMMIT:
  fix(frontend): CFB-04 route specification outcomes by status
```

---

## CFB-05a — русская generation-диагностика Specification

```text
SLICE_ID: CFB-05a
OWNER: specification
PRECONDITION: CFB-04 committed.
GOAL: Пользователь не видит `Backend`, raw `SPEC_*` или английские фрагменты;
machine codes продолжают управлять workflow и остаются в API.

ALLOWED_SCOPE:
  backend/app/services/specification_generation_service.py
  один ближайший backend generation test
  frontend/src/pages/specification/SpecPageChrome.tsx
  один новый/существующий pure diagnostic presentation model
  frontend/src/__tests__/unit/pages/specification/SpecPageChrome.kit.test.tsx
  frontend/src/__tests__/integration/pages/SpecificationPage.er-scope-write.test.tsx
NON-GOALS:
  status routing, pending state, backend code names, HTTP statuses,
  catalog/readiness fallback copy (CFB-05b), каталог/BOM logic, CSS redesign.

CHARACTERIZATION FIRST:
- DOM tests должны сначала найти текущие `Backend заблокировал формирование`
  и `SPEC_VARIANT_NOT_READY` в generation state.
- Backend test фиксирует mixed literal
  `Нет contributing electrical results для формирования BOM`.
- Проверь generation modal/settings occurrences; остаточный readiness/catalog
  copy принадлежит CFB-05b.

IMPLEMENTATION:
- Backend known message сделать полностью русским и предметным.
- В UI codes использовать только для выбора presentation; code не рендерить.
- Известные причины получают actionable copy:
  not ready → перейти/пересчитать ЭР;
  accessory selection → выбрать комплектующие;
  unassigned confirmation → подтвердить исключение или исправить назначения.
- Unknown code: безопасный общий title/message без вывода code.
- Field-specific settings issues и focus первого поля сохранить.

NEGATIVE DOM ASSERTIONS:
  queryByText(/Backend/i) == null
  document.body.textContent не содержит /SPEC_[A-Z_]+/
  не содержит `contributing electrical results`

FOCUSED_PROOF, cwd=root:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/integration/db/test_specification_generation_service.py \
      -q --tb=line --no-cov
  docker exec -w /app heatcalc_backend ruff check \
    app/services/specification_generation_service.py

FOCUSED_PROOF, cwd=frontend:
  npm run test:run -- \
    src/__tests__/unit/pages/specification/SpecPageChrome.kit.test.tsx \
    src/__tests__/integration/pages/SpecificationPage.er-scope-write.test.tsx
  npm run lint
  npm run typecheck
  npm run agent:scope -- --changed --json
  npm run agent:proof-run -- --changed
  npm run agent:proof-check -- --changed

BROWSER_PROOF:
- empty/not-ready, selection-required, unassigned-confirm states;
- 1000×768 и 1440×900;
- screenshot + accessibility snapshot;
- DOM negative search для Backend/SPEC_/English fragment;
- console/network.

COMMIT:
  fix(specification): CFB-05a present Russian generation diagnostics
```

---

## CFB-05b — убрать остаточный `Backend` из Specification copy

```text
SLICE_ID: CFB-05b
OWNER: specification
PRECONDITION: CFB-05a committed.
GOAL: Readiness hint и catalog fallback описывают предметное поведение без
слова `backend`; generation diagnostics из CFB-05a не меняются.

ALLOWED_SCOPE:
  frontend/src/pages/specification/SpecificationReadinessAlert.tsx
  frontend/src/pages/specification/specGenerationOptionsSyncModel.ts
  frontend/src/__tests__/unit/pages/specification/SpecPageChrome.kit.test.tsx
  frontend/src/__tests__/unit/pages/specification/specGenerationOptionsSyncModel.test.ts
NON-GOALS:
  backend, diagnostic codes/messages, state routing, API/catalog semantics,
  CSS/layout.

CHARACTERIZATION FIRST:
- Найди user-visible `backend` в readiness hint и catalog fallback.
- Зафиксируй смысл обоих состояний: readiness не гарантирует generation до
  server check; catalog может быть выбран системой при формировании.

IMPLEMENTATION:
- Замени технический субъект предметным русским текстом без изменения смысла.
- Не вводи обещание успешного формирования, которого API не гарантирует.
- Поиск по production Specification owner после patch не должен находить
  user-visible `/backend/i`; комментарии и test descriptions не считаются DOM.

FOCUSED_PROOF, cwd=frontend:
  npm run test:run -- \
    src/__tests__/unit/pages/specification/SpecPageChrome.kit.test.tsx \
    src/__tests__/unit/pages/specification/specGenerationOptionsSyncModel.test.ts
  npm run lint
  npm run typecheck
  npm run agent:scope -- --changed --json
  npm run agent:proof-run -- --changed
  npm run agent:proof-check -- --changed

BROWSER_PROOF:
- readiness ready/blocked и catalog fallback;
- 1000×768 и 1440×900;
- DOM negative search /backend/i, text overflow, console/network.

COMMIT:
  fix(frontend): CFB-05b remove backend jargon from specification
```

---

## CFB-06 — атомарная backend-валидация group update

```text
SLICE_ID: CFB-06
OWNER: heat
LAYER: backend
PRECONDITION: нет.
GOAL: Group update выполняет задокументированный all-or-nothing контракт:
range/formula-invalid value возвращает 422 и не меняет ни один объект.

ALLOWED_SCOPE:
  backend/app/services/project_service.py
  backend/app/api/v1/objects.py
  при необходимости один heat application validation helper, но не formula core
  backend/app/tests/integration/api/test_objects_group_ops.py
  один ближайший unit/service test
NON-GOALS:
  single create/update persist-invalid, frontend modal, формулы/ranges/units,
  schema migration, electrical calculation semantics.

CHARACTERIZATION FIRST:
- Замени/дополни текущий test
  test_invalid_value_is_persisted_with_structured_validation_state на требуемый
  endpoint contract, но сначала докажи красный current behavior:
  ambient_temperature=999 → 200, params=999, version+1, invalid.
- Добавь snapshot before и после для двух объектов.
- Добавь relation-invalid case для одного из объектов, чтобы операция была
  rollback для всех.
- Existing valid group update остаётся guard.

IMPLEMENTATION:
- Построй prospective normalized params для всех объектов.
- Прогони canonical heat validation/application boundary до commit; ranges не
  копировать в ProjectService/API.
- Собери problem list с object_id/name/error для каждого неподходящего объекта.
- При problems подними ProjectGroupValidationError; route делает rollback и 422.
- После failure params, version, results, validation_errors, updated_at и stale
  state всех объектов остаются прежними.
- При success сохранить существующие recalc, electrical/spec stale propagation,
  audit event и один commit.
- Не превращай single update/create в reject-invalid.

FOCUSED_PROOF, cwd=root:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/integration/api/test_objects_group_ops.py \
      app/tests/unit/test_pipe_slice2_contract.py::test_invalid_pipe_formula_persists_api_validation_state \
      -q --tb=line --no-cov
  docker exec -w /app heatcalc_backend ruff check \
    app/services/project_service.py app/api/v1/objects.py
  git diff --check

Проверь отдельно, что rejected group request не создаёт success audit и не
инвалидирует downstream расчёты.

Full backend: NOT RUN без отдельного запроса.
Frontend: NOT TOUCHED / NOT RUN.

COMMIT:
  fix(backend): CFB-06 validate group update atomically
```

---

## CFB-07 — opt-in non-clamping contract TltNumberField

```text
SLICE_ID: CFB-07
OWNER: ui
PRECONDITION: нет.
GOAL: UI-kit number field умеет по явному opt-in не clamp-ить out-of-range
draft на blur, сохраняя default behavior всех существующих consumers.

ALLOWED_SCOPE:
  frontend/src/components/form-controls/TltNumberField.tsx
  frontend/src/components/common/UnitInputNumber.tsx только для type pass-through
  frontend/src/__tests__/unit/components/FormControls.test.tsx
  frontend/src/__tests__/unit/components/UIKitLibrary.test.tsx
NON-GOALS:
  Heat/spec/admin consumers, domain validation messages, global default change,
  CSS/layout.

CHARACTERIZATION FIRST:
- Current field with min=-70/max=70: type 999, blur → emitted/displayed 70.
- Decimal comma, clear и valid boundary уже работающие guards.

IMPLEMENTATION:
- Добавь публичный boolean prop с ясной семантикой (не implementation-jargon).
- Внутри корректно передай Ant changeOnBlur/clamp behavior.
- Default/undefined полностью сохраняет current behavior.
- Opt-in оставляет `999` видимым и передаёт его controlled owner; UI-kit сам не
  пишет domain error и не решает, можно ли submit.
- Сохрани parser/formatter RU comma, null on clear, Enter handler, aria props,
  unit layout и controlled/uncontrolled behavior.
- Не экспортируй Ant InputNumberProps целиком как новый публичный API.

FOCUSED_PROOF, cwd=frontend:
  npm run test:run -- \
    src/__tests__/unit/components/FormControls.test.tsx \
    src/__tests__/unit/components/UIKitLibrary.test.tsx
  npm run lint
  npm run typecheck
  npm run agent:scope -- --changed --json
  npm run agent:proof-run -- --changed
  npm run agent:proof-check -- --changed
  git diff --check

UI-KIT PROOF:
- default: min/max clamp compatibility;
- opt-in: below min и above max remain draft;
- exact min/max, comma decimal, blank, Enter, disabled/readOnly;
- accessible name/invalid attributes не регрессируют.

Browser proof нужен только если story изменена: 1000×768 и 1440×900.
Feature E2E: NOT RUN / NOT TOUCHED.

COMMIT:
  feat(ui): CFB-07 support non-clamping number drafts
```

---

## CFB-08 — Heat min/max feedback без silent clamp

```text
SLICE_ID: CFB-08
OWNER: heat
PRECONDITION: CFB-06 и CFB-07 committed.
GOAL: Heat form и group modal показывают canonical range error, сохраняют
введённый draft и не отправляют invalid mutation.

ALLOWED_SCOPE:
  frontend/src/utils/heatCalcWizardFieldRules.ts
  frontend/src/components/heatcalc/HeatCalcGroupUpdateModal.tsx
  frontend/src/__tests__/unit/components/HeatCalcGroupUpdateModal.test.tsx
  frontend/src/__tests__/integration/components/ObjectWizardDependencies.validation-highlight.test.tsx
NON-GOALS:
  UI-kit internals, backend validation, Excel/inline mode без доказанного общего
  path, formulas/ranges/copy CFB-09, CSS redesign.

CHARACTERIZATION FIRST:
- Wizard/form: min-1 и max+1 сейчас clamp-ятся и submit остаётся возможен.
- Group modal: ambient=999 сейчас превращается в 70 и Apply вызывает mutation.
- Required blank показывает «Укажите значение» — guard, не менять.

IMPLEMENTATION:
- Heat numeric form props включают opt-in CFB-07.
- Domain validator остаётся единственным владельцем message:
  «Минимальное значение — X» / «Максимальное значение — X».
- Out-of-range draft остаётся в поле, status/aria-invalid/description связаны.
- Save/Apply не вызывает mutation, пока error существует.
- Group modal вычисляет error через существующий heat field config/rules, не
  hardcode диапазона; param change очищает value/error.
- Exact boundary values и corrected value отправляются без hidden transform.
- Backend 422 из CFB-06 всё равно обрабатывается для race/heterogeneous objects.

FOCUSED_PROOF, cwd=frontend:
  npm run test:run -- \
    src/__tests__/unit/components/HeatCalcGroupUpdateModal.test.tsx \
    src/__tests__/integration/components/ObjectWizardDependencies.validation-highlight.test.tsx
  npm run lint
  npm run typecheck
  npm run agent:scope -- --changed --json
  npm run agent:proof-run -- --changed
  npm run agent:proof-check -- --changed

BROWSER_PROOF:
- wizard/form below min, above max, exact bounds, corrected value;
- group modal ambient=999 и -71;
- 1000×768, 1280×800, 1440×900;
- keyboard/tab/focus/error description;
- network доказывает отсутствие POST при invalid и exact payload при valid;
- console и page/dialog overflow.

E2E consumer proof, cwd=e2e; файл не менять в этом слайсе:
  PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
  E2E_BASE_URL=http://127.0.0.1:3003 \
    npx playwright test tests/heat-object-actions.spec.ts --reporter=list

COMMIT:
  fix(frontend): CFB-08 validate Heat number drafts before submit
```

---

## CFB-09 — human labels для Heat structured errors

```text
SLICE_ID: CFB-09
OWNER: heat
PRECONDITION: CFB-08 committed.
GOAL: Formula-invalid object остаётся persisted invalid, но пользователь видит
«Толщина стенки» и понятную причину без raw `wall_thickness`.

ALLOWED_SCOPE:
  frontend/src/utils/heatCalcPageUtils.ts
  frontend/src/components/wizard/useObjectWizardFormSync.ts только если нужен
    canonical path для field highlight
  frontend/src/__tests__/unit/utils/heatCalcPageUtils.test.ts
  frontend/src/__tests__/integration/components/ObjectWizardDependencies.validation-highlight.test.tsx
NON-GOALS:
  backend formula/message, запрет persist-invalid, number clamp, CSS,
  изменение пункта 13 на server validation.

CHARACTERIZATION FIRST:
- Record с structured payload:
  error_code=wall_exceeds_pipe_radius,
  field=wall_thickness,
  fields.wall_thickness=<message>.
- Current output содержит raw wall_thickness или не связывает ошибку с visible
  field.
- Blank insulation thickness: local «Укажите значение», onSubmit не вызван.

IMPLEMENTATION:
- В одном pure mapping нормализуй backend storage path к canonical Heat UI id.
- Используй getHeatCalcFieldLabel с правильным objectType/context.
- Message из structured payload сохраняй, но дедуплицируй generic summary.
- Field highlight должен попасть на visible wall thickness control.
- Не парси русский message, если error_code/field уже structured.
- Unknown field получает безопасный generic label/message, raw id не выводится.
- D=2×wall по-прежнему сохраняется как invalid согласно persist contract.

ACCEPTANCE COPY:
- содержит «Толщина стенки»;
- не содержит `wall_thickness`;
- объясняет relation из backend message, если он доступен;
- пункт 13 остаётся локальным required guard без POST.

FOCUSED_PROOF, cwd=frontend:
  npm run test:run -- \
    src/__tests__/unit/utils/heatCalcPageUtils.test.ts \
    src/__tests__/integration/components/ObjectWizardDependencies.validation-highlight.test.tsx
  npm run lint
  npm run typecheck
  npm run agent:scope -- --changed --json
  npm run agent:proof-run -- --changed
  npm run agent:proof-check -- --changed

BROWSER_PROOF:
- pipe D=12 mm, wall=6 mm; save → invalid persisted, red wall field,
  human summary;
- clear existing insulation thickness → local error, no network mutation;
- 1000×768, 1280×800, 1440×900;
- focus, aria-describedby, console/network.

COMMIT:
  fix(frontend): CFB-09 localize Heat structured field errors
```

---

## CFB-10 — коэффициент PUT только обновляет

```text
SLICE_ID: CFB-10
OWNER: admin
LAYER: backend
PRECONDITION: нет.
GOAL: Опечатка/неизвестный key в PUT coefficient не создаёт новую строку.

ALLOWED_SCOPE:
  backend/app/api/v1/admin.py
  backend/app/services/admin_service.py
  backend/app/tests/unit/services/test_admin_service_unit.py
  backend/app/tests/integration/api/test_admin.py
  при необходимости schema error type, без migration
NON-GOALS:
  frontend key editing (key уже read-only), новый create UI/API,
  coefficient values/formulas, seed rewrite, DB migration.

CHARACTERIZATION FIRST:
- Existing service test сейчас требует upsert creates missing.
- Integration: count before; PUT /coefficients/typo-key; сейчас success и count+1.
- Existing-key update и retired-key rejection остаются guards.

IMPLEMENTATION:
- Раздели create_coefficient и update_coefficient semantics.
- PUT route вызывает только update; missing key поднимает typed not-found и
  возвращает 404.
- Missing path: no db.add, no commit, no refresh, no cache invalidation, no
  success audit.
- Existing path: update value/optional description, commit, refresh, cache
  invalidate, success audit.
- create_coefficient остаётся explicit internal operation и не делегирует в
  ambiguous upsert; duplicate key должен иметь явный error, если покрывается.
- Не добавляй POST endpoint без отдельного запроса.

FOCUSED_PROOF, cwd=root:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/services/test_admin_service_unit.py \
      app/tests/integration/api/test_admin.py -k coefficient \
      -q --tb=line --no-cov
  docker exec -w /app heatcalc_backend ruff check \
    app/api/v1/admin.py app/services/admin_service.py
  git diff --check

API ACCEPTANCE:
- PUT known → 200, same key/count, new value;
- PUT unknown → 404, same count;
- no success audit/cache invalidation for 404;
- admin auth boundary unchanged.

Full backend: NOT RUN без отдельного запроса.
Frontend: NOT TOUCHED / NOT RUN.

COMMIT:
  fix(backend): CFB-10 reject unknown coefficient updates
```

---

## CFB-AF — сводная регрессия и snapshot

```text
SLICE_ID: CFB-AF
OWNER: qa/docs
PRECONDITION: Все выбранные пользователем CFB-00…CFB-10, включая CFB-05a/05b,
committed. Если часть
осознанно отложена, перечисли её как NOT RUN / OPEN, не маскируй.
GOAL: Выполнить сводный proof пунктов 9–20 и записать динамическое evidence.
Production-код не менять.

ALLOWED_SCOPE:
  docs/audit/2026-08-14-client-feedback-09-20/snapshot.md
  browser/e2e generated artifacts только в ignored output directories
NON-GOALS:
  любые production/test fixes, backlog status, baseline update, новый CSS.

PREFLIGHT:
- git status --short;
- git rev-parse HEAD;
- UTC, host, Docker container versions, node/npm/python versions;
- убедись, что diff до snapshot не содержит чужих файлов.

FRONTEND FOCUSED, cwd=frontend:
  npm run test:run -- \
    src/__tests__/unit/pages/specification/specGenerationHydrateModel.test.ts \
    src/__tests__/integration/pages/SpecificationPage.er-scope-write.test.tsx \
    src/__tests__/unit/pages/specification/SpecPageChrome.kit.test.tsx \
    src/__tests__/unit/pages/specification/specificationReadinessModel.test.ts \
    src/__tests__/unit/components/FormControls.test.tsx \
    src/__tests__/unit/utils/heatCalcFieldRules.test.ts \
    src/__tests__/unit/components/HeatCalcGroupUpdateModal.test.tsx \
    src/__tests__/unit/utils/heatCalcPageUtils.test.ts \
    src/__tests__/integration/components/ObjectWizardDependencies.validation-highlight.test.tsx
  npm run lint
  npm run typecheck

BACKEND FOCUSED, cwd=root:
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/services/test_specification_preflight_rules.py \
      app/tests/unit/services/test_specification_preflight_service.py \
      app/tests/unit/services/test_specification_readiness_service.py \
      app/tests/integration/db/test_specification_generation_service.py \
      app/tests/integration/api/test_objects_group_ops.py \
      app/tests/unit/test_pipe_slice2_contract.py::test_invalid_pipe_formula_persists_api_validation_state \
      -q --tb=line --no-cov
  docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
    -w /app heatcalc_backend pytest \
      app/tests/unit/services/test_admin_service_unit.py \
      app/tests/integration/api/test_admin.py \
      -k coefficient -q --tb=line --no-cov

E2E, cwd=e2e:
  PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
  E2E_BASE_URL=http://127.0.0.1:3003 \
    npx playwright test \
      tests/specification-case1-demo-catalog.spec.ts \
      tests/specification-readiness-recovery.spec.ts \
      tests/heat-object-actions.spec.ts \
      --reporter=list

BROWSER MATRIX:
- Specification: 1000×768, 1280×800, 1440×900;
- modal/state routing: дополнительно 1920×1080;
- Heat wizard/group modal: 1000×768, 1280×800, 1440×900;
- mobile/tablet: N/A, не запускать как acceptance.

Обязательные state checks:
1. №9 route/F5 с context и recovery без context.
2. №14 partial ER selection→confirm→generated; request bodies.
3. №15 empty ER сразу blocked с recovery action.
4. №16–18 DOM без Backend/SPEC_/English, один релевантный dialog.
5. №10–11 below/above limits remain visible, correct message, no mutation.
6. №12 human wall label при persisted-invalid.
7. №13 blank insulation local guard, no POST.
8. №19 direct API invalid group request 422, objects byte/versions unchanged;
   valid UI group update success.
9. №20 PUT unknown key 404, coefficient count unchanged; не создавать мусорную
   запись ради UI proof.

Для каждого visible state:
- screenshot + accessibility snapshot;
- bounding boxes/overflow;
- keyboard focus/action availability;
- console warning/error;
- failed network requests с классификацией expected vs unexpected.

SNAPSHOT FORMAT:
- HEAD/UTC/environment/dirty status;
- таблица slice → commit;
- каждая фактическая команда + exit code + PASS/FAIL/NOT RUN;
- browser states/viewports;
- issue 9–20 verdict after fixes;
- residual risks и untested states;
- full dual-safe DoD: NOT RUN, если пользователь прямо не запросил.

Если любой обязательный check красный, CFB-AF = FAIL/BLOCKED. Не исправляй его
в AF и не расширяй scope; верни owner нового defect.

После snapshot:
  git diff --check
  git status --short

COMMIT:
  docs(qa): CFB-AF record client feedback regression proof
```
