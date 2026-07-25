# P-BAND-12 — heatCalcFieldRules visibility extract

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** heat  
**Production commit:** `3679a69`  

## LOC

| File | Before | After |
|---|---:|---:|
| `domain/heatCalcFieldRules.ts` | 412 | **254** |
| `domain/heatCalcFieldVisibilityRules.ts` | — | 192 |

## Extract

Visibility rule tables, insulation temperature basis helpers, layer/range field groups.
Validation / normalize / apply remain on owner; public exports re-exported.

## Proof

```bash
npx vitest run \
  src/__tests__/unit/utils/heatCalcFieldRules.test.ts \
  src/__tests__/unit/domain/heatCalcFieldVisibilityRules.test.ts \
  --project unit
# green
npm run test:agent-dod  # PASS wall ≈239.3s
```

## Browser

Not required — pure domain extract.
