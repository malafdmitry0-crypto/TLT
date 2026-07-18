# Phase 0 checkpoint — динамические именованные ЭР

Дата: 18.07.2026. Режим: `/audit-only` + `/ui-proof baseline`.
Production-код, тесты, конфигурация и DB schema не изменялись.

## 1. Ветка и worktree

- Подготовительный аудит закоммичен: `c4d9a2f` —
  `docs: add guest specification audit and dynamic ER plan`.
- Текущая ветка: `feature/tnp-dynamic-electrical-variants`.
- Phase 0 добавляет только ADR, impact matrix и curated baseline evidence.
- `.playwright-mcp/`, `tmp/` и root `tlt-recheck-*` — сырые/ранее
  существовавшие untracked artifacts; они не входят в feature commit.

## 2. Source of truth

1. PDL-ER-01…08 — явные решения пользователя.
2. Однозначные нормализованные требования PDF.
3. Для остального — действующий Business Logic Contract и профильные
   ТНП/XLSX/Markdown/machine-readable contracts.
4. SRS/API/ТЗ и код фиксируют legacy behavior и обновляются в ветке.
5. Golden нельзя менять без выбранного первичного источника.

Полная фиксация: `docs/architecture/dynamic-electrical-variants.md`.

## 3. PDL-ER-01…08

Все восемь ранее полученных решений внесены без переоткрытия:

- explicit one/many/select-all ЭР;
- order length +10% и commercial rounding;
- без прямого section editor;
- guest full automatic BOM, manual rows employee/admin-only;
- guest HTML/browser print, server exports employee/admin-only;
- `pipe/tank`, `barrel -> tank`, floor вне MVP;
- versioned project defaults + generation snapshot;
- `dтр >= 57 мм`.

## 4. Точная legacy-цепочка

```text
DB integer 1..4
  -> Pydantic/query/body variant_number
  -> calculation/query/copy/candidate/folder/task services
  -> Zustand [1,2,3,4] + СО tabs
  -> one-variant specification/report
  -> CSV schema_version=2
  -> unit/integration/e2e legacy expectations
```

Затронутые файлы и search baseline перечислены в
`docs/architecture/dynamic-electrical-variants-impact-matrix.md`.

Дополнительно доказан текущий critical cache defect: результат другого СО
может попасть в broad React Query cache, а статистика выбирает calculation с
максимальным integer. Previous-variant placeholder также смешивает экранные
данные при переключении.

## 5. Предлагаемый schema/API contract

- `electrical_variants`: UUID, project FK, name, sort order, active,
  copied-from, legacy trace, timestamps.
- `electrical_variant_objects`: unique ER/object assignment, system type,
  отдельный state, source object version и diagnostics.
- Downstream calculation/candidate/folder/spec/task/report rows получают UUID
  scope; DB не допускает cross-project ER/object links.
- Sections — отдельные persisted rows только после formula/data approval.
- Lifecycle resource: list/create/copy/rename/activate/delete.
- Assignment resource: list/bulk assign/unassign.
- Calculation/spec/report/task APIs используют UUID; multi-operation принимает
  проверенный список 1…5 UUID.
- Selected UI ER хранится в `?er=<uuid>`; active ER хранится backend.
- Query keys всегда включают exact UUID; cross-ER placeholder/write запрещён.

## 6. Migration/rollback

- Alembic head подтверждён: `0026`.
- Expand → union-slot backfill → assignments → downstream FK backfill →
  validate → NOT NULL/constraints → UUID cutover → отдельный contract phase.
- Snapshot локальной DB: 339 projects, 3561 objects; ожидается 344 variants и
  4403 assignments по текущему backfill rule.
- Пятый ЭР losslessly не возвращается в 1…4. Предложение: короткий compatibility
  window, проверенный backup/recovery point и one-way contract migration.

## 7. Phase plan / write sets

1. Phase 0 — docs/evidence only.
2. Phase 1 — DB/models/lifecycle API/tests; legacy UI adapter.
3. Phase 2 — frontend UUID state/tabs/query isolation/UI proof.
4. Phase 3 — assignments/system tabs/scoped stale cleanup.
5. Phase 4 — formula contracts/sections/hierarchy.
6. Phase 5 — spec/report/settings/CSV v3/full guest flow.
7. Phase 6 — legacy removal/docs/search/full gates.

После каждой phase — отдельный green checkpoint; giant diff запрещён.

## 8. Baseline verification

| Проверка | Результат |
|---|---|
| Backend focused calculations/specifications/reports/project-I/O, `--no-cov` | PASS |
| Frontend focused ElecCalc/Specification/Report/variant model | PASS: 4 files, 65 tests |
| `scripts/formula-qa.sh quick` | PASS |
| `scripts/codex-functional-audit.sh contracts` | PASS: 5 legacy contracts; PDF-BOM не зарегистрирован |
| `scripts/codex-functional-audit.sh db-invariants` | PASS: 11 checks, 0 violations |
| `docker exec heatcalc_backend alembic heads` | PASS: `0026 (head)` |
| Kontur static wrapper | INFRA FAIL: plugin вычисляет неверный repo root |

Before evidence снят на реальном стеке:

- desktop `1440x1000`: fixed `СО1…СО4`, no page overflow;
- mobile `390x844`: fixed `СО1…СО4`, no page overflow; action bar — локальный
  horizontal scroller;
- snapshots, geometry, screenshot, console и network сохранены в curated
  `assets/ui` и `evidence`.

Runtime baseline содержит 401/404 от stale project id перед созданием новой
guest-session, затем успешные 200; также favicon 404 и Ant Design message
context warning.

## 9. Новые blockers

Production Phase 1 не начинается до явных решений:

1. Duplicate names ЭР.
2. Сохранение или намеренное отключение действующего resistive flow.
3. Lossless state/type mapping для `mineral`/unsupported.
4. Момент создания первого `ЭР1`.
5. Copy semantics specification.
6. Atomicity multi-ЭР generation.
7. Утверждённый источник `Lmax`/пускового тока для sections.
8. Приоритет PDF/XLSX для конфликтующих BOM-формул.
9. One-way rollback/backup strategy.

Рекомендованные варианты перечислены как `OPEN-ER-01…09` в ADR. До ответа
статус: **blocked before production Phase 1**.
