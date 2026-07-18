# Журнал проверки

Дата проверки: 18.07.2026. Режим: `/audit-only`; исходный код, тесты,
конфигурация и схема БД не изменялись.

## PDF

| Проверка | Результат |
|---|---|
| `pdfinfo` | PASS: 81 страница A4, PDF 1.7, без шифрования, форм и JavaScript. |
| `shasum -a 256` | PASS: `5bf9a5f12f1ea609e7889f12dbbf4dbc24be8653258ea0e65f3d691d19fc978d`. |
| `pdftotext -layout` | PASS: извлечено 4098 строк с сохранением постраничных разрывов. |
| `pdftoppm -png -r 110` | PASS: получено 81 изображение. |
| Визуальная проверка | PASS: просмотрены страницы 1–81; отдельно сохранены макеты страниц 21, 35, 49 и 56. |

## Живой стек и пользовательский сценарий

| Проверка | Результат |
|---|---|
| `make dev-d` / `make ps` | PASS: frontend, backend, PostgreSQL и Redis healthy; worker запущен. |
| Guest entry, `1440x1000` | PASS: `POST /api/v1/auth/guest` → 201; автоматически открыт проект «Мой проект». |
| Создание трубы видимыми действиями | PASS: `POST /objects` → 201; после refetch/reload объект и теплопотери видны. UI-поля `108 мм` и `50 мм` переданы как `0.108 м` и `0.05 м`. Evidence: [request](evidence/api/guest-audit-object-create-request-body.json), [response](evidence/api/guest-audit-object-create-response-body.json). |
| Gate перехода | FAIL: electrical/specification/report доступны из header до успешного electrical calculation. |
| Генерация spec без electrical | **FAIL:** UI предупреждает о необходимости шага 2, но `POST /specifications/.../generate?variant=1` → 201 и возвращает 6 аксессуаров, `skipped_objects=0`. Evidence: [response](evidence/api/guest-audit-spec-generate-response-body.json). |
| Report propagation | FAIL: отчёт показывает 6 ложных позиций спецификации одновременно с `Электротехнический расчёт (0)`. |
| Console | PARTIAL: business-request failures не зафиксированы; есть `favicon.ico` 404 и Ant Design warning о static message без theme context. |

## UI geometry и screenshots

Проверены desktop `1440x1000` и mobile `390x844` на реальном приложении.

| Состояние | Результат / evidence |
|---|---|
| Home desktop/mobile | PASS по overflow; PDF mismatch: три role-card вместо двух стартовых действий. [desktop](assets/ui/guest-audit-home-desktop.png), [mobile](assets/ui/guest-audit-home-mobile.png). |
| Heat empty/populated desktop | PASS по page-level overflow; рабочая форма и таблица загружаются. [empty](assets/ui/guest-audit-heat-empty-desktop.png), [populated](assets/ui/guest-audit-heat-populated-desktop.png). |
| Electrical desktop | FAIL относительно PDF: фиксированные `СО1…СО4`, нет динамических именованных ЭР, распределения и секций. [screenshot](assets/ui/guest-audit-electrical-empty-desktop.png). |
| Specification empty desktop | PARTIAL: корректное пустое предупреждение, но кнопка не заблокирована. [screenshot](assets/ui/guest-audit-spec-empty-desktop.png). |
| Specification after invalid generation | FAIL: 6 позиций без electrical. [desktop](assets/ui/guest-audit-spec-without-electrical-desktop.png), [mobile](assets/ui/guest-audit-spec-without-electrical-mobile.png). |
| Report desktop/mobile | FAIL по business content; mobile использует внутренний горизонтальный scroll для широкой таблицы. [desktop](assets/ui/guest-audit-report-desktop.png), [mobile](assets/ui/guest-audit-report-mobile.png). |
| Heat populated mobile | **FAIL:** page-level horizontal scroll `393 > 390`, подписи `9px`, обрезаны единицы `мм/шт/°C/м/с/Вт/мК`, desktop-колонки сжаты до посимвольного переноса. [screenshot](assets/ui/guest-audit-heat-populated-mobile.png), [geometry](evidence/layout/guest-audit-heat-mobile-geometry.json). |
| Specification mobile geometry | PASS по clipping/overflow для достигнутого состояния; нижняя подпись варианта остаётся визуально чрезмерно узкой. [geometry](evidence/layout/guest-audit-spec-mobile-geometry.json). |

## Автоматические проверки

| Команда | Результат |
|---|---|
| `scripts/formula-qa.sh quick` | PASS. Важно: набор проверяет зарегистрированные старые формулы, но не PDF-BOM-01…07. |
| `scripts/codex-functional-audit.sh docs` | PASS: docs up to date, manifest facts OK. |
| `scripts/codex-functional-audit.sh contracts` | PASS: 5 контрактов. Новый PDF BOM не зарегистрирован, поэтому green не является proof его соответствия. |
| `scripts/codex-functional-audit.sh db-invariants` | PASS после ручного UI-сценария и повторно после e2e: 11 проверок, 0 нарушений. Инвариант не проверяет бизнес-условие «нет electrical → пустая spec». |
| Kontur `run-static-ui-checks.sh` | INFRA FAIL: скрипт ошибочно ищет `/Users/dmalafey/.codex/plugins/cache/personal/frontend/package.json`. Эквивалентные команды выполнены напрямую. |
| `npm --prefix frontend run lint` | FAIL: существующая `_omit` не используется в `projectStore.test.ts:49`. |
| `npm --prefix frontend run typecheck` | PASS. |
| `npm --prefix frontend run test -- --run` | FAIL: 925 passed, 1 failed, 1 skipped; не найден accessible separator в `HeatCalcPage.settings.test.tsx:321`. |
| Focused rerun упавшего HeatCalc settings test | FAIL воспроизводимо: 1 failed, 10 skipped; accessible separator отсутствует. |
| `npm --prefix frontend run build` | PASS. |
| Focused backend specification/auth/security, `--no-cov` | PASS: все выбранные assertions прошли; warnings о JWT HMAC key 23 bytes. |
| Тот же focused subset с repository coverage gate | FAIL только по global coverage: `44.23% < 85%`; test failures не было. |
| Relevant Playwright/e2e: specification, report, project CSV, layout | PASS вне sandbox: 18/18. Первая sandbox-попытка была infrastructure FAIL (`EPERM` localhost/Chrome) и не являлась product result. |
| `scripts/codex-functional-audit.sh accessibility` | PASS: 6/6 desktop/mobile. Gate guest workspace проверяет Heat/Elec, но не Specification/Report. |

Точные read-only проверки новых BOM oracles и наблюдаемые количества вынесены в
[formula-probes.md](formula-probes.md).

## Ограничения evidence

- Cross-browser Firefox/Opera/Яндекс и PDF NFR на 500 объектов не запускались.
- TTL три дня невозможно считать текущим контрактом без продуктового решения:
  действующая реализация и guest SRS используют 20 минут.
- Никакие expected/golden значения не менялись.

Существующий layout e2e green не опровергает mobile finding: он проверяет в
основном empty workspace и исключает элементы с `text-overflow: ellipsis`, тогда
как ручной verifier проверил populated form, clipped units и page scroll.

## Phase 0 запуска супер-промпта

Дата: 18.07.2026. Ветка:
`feature/tnp-dynamic-electrical-variants`. Production behavior не менялся.

| Проверка | Результат |
|---|---|
| `git log -1 --oneline --decorate` | PASS: `c4d9a2f`, main и feature branch указывают на подготовительный docs commit. |
| `docker exec heatcalc_backend alembic heads` | PASS: `0026 (head)`. |
| Focused backend: calculations, specifications, reports, project I/O, `--no-cov` | PASS. Warnings только о тестовом JWT HMAC key длиной 23 bytes. |
| Focused frontend: ElecCalcPage, SpecificationPage, ReportPage, variant model | PASS: 4 files, 65 tests. |
| `scripts/formula-qa.sh quick` | PASS. |
| `scripts/codex-functional-audit.sh contracts` | PASS: 5 legacy contracts; не является proof нового PDF BOM. |
| `scripts/codex-functional-audit.sh db-invariants` | PASS: 11 checks, 0 violations. |
| Kontur static wrapper | INFRA FAIL: ищет `package.json` в plugin cache, а не в TLT. |

### Electrical before evidence

- Desktop `1440x1000`: [screenshot](assets/ui/phase0-before-electrical-desktop.png),
  [snapshot](assets/ui/phase0-before-electrical-desktop.md),
  [geometry](evidence/layout/phase0-before-electrical-desktop-geometry.json).
- Mobile `390x844`: [screenshot](assets/ui/phase0-before-electrical-mobile.png),
  [snapshot](assets/ui/phase0-before-electrical-mobile.md),
  [geometry](evidence/layout/phase0-before-electrical-mobile-geometry.json),
  [action bar geometry](evidence/layout/phase0-before-electrical-mobile-toolbar-geometry.json).
- Runtime: [console](evidence/logs/phase0-before-electrical-console.log),
  [network](evidence/logs/phase0-before-electrical-network.md).

Оба viewport показывают ровно четыре fixed buttons `СО1…СО4`; overlap и
page-level horizontal overflow не обнаружены. На mobile правая часть action bar
находится вне viewport, но доступна через локальный container с
`overflow-x:auto` (`scrollWidth=1347`, `clientWidth=376`).

Runtime воспроизводит 401 к stale project id, затем `POST /auth/guest` 201 и
успешные запросы нового проекта; следом приходят 404 для уже невалидного старого
project id. Также остаются favicon 404 и Ant Design static-message warning.

## Phase 1 backend/DB final checkpoint

Дата: 18.07.2026. Ветка:
`feature/tnp-dynamic-electrical-variants`. Статус:
**PASS — backend/DB Phase 1 checkpoint complete**.

В отличие от исторического `/audit-only` и Phase 0, на этой итерации изменены
DB/backend и тесты. Полное описание границы находится в
[phase-1-checkpoint.md](phase-1-checkpoint.md).

| Проверка | Результат |
|---|---|
| Working DB Alembic current | **PASS: `0028`**. |
| Alembic 0027/0028 + metadata lifecycle | **PASS: 5 tests**. |
| Dynamic-ER integration full suite | **PASS: 21 collected**; оба candidate apply/delete race order — **2/2 PASS**, ordinary apply flows isolated PASS. |
| Project I/O + Excel import | **PASS: 46 tests**. Доказаны sparse `ЭР1 + ЭР4`, UUID FK, complete assignments, stale imported spec, zero-ЭР и atomic invalid slot. |
| Legacy adapter + specification | **PASS: 15 tests** (`3` new legacy write tests + `12` specification tests). Objectless generate возвращает 409 и не оставляет rows. |
| Project duplicate flow | **PASS: full `test_projects.py` 21 tests; focused duplicate class 4 tests**. Ready copy создаёт `ЭР1`/UUID до batch; not-ready copy возвращается heat-only без ER/electrical rows. |
| Calculation integration full suite | **PASS: 73 tests**. |
| Calculation/specification unit suites | **PASS: 114 tests**. |
| Task service unit suite | **PASS: 56 tests**. |
| Calculation jobs | **PASS: 14 tests**. |
| Reports | **PASS: 11 tests**. Numeric fresh slot 4 создаёт только `ЭР1 + ЭР4`. |
| Focused task matrix | **PASS: 56 unit + 25 integration** (`14` calc jobs + `11` reports). Проверены heat terminal-transition serialization, truthful replay audit, selector-null и changed payload/ER conflicts. |
| Full backend unit gate | **PASS: exit 0; exactly 1069 collected**. |
| Full backend integration gate | **PASS: clean single-process run, exit 0; exactly 421 collected**. Единственный expected skip — `test_performance_nfr.py:467`, `sample_import.csv` unavailable. Два overlapping backend-int run были infrastructure-invalid и superseded этим чистым результатом. |
| `scripts/formula-qa.sh quick` | **PASS** для legacy formula registry; не является доказательством heating sections/PDF-BOM Phase 4. |
| `scripts/codex-functional-audit.sh contracts` | **PASS: 5 legacy contracts / 5 commands**; новые sections/BOM contracts отсутствуют. |
| `scripts/codex-functional-audit.sh docs` | Проходил после generated-doc sync; root повторно запускает gate после этого финального docs-only diff. |
| `scripts/codex-functional-audit.sh db-invariants` | **PASS: 28 checks, 0 violations** на финальном head. |
| Smoke gate | **PASS: 18/18**. |
| Scale proof | **PASS:** `500 objects × 5 ER = 2500 assignments`; постоянные **69 SQL statements** ниже ceiling `80`. |
| Fresh `0001 → 0028` + seed | **PASS:** 19 calculations, 10 specifications, 10 variants, 28 assignments, 0 nullable UUID, 0 scope mismatch. |
| Static/model gates | **PASS:** Ruff, pre-commit, formatter (`40` changed Python files) и mapper checks. |
| Full frontend gate | **NOT GREEN: 925 passed, 1 failed, 1 skipped**. Неизменённый `HeatCalcPage.settings.test.tsx:321` не находит accessible separator. Isolated rerun: **1 failed, 10 skipped**. Дефект pre-existing и вне backend/DB Phase 1, поэтому не является regression Phase 1; он остаётся blocker общего product release. |
| `alembic check` | **NOT GREEN вне ER-среза:** только ранее существовавший metadata drift (`correction_coefficients`, `guest_sessions`, `insulation_materials`, trigram indexes `project_objects`, legacy `specifications` index, `users`); dynamic-ER drift не обнаружен. |
| `scripts/security-scan.sh` | **NOT GREEN вне Phase 1 diff:** Bandit без findings; dependency audit — 15 Python advisories и 7 npm vulnerabilities; frontend lint — существующий `_omit` error в `projectStore.test.ts:49`. Общий release blocker. |

### Доказанный контракт

- Lifecycle/readiness API создаёт первый active `ЭР1` только для готового
  проекта, поддерживает до пяти именованных UUID ЭР, copy/rename/activate/delete
  и owner/admin write guard.
- 0027 создаёт `electrical_variants`, `electrical_variant_objects`, UUID bridge
  downstream-таблиц и sync triggers; 0028 добавляет некаскадный UUID trace
  фоновых electrical/report задач.
- Новые task payloads UUID-first (`payload_version=3`); numeric selector
  `1…4` остаётся deprecated adapter и историческим v2 worker bridge.
- Все обычные numeric write paths и seeds readiness-gated до записи и получают
  project-scoped UUID; sparse slot 4 создаёт только `ЭР1 + ЭР4`.
- Project duplicate готовит `ЭР1`/UUID до batch только после успешной heat
  readiness; неготовая копия остаётся heat-only graph без ER/electrical rows.
- Явный task `Idempotency-Key` namespaced по principal/type/project и binding-ит
  полный payload/ЭР; exact/terminal retry возвращает исходную задачу, reuse с
  другим payload/ЭР даёт `409 TASK_IDEMPOTENCY_KEY_REUSED`. Heat lookup/insert
  project-locked; replay audit содержит фактический task status/result.
- Electrical job: omitted selector → legacy slot `1`; UUID-only очищает implicit
  default; explicit `variant_number:null` → стабильный 422 без ER side effect.
- Candidate apply/delete сериализованы общей project lock; apply перечитывает
  mapping и возвращает stable 404/409 вместо восстановления ЭР или 500.
- Project CSV v2 строит sparse UUID graph и импортирует legacy specifications
  stale, не выдавая их за sections-ready результат.

### Остаточные ограничения

- Frontend всё ещё отображает fixed `СО1…СО4`; Phase 2 pending.
- Direct candidates/folders/specification/report preview/sync export остаются
  numeric; пятый ЭР пока lifecycle-only и не имеет legacy расчётного графа.
- MEDIUM residual, intentional Phase 3 boundary: normal legacy calculation
  получает UUID, но assignment может остаться `unassigned/system_type=null`;
  consumers не используют state как authoritative до Phase 3 sync.
- Phase 3 и Phase 5 pending; Phase 4 заблокирована PDL-ER-15.
- Full frontend, dependency security и общий Alembic metadata-drift gates
  остаются не-green вне backend/DB Phase 1 diff.
- Общий PDF/DoD, product release и ранее найденные guest
  specification/report/mobile defects не закрыты этим backend/DB checkpoint.

## Phase 2 frontend/consumer final checkpoint

Дата: 18.07.2026. Ветка:
`feature/tnp-dynamic-electrical-variants`. Статус:
**PASS — frontend/consumer Phase 2 complete**.

Полная граница и findings: [phase-2-checkpoint.md](phase-2-checkpoint.md).

| Проверка | Результат |
|---|---|
| Backend focused dynamic-ER integration/schema suites | **PASS**. |
| Stale UUID + reused legacy slot oracle | **PASS:** expected UUID precondition вернул stable 409 и не изменил новый graph. |
| Focused backend Ruff | **PASS**. |
| `npm --prefix frontend run typecheck` | **PASS**. |
| `npm --prefix frontend run build` | **PASS**. |
| Focused `ElecCalcPage` + `ElectricalVariantTabs` | **PASS: 77/77 tests**. |
| Full frontend Vitest | **NOT GREEN: 1033 passed, 1 failed**. Единственный failure — прежний `HeatCalcPage.settings.test.tsx:321`, missing accessible separator. |
| Isolated HeatCalc settings rerun | **FAIL reproduced:** тот же separator defect, вне dynamic-ER diff. |
| `scripts/codex-functional-audit.sh db-invariants` после live UI | **PASS: 28 checks, 0 violations**. |
| Desktop `1440×1000`, один и пять ЭР | **PASS:** нет unexpected clipping/overlap/page overflow; выбранный tab видим полностью. |
| Mobile `390×844`, пять ЭР | **PASS:** локальный horizontal tab scroll, один controlled ellipsis с полным accessible name, нет page overflow. |
| Invalid `?er=<uuid>` reconciliation | **PASS:** selection и URL восстановлены к authoritative active ЭР. |
| Delete confirmation | **PASS:** перечислены связанные assignment/calculation/cable/candidate/folder/spec данные. |
| Console / network | **PASS:** 0 errors, 0 warnings; UUID виден в lifecycle и direct consumer запросах. |
| `scripts/codex-functional-audit.sh docs` после sync | **PASS:** docs up to date, manifest facts OK. |

UI evidence находится в
[evidence/phase-2-ui](evidence/phase-2-ui/): before/after desktop/mobile,
геометрия, long-name, delete confirmation, invalid URL recovery, console и
network trace.

### Доказанный Phase 2 контракт

- UI показывает до пяти именованных project-scoped UUID ЭР и поддерживает
  create/copy/inline rename/activate/delete.
- Selected и active ER разделены; deep link использует UUID, неизвестный UUID
  не создаёт скрытую selection и reconciled к server truth.
- Query/cache identity, background tracker и mutation snapshots используют UUID;
  поздний ответ другого ЭР не подменяет текущий экран.
- Пока direct data plane numeric, каждый запрос передаёт expected UUID, а
  backend под project lock проверяет точную пару UUID↔slot до чтения/записи.
- Пятый ЭР fail-closed для legacy calculations/spec/report и не показывает
  данные другого ЭР.
- ARIA tabs, keyboard focus, full long-name title, mobile local scroll,
  loading/error/retry/read-only и limit-5 states покрыты focused tests.

### Остаточные ограничения после Phase 2

- Phase 3 assignments и Phase 5 full UUID-only/multi-ЭР flow pending.
- Phase 4 blocked PDL-ER-15/18 до официального числового источника.
- Full frontend, dependency security и общий Alembic metadata drift остаются
  не-green вне Phase 2 diff и блокируют общий release.
