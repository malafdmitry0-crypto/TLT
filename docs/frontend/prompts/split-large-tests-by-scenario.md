# Промпт: разделить крупные test-файлы по пользовательским сценариям

**Статус:** template for backlog Track B (`P-TEST-*`)  
**Актуально на:** 2026-07-26  
**Pending authority:** только [refactor-backlog.md](../refactor-backlog.md)
(Track B after Track A unless user names a test slice).

## Done

- `HeatCalcNormalGlideGrid.test.tsx` → scenario files + harness (P6).
- `ObjectWizardDependencies.test.tsx` → scenario files + harness.
- **2026-07-26 heavy-test wave** (see `docs/audit/2026-07-26-heavy-test-files/`):
  - `useElectricalVariantSelection` → url-deep-link / readiness-init / lifecycle
  - `ElectricalVariantTabs` → render-nav / create-rename / delete-limits-feedback / readiness-errors
  - `useHeatCalcObjectsDataModel` → query-scope / rows-enums / load-state
  - `ElecCalcPage.candidates` → auto-recalc / display / folders
- **2026-07-26 five-fixes wave:** cable-meta, table-batch, headers-scroll,
  cssArchitectureRatchet helpers, HeatCalcPage.test-utils barrel.

## Remaining (queued in backlog Track B)

| ID | Файл | Notes |
|---|---|---|
| P-TEST-01 | `ElecCalcPage.catalog-recalc.test.tsx` (~509) | scenario split |
| P-TEST-02 | `HeatCalcPage.basics.test.tsx` (~507) | scenario sub-clusters |
| P-TEST-03 | `ReportPage.test.tsx` (~481) | scenario split |
| P-TEST-04 | `inlineStyleRatchet.architecture.test.ts` (~582) | helpers extract |
| P-TEST-05 | `elecCalcPageTestEnv.tsx` (~676) | harness thin / fixtures |
| P-TEST-06 | `HeatCalcPage.test-mocks.tsx` (~643) | mock clusters |
| P-TEST-07 | e2e `electrical-candidate-selection.spec.ts` (~667) | journey split |
| P-TEST-08 | e2e `inline-form-dependencies.spec.ts` (~643) | journey split |

## Rules (if user activates another split)

1. Поведение тестов неизменно: те же `it(...)` titles, asserts, mocks.
2. Один файл = один пользовательский сценарий / cluster.
3. Harness не регистрирует tests.
4. Исходный монолит удалить после переноса.
5. Не менять production, baselines, package.json.
6. Naming: `<Subject>.<scenario>.test.tsx`.
