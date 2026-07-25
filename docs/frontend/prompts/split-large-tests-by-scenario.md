# Промпт: разделить крупные test-файлы по пользовательским сценариям

**Статус:** OPTIONAL residual template (qa) — не ACTIVE queue  
**Актуально на:** 2026-07-25  
**Pending authority:** только [refactor-backlog.md](../refactor-backlog.md)

## Done

- `HeatCalcNormalGlideGrid.test.tsx` → scenario files + harness (P6).
- `ObjectWizardDependencies.test.tsx` → scenario files +
  `ObjectWizardDependencies.test-harness.tsx` (DOC residual fix):
  - layout-defaults
  - lazy-references
  - validation-highlight
  - climate-cable-refs
  - placement-visibility
  - payload-fields
  - visibility-matrix

## Remaining candidates (optional)

| Файл | Notes |
|---|---|
| `HeatCalcPage.test-utils.tsx` (~918) | harness-only; split only if agent friction |
| `cssArchitectureRatchet.architecture.test.ts` (~1124) | machine gate; helpers extract optional |
| `inlineStyleRatchet.architecture.test.ts` (~582) | machine gate |

## Rules (if user activates another split)

1. Поведение тестов неизменно: те же `it(...)` titles, asserts, mocks.
2. Один файл = один пользовательский сценарий / cluster.
3. Harness не регистрирует tests.
4. Исходный монолит удалить после переноса.
5. Не менять production, baselines, package.json.
6. Naming: `<Subject>.<scenario>.test.tsx`.
