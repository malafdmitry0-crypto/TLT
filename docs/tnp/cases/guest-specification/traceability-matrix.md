# Матрица трассируемости PDF → приложение

Статусы:

- `PASS` — требование доказано кодом и фактической проверкой;
- `PARTIAL` — реализована только часть или отличается модель;
- `FAIL` — наблюдаемое поведение противоречит требованию;
- `CONFLICT` — PDF расходится с действующим утверждённым контрактом или сам с собой;
- `NOT VERIFIED` — обязательного evidence нет.

Главный источник текущей бизнес-логики определён в
`docs/business-logic-contract.md:3-16`; неполная ТНП-логика должна получать
статус `Needs implementation / correction / business decision`
(`docs/business-logic-contract.md:18-24`). Поэтому новый PDF не используется
для молчаливой замены существующих golden-значений.

Phase 1 backend/DB, Phase 2 frontend/consumer и Phase 3 authoritative
assignments имеют статус **PASS** в своих границах. Evidence и переходные
ограничения вынесены в
[phase-1-checkpoint.md](phase-1-checkpoint.md) и
[phase-2-checkpoint.md](phase-2-checkpoint.md), текущий статус — в
[phase-3-checkpoint.md](phase-3-checkpoint.md). `PARTIAL` ниже не означает
готовность полного PDF-flow: sections, UUID-only data plane, multi-ЭР
specification и CSV v3 ещё отсутствуют.

## Гость, сессия и проект

| PDF ID | Статус | Документация и backend | Frontend, tests и фактическое evidence |
|---|---|---|---|
| PDF-GUEST-01 | PARTIAL | Guest session/project реализованы: `backend/app/api/v1/auth.py:67-108`, `backend/app/core/dependencies.py:79-121`. Гостю доступен только basic BOM: `backend/app/api/v1/specifications.py:70-77`. | Реальный guest entry и объект прошли; целевая модель ЭР/секций/full PDF BOM недоступна. |
| PDF-GUEST-02 | FAIL | Текущий SRS различает guest/employee/admin. | `frontend/src/pages/HomePage.tsx:64-139` выводит три role-card, PDF требует два стартовых действия. См. `assets/ui/guest-audit-home-desktop.png`. |
| PDF-GUEST-03 | PASS | Лимит один проект: `backend/app/core/config.py:71-80`; auto-project создаётся после guest session: `backend/app/api/v1/auth.py:88-98`. | После `POST /auth/guest` открыт `/workspace/heat-calc`, проект «Мой проект»; отдельного guest project list нет. |
| PDF-GUEST-04 | CONFLICT | PDF говорит «не в БД», но текущий SRS и код используют PostgreSQL session/project; FK isolation — `backend/app/services/project_service.py:94-130`. | Network и DB invariants подтверждают server-side persistence. Нужно определить, запрещено ли только долговременное хранение. |
| PDF-GUEST-05 | FAIL / CONFLICT | `GUEST_SESSION_TTL_MINUTES=20`, cleanup 10 минут: `backend/app/core/config.py:76-80`; PDF требует 3 дня. | Home сообщает 20 минут; TTL indicator/modal в `MainLayout` отсутствуют (`frontend/src/components/layout/MainLayout.tsx:18-39,62-86`). |
| PDF-GUEST-06 | PARTIAL | Project CSV v2 теперь восстанавливает sparse UUID graph для legacy slots `1…4`, включая assignments и stale specification trace. Формат всё ещё не переносит имена/active/пятый ЭР/sections/settings. | Combined Project I/O + Excel suite проходит 46 тестов, включая round-trip `1 + 4` без искусственных 2/3. Full-state PDF round-trip требует CSV v3 в Phase 5. |
| PDF-GUEST-07 | PARTIAL | Invalid slot валидируется до замены guest project; bulk откатывает только ошибочный project graph. Unknown electrical `object_key` всё ещё silently skipped, а полный PDF-граф не определён в v2. | UI по-прежнему запускает import сразу после выбора файла, без filename/предупреждения/confirm; это расходится с `docs/srs/ui/guest/06-csv-flows.md:94-171`. |

## NFR и защитные свойства

| PDF ID | Статус | Документация и реализация | Verification |
|---|---|---|---|
| PDF-NFR-01 | PARTIAL | Docker stack присутствует. | `make dev-d`, `make ps`: frontend/backend/DB/Redis healthy; core flow работал локально. Полный offline cold-start не проверялся. |
| PDF-NFR-02 | NOT VERIFIED | В репозитории нет полного обязательного browser gate Chrome/Firefox/Opera/Яндекс. | Проверен Chromium только. |
| PDF-NFR-03 | PARTIAL | Lifecycle scale proof создаёт `500 objects × 5 ER = 2500 assignments` за постоянные 69 SQL statements при ceiling 80. | PDF wall-clock thresholds 500 объектов ≤30 секунд и specification ≤30 секунд не измерялись. |
| PDF-NFR-04 | PARTIAL / FAIL limit | Backend и frontend допускают пять именованных UUID ЭР; direct legacy calculation graph всё ещё ограничен slots `1…4`, а лимит объектов остаётся 50. | Desktop/mobile proof показывает пять отдельных tabs и fail-closed пятый ЭР без подстановки данных. PDF всё ещё требует полный расчётный граф пятого ЭР и ≥500 объектов. |
| PDF-NFR-05 | PARTIAL | Explicit task key namespaced по principal/type/project и binding-ит full payload/ER; exact active/terminal retry возвращает исходную задачу, changed payload/ER даёт `409 TASK_IDEMPOTENCY_KEY_REUSED`. Heat path сериализован через terminal transition; replay audit показывает actual result. | Focused task matrix: 56 unit + 25 integration (`14` calc jobs + `11` reports). Остаются без полного oracle новый BOM и весь import/reorder partial-success flow. |
| PDF-NFR-06 | PARTIAL | Assignment/calculation/candidate apply-unapply Phase 3 помечают stale только specification exact UUID ЭР; object/heat change остаётся project-wide по производной природе. | Focused assignment/calculation tests покрывают exact-ER stale; full sections/settings propagation относится к Phase 4/5. |
| PDF-NFR-07 | PARTIAL | Audit model хранит actor/session/project/object/request/error, но events не содержат полного formula/catalog/version trace. | Browser показал loading/empty/success, однако Heat/Elec initial query errors маскируются под empty; structured log completeness не доказана. |

## Исходные данные и теплопотери

| PDF ID | Статус | Backend/frontend trace | Tests / live result |
|---|---|---|---|
| PDF-HEAT-01 | FAIL | Текущий heat screen содержит один heat form, а electrical/spec вынесены на свободные маршруты; `frontend/src/routes/index.tsx:48-60`. | Desktop screenshot: `assets/ui/guest-audit-heat-populated-desktop.png`; трёх PDF-групп нет. |
| PDF-HEAT-02 | FAIL | Текущие типы UI: `Трубопровод / Резервуар / Все`. | PDF требует `Трубопровод / Бочка / Пол`, где Пол disabled. |
| PDF-HEAT-03 | PARTIAL | Geometry, climate, insulation и units реализованы в `frontend/src/utils/objectWizardUtils.ts:348-415,509-705`; PDF cable/spec fields в object form отсутствуют. | Live request доказал `108 мм→0.108 м`, `50 мм→0.05 м`: `evidence/api/guest-audit-object-create-request-body.json`. |
| PDF-HEAT-04 | PARTIAL | POST object сохраняет данные и запускает heat calculation. | Live POST →201, refetch/reload вернули объект; report показывает 3.94 кВт. Edit/recalculation и atomic invalid-input сценарий не проверены. |
| PDF-HEAT-05 | PARTIAL | Import XLSX/CSV и copy actions есть; exact PDF stable-key/partial-success semantics не доказаны. | Existing e2e проходит upload напрямую, но полного retry/idempotency scenario нет. |
| PDF-HEAT-06 | FAIL | API batch/edit механики не образуют PDF atomic «один общий параметр для выбранных». | UI-механика групповой корректировки отсутствует; существующий gap подтверждён `docs/analysis/tnp-1-case-gap-vs-implementation.md`. |
| PDF-HEAT-07 | PARTIAL | Column settings представлены в UI и local state. | Финальный frontend gate не green: `HeatCalcPage.settings.test.tsx:321` воспроизводимо не находит accessible separator. Это pre-existing дефект вне backend/DB Phase 1, но blocker общего release. |
| PDF-HEAT-08 | PARTIAL | Backend reorder endpoint/sort order есть, UI DnD строк отсутствует. | Нет UI/e2e round trip reorder→reload→export/import. |
| PDF-HEAT-09 | FAIL | `Sidebar` всегда навигирует по ключу: `frontend/src/components/layout/Sidebar.tsx:53-98`. | Live: electrical/spec/report открылись без electrical readiness; блокирующей кнопки «Далее» нет. |
| PDF-HEAT-10 | PARTIAL | 0027 добавляет матрицу, 0029 делает assignment authoritative. Readiness initialization создаёт `ЭР1` и `unassigned`; frontend показывает assignment panel выбранного UUID. | Focused UI покрывает `Нераспределённые/Самрег/Резистив`, optimistic mutations и ER5; live desktop/mobile/reload Phase 3 proof и post-UI DB invariants прошли. PARTIAL остаётся из-за отсутствия полного PDF section workflow. |

## Электротехнические расчёты и секции

| PDF ID | Статус | Backend/frontend trace | Evidence |
|---|---|---|---|
| PDF-ER-01 | PARTIAL | UUID entity, readiness/list/create/copy/rename/activate/delete и лимит 5 реализованы. Frontend tabs, URL и query/cache identity UUID-first; direct numeric consumers требуют точную пару `UUID ↔ slot`. Legacy calculation graph остаётся `1…4`. | Focused frontend 77/77, stale-slot backend oracle и live desktop/mobile proof проходят. Пятый ЭР доступен как самостоятельная lifecycle entity, но его расчётный data plane намеренно fail-closed до Phase 5. |
| PDF-ER-02 | PARTIAL | 0029 + assignment service делают `system_type`/`assignment_state` authoritative отдельно, добавляют optimistic `version` и exact UUID API. Assign поддерживает self-reg/resistive, а runtime calculation не auto-assign. | Expanded backend 249/249, root relevant backend 167/167, migration 2/2; focused frontend 6 files / 95 tests. Live exact-UUID assign/unassign/reload и DB invariants 28/28 прошли. PARTIAL — PDF требует дальнейший section/data plane. |
| PDF-ER-03 | PARTIAL | UUID lifecycle copy создаёт новый ЭР и идемпотентно копирует assignments/calculations/candidates/folders. Legacy calc-copy явно staging target assignment intent; project duplicate создаёт unassigned `ЭР1`, не guessed batch. По PDL-ER-13 specification не копируется/не регенерируется, target `not_generated`; explicit regeneration fail-closed до mutation. | Heating sections ещё отсутствуют, а расчётный graph пятого ЭР fail-closed до UUID-only cutover. |
| PDF-ER-04 | PARTIAL | DB/API хранят имя и обеспечивают уникальность после `trim + casefold`; UI поддерживает inline rename, Enter/Esc, invalid/empty state и persistence. Имя используется в electrical/spec/report selectors. | Unit tests и live long-name proof проходят; full Phase 5 multi-ЭР specification wizard и end-to-end reload всех downstream artifacts ещё отсутствуют. |
| PDF-ER-05 | FAIL | Текущий screen имеет одну строку summary. | Нет четырёх independent summaries и секционного количества; screenshot `assets/ui/guest-audit-electrical-empty-desktop.png`. |
| PDF-ER-06 | PARTIAL | Assignment model/API/UI различает `unassigned`, `ready`, `unsupported`, `stale`, `error`; assign → stale/calculation-required, same-system no-op, reassign требует confirmed unassign, calculation sync exact UUID. Dirty unassigned legacy graph требует `CLEANUP_REQUIRED` и отдельный confirmed cleanup с сохранением heat. Row/batch/inline compatibility остаётся strict, но supported assignment открывает manual/candidate modal с system-safe type (`resistive → single_core`) даже без compatible saved calculation. | Tabs/mutations/atomic sync/cleanup handshake покрыты focused tests. Live UI доказал `resistive → single_core + Линия`, confirm-unassign, persisted reload и 0 console errors/warnings. DnD и section hierarchy не входят Phase 3. |
| PDF-ER-07 | PARTIAL / CONFLICT | 0029 нормализует self-reg/resistive, сохраняет `skin/mineral` unsupported и исходный requested type. Candidate create для этих requested types отклоняется до dedupe/upsert и не создаёт diagnostic row. | UI разрешает назначать `Самрег/Резистив`; `Скин/Минеральный` нельзя выбрать как target, но tabs browsable для migrated rows и confirmed unassign. Direct candidate API даёт `409 ELECTRICAL_SYSTEM_UNSUPPORTED`. Это следует PDL-ER-10/11 и не оставляет stranded data. |
| PDF-ER-08 | PARTIAL | Самрег auto/manual selection существует: `backend/app/formulas/electrical/self_regulating.py`; геометрия/нить/навив считаются. | PDF equal-section algorithm и hierarchical sections не реализованы. |
| PDF-ER-09 | FAIL / CONFLICT | Basic builder использует `required_order_length`, full — агрегированный installed length×R: `backend/app/formulas/specification/builder.py:57-68`, `full_builder.py:134-147`. | PDF сам конфликтует actual vs order length (`PDF-CONFLICT-02`); trace двух длин в item отсутствует. |
| PDF-ER-10 | PARTIAL | Structured results/errors сохранены; 0029 проецирует exact UUID legacy success/error/stale/unsupported, runtime upsert атомарно обновляет только target assignment. Section errors отсутствуют. | Migration и calculation-sync focused tests покрывают ready/error/stale; live reload assignment state прошёл. PARTIAL остаётся: Phase 4 section errors отсутствуют. |
| PDF-ER-11 | FAIL | Full builder получает `num_circuits`, но отдельного `Lток/Lогр` и section records нет. | Golden `Iдоп/Iст.уд` отсутствует. |
| PDF-ER-12 | FAIL | `Nсек` ошибочно алиасится к `num_circuits`: `backend/app/formulas/specification/full_builder.py:19-21,134`. | Oracle `200/67 → 3×67=201` не зарегистрирован и не тестируется. |
| PDF-ER-13 | PARTIAL | Voltage/power/current считаются по объекту/cable result. | Нет per-section currents, equal-section invariant и hierarchy. |
| PDF-ER-14 | PARTIAL | Manual cable/pitch UI существует. | Прямой lifecycle секций отсутствует, поэтому запрет/пересчёт section composition не доказан. |
| PDF-ER-15 | PARTIAL | Confirmed unassign API удаляет exact P+ER+object calculations/candidates/folders/items, сохраняет heat/other ER и оставляет assignment `unassigned`. Exact dirty-unassigned graph сначала даёт `CLEANUP_REQUIRED`/UI handshake; corrupt NULL/mismatch graph fail-closed без cleanup. | Backend isolation/RBAC/race tests, live confirmation/network/reload и post-UI DB invariants 28/28 прошли. PARTIAL — section lifecycle относится к Phase 4. |
| PDF-ER-16 | PARTIAL | Object/heat change stale-ит затронутые assignments; electrical/assignment/candidate apply-unapply stale-ит только specification точного UUID ЭР. | Focused sync/isolation tests есть; sections/settings propagation остаётся Phase 4/5. |

## Спецификация и отчёт

| PDF ID | Статус | Backend/frontend trace | Tests / live result |
|---|---|---|---|
| PDF-SPEC-01 | PARTIAL | `specifications.electrical_variant_id`, same-project/slot FK и unique `(project_id, electrical_variant_id)` отделяют спецификации. UI показывает именованный UUID selector; переходные generate/read/save запросы передают UUID+slot и backend отклоняет mismatch. | Fresh seed и focused spec tests не находят nullable/scope mismatch; live network показывает точный UUID. Пятый ЭР и multi-ЭР wizard остаются fail-closed/pending до Phase 5. |
| PDF-SPEC-02 | FAIL | Endpoint принимает один `variant`; UI selector фиксирован `[1,2,3,4]`: `SpecificationPage.tsx:515-536`. | Multi-ЭР wizard отсутствует. |
| PDF-SPEC-03 | **FAIL** | Objectless generation теперь readiness-blocked: 409 и 0 variant/spec rows. Но при существующем объекте builder всё ещё использует `object_count=len(all project objects)` и может добавить аксессуары без successful electrical. | Новая objectless atomic проверка проходит; исторический live flow с одним объектом и zero electrical вернул 201, 6 items, `skipped_objects=0`. Partial sections-aware guard/confirm flow не реализован. |
| PDF-SPEC-04 | FAIL | Full options schema существует, guest `mode=full` получает 403: `schemas/specification.py:22-81`, `api/v1/specifications.py:70-77`. | Guest UI принудительно basic; PDF settings недоступны. |
| PDF-SPEC-05 | FAIL | `SpecTable` имеет только category/name/article/unit/quantity: `frontend/src/components/specification/SpecTable.tsx:24-61`. | Нет `Трубы/Бочки/Общие`, supplier, supply unit, nomenclature code. |
| PDF-SPEC-06 | PARTIAL | Phase 3 stale-ит exact-ER specification при assignment, calculation и candidate apply/unapply; unassign не затрагивает spec другого ЭР. | Focused tests покрывают UUID scope; full multi-ЭР generation/settings snapshot остаётся Phase 5. |
| PDF-SPEC-07 | CONFLICT / PARTIAL | Guest report HTML preview доступен, file export скрыт. | Live report содержит spec при `Электротехнический расчёт (0)`; browser print отсутствует. PDF сам неоднозначен по guest report. |

## BOM PDF §7.9–7.15

Действующий старый BOM-контракт находится в
`docs/business-logic-contract.md:84-94` и основан на XLSX от 29.05.2026.
Новый PDF от 07.07.2026 задаёт несовместимые правила. Guest full mode запрещён,
поэтому PDF-BOM-01…07 недостижимы в проверяемом guest flow.

| PDF ID | Статус | Code comparison | Oracle / boundary evidence |
|---|---|---|---|
| PDF-BOM-01 | FAIL / CONFLICT | Full cable = aggregated installed length×`Rгр` (`full_builder.py:134-147`); basic = commercial order length. Отдельных section records нет. | PDF конфликтует actual vs order length; trace formula/source отсутствует. |
| PDF-BOM-02 | FAIL | Код одновременно добавляет КСН/КСВ-1=`N×R` и КСН/КСВ-2=`N×R×2`: `full_builder.py:156-161,198-208`. PDF требует выбрать один kit и `ceil(N/sections_per_kit)`. | PDF oracle 9/2=5 не тестируется; current tests намеренно ожидают старую формулу. |
| PDF-BOM-03 | PARTIAL / CONFLICT | `_ceil(group_length/150)`: `full_builder.py:209-210`. | Focused pure-builder probe 729→5 совпал; нет boundary 150/151 и data-driven row. |
| PDF-BOM-04 | FAIL | Glue использует только connector counts и approximate `×0.14`, repair kits исключены: `full_builder.py:233`, `spec_accessories.json:30`. | PDF `(9+5)/7→2`; current PDF-like probe дал 4. |
| PDF-BOM-05 | PARTIAL / FAIL boundary | Алгебра длины совпадает: `full_builder.py:162,168,230`; package factor `0.0333334` не равен exact `/30`. | Probe exact 30 м tape → 2 рулона вместо 1; PDF 8939/30→298 не имеет golden. |
| PDF-BOM-06 | PARTIAL | Code `(length_low+length_high)×0.02`: `full_builder.py:232,264-269`. | Probe 729→15 совпал только при текущих fixed параметрах и `Rгр=1`. |
| PDF-BOM-07 | FAIL | Одна hardcoded `_box_bucket`, universal `ceil(N/3)`, `d>57`: `full_builder.py:82-94,170-181`; PDF требует evaluate all rows, `d≥57`, per-row up/down/divider/min. | Probes d60/N5 и d=57 расходятся; Ex/Rгр не участвуют; PDF table сама не задаёт исполнимые Ex/Rгр row values. |

## Пробелы machine-readable contracts

- `codex-docs/business-formula-contracts.json:156-179` содержит только общий
  `specification_from_electrical_variant`, ссылающийся на basic builder.
- PDF-BOM-01…07 не представлены отдельными `formula_id`, requirement refs,
  source/version и diagnostic codes.
- `qa-agent/examples/tlt-formulas.registry.yaml:1004-1017` требует внешний
  oracle для basic grouping и не содержит независимой fixture аксессуаров.
- Green `scripts/codex-functional-audit.sh contracts` проверяет пять старых
  контрактов, но не обнаруживает этот drift.

## Итог матрицы

Phase 1 добавила backend/DB foundation, Phase 2 перевела пользовательский
lifecycle, URL/cache identity и direct consumer bridge на именованные UUID ЭР,
а Phase 3 реализовала authoritative assignment API/UI, exact calculation scope
и confirmed cleanup. Однако equal-section hierarchy, полный UUID-only data
plane, multi-ЭР wizard, CSV v3 и новый data-driven BOM не реализованы. Действующий
basic builder по-прежнему нарушает
текущий guest SRS, потому что создаёт закупочные позиции без успешного
electrical result. Поэтому общий PDF/DoD не закрыт.

Phase 1/2/3 checkpoints завершены, Phase 5 pending, Phase 4 blocked
PDL-ER-15/18/28, а общий product release дополнительно блокирует не-green
frontend gate (`1052 passed, 1 failed`), dependency security gate и
общий Alembic metadata drift вне dynamic-ER diff.
