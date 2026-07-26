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

## Remaining

**None** — Track B P-TEST-01..08 closed 2026-07-26 (see `refactor-backlog.md`
EMPTY QUEUE). New splits only by explicit user goal.

### Closed this wave (P-TEST-01..08)

| ID | Notes |
|---|---|
| P-TEST-01 | catalog-recalc scenario split |
| P-TEST-02 | HeatCalc basics scenario split |
| P-TEST-03 | ReportPage scenario split |
| P-TEST-04 | inlineStyleRatchet helpers extract |
| P-TEST-05 | elecCalcPageTestEnv thin harness |
| P-TEST-06 | HeatCalcPage.test-mocks clusters |
| P-TEST-07 | electrical-candidate-selection e2e journeys |
| P-TEST-08 | inline-form-dependencies e2e journeys |

## Rules (if user activates another split)

1. Поведение тестов неизменно: те же `it(...)` titles, asserts, mocks.
2. Один файл = один пользовательский сценарий / cluster.
3. Harness не регистрирует tests.
4. Исходный монолит удалить после переноса.
5. Не менять production, baselines, package.json.
6. Naming: `<Subject>.<scenario>.test.tsx`.
