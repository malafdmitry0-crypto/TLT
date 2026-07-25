# P-BAND-20 — electricalTableColumns widths extract

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** electrical  
**Production commit:** `8958e4c`  

## LOC

| File | Before | After |
|---|---:|---:|
| `utils/electricalTableColumns.ts` | 405 | **387** |
| `utils/electricalTableColumnWidths.ts` | — | 35 |

## Extract

Width base/min/max constants + clamp / pct↔px helpers; re-exported from owner.

## Proof

```bash
npx vitest run \
  src/__tests__/unit/utils/electricalTableColumns.test.ts \
  src/__tests__/unit/utils/electricalTableColumnWidths.test.ts \
  --project unit
# green
npm run test:agent-dod  # PASS wall ≈239.3s
```

## Browser

Not required — pure util extract.

## Residual

- Catalog + storage + mutators still co-located on owner (under 399).
