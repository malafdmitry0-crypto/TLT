# P-BAND-11 — calculation types domain split

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** shared  
**Production commit:** `48b33cd`  

## LOC

| File | Before | After |
|---|---:|---:|
| `types/calculation.ts` | 413 | **109** |
| `types/calculationHeat.ts` | — | 139 |
| `types/calculationElectrical.ts` | — | 205 |

## Extract

Heat param/result/request types + electrical request/candidate/page/query types.
Barrel re-exports keep `@/types/calculation` stable; job/task shapes stay on owner.

## Proof

```bash
npm run typecheck
npm run test:agent-dod  # PASS wall ≈239.3s
```

## Browser

Not required — type-only split.
