# P-TEST-01 — ElecCalcPage.catalog-recalc scenario split

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** qa  
**Production/test commit:** `b6c7672`  

## LOC

| File | LOC |
|---|---:|
| monolit (removed) | 509 |
| `…catalog-recalc.variant-copy.test.tsx` | 124 |
| `…catalog-recalc.cable-type-batch.test.tsx` | 217 |
| `…catalog-recalc.cable-mark-ui.test.tsx` | 192 |

**its:** 8/8 preserved

## Proof

```bash
npx vitest run ElecCalcPage.catalog-recalc --project elec-integration
# 3 files · 8 tests · green
```
