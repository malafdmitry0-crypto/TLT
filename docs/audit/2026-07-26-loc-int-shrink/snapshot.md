# LOC cap ceiling + int/unit scenario shrink

**Status:** **PARTIAL** — LOC ceiling **>400 = 0**; dual-safe wall **PASS but not ≤120** (host variance)  
**UTC:** 2026-07-26  
**Prior HEAD:** `a9b4cb3` dual-safe **143.7 s**  
**This wave:** LOC program + scenario splits for wall

## LOC cap

| Metric | Before wave | After |
|---|---:|---:|
| Files >400 | 6 | **0** |
| Files >350 | 19 | **12** |
| Files ≥500 | 0 | **0** |

### Split this wave

| Area | Change |
|---|---|
| SpecificationPage | empty-display + er-scope-write |
| HeatCalcPage.inline-edit | table-excel + prefs-api |
| ElecCalcPage.glide-modals | settings-filters + mark-modals |
| cssArchitectureRatchet gate | freeze / responsive-order / metrics-fixtures |
| dependencyRatchet | helpers extract + thin suite |
| e2e cable-business-flows | layout-glide / cable-types / catalog-spec-path |
| e2e heat-excel-mode | selection-edit / draft-defaults-menu |

Remaining >350 (all ≤399): heat-form inspect-dom 399, project-isolation 396, ui-kit-parity 396, heatCalcPageUtils 385, glide selection/painting 384, candidates.display 382, form-sync 379, headers-scroll 377, query-scope 372, rendering 365, lifecycle 356.

## Dual-safe wall

| Run | Total | unit | int |
|---|---:|---:|---:|
| Prior (a9b4cb3) | **143.7 s** | 112.2 | 130.6 |
| This wave n=1 | **197.0 s** | 146.8 | 183.5 |

**Interpretation:** scenario splits improved open-cost (LOC) but **duplicated setup** can raise concurrent wall under worker caps. Target ≤120 still needs harness extract (shared setup, not more monolit→N full env copies) on int long poles. Re-run wall n≥2 for variance.

## Browser re-seal

**BLOCKED** — Docker daemon unavailable.

## Proof

- `npm run test:agent-gates` PASS
- focused suites green (Specification, inline-edit, glide-modals, css/dependency ratchets)
- dual-safe PASS (wall not ≤120)
