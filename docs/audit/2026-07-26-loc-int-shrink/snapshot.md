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
| This wave n=2 | **280.9 s** | (loaded host) | 264.9 concurrent |

**Interpretation:** LOC ceiling cleared. Wall runs **regressed under load** (197–281 s) vs prior 143.7 s — scenario fan-out duplicates suite setup tax; dual-safe workers thrash when host is busy. Target ≤120 needs **harness extract** (share setup, keep thin scenario files) and quiet-host n≥3, not more monolit fan-out alone.

## Browser re-seal

**BLOCKED** — Docker daemon unavailable.

## Proof

- `npm run test:agent-gates` PASS
- focused suites green (Specification, inline-edit, glide-modals, css/dependency ratchets)
- dual-safe PASS (wall not ≤120)
