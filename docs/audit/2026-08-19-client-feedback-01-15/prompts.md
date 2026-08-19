# Исполняемые промпты для замечаний 1–15

Каждый блок ниже — отдельный agent run и отдельный commit. Перед запуском
передай агенту **общий префикс** и **ровно один** slice-блок. Не склеивай
соседние слайсы, даже если они стоят рядом в плане.

Контракты и зависимости: [plan.md](./plan.md). Исходные доказательства:
[snapshot.md](./snapshot.md).

Если пользователь задаёт другой proof-контракт, запрещает commit или меняет
продуктовое решение, его явное указание имеет приоритет.

## Общий префикс

```text
Работай из /Users/dmalafey/Desktop/TLT.

Прочитай полностью:
1. корневой AGENTS.md;
2. docs/audit/2026-08-19-client-feedback-01-15/plan.md;
3. docs/audit/2026-08-19-client-feedback-01-15/snapshot.md;
4. для frontend-слайса — frontend/AGENTS.md,
   docs/frontend/agent-development-standard.md,
   docs/frontend/pr-budget.md и docs/frontend/viewport-policy.md;
5. ближайший production-код, types/contracts и тесты выбранного owner.

Используй обязательные skills по фактической зоне: react-workflow для
React/TypeScript, python-workflow для FastAPI/Python, spreadsheets для
XLSX/CSV, kontur-ui-quality:verify-kontur-ui для видимого интерфейса.

Preflight:
- git status --short;
- git rev-parse HEAD;
- не трогай, не форматируй и не добавляй в commit чужой WIP;
- если dirty file пересекает ALLOWED_SCOPE, остановись с
  FILE / EVIDENCE / DECISION NEEDED;
- не меняй docs/frontend/refactor-backlog.md;
- для каждого frontend production path сначала выполни из frontend/
  npm run agent:scope -- <path>.

Один запуск = один SLICE_ID, один feature-owner, одна причина изменения и один
commit. Characterization first: сначала тест, который краснеет на дефекте,
затем минимальный production patch. Не ослабляй assertions, не используй any,
@ts-ignore, широкие casts, retry/timeout increase или baseline increase. Не
меняй формулы, units, routes, query keys и payload semantics вне явного scope.

Backend proof: точные focused pytest с --no-cov через существующий dev
container/wrapper, затем ruff по затронутым файлам. Формульный slice по риску
добавляет scripts/formula-qa.sh quick.

Frontend proof после focused tests:
cd frontend
npm run agent:scope -- --changed --json
npm run agent:proof-run -- --changed
npm run agent:proof-check -- --changed

Видимый UI обязательно проверь в browser на 1440×900 и указанном в slice
крайнем desktop viewport, включая keyboard/focus, clipping/overflow, console и
failed requests. E2E запускай только из e2e/. Полный
test:agent-dod:dual-safe локально не запускай без отдельного прямого запроса;
если не запрошен, укажи NOT RUN.

После зелёного согласованного proof создай conventional commit только из
явных файлов slice; git add . запрещён. Push не выполняй.

Финальный отчёт:
Slice; behavior before→after; files; focused proof; browser proof; NOT RUN;
residual risk; commit hash.
```

---

## FB15-00 — handoff текущего ATB WIP

```text
SLICE_ID: FB15-00
OWNER: qa / handoff

GOAL:
Классифицировать текущий незакоммиченный ATB WIP и безопасно освободить
конфликтующие spreadsheet/table files. Production не менять.

ALLOWED_SCOPE:
- read-only git diff/log/status;
- answers/05-ambient-temperature-bounds/plan.md и prompts.md;
- новый dated audit note только если нужен handoff record.

DO:
1. По diff определи точный ATB slice для каждого dirty file.
2. Сверь изменения с ALLOWED_SCOPE соответствующего ATB prompt.
3. Докажи, что один owner не смешан с другим. Если смешан — STOP:
   FILE / EVIDENCE / DECISION NEEDED.
4. Зафиксируй, какие commits должны закрыть ATB-03a/03b/04 до FB15 import/table.
5. Не завершай и не коммить чужой WIP без явной передачи владельца.

ACCEPTANCE:
- известен точный владелец каждого dirty file;
- импортные файлы разблокируются только после ATB-04;
- table registry/renderers разблокируются только после ATB-03a/03b;
- ни одной production-правки в FB15-00.

PROOF:
git status --short
git diff --stat
git diff --check

COMMIT:
Только если создан handoff note:
docs(audit): FB15-00 record ATB handoff
Иначе commit не нужен.
```

## FB15-01A — import validation gate

```text
SLICE_ID: FB15-01A
OWNER: heat / interchange backend
POINT: 2

PRECONDITION:
ATB-04 committed или его WIP явно передан; excel_import_service.py clean.

GOAL:
Не сохранять строки, которые canonical form/domain validation считает
невалидными, и вернуть по ним structured row errors.

ALLOWED_SCOPE:
- backend/app/services/excel_import_service.py;
- backend/app/api/v1/objects.py и import response schema, если нужен contract;
- focused import tests/helpers.

CHARACTERIZATION:
Файл содержит валидную pipe и pipe с диаметром 5000 мм. До fix invalid object
попадает в created/project. Тест обязан доказать этот дефект.

IMPLEMENTATION:
- validate before batch append, sort/limit consumption and task scheduling;
- valid neighbor создаётся, invalid neighbor пропускается;
- response отдельно считает created и invalid;
- validation item: sheet, row, field, code, human message;
- parse errors, duplicates и limit остаются отдельными категориями;
- dedupe key не загрязняется rejected row.

ACCEPTANCE:
- для единственной invalid row: created=0, invalid=1, project objects=0;
- mixed file: created=1, invalid=1, task получает только valid id;
- причина диаметра видна в response;
- merge/append/replace contracts имеют focused guards.

FOCUSED PROOF:
- test_excel_import_helpers.py: _add_rows invalid + mixed batch;
- test_import_excel.py: 5000 мм, task ids, merge/replace regression;
- ruff changed backend files.

COMMIT:
fix(heatcalc): FB15-01A reject invalid import rows
```

## FB15-01B — честная сводка импорта

```text
SLICE_ID: FB15-01B
OWNER: heat / frontend
POINT: 2

PRECONDITION:
FB15-01A response contract committed.

GOAL:
Показать пользователю, сколько строк создано/пропущено и почему; не сообщать
«без ошибок» при domain-invalid input.

ALLOWED_SCOPE:
- frontend/src/api/projects.ts;
- frontend/src/components/ImportExcelButton.tsx;
- существующий owner CSS только если без него невозможно длинное сообщение;
- focused component/API tests.

IMPLEMENTATION:
- типизируй valid/invalid/structured row errors без cast;
- toast различает success и partial import;
- modal отдельно показывает created, invalid, parse errors, duplicates, limit;
- для diameter=5000 видны row/field/message;
- existing query invalidation и task polling не менять.

ACCEPTANCE:
- «Все строки импортированы без ошибок» только при нулевых проблемах;
- keyboard закрывает modal, focus не теряется;
- длинный русский текст не обрезан.

FOCUSED PROOF:
- ImportExcelButton focused tests: success, partial invalid, parse error;
- projects API type/adapter test;
- calculated frontend proof.

BROWSER PROOF:
1440×900 + 1000×768, modal partial import, keyboard/focus, console/network.

COMMIT:
fix(frontend): FB15-01B show invalid import rows
```

## FB15-02 — edited climate temperature becomes manual

```text
SLICE_ID: FB15-02
OWNER: heat / interchange backend
POINT: 3

PRECONDITION:
FB15-01A committed; excel_import_service.py clean.

GOAL:
Если пользователь изменил T° среды в экспортированном файле, применить новое
значение как manual override, даже при оставшемся source=climate.

ALLOWED_SCOPE:
- backend/app/services/excel_import_service.py;
- climate lookup helper только через существующий public boundary;
- focused Excel import/round-trip tests.

CHARACTERIZATION:
Создать climate object Togul/-33, экспортировать, изменить только temperature
cell на -10, импортировать в новый проект. До fix итог снова -33.

IMPLEMENTATION:
- unchanged climate cell сохраняет source=climate;
- changed user-facing cell сохраняет -10 и source=manual;
- сравнение использует canonical climate policy, diameter/basis/key и единицы;
- не применять heuristic к missing/unknown provenance;
- pipe и tank, negative/zero values; underground pipe не получает ambient.

ACCEPTANCE:
- точный сценарий -33→-10 остаётся -10 после recalc;
- нет ложного manual override при неизменённом export round-trip;
- source column всё ещё валидируется, но не отменяет явную правку value cell.

FOCUSED PROOF:
- helper tests на changed/unchanged/missing provenance;
- integration export→cell edit→import→recalc;
- ruff changed files.

COMMIT:
fix(heatcalc): FB15-02 honor edited climate temperature
```

## FB15-03A — canonical spreadsheet descriptor

```text
SLICE_ID: FB15-03A
OWNER: heat / interchange backend
POINT: 4

PRECONDITION:
FB15-02 committed; excel_import_service.py clean.

GOAL:
Сделать один canonical descriptor владельцем semantic spreadsheet fields,
aliases, headers, units и object applicability. Поведение пока не расширять.

ALLOWED_SCOPE:
- excel import/export service или новый узкий spreadsheet schema module;
- unit characterization для headers/aliases/order;
- без frontend и без видимого template expansion.

IMPLEMENTATION:
- descriptor генерирует PIPE_HEADERS/TANK_HEADERS и export/template header lists;
- старые русские/legacy aliases и стабильный порядок сохраняются;
- duplicate semantic keys и неоднозначные normalized aliases fail closed;
- не менять validation/source precedence/formulas.

ACCEPTANCE:
- текущие XLSX/CSV golden headers без неожиданных изменений;
- один semantic key не объявлен в нескольких независимых таблицах;
- unit guard краснеет при alias collision или забытом exporter mapping.

FOCUSED PROOF:
- full spreadsheet helper unit file с --no-cov;
- existing export/import integration focused subset;
- ruff changed files.

COMMIT:
refactor(heatcalc): FB15-03A centralize spreadsheet schema
```

## FB15-03B — CSV semantic parity

```text
SLICE_ID: FB15-03B
OWNER: heat / interchange backend
POINT: 4

PRECONDITION:
FB15-03A committed; canonical descriptor is the only header owner.

GOAL:
Довести CSV до semantic parity с XLSX для underground и multilayer objects.

ALLOWED_SCOPE:
- canonical spreadsheet descriptor/import/export/template builders;
- focused unit/integration tests;
- frontend download button вне scope.

IMPLEMENTATION:
- включи ground temperature/type/conductivity/depth;
- pipe λ, layer 1–3 thickness/material/λ/range, cover;
- необходимые source fields и tank-applicable fields;
- CSV union uses «Тип» to apply fields, not positional guesses;
- preserve legacy CSV headers.

ACCEPTANCE:
1. ground=глина, depth=1.5 импортируются и видны в object params;
2. pipe с тремя слоями round-trips без потерь;
3. semantic CSV set покрывает применимые XLSX fields;
4. parse→API import→export→import сохраняет значения/units;
5. invalid field всё ещё проходит FB15-01A gate.

FOCUSED PROOF:
- descriptor parity unit test;
- CSV underground + three-layer integration;
- XLSX backward compatibility regression;
- ruff changed files.

COMMIT:
fix(heatcalc): FB15-03B complete CSV import parity
```

## FB15-04A — dependent domain messages

```text
SLICE_ID: FB15-04A
OWNER: heat / backend
POINT: 5

GOAL:
Вернуть конкретные field-aware сообщения для глубины трубы и заглубления
резервуара без изменения формул/границ.

ALLOWED_SCOPE:
- backend/app/formulas/heat_loss/outcome_errors.py;
- closest structured error tests;
- mapping/presentation only, not calculation core.

IMPLEMENTATION:
- invalid_buried_height → «Высота подземной части X м не может быть больше
  высоты резервуара Y м»;
- сохранить path tank_buried_height и typed code;
- pipe message продолжает показывать depth и наружный радиус всех слоёв;
- no raw internal codes in user message.

ACCEPTANCE:
- tank H=4, buried=10 даёт конкретный русский message;
- pipe D=108, insulation=50, depth=.10 даёт message с radius=.104;
- boundary .104/.11 поведение формулы не изменено.

FOCUSED PROOF:
- structured error channel tests;
- heat-loss ownership tests;
- scripts/formula-qa.sh quick по риску;
- ruff changed files.

COMMIT:
fix(heatcalc): FB15-04A explain dependent geometry errors
```

## FB15-04B — dependent form validation

```text
SLICE_ID: FB15-04B
OWNER: heat / frontend
POINT: 5

PRECONDITION:
FB15-04A committed.

GOAL:
Показать те же dependent constraints у поля и в summary до save.

ALLOWED_SCOPE:
- pure heat field/dependency validation model;
- wizard error projection/form wiring;
- focused unit/integration tests;
- не менять backend formulas.

IMPLEMENTATION:
- tank buried height <= total height;
- pipe centerline depth >= metal outer radius + all insulation thicknesses;
- использовать текущие mm↔m mappings;
- dependencies revalidate on diameter/layers/height/placement changes;
- backend structured message остаётся fallback.

ACCEPTANCE:
- tank 4/10 blocked with exact message;
- pipe 108+50: .10 blocked, .11 accepted;
- field highlight и top summary совпадают;
- request не отправляется при local invalid.

FOCUSED PROOF:
- pure boundary tests;
- ObjectWizard dependency/validation integration tests;
- calculated frontend proof.

BROWSER PROOF:
Heat form 1440×900 + 1280×800 + 1000×768; field/summary, keyboard,
console/network.

COMMIT:
fix(frontend): FB15-04B validate dependent geometry in form
```

## FB15-05 — manual cable diagnostics

```text
SLICE_ID: FB15-05
OWNER: electrical
POINT: 6

GOAL:
Ручная марка получает сообщение про выбранную марку; auto mode — про каталог.

ALLOWED_SCOPE:
- self-regulating formula error construction;
- typed electrical error payload/guidance if required;
- closest backend tests and one frontend pass-through test if needed;
- cable selection logic/catalog ranking вне scope.

IMPLEMENTATION:
- manual power: «Выбранная марка 10ТТН2-СТ не обеспечивает требуемую
  мощность 45 Вт/м»;
- manual temperature: назвать mark, actual temperature и violated limit;
- details retain typed mark/value/limits;
- auto messages remain catalog-wide;
- frontend must render message, not replace it with generic hint.

ACCEPTANCE:
- manual and auto branches separately tested for power and temperature;
- no string parsing to recover mark/number;
- Russian formatting is stable and actionable.

FOCUSED PROOF:
- self_regulating formula tests;
- electrical_error_guidance tests;
- relevant query/UI pass-through test;
- scripts/formula-qa.sh quick;
- ruff/frontend proof according to actual diff.

BROWSER PROOF:
Если frontend production изменён: electrical page 1440×900 + 1280×800,
manual mark error, console/network.

COMMIT:
fix(electrical): FB15-05 name rejected manual cable
```

## FB15-06A — safe underground name model

```text
SLICE_ID: FB15-06A
OWNER: heat / frontend
POINT: 8

GOAL:
Pure generator строит имя подземных pipe/tank по температуре грунта и безопасен
на неполных values.

ALLOWED_SCOPE:
- frontend/src/utils/objectWizardNaming.ts;
- его pure unit tests;
- form hooks/components вне scope.

IMPLEMENTATION:
- types include placement and ground_temperature;
- select ambient for non-underground, ground for underground;
- remove unsafe non-null assertions from required name inputs;
- incomplete inputs return '' instead of throwing/producing undefined.

ACCEPTANCE:
- outdoor pipe/tank names unchanged;
- underground pipe/tank include ground temperature;
- missing geometry/material/temperature returns empty suggestion;
- decimal/sign formatting regression green.

FOCUSED PROOF:
- objectWizardNaming pure tests;
- calculated frontend proof.

COMMIT:
fix(frontend): FB15-06A generate underground object names
```

## FB15-06B — persist generated underground name

```text
SLICE_ID: FB15-06B
OWNER: heat / frontend
POINT: 8

PRECONDITION:
FB15-06A committed.

GOAL:
Передать placement/ground temperature генератору и сохранить programmatic name
в draft/object payload.

ALLOWED_SCOPE:
- useObjectWizardFormSync.ts;
- ConfirmStep.tsx либо один общий name-sync helper;
- focused hook/integration tests.

IMPLEMENTATION:
- watch placement + ground_temperature;
- использовать один name sync owner, удалить дублирующий путь если доказан;
- after setFieldsValue({name}) вызвать draft change contract;
- не перезаписывать ручное имя;
- edit/reopen сохраняют существующее manual name.

ACCEPTANCE:
- underground pipe/tank save API payload has generated non-empty name;
- table no longer falls back to «Трубы #1»;
- manual name remains unchanged after field edits.

FOCUSED PROOF:
- useObjectWizardFormSync tests;
- payload/save integration test;
- calculated frontend proof.

BROWSER PROOF:
Heat form 1440×900 + 1280×800, create underground pipe and tank, reopen,
console/network.

COMMIT:
fix(frontend): FB15-06B persist underground generated names
```

## FB15-07A — applied I доп projection

```text
SLICE_ID: FB15-07A
OWNER: electrical / frontend
POINT: 9

PRECONDITION:
ATB table WIP committed/handoff complete.

GOAL:
Создать pure typed projection применённого объектного I доп из canonical
electrical result.

ALLOWED_SCOPE:
- electrical result value/model helper;
- calculation types only if canonical shape is missing;
- pure unit tests;
- no visible columns/UI.

IMPLEMENTATION:
- read section_plan.max_start_current_a and max_start_current_source;
- display state distinguishes catalog/project/manual, pending/error/missing;
- no fallback to project draft setting when object result absent;
- no 0 for missing value.

ACCEPTANCE:
- catalog-derived and project-setting fixtures return exact value/source;
- stale/pending/error return explicit non-value state;
- typecheck without casts.

FOCUSED PROOF:
- new/existing electrical result model unit tests;
- calculated frontend proof.

COMMIT:
feat(frontend): FB15-07A project applied I dop result
```

## FB15-07B — visible applied I доп

```text
SLICE_ID: FB15-07B
OWNER: electrical / frontend
POINT: 9

PRECONDITION:
FB15-07A committed; electrical table/field registry clean.

GOAL:
Показать применённый I доп и source в строке электротехнического расчёта.

ALLOWED_SCOPE:
- electrical table column registry/renderer for one new read-only field;
- focused table/settings tests;
- project Idop editor behavior вне scope.

IMPLEMENTATION:
- label «I доп применённый, А»;
- value from FB15-07A; source label «по каталогу»/«проектный»;
- missing/pending/error presentation explicit;
- numeric sort/filter/copy only if current column contract supports it.

ACCEPTANCE:
- known catalog fixture renders exact applied value (including 18.5 A fixture,
  если он остаётся authoritative на текущем каталоге);
- project override renders its value and project source;
- placeholder «По каталогу» в settings не считается доказательством row value.

FOCUSED PROOF:
- electrical table model/renderer/settings tests;
- calculated frontend proof.

BROWSER PROOF:
Electrical table 1440×900 + 1280×800 + 1000×768, catalog/project states,
column settings, copy, console/network.

COMMIT:
feat(frontend): FB15-07B show applied I dop per object
```

## FB15-08 — Guest Help Back

```text
SLICE_ID: FB15-08
OWNER: help / frontend
POINT: 10

GOAL:
Вернуть гостя из инструкции в текущий проект, не создавая новую сессию.

ALLOWED_SCOPE:
- GuestHelpPage.tsx;
- общий существующий Help back helper только если уже владеет этим contract;
- focused navigation test.

IMPLEMENTATION:
- label/accessibility name «Назад»;
- app history → назад;
- direct entry/no usable history → /workspace/heat-calc;
- не очищать auth/project stores.

ACCEPTANCE:
- from heat workspace Back returns same project/object count;
- direct /help/guest Back opens heat workspace;
- keyboard Enter/Space works and focus visible.

FOCUSED PROOF:
- GuestHelpPage navigation integration tests;
- route regression;
- calculated frontend proof.

BROWSER PROOF:
1000×768, 1440×900, 1920×1080; history/direct entry, focus,
console/network.

COMMIT:
fix(frontend): FB15-08 preserve guest project on help back
```

## FB15-09 — Admin Logout contrast

```text
SLICE_ID: FB15-09
OWNER: admin / frontend
POINT: 11

GOAL:
Сделать «Выход» видимым и доступным, не меняя logout semantics.

ALLOWED_SCOPE:
- AdminLayout.tsx;
- admin-layout.css;
- focused AdminLayout test.

IMPLEMENTATION:
- semantic button/link with keyboard activation;
- token color appropriate to actual header background;
- visible hover/focus; contrast >=4.5:1;
- API logout, store clear and redirect unchanged.

ACCEPTANCE:
- normal/hover/focus visible;
- accessible name «Выход»;
- mouse and keyboard both logout;
- no page overflow.

FOCUSED PROOF:
- AdminLayout interaction test;
- CSS architecture/calculated frontend proof.

BROWSER PROOF:
1000×768, 1440×900, 1920×1080; computed contrast, focus, console/network.

COMMIT:
fix(frontend): FB15-09 restore admin logout visibility
```

## FB15-10A — derive internal tm from placement

```text
SLICE_ID: FB15-10A
OWNER: heat / frontend
POINT: 12

GOAL:
Сделать insulation_temperature_basis полностью производным от placement до
скрытия UI-control.

ALLOWED_SCOPE:
- pure placement→basis mapper;
- form/API sync owner;
- focused mapper/hook tests;
- visible UI/field registry вне scope.

IMPLEMENTATION:
- reuse current canonical defaults: indoor→indoor, outdoor→outdoor_winter,
  underground→channel (или докажи текущую authoritative mapping кодом);
- create/edit/placement change/recalc persist derived value;
- legacy incompatible basis normalizes deterministically;
- formula input key remains unchanged.

ACCEPTANCE:
- each placement produces one expected basis;
- placement change immediately updates draft/payload;
- no hidden validation error on legacy object;
- existing formula results remain stable for already canonical objects.

FOCUSED PROOF:
- pure mapping boundary tests;
- form sync/payload tests;
- calculated frontend proof.

COMMIT:
refactor(frontend): FB15-10A derive insulation basis from placement
```

## FB15-10B — hide tm from board

```text
SLICE_ID: FB15-10B
OWNER: heat / frontend
POINT: 12

PRECONDITION:
FB15-10A committed; heat field registry clean.

GOAL:
Убрать `tm` из всех пользовательских поверхностей доски, сохранив internal
payload/formula field.

ALLOWED_SCOPE:
- InsulationSettingsRow or its caller;
- heat field/table/settings registry;
- focused visibility/registry tests;
- interchange and backend formulas outside scope.

IMPLEMENTATION:
- no tm select in wizard/full/inline form;
- no tm column in table or column settings;
- remove inaccessible required validation tied to hidden control;
- keep internal value from FB15-10A and backward-compatible import.

ACCEPTANCE:
- DOM and settings contain no user-facing «tm»/«Режим температуры изоляции»;
- create/edit/recalc remain valid across placements;
- calculation receives derived internal basis.

FOCUSED PROOF:
- placement visibility and table registry tests;
- relevant Heat page test;
- calculated frontend proof.

BROWSER PROOF:
Heat workspace 1440×900 + 1280×800 + 1000×768, all placements, column
settings, console/network.

COMMIT:
fix(frontend): FB15-10B hide insulation temperature mode
```

## FB15-11A — one runtime TTL contract

```text
SLICE_ID: FB15-11A
OWNER: auth / backend
POINT: 13

GOAL:
Устранить дрейф session TTL между defaults, env examples и compose и доказать
sliding guest cleanup детерминированным временем.

ALLOWED_SCOPE:
- backend auth/config/guest activity boundaries;
- docker-compose*.yml and env example values for these settings;
- auth/TTL tests;
- no frontend draft behavior.

IMPLEMENTATION:
- guest effective TTL >=4320 min and cleanup interval explicit in runtime;
- access/refresh settings and cookie max-age remain aligned;
- compose passes guest TTL/cleanup variables to backend;
- non-secret effective TTL observable in startup log/diagnostic;
- tests use fake time, no sleep.

ACCEPTANCE:
- active guest touched before boundary survives cleanup;
- inactive guest past boundary is deleted;
- root/example/runtime values do not contradict Help’s 3-day promise;
- employee refresh contract remains >=7 days.

FOCUSED PROOF:
- test_auth.py + test_guest_ttl_expiry_path.py focused;
- config/compose guard;
- ruff changed backend files;
- test-compose-readiness if compose wiring changes.

COMMIT:
fix(auth): FB15-11A align effective session TTL
```

## FB15-11B — token rollover and draft durability

```text
SLICE_ID: FB15-11B
OWNER: auth / frontend
POINT: 13

PRECONDITION:
FB15-11A committed.

GOAL:
Не терять заполненный draft при access-token rollover, transient 401 или guest
session recovery path.

ALLOWED_SCOPE:
- auth API interceptor/session recovery owner;
- Heat draft persistence owner only where evidence shows clearing;
- focused auth/draft integration tests;
- no TTL value changes.

CHARACTERIZATION:
Использовать fake timers/API mocks: заполнить draft, продвинуть время минимум на
6 минут и через access expiry/401 выполнить следующий запрос.

IMPLEMENTATION:
- employee refresh retries original request once without logout/navigation;
- transient refresh/network failure does not clear local draft;
- truly expired guest session shows recovery action before creating a new
  project; no silent overwrite;
- prevent refresh loops/races.

ACCEPTANCE:
- draft values remain after 6+ virtual minutes and successful refresh;
- guest sliding activity does not replace project;
- terminal expiry has explicit UI and recoverable/export path;
- no real sleep in tests.

FOCUSED PROOF:
- api client refresh tests;
- auth store/hydrator tests;
- Heat draft save/recovery integration;
- calculated frontend proof.

BROWSER PROOF:
1440×900 + 1000×768 with short-lived test session; employee and guest,
console/network, no duplicate refresh requests.

COMMIT:
fix(frontend): FB15-11B preserve drafts across session rollover
```

## FB15-12A — backend λ override contract

```text
SLICE_ID: FB15-12A
OWNER: heat / backend
POINT: 15

PRECONDITION:
FB15-10B committed; product contract in plan.md accepted.

GOAL:
Разрешить per-layer manual λ override при сохранённом reference material и
явно трассировать source.

ALLOWED_SCOPE:
- heat object params validation/canonicalization;
- heat-loss preparation/core boundary and provenance;
- schemas/types and focused tests;
- frontend/interchange outside scope.

CONTRACT:
- conductivity_source: reference | manual_override;
- reference material code remains in both modes;
- manual_override requires finite positive conductivity;
- reset to reference removes stale override authority;
- legacy material=other/manual fields remain supported.

ACCEPTANCE:
- reference layer + override validates and calculation uses override;
- same material in reference mode uses catalog law/value;
- missing/invalid override returns structured layer field error;
- pipe/tank and layer indices supported by canonical layer model;
- provenance reports applied λ/source.

FOCUSED PROOF:
- project object params validation tests;
- heat preparation/core/provenance tests;
- formula-qa quick;
- ruff changed files.

COMMIT:
feat(heatcalc): FB15-12A support reference material lambda override
```

## FB15-12B — typed λ form mapping

```text
SLICE_ID: FB15-12B
OWNER: heat / frontend
POINT: 15

PRECONDITION:
FB15-12A committed and API contract available.

GOAL:
Сохранить material, conductivity value и source через API→form→API для каждого
слоя; visible controls пока не добавлять.

ALLOWED_SCOPE:
- pipe/tank form types;
- objectWizard form↔API mappers;
- pure mapping tests;
- UI components/registry outside scope.

IMPLEMENTATION:
- map reference/manual_override/null/clear for layer 1–3;
- preserve legacy other semantics;
- do not infer source from truthiness (0 must validate, not become absent);
- underground/placement changes do not erase insulation source.

ACCEPTANCE:
- pipe and tank round-trip all supported layers;
- reset override serializes canonical reference state;
- edit/reopen preserves source and value;
- types compile without casts.

FOCUSED PROOF:
- pipe-form-api and tank-form-api tests;
- calculated frontend proof.

COMMIT:
feat(frontend): FB15-12B map insulation lambda sources
```

## FB15-12C — λ override UI

```text
SLICE_ID: FB15-12C
OWNER: heat / frontend
POINT: 15

PRECONDITION:
FB15-12B committed; FB15-10B removed tm control.

GOAL:
Дать пользователю для каждого слоя явное включение/сброс ручной λ при
сохранённом reference material.

ALLOWED_SCOPE:
- InsulationConductivityField and one layer-row owner/helper;
- existing feature CSS only if required;
- focused component/integration tests;
- API mappers outside scope.

IMPLEMENTATION:
- reference mode: applied catalog λ/source visible read-only;
- action «Использовать своё значение» opens number input;
- action «Вернуть из справочника» clears override authority;
- manual input required, finite, positive, canonical range validation;
- material change behavior follows plan contract without silent data loss.

ACCEPTANCE:
- first/second/third layer; pipe/tank;
- enable, edit, reset, reopen;
- reference material code never changes to other;
- keyboard/focus/labels and error text accessible.

FOCUSED PROOF:
- InsulationConductivityField tests;
- layer table/form integration tests;
- calculated frontend proof.

BROWSER PROOF:
Heat form 1440×900 + 1280×800 + 1000×768; 1/3 layers, pipe/tank, keyboard,
clipping, console/network.

COMMIT:
feat(frontend): FB15-12C edit reference insulation lambda
```

## FB15-12D — λ interchange and provenance

```text
SLICE_ID: FB15-12D
OWNER: heat / interchange
POINT: 15

PRECONDITION:
FB15-03B and FB15-12C committed; excel_import_service.py clean.

GOAL:
Сделать material + λ + source обратимыми в project file, XLSX и CSV и показать
applied provenance в существующих результатах/отчёте.

ALLOWED_SCOPE:
- project IO and canonical spreadsheet descriptor/import/export;
- existing report/result provenance presentation only where λ already exists;
- focused backend tests; frontend only if existing provenance renderer needs key;
- no redesign.

IMPLEMENTATION:
- explicit source columns/fields for each layer;
- old files infer deterministic legacy source;
- reference export must not materialize applied catalog λ as manual override;
- manual_override round-trips exact value and material code;
- report/confirmation distinguishes «справочник»/«вручную».

ACCEPTANCE:
- project/XLSX/CSV export→import→recalc preserves applied λ/source/result;
- reference and override paths tested for pipe/tank and multi-layer pipe;
- unknown source returns row/path-aware error;
- no conflict with FB15-03A/FB15-03B parity descriptor.

FOCUSED PROOF:
- project_io helpers/integration;
- excel import helpers/integration;
- report/provenance focused tests if touched;
- ruff and frontend proof according to diff.

COMMIT:
feat(heatcalc): FB15-12D round-trip insulation lambda sources
```

## FB15-QA — общий regression seal

```text
SLICE_ID: FB15-QA
OWNER: qa / docs
POINTS: 1–15

PRECONDITION:
Все выбранные FB15 commits и ATB-QA существуют; target HEAD clean кроме явно
переданного WIP.

GOAL:
Повторить все 15 исходных сценариев на одном HEAD. Production не менять.

VERIFY:
1. Повторный merge того же файла не удваивает rows; append создаёт копии.
2. Diameter 5000 не создаётся, summary показывает field reason.
3. Togul -33, cell edit -10 → -10/manual после import+recalc.
4. CSV создаёт underground clay/depth 1.5 и 3-layer insulation.
5. Tank 4/10 и pipe 108+50/.10 получают конкретные hints; .11 проходит.
6. Manual 10ТТН2-СТ power/temperature errors называют mark и limit.
7. Burial depth required/range 0..200 работают без ложной ошибки.
8. Underground pipe/tank имеют сохранённые names.
9. Applied I доп value/source видны per row.
10. Guest Help Back сохраняет project; direct entry fallback корректен.
11. Admin Logout видим, keyboard-accessible, contrast >=4.5.
12. tm отсутствует на доске, calculations остаются stable.
13. 6+ virtual/controlled minutes и token rollover не теряют draft.
14. Выполнить acceptance существующего ATB-QA.
15. Reference material manual λ override round-trips and affects applied λ.

MATRIX:
- Heat/Electrical dense UI: 1000×768, 1280×800, 1440×900;
- Help/Admin shell: 1000×768, 1440×900, 1920×1080;
- keyboard/focus, clipping/overflow, console, failed requests;
- import/API/backend logs for row errors and tasks.

PROOF:
- focused backend suites for import, heat errors, auth, electrical, project IO;
- frontend diff-wide receipts for each implementation commit;
- relevant E2E from e2e/;
- formula-qa quick;
- full frontend dual-safe only if explicitly requested, otherwise NOT RUN.

ARTIFACT:
Создай новый dated docs/audit/.../snapshot.md с HEAD, UTC, environment, exact
commands and PASS/FAIL/NOT RUN. Screenshots/logs stay in that audit directory,
не в repo root. Не переписывай исходный snapshot этого пакета.

FAILURE RULE:
Не исправляй новый defect внутри FB15-QA. Верни его owner новым отдельным
slice с FILE / EVIDENCE / DECISION NEEDED.

COMMIT:
docs(audit): FB15-QA record client feedback revalidation
```
