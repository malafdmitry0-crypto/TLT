# P-BAND-17 — useObjectWizardFormSync pure mappers

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** heat  
**Production commit:** `61ef37f`  

## LOC

| File | Before | After |
|---|---:|---:|
| `components/wizard/useObjectWizardFormSync.ts` | 407 | **310** |
| `components/wizard/objectWizardFormSyncMappers.ts` | — | 173 |

## Extract

Pure mappers: climate/soil/insulation reference sync values, calc-error name
clearing, placement basis, climate-key clear, pipe material λ mode.

## Proof

```bash
npx vitest run src/__tests__/unit/components/wizard/useObjectWizardFormSync.test.tsx --project unit
# 11/11 green
```

## Browser

Not required — behavior-preserving pure extract; characterization suite green.

## Residual

- Effect orchestration remains on hook owner (under 399).
- Next Track A: P-BAND-18 useHeatCalcObjectsDataModel.
