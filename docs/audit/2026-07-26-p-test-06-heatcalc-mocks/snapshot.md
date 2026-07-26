# P-TEST-06 — HeatCalcPage.test-mocks mock clusters

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** qa  
**Production/test commit:** `f03b2df`  

## LOC

| File | LOC |
|---|---:|
| monolit (before) | 643 |
| `HeatCalcPage.test-mocks.tsx` (barrel) | 4 |
| `HeatCalcPage.test-mocks.types.ts` | 67 |
| `HeatCalcPage.test-mocks.api.ts` | 176 |
| `HeatCalcPage.test-mocks.normal-glide.tsx` | 274 |
| `HeatCalcPage.test-mocks.excel-glide.tsx` | 131 |

## Proof

```bash
npx vitest run HeatCalcPage.basics     # 16 green
npx vitest run HeatCalcPage.inline-edit HeatCalcPage.filters  # 15 green
```

Consumers still import `./HeatCalcPage.test-utils` (side-effect barrel).
