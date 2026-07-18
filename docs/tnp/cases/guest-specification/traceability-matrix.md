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

## Гость, сессия и проект

| PDF ID | Статус | Документация и backend | Frontend, tests и фактическое evidence |
|---|---|---|---|
| PDF-GUEST-01 | PARTIAL | Guest session/project реализованы: `backend/app/api/v1/auth.py:67-108`, `backend/app/core/dependencies.py:79-121`. Гостю доступен только basic BOM: `backend/app/api/v1/specifications.py:70-77`. | Реальный guest entry и объект прошли; целевая модель ЭР/секций/full PDF BOM недоступна. |
| PDF-GUEST-02 | FAIL | Текущий SRS различает guest/employee/admin. | `frontend/src/pages/HomePage.tsx:64-139` выводит три role-card, PDF требует два стартовых действия. См. `assets/ui/guest-audit-home-desktop.png`. |
| PDF-GUEST-03 | PASS | Лимит один проект: `backend/app/core/config.py:71-80`; auto-project создаётся после guest session: `backend/app/api/v1/auth.py:88-98`. | После `POST /auth/guest` открыт `/workspace/heat-calc`, проект «Мой проект»; отдельного guest project list нет. |
| PDF-GUEST-04 | CONFLICT | PDF говорит «не в БД», но текущий SRS и код используют PostgreSQL session/project; FK isolation — `backend/app/services/project_service.py:94-130`. | Network и DB invariants подтверждают server-side persistence. Нужно определить, запрещено ли только долговременное хранение. |
| PDF-GUEST-05 | FAIL / CONFLICT | `GUEST_SESSION_TTL_MINUTES=20`, cleanup 10 минут: `backend/app/core/config.py:76-80`; PDF требует 3 дня. | Home сообщает 20 минут; TTL indicator/modal в `MainLayout` отсутствуют (`frontend/src/components/layout/MainLayout.tsx:18-39,62-86`). |
| PDF-GUEST-06 | PARTIAL | Project CSV import/export есть в API/service, но round trip всех PDF-сущностей невозможен: ЭР и секций в модели нет. | `frontend/src/components/layout/ProjectMenu.tsx:60-76,100-134` даёт «Скачать/Загрузить»; full-state local-file oracle отсутствует. |
| PDF-GUEST-07 | PARTIAL | Backend import выполняет parsing/замену, но целевой полный формат PDF не определён. | UI запускает import сразу после выбора файла, без filename/предупреждения/confirm; это расходится с `docs/srs/ui/guest/06-csv-flows.md:94-171`. |

## NFR и защитные свойства

| PDF ID | Статус | Документация и реализация | Verification |
|---|---|---|---|
| PDF-NFR-01 | PARTIAL | Docker stack присутствует. | `make dev-d`, `make ps`: frontend/backend/DB/Redis healthy; core flow работал локально. Полный offline cold-start не проверялся. |
| PDF-NFR-02 | NOT VERIFIED | В репозитории нет полного обязательного browser gate Chrome/Firefox/Opera/Яндекс. | Проверен Chromium только. |
| PDF-NFR-03 | NOT VERIFIED | Perf helpers есть, но PDF thresholds не входят в выполненный gate. | 500 объектов ≤30 секунд и specification ≤30 секунд не измерялись. |
| PDF-NFR-04 | FAIL | Guest limit 50 объектов и варианты DB `1..4`: `backend/app/core/config.py:71-80`, `backend/app/models/electrical_calculation.py:13-55`. | PDF требует ≥500 объектов и 5 динамических ЭР. |
| PDF-NFR-05 | PARTIAL | Есть unit/integration tests и idempotent regeneration, но нет PDF boundary 500 и полного partial-success oracle. | `formula-qa quick` pass; coverage не распространяется на новый BOM и весь import/reorder flow. |
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
| PDF-HEAT-07 | PARTIAL | Column settings представлены в UI и local state. | В full frontend suite соответствующий drag-width test и focused rerun упали; восстановление в согласованном scope не доказано. |
| PDF-HEAT-08 | PARTIAL | Backend reorder endpoint/sort order есть, UI DnD строк отсутствует. | Нет UI/e2e round trip reorder→reload→export/import. |
| PDF-HEAT-09 | FAIL | `Sidebar` всегда навигирует по ключу: `frontend/src/components/layout/Sidebar.tsx:53-98`. | Live: electrical/spec/report открылись без electrical readiness; блокирующей кнопки «Далее» нет. |
| PDF-HEAT-10 | FAIL | Backend имеет fixed variant, но не assignment state. | Live electrical screen показывает плоский `СО1` и фиксированные СО1…СО4; `Нераспределённые` и auto-created ЭР отсутствуют. |

## Электротехнические расчёты и секции

| PDF ID | Статус | Backend/frontend trace | Evidence |
|---|---|---|---|
| PDF-ER-01 | FAIL | Вариант — integer `1..4`, не entity с id/name; `frontend/src/store/calculationVariantStore.ts:4-35`. | Нет create/rename/delete и пятого ЭР. |
| PDF-ER-02 | FAIL | Нет persistence assignment `object → unassigned/system` per ER. | Live screen сразу предлагает расчёт всех объектов. |
| PDF-ER-03 | PARTIAL | Copy fixed variant реализован, но не создаёт новый dynamic ER. | `Создать на основании` копирует в один из существующих slots. |
| PDF-ER-04 | FAIL | Поля имени ЭР нет в DB/schema/store. | Inline rename/Enter/Esc и sync имени spec отсутствуют. |
| PDF-ER-05 | FAIL | Текущий screen имеет одну строку summary. | Нет четырёх independent summaries и секционного количества; screenshot `assets/ui/guest-audit-electrical-empty-desktop.png`. |
| PDF-ER-06 | FAIL | Нет system assignment модели. | Tabs `Нераспределённые / Самрег / Резистив / Скин`, button/DnD отсутствуют. |
| PDF-ER-07 | FAIL | UI предлагает действующие cable types, а не PDF disabled future tabs. | Текущая full-version policy также расходится с PDF MVP scope. |
| PDF-ER-08 | PARTIAL | Самрег auto/manual selection существует: `backend/app/formulas/electrical/self_regulating.py`; геометрия/нить/навив считаются. | PDF equal-section algorithm и hierarchical sections не реализованы. |
| PDF-ER-09 | FAIL / CONFLICT | Basic builder использует `required_order_length`, full — агрегированный installed length×R: `backend/app/formulas/specification/builder.py:57-68`, `full_builder.py:134-147`. | PDF сам конфликтует actual vs order length (`PDF-CONFLICT-02`); trace двух длин в item отсутствует. |
| PDF-ER-10 | PARTIAL | Structured electrical results/errors и manual selection существуют, но assignment/section errors PDF отсутствуют. | Нет end-to-end test «error after reload + batch does not overwrite manual mark» для новой модели. |
| PDF-ER-11 | FAIL | Full builder получает `num_circuits`, но отдельного `Lток/Lогр` и section records нет. | Golden `Iдоп/Iст.уд` отсутствует. |
| PDF-ER-12 | FAIL | `Nсек` ошибочно алиасится к `num_circuits`: `backend/app/formulas/specification/full_builder.py:19-21,134`. | Oracle `200/67 → 3×67=201` не зарегистрирован и не тестируется. |
| PDF-ER-13 | PARTIAL | Voltage/power/current считаются по объекту/cable result. | Нет per-section currents, equal-section invariant и hierarchy. |
| PDF-ER-14 | PARTIAL | Manual cable/pitch UI существует. | Прямой lifecycle секций отсутствует, поэтому запрет/пересчёт section composition не доказан. |
| PDF-ER-15 | FAIL | Нет unassigned state, следовательно нет подтверждаемого возврата со scoped cleanup. | Нельзя доказать сохранение heat inputs при удалении assignment/cable/sections. |
| PDF-ER-16 | PARTIAL | Object/heat change помечает результаты stale по fixed variants. | Per-ER UI отличается; electrical mutation → spec stale не работает (PDF-NFR-06). |

## Спецификация и отчёт

| PDF ID | Статус | Backend/frontend trace | Tests / live result |
|---|---|---|---|
| PDF-SPEC-01 | PARTIAL | DB unique `(project_id, variant_number)`; `backend/app/models/specification.py:14-45`. | Separate fixed СО1…СО4 существуют, именованных ЭР/tabs нет. |
| PDF-SPEC-02 | FAIL | Endpoint принимает один `variant`; UI selector фиксирован `[1,2,3,4]`: `SpecificationPage.tsx:515-536`. | Multi-ЭР wizard отсутствует. |
| PDF-SPEC-03 | **FAIL** | Service передаёт `object_count=len(all project objects)`, builder добавляет аксессуары независимо от successful electrical: `specification_service.py:139-149`, `builder.py:89-104`. | Live: zero electrical → POST 201, 6 items, `skipped_objects=0`; `evidence/api/guest-audit-spec-generate-response-body.json`. Unit tests закрепляют это поведение (`test_spec_builder.py:82-102`, `test_specification_service_unit.py:121-155`). |
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

Текущая система реализует базовый контур guest session → project → object →
heat → fixed electrical variant → basic specification → report preview. Она не
реализует основную новую доменную модель PDF: dynamic ЭР, assignment,
equal-section hierarchy, multi-ЭР wizard и новый data-driven BOM. Более того,
действующий basic builder нарушает и текущий guest SRS, потому что создаёт
закупочные позиции без успешного electrical result.
