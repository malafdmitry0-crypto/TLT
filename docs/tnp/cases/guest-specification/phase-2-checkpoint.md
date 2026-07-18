# Functional Accuracy Report — Dynamic ER Phase 2

Дата: 18.07.2026

Ветка: `feature/tnp-dynamic-electrical-variants`

Статус: **PASS — frontend/consumer Phase 2 complete**

Статус общего PDF/DoD и product release: **NOT COMPLETE**

## Scope

Phase 2 переводит пользовательский lifecycle и переходных consumers с
фиксированных `СО1…СО4` на именованные project-scoped UUID ЭР:

- список, создание, копирование, inline rename, activate и delete до пяти ЭР;
- selected/active state и deep link `?er=<uuid>`;
- UUID query/cache identity для calculation/candidate/cable/spec/report данных;
- строгая проверка `expected UUID ↔ legacy slot` до чтения или записи;
- явный fail-closed state пятого ЭР вместо подстановки данных другого варианта;
- loading/error/retry/read-only states и доступная навигация вкладок;
- desktop/mobile UI proof, console/network evidence и DB invariants.

Heating assignments, section formulas, полный UUID-only data plane, multi-ЭР
specification wizard и CSV v3 не входят в Phase 2.

## Docs checked

- `AGENTS.md`, `.agents/routing.yaml`, профиль frontend/UI QA;
- `codex-docs/README.md`, `project-map.md`, `requirements-map.md`, `testing.md`;
- `codex-docs/business-formula-contracts.json`;
- `docs/srs.md`, `docs/srs/`, `docs/tz-compliance.md`;
- `docs/analysis/business-rules.md`, `docs/api.md`, `docs/qa/`;
- `product-decisions.md`, `pdf-requirements.md`, ADR и Phase 0/1 checkpoints.

## Implementation found

### Backend

- `backend/app/services/electrical_variant_service.py` — project-scoped
  lifecycle, read/write ownership, UUID↔slot precondition и stable
  `ELECTRICAL_VARIANT_SCOPE_MISMATCH`.
- `backend/app/api/v1/calculations.py`, `specifications.py`, `reports.py` —
  expected UUID проводится через переходные numeric endpoints.
- `backend/app/schemas/calculation.py` — UUID trace для одиночных и batch
  запросов.
- `backend/app/services/project_service.py` и object/lifecycle endpoints —
  readiness и консистентное project summary.

### Frontend

- `frontend/src/api/electricalVariants.ts`, `electricalQueryKeys.ts` — UUID
  lifecycle API и единая cache identity.
- `frontend/src/pages/electrical/ElectricalVariantTabs.tsx` — доступные
  именованные tabs, inline rename, create/copy/delete, limit 5 и mobile scroll.
- `useElectricalVariantSelection.ts`, `useLegacyElectricalVariantContext.ts` —
  authoritative URL selection, reconciliation и fail-closed legacy bridge.
- `ElecCalcPage.tsx`, `SpecificationPage.tsx`, `ReportPage.tsx` и API clients —
  UUID проходит через calculation/spec/report/candidate/cable flows.
- background batch/report orchestration фиксирует UUID snapshot и не допускает
  смешивания результатов после переключения ЭР.

### Tests

- `ElecCalcPage.test.tsx` — lifecycle, max-5, copy/delete, fifth fail-closed,
  read-only и consumer isolation.
- `ElectricalVariantTabs.test.tsx` — ARIA tabs, keyboard/focus, rename,
  long-name title и scroll-to-selected.
- focused API/query/store/hook tests — UUID cache keys, selection recovery,
  stale responses и batch/report scope.
- backend stale-slot integration oracle — удалённый UUID не может читать или
  изменять повторно использованный legacy slot.

## Verification

| Команда / проверка | Результат |
|---|---|
| Backend focused dynamic-ER integration/schema suites | **PASS** |
| Stale UUID + reused slot integration oracle | **PASS:** stable 409, доменная запись не изменена |
| Focused Ruff по изменённому backend | **PASS** |
| `npm --prefix frontend run typecheck` | **PASS** |
| `npm --prefix frontend run build` | **PASS** |
| Focused `ElecCalcPage` + `ElectricalVariantTabs` Vitest | **PASS: 77/77** |
| Full frontend Vitest | **NOT GREEN: 1033 passed, 1 failed** — только прежний `HeatCalcPage.settings.test.tsx:321` |
| Isolated failing HeatCalc settings test | **FAIL reproduced:** accessible separator отсутствует; файл вне Phase 2 diff |
| `scripts/codex-functional-audit.sh db-invariants` после UI flow | **PASS: 28 checks, 0 violations** |
| Desktop `1440×1000`, 1 и 5 ЭР | **PASS:** нет page overflow/clipping/overlap; выбранный tab полностью видим |
| Mobile `390×844`, 5 ЭР | **PASS:** только локальный tab scroll; full accessible long name; нет page overflow |
| Invalid UUID deep link | **PASS:** URL и selection reconciled к authoritative active ЭР |
| Delete confirmation | **PASS:** перечисляет assignment/calculation/cable/candidate/folder/spec последствия |
| Browser console | **PASS: 0 errors, 0 warnings** |
| Browser network | **PASS:** UUID присутствует в lifecycle и direct consumer запросах |
| `scripts/codex-functional-audit.sh docs` после sync | **PASS:** docs up to date, manifest facts OK |

UI evidence: [каталог Phase 2](evidence/phase-2-ui/), включая
[desktop с пятью ЭР](evidence/phase-2-ui/after-five-er-desktop.png),
[mobile с длинным именем](evidence/phase-2-ui/after-five-er-mobile.png),
[delete confirmation](evidence/phase-2-ui/delete-confirm-mobile.png),
[invalid URL recovery](evidence/phase-2-ui/invalid-url-reconciled-mobile.png),
[console](evidence/phase-2-ui/after-console.txt) и
[network](evidence/phase-2-ui/after-network.txt).

## Findings

1. Противоречие `ЭР1…ЭР5` против fixed `СО1…СО4` закрыто для lifecycle/UI и
   переходных direct consumers.
2. Число слота больше не является cache identity или единственным scope:
   UUID authoritative, а legacy number валиден только вместе с точной
   project-scoped UUID mapping.
3. Пятый ЭР не выдаётся за расчётно готовый: неподдержанный legacy data plane
   блокируется явно и не показывает данные ЭР1…ЭР4.
4. Общий PDF-контракт ещё не выполнен: assignment workflow и section/BOM
   формулы относятся к следующим фазам.

## Residual risk

- Phase 3 pending: assignment/unassign API, UI tabs и authoritative
  calculation→assignment transitions.
- Phase 4 blocked PDL-ER-15/18: отсутствует официальный числовой каталог для
  heating sections и BOM oracle.
- Phase 5 pending: полный UUID-only graph, пятый расчётный ЭР, multi-ЭР
  specification/report и CSV v3.
- Full frontend gate остаётся красным из-за существующего separator defect вне
  dynamic-ER diff; dependency security и общий Alembic metadata drift также
  остаются release blockers.
