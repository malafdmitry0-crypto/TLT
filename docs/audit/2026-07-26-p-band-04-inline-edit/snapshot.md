# P-BAND-04 — heatCalcInlineEdit draft model extract

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** heat  
**Production commit:** `47b6776`  
**Host:** dmitrys-MacBook-Pro.local · Darwin · Node v23.5.0  

## LOC

| File | Before | After |
|---|---:|---:|
| `utils/heatCalcInlineEdit.ts` | 442 | **322** |
| `utils/heatCalcInlineEditDraftModel.ts` | — | 146 |

## Extract

Pure draft-row helpers: create/dirty/param conversion, value equality, error field normalization.

## Proof

```bash
cd frontend
npx vitest run src/__tests__/unit/utils/heatCalcInlineEdit.test.ts --project unit
# 20/20 green
npm run test:agent-dod  # PASS wall ≈239.3s (batch with other pure extracts)
```

## Browser

Not required — pure util extract; no visible UI change.

## Residual

- Public API via `@/utils/heatCalcInlineEdit` unchanged (types + projection re-exports).
