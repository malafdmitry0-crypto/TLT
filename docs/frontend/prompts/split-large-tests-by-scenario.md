# Промпт: разделить крупные test-файлы по пользовательским сценариям

**Статус:** OPTIONAL residual template (qa) — не ACTIVE queue  
**Актуально на:** 2026-07-25  
**Pending authority:** только [refactor-backlog.md](../refactor-backlog.md)

## Done

- `HeatCalcNormalGlideGrid.test.tsx` → scenario files + harness (P6).
- `ObjectWizardDependencies.test.tsx` → scenario files + harness.
- **2026-07-26 heavy-test wave** (see `docs/audit/2026-07-26-heavy-test-files/`):
  - `useElectricalVariantSelection` → url-deep-link / readiness-init / lifecycle
  - `ElectricalVariantTabs` → render-nav / create-rename / delete-limits-feedback / readiness-errors
  - `useHeatCalcObjectsDataModel` → query-scope / rows-enums / load-state
  - `ElecCalcPage.candidates` → auto-recalc / display / folders

## Remaining candidates (optional)

| Файл | Notes |
|---|---|
| `HeatCalcPage.test-utils.tsx` (~918) | harness-only; split only if agent friction |
| `elecCalcPageTestEnv.tsx` (~676) | harness/env |
| `cssArchitectureRatchet.architecture.test.ts` (~1124) | machine gate; helpers extract optional |
| `inlineStyleRatchet.architecture.test.ts` (~582) | machine gate |
| `ElecCalcPage.cable-meta` / `table-batch` / e2e specs | next wave if needed |
| `HeatCalcNormalGlideGrid.headers-scroll` (~533) | only if grows further |

## Rules (if user activates another split)

1. Поведение тестов неизменно: те же `it(...)` titles, asserts, mocks.
2. Один файл = один пользовательский сценарий / cluster.
3. Harness не регистрирует tests.
4. Исходный монолит удалить после переноса.
5. Не менять production, baselines, package.json.
6. Naming: `<Subject>.<scenario>.test.tsx`.
