# P5-TEST-CONTEXT-INVENTORY-01

**Status:** **PASS**  
**UTC:** 2026-07-25  
**BASE_HEAD:** `3bbe468` (queue open) / work on subsequent commits  

## Commands

```bash
cd frontend
find src/__tests__ \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 wc -l | sort -n
```

## Test files >700 LOC

| LOC | Path | Class | Risk | Split candidate |
|---:|---|---|---|---|
| **1473** | `unit/components/HeatCalcNormalGlideGrid.test.tsx` | unit / component | monolit scenarios; shared Glide mock | **YES — P6 pick** |
| 1138 | `integration/components/ObjectWizardDependencies.test.tsx` | integration | dependency matrix; heavier than unit | later |
| 1124 | `unit/architecture/cssArchitectureRatchet.architecture.test.ts` | architecture gate | helpers + many cases; split lowers cohesion of single ratchet | avoid unless needed |
| 918 | `unit/pages/HeatCalcPage.test-utils.tsx` | **harness** (no tests) | shared HeatCalc page setup | not a test suite |

## Near-miss 600–700

| LOC | Path |
|---:|---|
| 676 | `integration/pages/electrical/elecCalcPageTestEnv.tsx` (env harness) |
| 615 | `unit/pages/electrical/useElectricalVariantSelection.test.tsx` |

## P6 recommendation

**Split `HeatCalcNormalGlideGrid.test.tsx`** into scenario files + harness fixtures:

- rendering
- painting-edit
- selection
- headers-scroll

Mocks stay per-file (`vi.hoisted` cannot be exported from harness); `rows` fixture in harness.

## SAFE NEXT

`P6-TEST-CONTEXT-SPLIT-01` on HeatCalcNormalGlideGrid only.
