# P-BAND-05 — electrical candidate column catalog extract

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** electrical  
**Production commit:** `ab5c088`  

## LOC

| File | Before | After |
|---|---:|---:|
| `utils/electricalCandidateTableColumnsCore.ts` | 437 | **257** |
| `utils/electricalCandidateTableColumnCatalog.ts` | — | 202 |

## Extract

Service columns, priority order, width map, and registry→candidate catalog projection.

## Proof

```bash
npx vitest run src/__tests__/unit/utils/electricalCandidateTableColumns.test.ts --project unit
# 5/5 green
npm run test:agent-dod  # PASS wall ≈239.3s
```

## Browser

Not required — pure util extract.

## Residual

- Settings mutators remain in core; public barrel `electricalCandidateTableColumns` unchanged.
