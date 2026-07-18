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

Phase 1 backend/DB имеет статус
**PASS — backend/DB Phase 1 checkpoint complete**; его evidence и переходные
ограничения вынесены в
[phase-1-checkpoint.md](phase-1-checkpoint.md). `PARTIAL` ниже не означает
готовность PDF-flow: frontend, sections, specification/report UUID cutover и
CSV v3 ещё отсутствуют.

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
| PDF-NFR-04 | PARTIAL / FAIL limit | Backend lifecycle допускает пять UUID ЭР, но direct legacy graph и frontend ограничены slots/`СО1…СО4`; лимит объектов остаётся 50. | Пятый ЭР доказан только как lifecycle/empty-assignment entity. PDF требует также полный расчётный граф и ≥500 объектов. |
| PDF-NFR-05 | PARTIAL | Explicit task key namespaced по principal/type/project и binding-ит full payload/ER; exact active/terminal retry возвращает исходную задачу, changed payload/ER даёт `409 TASK_IDEMPOTENCY_KEY_REUSED`. Heat path сериализован через terminal transition; replay audit показывает actual result. | Focused task matrix: 56 unit + 25 integration (`14` calc jobs + `11` reports). Остаются без полного oracle новый BOM и весь import/reorder partial-success flow. |
| PDF-NFR-06 | FAIL | Heat/object mutations могут stale spec, но обычные electrical calculate/select/batch не вызывают `mark_project_specifications_stale`; `backend/app/services/calculation_service.py:1260-1293,3502-3537,3720-3958`. | Нет теста `electrical change → stale spec`; существующие stale tests покрывают object/heat/delete. |
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
| PDF-HEAT-10 | PARTIAL | 0027 добавляет project-scoped `electrical_variants` и `electrical_variant_objects.assignment_state`; readiness initialization создаёт `ЭР1` и полную матрицу `unassigned`. | Frontend не подключён к lifecycle/assignments: live screen всё ещё показывает плоский `СО1` и фиксированные `СО1…СО4`. |

## Электротехнические расчёты и секции

| PDF ID | Статус | Backend/frontend trace | Evidence |
|---|---|---|---|
| PDF-ER-01 | PARTIAL | Phase 1 реализует UUID entity, readiness/list/create/copy/rename/activate/delete и лимит 5. Все normal numeric writes readiness-gated через UUID adapter; fresh slot `4` создаёт только `ЭР1 + ЭР4`. Legacy calculation graph остаётся `1…4`. | Adapter/spec 15, calculations 73 и report/task matrix проходят; frontend store/tabs остаются numeric `СО1…СО4`, пользовательский lifecycle и пятый расчётный ЭР недоступны. |
| PDF-ER-02 | PARTIAL | `electrical_variant_objects` хранит отдельные `system_type`, `assignment_state`, lossless `requested_cable_type`; initialization и import создают полную матрицу. Normal legacy calculation уже получает UUID, но assignment пока может остаться `unassigned/system_type=null`. | MEDIUM intentional Phase 3 boundary: consumers не считают assignment state authoritative до атомарной синхронизации; assignment service/UI и действие распределения относятся к Phase 3. |
| PDF-ER-03 | PARTIAL | UUID lifecycle copy создаёт новый ЭР и идемпотентно копирует assignments/calculations/candidates/folders без specification. Legacy fixed-slot copy также временно сохранён. | UI всё ещё вызывает numeric «Создать на основании»; copy непустого графа в пятый ЭР блокируется до UUID-only cutover. |
| PDF-ER-04 | PARTIAL | DB/API хранят имя и обеспечивают уникальность после `trim + casefold`; PATCH переименовывает ЭР. | Inline rename/Enter/Esc и синхронное отображение имени в spec/report UI отсутствуют. |
| PDF-ER-05 | FAIL | Текущий screen имеет одну строку summary. | Нет четырёх independent summaries и секционного количества; screenshot `assets/ui/guest-audit-electrical-empty-desktop.png`. |
| PDF-ER-06 | PARTIAL | Assignment model различает `unassigned`, `ready`, `unsupported`, `stale`, `error` и system type, но legacy write adapter пока гарантирует UUID mapping, а не authoritative state transition. | Tabs, assignment mutations, DnD и atomic calculation→assignment sync отсутствуют до Phase 3. |
| PDF-ER-07 | PARTIAL / CONFLICT | Backfill/import нормализуют self-reg/resistive, сохраняют `skin/mineral` как unsupported и исходный requested type. | UI остаётся на legacy cable-type flow; PDF disabled future tabs и текущая full-version policy всё ещё расходятся. |
| PDF-ER-08 | PARTIAL | Самрег auto/manual selection существует: `backend/app/formulas/electrical/self_regulating.py`; геометрия/нить/навив считаются. | PDF equal-section algorithm и hierarchical sections не реализованы. |
| PDF-ER-09 | FAIL / CONFLICT | Basic builder использует `required_order_length`, full — агрегированный installed length×R: `backend/app/formulas/specification/builder.py:57-68`, `full_builder.py:134-147`. | PDF сам конфликтует actual vs order length (`PDF-CONFLICT-02`); trace двух длин в item отсутствует. |
| PDF-ER-10 | PARTIAL | Structured results/errors сохранены; migration/import проецируют legacy success/error/stale/unsupported в assignment state без превращения ошибок в success. Section errors отсутствуют. | Migration projection и CSV round-trip покрыты; UUID UI reload и Phase 3/4 end-to-end ещё нет. |
| PDF-ER-11 | FAIL | Full builder получает `num_circuits`, но отдельного `Lток/Lогр` и section records нет. | Golden `Iдоп/Iст.уд` отсутствует. |
| PDF-ER-12 | FAIL | `Nсек` ошибочно алиасится к `num_circuits`: `backend/app/formulas/specification/full_builder.py:19-21,134`. | Oracle `200/67 → 3×67=201` не зарегистрирован и не тестируется. |
| PDF-ER-13 | PARTIAL | Voltage/power/current считаются по объекту/cable result. | Нет per-section currents, equal-section invariant и hierarchy. |
| PDF-ER-14 | PARTIAL | Manual cable/pitch UI существует. | Прямой lifecycle секций отсутствует, поэтому запрет/пересчёт section composition не доказан. |
| PDF-ER-15 | FAIL | `unassigned` state теперь существует, но публичные assignment/unassign API и scoped cleanup ещё не реализованы. | Сохранение heat inputs при полном возврате из ЭР должно быть доказано в Phase 3. |
| PDF-ER-16 | PARTIAL | Object/heat change помечает результаты stale по fixed variants. | Per-ER UI отличается; electrical mutation → spec stale не работает (PDF-NFR-06). |

## Спецификация и отчёт

| PDF ID | Статус | Backend/frontend trace | Tests / live result |
|---|---|---|---|
| PDF-SPEC-01 | PARTIAL | 0027 добавляет `specifications.electrical_variant_id`, same-project/slot FK и unique `(project_id, electrical_variant_id)`; numeric generate/save теперь readiness-gated и записывают UUID. | Fresh `0001→0028` seed: 10 specs, 0 nullable UUID, 0 scope mismatch. Generation/read UI и service всё ещё выбирают numeric `variant_number`; именованных UUID tabs нет до Phase 5. |
| PDF-SPEC-02 | FAIL | Endpoint принимает один `variant`; UI selector фиксирован `[1,2,3,4]`: `SpecificationPage.tsx:515-536`. | Multi-ЭР wizard отсутствует. |
| PDF-SPEC-03 | **FAIL** | Objectless generation теперь readiness-blocked: 409 и 0 variant/spec rows. Но при существующем объекте builder всё ещё использует `object_count=len(all project objects)` и может добавить аксессуары без successful electrical. | Новая objectless atomic проверка проходит; исторический live flow с одним объектом и zero electrical вернул 201, 6 items, `skipped_objects=0`. Partial sections-aware guard/confirm flow не реализован. |
| PDF-SPEC-04 | FAIL | Full options schema существует, guest `mode=full` получает 403: `schemas/specification.py:22-81`, `api/v1/specifications.py:70-77`. | Guest UI принудительно basic; PDF settings недоступны. |
| PDF-SPEC-05 | FAIL | `SpecTable` имеет только category/name/article/unit/quantity: `frontend/src/components/specification/SpecTable.tsx:24-61`. | Нет `Трубы/Бочки/Общие`, supplier, supply unit, nomenclature code. |
| PDF-SPEC-06 | FAIL | Spec stale вызывается не из обычных electrical mutations. | Сохранённая spec может остаться актуальной после смены кабеля; focused test отсутствует. |
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

Phase 1 добавляет backend/DB foundation: именованные UUID ЭР, readiness,
lifecycle, persisted assignments, UUID task trace и sparse v2 import. Однако
пользовательский поток остаётся `СО1…СО4`, а equal-section hierarchy,
assignment UI, UUID specification/report flow, multi-ЭР wizard, CSV v3 и новый
data-driven BOM не реализованы. Действующий basic builder по-прежнему нарушает
текущий guest SRS, потому что создаёт закупочные позиции без успешного
electrical result. Поэтому общий PDF/DoD не закрыт.

Backend/DB Phase 1 checkpoint завершён, но Phase 2/3/5 pending, Phase 4
blocked PDL-ER-15, а общий product release дополнительно блокирует не-green
frontend gate (`925 passed, 1 failed, 1 skipped`), dependency security gate и
общий Alembic metadata drift вне dynamic-ER diff.
