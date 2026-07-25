# Heavy test files audit

**Status:** **PASS** (inventory only — no production change)  
**UTC:** 2026-07-26  
**Verified HEAD:** `82eab20` (recompute if tree moved)  
**Host:** dmitrys-MacBook-Pro.local · Darwin arm64 · Node v23.5.0  
**Scope:** `frontend/src/__tests__/**` + `e2e/tests/**`

## Commands

```bash
cd frontend
# LOC ranking
find src/__tests__ ../e2e/tests \( -name '*.ts' -o -name '*.tsx' \) \
  ! -path '*/node_modules/*' -print0 | xargs -0 wc -l | sort -n

# Classification (LOC, it/test count, harness vs ratchet vs suite)
python3 # see session inventory script: kind + split candidates
```

## Totals

| Metric | Value |
|---|---:|
| Test-related files scanned | **321** |
| `src/__tests__` files | **292** |
| `src/__tests__` disk | **~2.3M** |
| LOC ≥300 | **46** |
| LOC ≥500 | **16** |
| LOC ≥800 | **2** (1 ratchet + 1 harness) |

**Closed since P5 inventory:** monolit `HeatCalcNormalGlideGrid.test.tsx` (1473) and
`ObjectWizardDependencies.test.tsx` (1138) are **gone** (scenario split).

## Classification rules

| Kind | Meaning | Split policy |
|---|---|---|
| **unit / integration suite** | `it`/`test` present | Prefer scenario split if LOC≥500 and ≥2 clusters |
| **harness** | shared setup, **0** tests | Do **not** “split like tests”; optional extract helpers only if agent friction |
| **architecture-ratchet** | gate over tree + baseline | Prefer keep cohesive; optional helpers extract, not scenario fiction |
| **e2e** | Playwright specs | Split only by user journey / area |

## Top files (all kinds)

| LOC | its | Kind | Path | Note |
|---:|---:|---|---|---|
| **1124** | 24 | ratchet | `unit/architecture/cssArchitectureRatchet.architecture.test.ts` | largest open file; machine gate |
| **918** | 0 | harness | `unit/pages/HeatCalcPage.test-utils.tsx` | HeatCalc page factory; not a suite |
| **676** | 0 | harness | `integration/pages/electrical/elecCalcPageTestEnv.tsx` | Elec mock/env |
| **667** | 10 | e2e | `e2e/tests/electrical-candidate-selection.spec.ts` | candidate flows |
| **643** | 13 | e2e | `e2e/tests/inline-form-dependencies.spec.ts` | form dependency journeys |
| **615** | 18 | unit | `unit/pages/electrical/useElectricalVariantSelection.test.tsx` | **#1 unit split cand.** |
| **593** | 1 | e2e | `e2e/tests/heat-form-layout-split.spec.ts` | long single-flow (not multi-scenario) |
| **586** | 8 | integration | `integration/…/ElecCalcPage.cable-meta.test.tsx` | already scenario-named; dense setup |
| **582** | 22 | ratchet | `unit/architecture/inlineStyleRatchet.architecture.test.ts` | gate + fixtures |
| **581** | 5 | integration | `integration/…/ElecCalcPage.candidates.test.tsx` | high LOC/it (~116) |
| **543** | 13 | unit | `unit/pages/heatcalc/useHeatCalcObjectsDataModel.test.tsx` | heat data model |
| **542** | 9 | integration | `integration/…/ElecCalcPage.table-batch.test.tsx` | batch jobs |
| **533** | 7 | unit | `unit/…/HeatCalcNormalGlideGrid.headers-scroll.test.tsx` | post-P6 largest glide piece |
| **511** | 22 | unit | `unit/pages/electrical/ElectricalVariantTabs.test.tsx` | many small its |
| **509** | 8 | integration | `integration/…/ElecCalcPage.catalog-recalc.test.tsx` | catalog/recalc |
| **505** | 16 | unit | `unit/pages/HeatCalcPage.basics.test.tsx` | already scenario-named |

### Band ≥400 by kind

| Kind | Files | Σ LOC | Max |
|---|---:|---:|---:|
| unit | 9 | 4468 | 615 |
| integration | 6 | 3141 | 586 |
| e2e | 5 | 2736 | 667 |
| architecture-ratchet | 3 | 2111 | 1124 |
| harness | 2 | 1594 | 918 |

## Already improved (do not re-open as monolit)

| Was | Now |
|---|---|
| HeatCalcNormalGlideGrid **1473** | 4 scenario files (largest **533** headers-scroll) + harness |
| ObjectWizardDependencies **1138** | 7 scenario files + harness (largest validation-highlight **~329**) |

## Split candidates (agent context) — ranked

Priority = agent friction (open file size) × scenario cohesion × not harness/ratchet.

| Prio | LOC | its | loc/it | Path | Suggested clusters |
|---:|---:|---:|---:|---|---|
| **1** | 615 | 18 | 34 | `useElectricalVariantSelection.test.tsx` | selection vs switch vs limits / copy |
| **2** | 581 | 5 | **116** | `ElecCalcPage.candidates.test.tsx` | heavy setup per it — harness extract first, then scenarios |
| **3** | 543 | 13 | 42 | `useHeatCalcObjectsDataModel.test.tsx` | load/filter/save clusters |
| **4** | 511 | 22 | 23 | `ElectricalVariantTabs.test.tsx` | tabs UI vs keyboard vs limits |
| **5** | 586 | 8 | 73 | `ElecCalcPage.cable-meta.test.tsx` | cable mark / source / batch (already one file; optional sub-split) |
| **6** | 542 / 509 | 9 / 8 | 60 / 64 | `table-batch` / `catalog-recalc` | keep as area suites or split if next touch |
| **7** | 667 / 643 | 10 / 13 | 67 / 50 | e2e candidate-selection / inline-form | e2e journey split (qa owner) |
| — | 533 | 7 | 76 | `HeatCalcNormalGlideGrid.headers-scroll` | optional further split only if grows |
| — | 505 | 16 | 32 | `HeatCalcPage.basics` | already named; optional sub-clusters |

### Explicit non-candidates (unless user asks)

| LOC | Path | Why |
|---:|---|---|
| 1124 | cssArchitectureRatchet | single gate + shared scan; split hurts cohesion |
| 582 | inlineStyleRatchet | same |
| 918 | HeatCalcPage.test-utils | harness; extract pure factories only if needed |
| 676 | elecCalcPageTestEnv | harness / env |
| 593 | heat-form-layout-split e2e | one long flow (1 it) — not multi-scenario monolit |

## Risk notes

1. **Electrical integration** dominates heavy suites (cable-meta, candidates, table-batch, catalog). Shared env already large (**676**); more scenario files without harness discipline will multiply setup cost.
2. **High loc/it** (candidates **~116**, cable-meta **~73**, headers-scroll **~76**) = setup/boilerplate tax — often better fixed by harness extract than by more `it`s.
3. **Ratchets** inflate “top LOC” but are not user-scenario debt; count separately when scoring agent-friendliness.
4. **Harness 918** is still the #1 “file agents open by accident” risk for HeatCalc — document in README/AGENTS if needed, don’t scenario-split.

## Recommended next slices (not auto-queued)

1. **P-TEST-SPLIT-VARIANT-01** — `useElectricalVariantSelection.test.tsx` (unit, electrical)  
2. **P-TEST-HARNESS-CANDIDATES-01** — extract shared setup from `ElecCalcPage.candidates` then optional scenario split  
3. **P-TEST-SPLIT-OBJECTS-DATA-01** — `useHeatCalcObjectsDataModel.test.tsx` (heat)  
4. Optional: thin helpers from `cssArchitectureRatchet` (architecture only)

Do **not** mark backlog pending unless user promotes one slice.

## Comparison to P5 (2026-07-25)

| Then | Now |
|---|---|
| Max monolit suite **1473** | Max suite (non-ratchet/harness) **615** unit / **586** int |
| ObjectWizard **1138** monolit | scenario-split (done) |
| >700 suites: 3 | **0** suites >700 (only ratchet 1124 + harness 918) |

## Residual

- No code changes in this audit.
- HEAD recompute required before using numbers as acceptance baseline for a split slice.

---

## Follow-up execution (same day) — scenario splits landed

**Status:** **PASS** (test-only; 58/58 focused green)

| Was | After (scenario files) |
|---|---|
| `useElectricalVariantSelection.test.tsx` **616** / 18 its | `url-deep-link` 288 · `readiness-init` 247 · `lifecycle` 357 |
| `ElectricalVariantTabs.test.tsx` **512** / 22 its | `render-nav` 139 · `create-rename` 278 · `delete-limits-feedback` 167 · `readiness-errors` 204 |
| `useHeatCalcObjectsDataModel.test.tsx` **544** / 13 its | `query-scope` 401 · `rows-enums` 298 · `load-state` 269 |
| `ElecCalcPage.candidates.test.tsx` **582** / 5 its | `auto-recalc` 67 · `display` 383 · `folders` 158 |

Proof:

```bash
cd frontend
npx vitest run \
  src/__tests__/unit/pages/electrical/useElectricalVariantSelection \
  src/__tests__/unit/pages/electrical/ElectricalVariantTabs \
  src/__tests__/unit/pages/heatcalc/useHeatCalcObjectsDataModel \
  src/__tests__/integration/pages/electrical/ElecCalcPage.candidates \
  --project unit --project integration --project elec-integration
# 13 files · 58 tests · all green
```

Still heavy (unchanged this wave): harness 918/676, ratchets 1124/582, e2e 667/643,
`HeatCalcNormalGlideGrid.headers-scroll` 533, `cable-meta` ~586.
