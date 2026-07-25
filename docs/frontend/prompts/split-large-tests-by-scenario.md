# Промпт: разделить крупнейшие test-файлы по пользовательским сценариям

**Статус:** ACTIVE slice (qa owner)  
**Дата:** 2026-07-25  
**Цель:** снизить размер test-файлов без изменения поведения тестов.

## Scope

Только тесты (без production):

| Исходный файл | LOC | Owner |
|---|---|---|
| `frontend/src/__tests__/unit/components/HeatCalcNormalGlideGrid.test.tsx` | ~1473 | heat |
| `frontend/src/__tests__/integration/components/ObjectWizardDependencies.test.tsx` | ~1138 | heat/wizard |

Architecture ratchets (`cssArchitectureRatchet`, `inlineStyleRatchet`) **не** трогать — это не user scenarios.

## Правила

1. **Поведение тестов неизменно:** те же `it(...)` titles, asserts, mocks.
2. **Один файл = один пользовательский сценарий / cluster** (не utility-группа).
3. Общий harness (mocks, fixtures, `render*`) — в `*.test-harness.ts(x)` рядом; harness **не** регистрирует tests.
4. Исходный монолитный файл удалить после переноса (нет dual path).
5. Не менять production, baselines, package.json.
6. Naming: `<Subject>.<scenario>.test.tsx` (точка, kebab/lowercase scenario).
7. Proof: focused vitest на новые файлы; при touch integration — `npm run test:agent-dod` если затронуты gates.

## Целевой split

### HeatCalcNormalGlideGrid

| Файл | Сценарий пользователя |
|---|---|
| `HeatCalcNormalGlideGrid.basics.test.tsx` | открытие формы с ячейки, adapter state, draft invalidate, stretch width |
| `HeatCalcNormalGlideGrid.paint-theme.test.tsx` | theme/font, active/error row paint, cell actions, status badge |
| `HeatCalcNormalGlideGrid.selection.test.tsx` | checkbox/focus/Ctrl/Shift selection без смены form semantics |
| `HeatCalcNormalGlideGrid.inline-edit.test.tsx` | inline editor в normal mode |
| `HeatCalcNormalGlideGrid.table-view.test.tsx` | sort/filter header, infinite load, column resize |
| `HeatCalcNormalGlideGrid.test-harness.tsx` | mocks + rows + default props |

### ObjectWizard (integration)

| Файл | Сценарий пользователя |
|---|---|
| `ObjectWizard.layout-defaults.test.tsx` | wide/side layout, defaults трубы/резервуара |
| `ObjectWizard.validation.test.tsx` | подсветка/required/backend validation |
| `ObjectWizard.references-lazy.test.tsx` | lazy climate/soil, climate UI, material modal, λ text |
| `ObjectWizard.placement-fields.test.tsx` | placement/underground, Q_доп, L_ekv, wall, soil λ |
| `ObjectWizard.visibility-matrix.test.tsx` | visibility matrices + multi-layer insulation payload |
| `ObjectWizard.test-harness.tsx` | mocks + renderWizard + fixtures |

## Stop

- Менять assertions «заодно»
- Смешивать unit и integration harness
- Дробить architecture ratchets
- Менять query keys / feature code

## DoD

- [x] Монолиты удалены
- [x] Все `it` titles сохранены (24 Glide + 37 Wizard = 61)
- [x] Focused tests green (`vitest` 10 files / 61 tests)
- [x] Нет orphan imports / dual files

## Execution note (2026-07-25)

Vitest: `vi.mock` for `@/api/references` must be in each ObjectWizard `*.test.tsx`;
HeatCalc harness is imported first (mocks), SUT imported after. Do not export
`vi.hoisted` bindings directly.

### Wave 2 (electrical)

| Source | Split into |
|---|---|
| `useElectricalVariantSelection.test.tsx` (~615) | `url-selection` / `readiness` / `lifecycle` + harness |
| `ElecCalcPage.candidates.test.tsx` (~581) | `auto-recalc` / `rows-actions` / `folders` (shared elec harness) |
| `ElecCalcPage.cable-meta.test.tsx` (~579) | `brand-modal` / `source-type` / `inline-batch` |

Proof wave 2: 31 tests green.

### Wave 3

| Source | Split into |
|---|---|
| `objectWizardUtils.test.ts` (~566) | naming / pipe-form-api / tank-form-api / form-roundtrip / defaults |
| `heatCalcExcelMode.test.ts` (~554) | parse / columns / selection / draft-rows / errors + harness |
| `useHeatCalcObjectsDataModel.test.tsx` (~543) | query-scope / rows-model / load-state + harness |
| `ElecCalcPage.table-batch.test.tsx` (~542) | permissions / display-status / pagination / batch-actions |
| `ElectricalVariantTabs.test.tsx` (~511) | chrome / lifecycle-edit / delete-limit / readiness + harness |
| `HeatCalcPage.basics.test.tsx` (~505) | chrome / object-type / toolbar / load-state |

Proof wave 3: **124** tests green (25 files). Architecture ratchets not split.

### Wave 4

| Source | Split into |
|---|---|
| `ElecCalcPage.catalog-recalc` (~509) | copy-lifecycle / catalog / recalculation / mark-ui |
| `ReportPage` (~470) | empty-guest / export-print / composition / scope-uuid |
| `client` (~461) | guest-recovery / network-retry / project-403 / async-jobs |
| `heatCalcInlineEdit` (~458) | field-mapping / placement-tm / draft-model / validation-errors / save-projection |
| `SpecificationPage` (~445) | empty-content / er-scope / permissions |
| `HeatCalcPage.inline-edit` (~426) | normal-mode / excel-mode / draft-highlight / user-settings-api |
| `HeatCalcPage.settings` (~416) | columns / layout / calc-details |

Proof wave 4: **84** tests green (27 files). Architecture ratchets still not split.

### Wave 5

| Source | Split into |
|---|---|
| `useElecCalcCandidateMutationFlow` (~399) | candidates / folders / readonly |
| `HeatCalcPage.project-isolation` (~396) | normal / excel / selection |
| `heatCalcPageUtils` (~385) | status-errors / query-filters / format |
| `useObjectWizardFormSync` (~379) | required-errors / name-suggest / derived-refs |
| `useElecCalcCableSelectionMutationFlow` (~368) | selection / layout / modal / readonly |
| `ElecCalcPage.glide-modals` (~365) | settings-ui / table-query / mark-modal |
| `useHeatCalcDraftSaveModel` (~345) | save-success / invalid-fail / selection-scope |
| `heatCalcExcelRows` (~340) | local-rows / cache / delete-reset / draft-helpers |
| `EditableTableCell` (~337) | chrome-state / editor / excel-context |
| `useElectricalBatchJobTracker` (~332) | concurrent / invalidate / recovery / terminal |

Proof wave 5: **86** tests green (33 files).
