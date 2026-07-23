# S0-lite execution status

> Архивный status snapshot завершённого этапа.

**Выполнено:** 2026-07-23  
**Скоуп:** factory gates only (no Heat geometry migration).

## Delivered

| Item | Status |
|---|---|
| `npm run test:architecture` | ✅ exists + green (10 tests) |
| `npm run test:s0-gates` | ✅ added + green (15 tests) |
| `npm run test:ui-kit` | ✅ added + green (9 tests) |
| e2e `test:ui-kit-parity` / `:chrome` | ✅ scripts in `e2e/package.json` |
| [pr-budget.md](../pr-budget.md) | ✅ |
| [metrics-baseline.md](./metrics-baseline.md) | ✅ |
| styles.css freeze documented | ✅ css-strategy + pr-budget |
| architecture test pointer → docs/frontend | ✅ |

## Baseline (2026-07-23)

| Metric | Value |
|---|---:|
| ElecCalcPage LOC | 1936 → **1787** (slices 6–7) |
| HeatCalcPage LOC | 1046 → **993** (slices 3–5; pure presentation) |
| SpecificationPage LOC | 1005 |
| styles.css LOC | 6777 |
| inverted components→pages | 3 → **0** |

## Proof commands run

```bash
cd frontend && npm run test:s0-gates    # 15 passed
cd frontend && npm run test:ui-kit      # 9 passed
cd e2e && E2E_BASE_URL=http://127.0.0.1:3003 npm run test:ui-kit-parity:chrome
```

## Explicitly NOT done (next slice)

- Heat geometry → CompactField
- ElecCalc shell extract
- CSS mass extract from styles.css

## First refactor slice (after S0) — 2026-07-23

| Item | Status |
|---|---|
| Parity e2e label height (kit 26px → natural) | ✅ compact-fields label min-height fixed |
| Pure elec models → `domain/electrical/` | ✅ 5 models + re-export stubs in pages/ |
| inverted components→pages | **3 → 1** (only Sidebar left) |
| Proof: s0-gates, model units, parity e2e | ✅ |

## Slice 2 — Sidebar invert → 0 (2026-07-23)

| Item | Status |
|---|---|
| `useLegacyElectricalVariantContext` → `hooks/` | ✅ |
| Sidebar imports hooks (not pages) | ✅ |
| re-export stub under pages/electrical | ✅ |
| architecture allowlist | **empty** |
| inverted components→pages | **0** |

## Slice 3 — Heat shell extract (reorder + draft ids) — 2026-07-23

| Item | Status |
|---|---|
| pure `changedDraftRowIds` → `heatCalcDraftRowsModel.ts` | ✅ |
| `useHeatCalcObjectReorder` (PDF-HEAT-08 DnD) | ✅ |
| HeatCalcPage wired; local helpers removed | ✅ |
| unit tests (6) | ✅ |
| HeatCalcPage LOC | **1046 → 1007** |

## Slice 4 — Heat continue→electrical extract — 2026-07-23

| Item | Status |
|---|---|
| pure readiness/tooltip/block messages | ✅ `heatCalcContinueToElectricalModel` |
| hook PDF-HEAT-10 init + navigate | ✅ `useHeatCalcContinueToElectrical` |
| HeatCalcPage `renderTypeBar` thinned | ✅ |
| unit tests (10) | ✅ |
| HeatCalcPage LOC | **1007 → 986** |

## Slice 5 — Heat pure presentation (save + counts) — 2026-07-23

| Item | Status |
|---|---|
| `buildHeatCalcToolbarSavePresentation` | ✅ |
| `buildHeatCalcTableCounts` | ✅ |
| unit tests (8) | ✅ |
| HeatCalcPage LOC | **986 → 993** (named pure args; logic moved out) |

## Slice 6 — Elec assignment/selection orchestration — 2026-07-23

| Item | Status |
|---|---|
| `electricalAssignmentVersionsMap` + warning constant | ✅ scope model |
| `useElecCalcAssignmentSelectionState` | ✅ projection, scope, selection effects |
| unit tests (9) | ✅ |
| ElecCalcPage LOC | **1936 → 1879** (−57) |

## Slice 7 — Elec object modals + Glide layout commit — 2026-07-23

| Item | Status |
|---|---|
| `useElecCalcObjectActionModals` | ✅ mark/sizing open/close gates |
| `useElecCalcGlideLayoutCommit` | ✅ editability + commit mutate |
| unit tests (8) | ✅ |
| ElecCalcPage LOC | **1879 → 1787** (−92) |

## Next

**Очередь и автономия:** [autonomous-continuation-plan.md](./autonomous-continuation-plan.md)

1. Первый pending: **E8** (Elec cable type options)
2. Пока Elec > 1200 — только Track E (до 3 slice за «продолжай»)
3. Не спрашивать «что дальше» — брать следующий `pending`
