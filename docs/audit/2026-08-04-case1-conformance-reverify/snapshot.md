# Case 1 conformance reverify — audit snapshot

**Дата снимка:** 2026-08-04
**Начало регрессионной перепроверки:** 2026-08-04T02:34:14+03:00
**Ветка:** `main`
**HEAD:** `ca8805e4447f82ebe55a731b0a23c84255a46dda`
**Состояние относительно `origin/main`:** ahead 50, behind 0
**Источник задания:** `docs/tnp/cases/case1-conformance-reverify-agent-prompt.md`
**Режим:** независимый audit/reverify; продуктовый код не изменялся

## Errata платформы (2026-08-04) — **мобильной версии нет**

**Решение владельца, постоянное:** phone/tablet / viewport &lt;1000 px **вне product contract**.
Норматив: [`../../frontend/viewport-policy.md`](../../frontend/viewport-policy.md) §0,
[`../../tnp/cases/case1-designer-brief.md`](../../tnp/cases/case1-designer-brief.md) §2.1.

Строки browser matrix с `390×844` в этом снимке и в [`browser-e2e/report.md`](./browser-e2e/report.md)
переводятся в **N/A**: не FAIL, не P0, **не входят в % закрытости ТЗ**.

Актуальный пересчёт готовности (desktop-only + post SPEC-P0/help):
[`reassessment-desktop-only.md`](./reassessment-desktop-only.md).

---

## Итог

Cutover E0–E9 действительно присутствует в `HEAD` и заметно усилил electrical MVP. Электротехническое ядро в целом подтверждено кодом и точечными тестами. Однако весь кейс 1 нельзя считать release-ready или закрытым на 100%.

Главные release blockers находятся в Specification:

1. generated BOM rows могут попадать в секцию «Общее» из-за несовпадения FE/BE-поля секции;
2. preflight не предоставляет требуемое действие «Исправить» с переходом к проблемному месту;
3. временный catalog seed-debt способен выглядеть как `APPROVED` и участвовать в production-like selection вместо owner-approved каталога.

Дополнительно остаются P1-разрывы в guest help/session recovery, Glide DnD, object-level `Iдоп`, frontend concurrency/idempotency и UX спецификации. На момент исходного аудита browser/E2E, полный DoD и NFR не запускались, поэтому визуальное и интеграционное соответствие не доказано.

## Зафиксированное состояние репозитория

Последовательность cutover-коммитов:

| Slice | Commit | Subject |
| --- | --- | --- |
| E0 | `5e72a50` | `fix(electrical): E0 MVP cutover — TT assign, threads 1..3, 230 V` |
| E1 | `8c1a1fc` | `fix(electrical): E1 MVP chrome — Samreg-only UI and 230 V read-only` |
| E2 | `54ecb58` | `feat(electrical): E2 project Iдоп settings UI on ER workspace` |
| E3 | `e89e5ad` | `feat(electrical): E3 stale row UX and bulk recalc banner` |
| E4 | `2348779` | `fix(electrical): E4 §9.15 final ready gate for TT results` |
| E5 | `8246c6d` | `feat(electrical): E5 cable-options API returns TT catalog models` |
| E6 | `b2ba00e` | `fix(electrical): E6 expose table status stale separately from not_calculated` |
| E7 | `67b9b9d` | `feat(electrical): E7 manual mark options from BE cable-options` |
| E7.4–E9 | `ca8805e` | `feat(electrical): close cutover E7.4–E9 (L* columns, concurrency, soft-stale import)` |

До начала работы уже существовали untracked-файлы, не относящиеся к этому slice. Они не изменялись и не удалялись:

```text
one.js
scripts/build_header.py
scripts/pclone.py
scripts/penpot.py
scripts/penpot_build.js
scripts/penpot_kit.py
scripts/penpot_screens.py
scripts/render_html.py
tools/penpot/penpot.local.json
```

## Источники и метод

Перепроверены:

- PDF кейса 1 Rev.4, физические страницы 34–61;
- нормативные TNP-документы для guest electrical calculation, specification algorithm и frontend user stories;
- актуальный код `frontend/` и `backend/` на указанном `HEAD`;
- история E0–E9;
- точечные backend и frontend tests.

Статусы означают:

- `PASS` — требование подтверждено кодом и, где указано, тестом;
- `PARTIAL` — основа реализована, но контракт или UX неполон;
- `FAIL` — требуемое поведение отсутствует либо фактическое поведение противоречит нормативу;
- `NOT RUN` — runtime-доказательства не получены; статический просмотр не заменяет прогон.

Проценты ниже — взвешенная экспертная оценка реализованного поведения, а не code-coverage score. Отсутствие browser/E2E/NFR ограничивает release-оценку.

## Исходные тестовые доказательства

### Backend focused regression

Команда выполнялась в read-only Docker mount:

```bash
docker run --rm --entrypoint pytest \
  -e PYTHONDONTWRITEBYTECODE=1 \
  -v /Users/dmalafey/Desktop/TLT/backend:/app:ro \
  -w /app heatcalc-backend-dev:latest \
  app/tests/unit/formulas/test_tt_cable_options.py \
  app/tests/unit/services/test_electrical_query_status.py \
  app/tests/unit/services/test_legacy_import_soft_stale.py \
  app/tests/unit/services/test_electrical_assignment_version_gate.py \
  -v --no-cov -p no:cacheprovider
```

Результат: **23 passed**.

### Frontend focused regression

Команда выполнялась из `frontend/`:

```bash
npx vitest run --project unit \
  src/__tests__/unit/pages/electrical/elecCalcStaleModel.test.ts \
  src/__tests__/unit/pages/electrical/ElecCalcStaleBanner.test.tsx \
  src/__tests__/unit/pages/electrical/elecCalcCableOptionsModel.test.ts \
  src/__tests__/unit/utils/electricalTableColumns.test.ts
```

Результат: **4 test files, 20 tests passed**.

### Что исходно не запускалось

- `test_tt_final_gate.py` и широкий specification/guest backend regression;
- широкая frontend component/unit regression;
- integration tests;
- repository Playwright/E2E;
- browser state matrix на `1440x1000` и `390x844`;
- полный lint/typecheck/build/DoD;
- NFR 500 объектов / 10 одновременных пользователей;
- guest project-file roundtrip.

## Electrical — матрица соответствия

| Требование | Backend | Frontend | Фактическое состояние |
| --- | --- | --- | --- |
| Не более 5 ЭР; rename/delete | PASS | PARTIAL | Ограничение и delete реализованы. Пустой rename в `frontend/src/pages/electrical/useElectricalVariantRename.ts:83` не восстанавливает прежнее имя, а текст ошибки расходится с нормативным. |
| Назначение только на «Саморег» | PARTIAL | PASS | FE скрывает неподходящие варианты. `backend/app/services/electrical_assignment_service.py:49` всё ещё допускает `self_regulating` и `resistive`. |
| Assign автоматически считает `self_regulating_tt` | PASS | PASS | Связка подтверждена в `ElecCalcWorkspace.tsx:89` и `elecCalcAssignAutoCalcModel.ts`. |
| Число ниток 1..3 | PASS | PASS | Ограничения схем и FE layout согласованы; ключевые места — `elecCalcLayoutModel.ts:118,150`. |
| 230 В read-only | PASS | PASS | UI read-only в `ElecCalcElectricalTypeControls.tsx:38`; resolver принудительно использует 230 В. |
| `Iдоп` fail-closed и настройки | PASS | PARTIAL | Формула fail-closed в `backend/app/formulas/electrical/sections.py:206`; project-level UI есть (`ElecCalcIdopSettings.tsx:41`), object/assignment override отсутствует. |
| Summary Саморег + Итого | PASS | PARTIAL | Основные карточки присутствуют (`ElectricalSummary.tsx:72`), но строгий summary не интегрирует полные counts unassigned/stale/error. |
| Stale status и banner | PASS | PASS | Query status и отдельный stale UX реализованы; точечные тесты зелёные. |
| Cable options object-scoped | PASS | PASS | BE выборка в `tt_cable_options.py:145`, FE query привязан к объекту; тесты зелёные. |
| Manual mark без synthetic suffix | PASS | PASS | FE mapping в `elecCalcCableOptionsModel.ts:37` использует базовую марку. |
| L* default-visible columns | PASS | PASS | Конфигурация и unit test подтверждают default-visible L-колонки. |
| §9.15 final gate | PASS | PASS (static) | Gate вызывается до `ready`; специализированный test в исходном прогоне не запускался. |
| DnD и keyboard reorder | PASS | PARTIAL | Keyboard control есть. DnD работает в AntD-варианте, тогда как default engine — Glide (`electricalTableEngine.ts:5`, `ElectricalUnifiedTableCard.tsx:157`). |
| `expected_assignment_version` | PASS | PARTIAL | Assignment mutation передаёт обязательную версию. Для прямого calculate в FE существует только тип; фактическая версия не заполняется. BE принимает поле опционально и проверяет при наличии (`calculation_service.py:1742`). |
| Idempotency-Key | PARTIAL | PARTIAL | Заголовок существует. Direct endpoint сохраняет key, но sync batch не выполняет replay/skip по formula store; background jobs имеют idempotency. |
| Legacy import soft-stale | PASS | PASS | Проекция assignment/version и stale-поведение реализованы; focused tests зелёные. |

### Вывод по Electrical

Инженерное ядро E0–E9 подтверждено. Основные незакрытые контракты — backend Samreg-only, object-level `Iдоп`, default Glide DnD, FE calculation concurrency и полноценная sync idempotency.

## Specification — матрица соответствия

| Область | Статус | Фактическое состояние |
| --- | --- | --- |
| Generate / selection / F5 / fingerprint | PASS (static) | Engineering path присутствует; специализированные runtime/spec tests в исходном прогоне не запускались. |
| BOM section mapping | **FAIL / P0** | `SpecTable.bomSectionOf` читает `bom_section || object_type` (`frontend/src/components/specification/SpecTable.tsx:34`), тогда как BE пишет секцию в `params.object_type_section` (`backend/app/services/specification_bom_builder.py:307,919`). Auto rows поэтому способны попасть в «Общее». |
| Preflight action «Исправить» | **FAIL / P0** | Modal содержит confirm/cancel, но нет перехода к проблемному месту, фокуса или highlight (`SpecPageChrome.tsx:414`). |
| Preflight readability | PARTIAL | Diagnostics flatten-ятся и показываются как raw `CODE: message`; settings modal закрывается при selection/confirmation (`useSpecificationPageModel.ts:157`). |
| Honest empty section | FAIL | Любая пустая секция показывает один и тот же unsupported-message (`SpecTable.tsx:332`), даже если секция просто пуста. |
| Production catalog authority | **FAIL / P0 release gate** | `specification_catalog_seed_debt.py` помечен как временный, но создаёт `authority=APPROVED`; `tech-debt` не входит в untrusted tokens, поэтому временные записи способны стать active и пройти resolve. Нужен owner-approved catalog. |
| Fixed-first / internal scroll contract | PARTIAL | В таблице остаются sorters, что расходится со строгим чтением PDF §7.1; fixed-first и локальный scroll не доказаны браузером. |
| Diagnostics visual language | PARTIAL | Не хватает различимых kind-tones, per-ЭР badges, имени ЭР вместо UUID, полноценного provenance/detail и ясной stale-selection copy. |

### Вывод по Specification

Backend engineering flow близок к закрытому, но пользовательский §7 и production catalog имеют критические разрывы. До исправления трёх P0 заявлять кейс 1 готовым нельзя.

## Guest mode — матрица соответствия

| Требование | Статус | Фактическое состояние |
| --- | --- | --- |
| TTL 3 дня / лимит 500 объектов | PASS в config/home | Backend config и home отражают 3 дня и 500 объектов. |
| Guest Help | FAIL | Help сообщает 30 дней, 50 объектов, использует «Пользователь» и предлагает создать проект — это противоречит текущему guest-контракту. |
| Guest menu | PASS (static) | Employee new/open скрыты, download/upload доступны. |
| Project file roundtrip | PARTIAL / NOT RUN | Backend schema v3 и replace-safety присутствуют, но UI labels «Скачать/Загрузить (CSV)» и help описывает импорт объектов. Фактический roundtrip не запускался. |
| Session recovery | PARTIAL | Создаётся новая guest session и запрос повторяется, но старые project queries явно не отменяются/не удаляются и нет гарантии одного понятного user message. |

## Claimed vs fact

| Заявление | Факт на HEAD | Решение |
| --- | --- | --- |
| E0 TT assign закрыт | Auto-calc path присутствует | CONFIRMED |
| E0 threads 1..3 закрыт | FE и BE лимиты согласованы | CONFIRMED |
| E0 230 В закрыт | Read-only FE + forced resolver | CONFIRMED |
| E1 Samreg-only закрыт | FE закрыт, BE сохраняет `resistive` | PARTIAL |
| E1 summary закрыт | Core cards есть, strict counts неполны | PARTIAL |
| E2 `Iдоп` закрыт | Только project-level UI; object override нет | PARTIAL |
| E3 stale UX закрыт | Код и focused tests подтверждают | CONFIRMED |
| E3 DnD закрыт | Default Glide не получает эквивалентный DnD | PARTIAL |
| E4 final gate закрыт | Static path подтверждён; отдельный test исходно NOT RUN | CONFIRMED STATIC |
| E5 cable-options закрыт | BE/FE и focused tests подтверждают | CONFIRMED |
| E6 stale отделён от not_calculated | Код и focused tests подтверждают | CONFIRMED |
| E7 manual mark options закрыт | Базовая марка без suffix подтверждена | CONFIRMED |
| E7 L* columns закрыт | Config + unit test подтверждают | CONFIRMED |
| E8 version gate закрыт | BE закрыт; прямой FE calculate не передаёт значение | PARTIAL |
| E8 idempotency закрыта | API surface есть, полноценный sync replay отсутствует | PARTIAL |
| E9 soft-stale import закрыт | Код и focused tests подтверждают | CONFIRMED |
| Select-all cap 5 отсутствует | Lifecycle/import поддерживают инвариант ≤5 | FALSE GAP / CLOSED |
| Dead schemas разрешают threads ≤100 | Релевантные схемы ограничены ≤3 | FALSE GAP / CLOSED |
| Spec engineering закрыт | Static path сильный, runtime proof неполон | CONFIRMED STATIC ONLY |
| D-ELEC/D-SPEC/D-CHROME равны product P0 | Это главным образом design residual, не доказанный product P0 | CLAIM NOT PROVEN |

## Исходная оценка готовности до расширенной regression

| Scope | Оценка | Уверенность | Ограничение |
| --- | ---: | --- | --- |
| ТЗ Electrical ER MVP | 86–90% | высокая static / средняя runtime | Остались DnD, override, concurrency/idempotency и несколько контрактных углов. |
| Engineering guest path | 86–89% | средняя | Help, recovery и project-file roundtrip не закрыты. |
| Specification engineering | 88–92% | средняя | Основной pipeline есть, но runtime suite не был широким. |
| Specification UX §7 | 60–68% | высокая static | Section mapping, «Исправить», empty/preflight и визуальная семантика. |
| Case 1 product/UX | 72–78% | средняя | Сильное ядро, но заметные cross-layer разрывы. |
| Release claim «100% case 1» | 65–72% | низкая–средняя | Три P0 и отсутствие полной browser/E2E/NFR доказательной базы. |

## Реальные незакрытые работы

### P0 — release blockers

1. Согласовать FE/BE section field и добавить regression test, чтобы auto-generated rows попадали в правильную секцию.
2. Реализовать preflight «Исправить»: переход, фокус/highlight и E2E на ошибочную строку/секцию.
3. Загрузить owner-approved production catalog и запретить temporary seed-debt проходить production activation/resolve как trusted `APPROVED`.

### P1 — функциональные и UX-разрывы

- честные empty states, человекочитаемый preflight и визуально различимые diagnostic kinds;
- Guest Help, file labels/описание и предсказуемая session recovery;
- DnD для default Glide, inline mark edit, per-row recalc и object-level `Iдоп`;
- фактическая передача `expected_assignment_version` из direct FE calculate;
- полноценная idempotency для direct/sync calculation;
- TT sizing modal на object-scoped cable options;
- единый error label и полные summary counts;
- Spec badges, имена ЭР, provenance/detail и stale-selection copy;
- удалить/ограничить Spec sorting, если строгий PDF-контракт требует fixed-first порядок.

### P2 — proof debt и polish

- browser state matrix и screenshots на 1440×1000 / 390×844;
- guest project-file roundtrip;
- NFR 500 объектов / 10 пользователей;
- полный DoD: lint, typecheck, unit, build, integration, E2E;
- legacy import E2E и проверка purge `cables_tlt`;
- dead CSS/report polish и non-MVP residual.

## Top-10 gaps для следующей работы

| # | Priority | Gap | Минимальное доказательство закрытия |
| ---: | --- | --- | --- |
| 1 | P0 gate | Вернуть зелёные FE lint/typecheck/build | 0 TS/lint errors и выполненный Vite production bundle. |
| 2 | P0 | Specification write isolation | Regression tests на READY+BLOCKED, savepoint exception и fingerprint conflict без лишних writes. |
| 3 | P0 | FE/BE section mapping generated BOM | Contract test + FE regression на все секции. |
| 4 | P0 | Preflight «Исправить» | Component test и Playwright с переходом/focus/highlight. |
| 5 | P0 | Owner-approved production catalog | Migration/seed provenance + запрет activation временных debt-записей. |
| 6 | **N/A** | ~~Mobile home / guest heat 390~~ | **Снято:** мобильной версии нет (`viewport-policy.md` §0). Не gap. |
| 7 | P1 | Project IO + spec idempotency regressions | Три backend tests зелёные; roundtrip сохраняет ожидаемый assignment contract. |
| 8 | P1 | Завершить TT cable-options migration | Типы, hook contract и functional tests согласованы без unused legacy args. |
| 9 | P1 proof | Обновить shared E2E pipe helper | `insulation_layers`, затем успешный Electrical cable-selection critical path. |
| 10 | P2 proof | Полный browser/DoD/NFR evidence | Populated state matrix, full DoD и 500×10 нагрузочный сценарий. |

## Рекомендуемый следующий slice

### SPEC-P0

Acceptance criteria:

1. backend contract или FE adapter отдают/читают одно каноническое поле секции;
2. regression test доказывает правильные секции для generated auto rows;
3. preflight содержит действие «Исправить», переводит пользователя к проблеме и оставляет понятный highlight/focus;
4. empty section отличает «нет строк» от «тип не поддержан»;
5. focused unit/component/E2E зелёные на desktop и mobile.

Отдельным release gate выполнить owner-catalog migration и production restriction для seed-debt. После SPEC-P0 — browser matrix и guest project-file roundtrip.

## Параллельная регрессия по запросу пользователя

Запущены три независимых направления:

1. backend regression: Electrical + Specification + Guest/project IO;
2. frontend regression: unit/component/static checks для Electrical + Specification + Guest;
3. browser/E2E regression: critical paths, responsive geometry, console/network и screenshots.

Все три направления завершены. Итоговый regression gate: **RED**.

### Backend agent result

**Статус: FAILED.** Прогон завершён на `ca8805e`; продуктовые и тестовые файлы не менялись.

Итог по уникальным тестам: **595 collected; 589 passed; 6 failed; 0 skipped**.

| Набор | Результат | Время |
| --- | ---: | ---: |
| Unit | 434 passed, 1 failed | 2.21 s |
| API/service integration | 139 passed, 5 failed | 106.65 s |
| Electrical/specification migrations | 16 passed | 47.59 s |

Окружение:

- Docker image `heatcalc-backend-dev:latest`, digest `sha256:ba8091f416994e05e04cba12e2cd663ad64c83f7474d7bf043896e83565525e3`;
- Python 3.11.15, pytest 9.0.3;
- unit run — `/backend` read-only, bytecode/cache/coverage отключены;
- integration — live `backend`, отдельная `heatcalc_test`; fixture пересоздавала и очищала test schema;
- backend, PostgreSQL, frontend, Redis и worker были healthy.

Воспроизводимые failures:

1. `app/tests/unit/services/test_project_io_helpers.py::TestApplyProjectData::test_electrical_links_via_object_key` — после `_apply_project_data` assignment имеет `assignment_state == "stale"`, а тестовый контракт ожидает `ready`; изолированный повтор: 1 failed in 0.17 s.
2. `app/tests/integration/api/test_idempotency.py::TestSpecGenerateIdempotency::test_generate_twice_same_count` — первый `POST /specifications/{project_id}/generate` возвращает 422 вместо 201; тройная идемпотентная генерация не достигается.
3. `app/tests/integration/api/test_project_io.py::TestSingleExportImport::test_import_normalizes_manual_cable_source_before_batch` — `POST /calc/electrical/select-cable` возвращает `422 ELECTRICAL_INPUT_REQUIRED` из-за отсутствующего `maintain_temperature_c`, ожидался 200.
4. `test_ready_and_blocked_mixed_writes_only_ready` — READY+BLOCKED сохраняют 2 specification rows вместо одной.
5. `test_exception_mid_er_rolls_back_only_that_savepoint` — исключение внутри второго ЭР оставляет 2 rows вместо одной; blocked slice сохраняется.
6. `test_fingerprint_race_returns_conflict_without_write` — при `GENERATION_CONFLICT` остаётся 1 specification row, ожидалось отсутствие записей.

Failures 4–6 — единый высокорисковый кластер: blocked/conflict specification generation нарушает ожидаемый write-isolation/rollback contract.

Основные команды:

```bash
docker run --rm --entrypoint pytest -e PYTHONDONTWRITEBYTECODE=1 \
  -v /Users/dmalafey/Desktop/TLT/backend:/app:ro -w /app \
  heatcalc-backend-dev:latest \
  app/tests/unit/core/test_guest_activity.py \
  app/tests/unit/formulas/test_catalog_identity_and_source.py \
  app/tests/unit/formulas/test_specification_box_calculator.py \
  app/tests/unit/formulas/test_specification_calculators.py \
  app/tests/unit/formulas/test_specification_grouping.py \
  app/tests/unit/formulas/test_tt_cable_options.py \
  app/tests/unit/formulas/test_tt_final_gate.py \
  app/tests/unit/models/test_electrical_calculation_revision.py \
  app/tests/unit/reference_data/test_electrical_tt_bom.py \
  app/tests/unit/schemas/test_specification_contract.py \
  app/tests/unit/services/test_cable_snapshot.py \
  app/tests/unit/services/test_electrical_assignment_version_gate.py \
  app/tests/unit/services/test_electrical_candidate_dedupe.py \
  app/tests/unit/services/test_electrical_catalog_service.py \
  app/tests/unit/services/test_electrical_error_guidance.py \
  app/tests/unit/services/test_electrical_history_service.py \
  app/tests/unit/services/test_electrical_input_resolver.py \
  app/tests/unit/services/test_electrical_query_status.py \
  app/tests/unit/services/test_electrical_tt_calculation_service.py \
  app/tests/unit/services/test_electrical_tt_pipeline.py \
  app/tests/unit/services/test_legacy_import_soft_stale.py \
  app/tests/unit/services/test_project_io_helpers.py \
  app/tests/unit/services/test_rename_no_stale_contract.py \
  app/tests/unit/services/test_specification_bom_builder.py \
  app/tests/unit/services/test_specification_candidate_service.py \
  app/tests/unit/services/test_specification_catalog_seed_debt.py \
  app/tests/unit/services/test_specification_catalog_service.py \
  app/tests/unit/services/test_specification_preflight_rules.py \
  app/tests/unit/services/test_specification_preflight_service.py \
  app/tests/unit/services/test_specification_selection_service.py \
  app/tests/unit/services/test_specification_service_unit.py \
  app/tests/unit/test_electrical_result_status.py \
  app/tests/unit/api/test_specification_openapi.py \
  -v --no-cov -p no:cacheprovider
```

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  exec -T -e PYTHONDONTWRITEBYTECODE=1 backend pytest \
  app/tests/integration/api/test_cable_options.py \
  app/tests/integration/api/test_electrical_assignments.py \
  app/tests/integration/api/test_electrical_backend_acceptance.py \
  app/tests/integration/api/test_electrical_catalogs.py \
  app/tests/integration/api/test_electrical_variants.py \
  app/tests/integration/api/test_guest_ttl_expiry_path.py \
  app/tests/integration/api/test_idempotency.py \
  app/tests/integration/api/test_legacy_electrical_variant_writes.py \
  app/tests/integration/api/test_project_electrical_settings.py \
  app/tests/integration/api/test_project_io.py \
  app/tests/integration/api/test_specification_canonical_api.py \
  app/tests/integration/api/test_specification_catalog_admin.py \
  app/tests/integration/api/test_specification_production_flow_http.py \
  app/tests/integration/api/test_specifications.py \
  app/tests/integration/db/test_electrical_page_summary.py \
  app/tests/integration/db/test_specification_generation_service.py \
  app/tests/integration/db/test_specification_preflight_service.py \
  -v --no-cov -p no:cacheprovider
```

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  exec -T -e PYTHONDONTWRITEBYTECODE=1 backend pytest \
  app/tests/integration/db/test_background_task_electrical_variant_migration.py \
  app/tests/integration/db/test_dynamic_electrical_variants_phase1a.py \
  app/tests/integration/db/test_electrical_assignment_migration.py \
  app/tests/integration/db/test_electrical_catalog_migration.py \
  app/tests/integration/db/test_electrical_catalog_seed.py \
  app/tests/integration/db/test_electrical_revision_migration.py \
  app/tests/integration/db/test_specification_catalog_migration.py \
  app/tests/integration/db/test_specification_catalog_selections_migration.py \
  app/tests/integration/db/test_specification_uuid_identity_migration.py \
  -v --no-cov -p no:cacheprovider
```

Не покрывались: полный backend suite, coverage gate, ruff/mypy, perf/load 500×10, весь generic migration/cascade/race/query-count набор и внешние/browser/frontend сценарии. Non-blocking warnings: Pydantic `__fields__` deprecation, короткий test HMAC key и одна deprecated calculation schema ветка.

### Frontend agent result

**Статус: FAILED.** HEAD `ca8805e`; Node v23.5.0, npm 10.9.2. Tracked-файлы не менялись.

#### Mandatory static UI gate

```bash
/Users/dmalafey/.codex/plugins/cache/personal/kontur-ui-quality/0.1.0+codex.20260719195723/scripts/run-static-ui-checks.sh \
  /Users/dmalafey/Desktop/TLT
```

Exit 1 за 8.18 s. MCP-конфигурация OK; lint завершился с двумя ошибками, поэтому последующие стадии wrapper не запускались:

- `useElecCalcCableMarkOptions.tsx:43` — unused `ttCables`;
- `useElecCalcCableMarkOptions.tsx:47` — unused `aggressiveProduct`.

#### Typecheck и build

```bash
npm run typecheck
```

Exit 2 за 9.46 s, 4 TypeScript errors:

- nullable mapping/type predicate в `elecCalcCableOptionsModel.ts:46,61` — 2 ошибки;
- два unused-параметра в `useElecCalcCableMarkOptions.tsx:43,47`.

```bash
npm run build
```

Exit 1 за 9.90 s: остановился на тех же четырёх TypeScript errors, Vite bundle не стартовал.

#### Full Vitest

```bash
npm run test -- --run
```

Exit 1. Итог: **344 files — 332 passed / 12 failed; 1467 tests — 1455 passed / 12 failed / 0 skipped; 334.24 s**.

Функциональные/test-contract failures:

1. `useElecCalcCableReferenceData.test.tsx` — для TT ожидалась одна manual sizing option, получено `[]`; код уже требует object-scoped backend options, но старые параметры остаются unused. Миграция неполна либо тест устарел.
2. `useElecCalcRecalculationParams.test.tsx` — тест ожидает 220 В, реализация нормативно использует 230 В; тест устарел.
3. `ElecCalcPage.table-batch.batch-assign.test.tsx` — та же рассинхронизация 220→230 В; остальной payload присутствует.
4. `ObjectWizardDependencies.layout-defaults.test.tsx` — отсутствует ожидаемый блок «Подбор спецификации».

Architecture failures:

- direct Ant import: 140 > baseline 139; новый owner `ElecCalcIdopSettings.tsx`;
- `useSpecificationPageModel.ts`: 532 LOC > 500;
- CSS LOC вырос в четырёх owner-files;
- `!important`: 2 > 0;
- inline styles: 57 > 54, включая 3 в `ElecCalcIdopSettings.tsx`;
- root `AGENTS.md` не tracked;
- node-environment test `elecCalcCableOptionsModel.test.ts` достигает browser-dependent API client;
- visual literals в `glideGridPrimitives.ts`: 26 > 25.

Во время полного прогона наблюдались многочисленные `jsdom XMLHttpRequest AggregateError`. Они не посчитаны как отдельные test failures, но clean-console/runtime health не подтверждён.

#### Focused Specification + Guest pack

```bash
npx vitest run --project unit --project integration --project integration-unoptimized \
  src/__tests__/unit/pages/specification \
  src/__tests__/unit/components/SpecTable.test.tsx \
  src/__tests__/unit/api/specifications.test.ts \
  src/__tests__/unit/api/client.guest-recovery.test.ts \
  src/__tests__/unit/api/client.network-idempotency.test.ts \
  src/__tests__/unit/components/ProjectMenu.test.tsx \
  src/__tests__/unit/store/projectStore.test.ts \
  src/__tests__/unit/store/authStore.test.ts \
  src/__tests__/unit/hooks/useAuth.test.tsx \
  src/__tests__/integration/pages/SpecificationPage.empty-display.test.tsx \
  src/__tests__/integration/pages/SpecificationPage.er-scope-write.test.tsx \
  src/__tests__/integration/pages/ProjectsPage.test.tsx \
  src/__tests__/integration/pages/HomePage.test.tsx
```

Exit 0: **20/20 files, 93/93 tests passed, 0 failed/skipped, 15.46 s**. Direct Specification и guest/session/menu/project flows зелёные; cross-owner wizard/spec layout остаётся красным.

Не запускались этим агентом: browser/Playwright viewport matrix, полный `test:agent-dod:dual-safe`, coverage и security audit.

### Browser/E2E agent result

**Статус: FAILED.** Полный отдельный протокол: [`browser-e2e/report.md`](./browser-e2e/report.md).

Target: local Docker stack, frontend `http://127.0.0.1:3003`, API `http://127.0.0.1:8000`. `frontend`, `backend`, PostgreSQL и Redis были healthy, worker — running. Основной browser evidence получен через isolated `kontur_playwright`; repository Playwright использовал system Chrome.

Mandatory browser smoke прошёл. In-app browser surface не подключился из-за unavailable trusted bridge, но это не было объявлено общим blocker: обязательный `kontur_playwright` работал.

#### Runtime state matrix

| State | Viewport | Result | Evidence |
| --- | ---: | --- | --- |
| Home | 1440×1000 | PASS visually | Login card и actions видимы. |
| Home | 390×844 | **FAIL** | `scrollWidth=475`, `clientWidth=390`, overflow +85 px; все 6 action buttons занимают `x=-47..437`. |
| Guest Help | 1440×1000 | **FAIL copy**, PASS geometry | Runtime подтверждает устаревшие «до 30 дней», «до 50 на проект», «Пользователь», «Создайте проект». |
| Guest Help | 390×844 | **FAIL copy**, PASS geometry | Нет overflow; та же неверная copy. |
| Guest heat empty | 1440×1000 | PASS geometry | 47 visible controls, 0 outside viewport. |
| Guest heat empty | 390×844 | **FAIL** | Page scrollWidth формально равен viewport, но 13 visible controls клиппятся; крайние достигают `right=698`. |
| Electrical no-ER | 1440×1000 | PASS | Honest readiness copy; 10 controls, 0 outside. |
| Electrical no-ER | 390×844 | PASS reached empty state | 10 controls, 0 outside; page overflow отсутствует. |
| Specification no-ER | 1440×1000 | PASS | Honest «ЭР ещё не создан», CTA видим; 10 controls, 0 outside. |
| Specification no-ER | 390×844 | PASS reached empty state | 10 controls, 0 outside; page overflow отсутствует. |
| Electrical assigned calculation | desktop | HANDLED FAILURE | Valid pipe/ЭР созданы, assignment переведён в Samreg, batch принят. UI последовательно показал missing `steam_temperature_c`, затем missing `winding_pitch_mm`; успешный cable selection не доказан. |

Console/network по наблюдённым сценариям:

- console: 0 warnings, 0 errors, 3 informational messages;
- guest session 201; project/electrical/specification reads 200; batch jobs 202;
- failed dynamic network requests в MCP-сценариях не наблюдались.

#### Focused repository Playwright

Layout command:

```bash
cd e2e
E2E_BASE_URL=http://127.0.0.1:3003 \
E2E_API_BASE=http://127.0.0.1:8000 \
PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
npx playwright test tests/layout-regression.spec.ts \
  --grep 'guest workspace flow has no layout regressions — (desktop|mobile)' \
  --reporter=list \
  --output=/private/tmp/tlt-case1-browser-e2e-2026-08-04/playwright-layout
```

Результат: **1 passed, 1 failed, 13.8 s**.

- desktop 1440×900: PASS для guest heat, Electrical, Specification и Report;
- mobile 390×844: FAIL на guest heat; 6 точных outside-viewport assertions — «Пол», object name, placement, insulation-temperature-basis, insulation-thickness wrapper и input.

Critical-path command:

```bash
cd e2e
E2E_BASE_URL=http://127.0.0.1:3003 \
E2E_API_BASE=http://127.0.0.1:8000 \
PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
npx playwright test \
  tests/elec-calculation.spec.ts \
  tests/phase5-specification-proof.spec.ts \
  tests/phase5-actionable-close.spec.ts \
  --grep '(после расчёта объекта показывает марку кабеля|5\.1 guest opens specification controls at desktop width|5\.13 CSV v3 export)' \
  --reporter=list \
  --output=/private/tmp/tlt-case1-browser-e2e-2026-08-04/playwright-critical
```

Результат: **2 passed, 1 failed, 9.3 s**.

- PASS: Specification controls для initialized ER на desktop (`5.1`);
- PASS: guest CSV v3 export → re-import trust roundtrip (`5.13`);
- FAIL до electrical calculation: shared `createCalculatedPipe` ожидал 201, получил 422 `{"detail":"Forbidden pipe heat params: insulation_material, insulation_thickness"}`. Helper отправляет удалённые legacy flat insulation keys вместо `insulation_layers`. Это drift E2E harness, а не самостоятельное доказательство дефекта production formula.

Первый layout launch без localhost escalation был заблокирован sandbox (`connect EPERM 127.0.0.1:8000`); authoritative результат — успешный повтор с localhost access, приведённый выше.

#### Browser artifacts

В `browser-e2e/` сохранены 11 screenshots:

- `home-desktop-1440x1000.png`;
- `home-mobile-390x844-overflow.png`;
- `guest-help-desktop-1440x1000.png`;
- `guest-help-mobile-390x844.png`;
- `guest-heat-empty-desktop-1440x1000.png`;
- `guest-heat-empty-mobile-390x844-clipped.png`;
- `electrical-empty-desktop-1440x1000.png`;
- `electrical-empty-mobile-390x844.png`;
- `specification-no-er-desktop-1440x1000.png`;
- `specification-no-er-mobile-390x844.png`;
- `electrical-input-required-desktop-1440x1000.png`.

Failure screenshot/video/trace bundles находятся в `/private/tmp/tlt-case1-browser-e2e-2026-08-04/playwright-layout/` и `/private/tmp/tlt-case1-browser-e2e-2026-08-04/playwright-critical/`.

Не покрыты браузером: populated Specification output, preflight conflict/«Исправить», section placement, honest per-section empty; успешный Electrical cable selection; Glide DnD/keyboard, candidate selector, stale/manual mark/options/per-row recalc/max-5; UI-driven download/upload; loading/retry/forced failures, long tables и NFR. Mobile routes после heat в repository layout test не были достигнуты после first failure, но отдельные no-ER states Electrical/Specification покрыты MCP.

## Итог после расширенной regression

| Gate | Result |
| --- | --- |
| Backend risk-based | **RED:** 589/595 passed, 6 reproducible failures |
| Frontend focused Spec+Guest | **GREEN:** 93/93 passed |
| Frontend repository-wide | **RED:** 1455/1467 passed, 12 failures |
| Lint / typecheck / build | **RED:** lint 2 errors; typecheck/build 4 TS errors |
| Browser MCP state matrix | **RED:** mobile home overflow, mobile heat clipping, stale Guest Help copy |
| Focused Playwright layout | **RED:** 1/2 passed |
| Focused Playwright critical | **RED:** 2/3 passed; Electrical blocked by stale shared helper |
| Console on reached MCP states | **GREEN:** 0 warnings, 0 errors |
| Guest CSV v3 trust roundtrip | **GREEN:** passed repository Playwright scenario |

**Release decision: RED / NOT READY.** Это более сильное доказательство, чем исходный static audit: compile/build gates красные, backend имеет воспроизводимый write-isolation cluster. **Mobile 390 FAIL не входит в решение** (errata §платформа выше; `viewport-policy.md` §0). In-scope: lint/build, write-isolation, desktop critical path / harness. Уверенность в NOT READY — высокая.

Минимальная последовательность recovery:

1. исправить 4 TypeScript/lint errors и вернуть production build;
2. исправить Specification write-isolation и остальные 3 backend failures;
3. закрыть исходные Spec P0: section mapping, «Исправить», owner catalog *(post-snapshot: закрыто на `01bcdf4`)*;
4. Guest Help copy *(post-snapshot: закрыто)*; **не** mobile geometry;
5. обновить shared E2E pipe fixture и повторить Electrical critical path;
6. повторить все красные suites, затем расширить **desktop** browser matrix на populated/error states (1000/1280/1440).

## Ограничения снимка

- Документ отражает конкретный `HEAD`; при изменении кода требуется новый датированный snapshot.
- `PASS (static)` не означает runtime acceptance.
- Незапущенная проверка не считается зелёной.
- Продуктовый код в рамках этого audit/regression задания не изменялся.
