# P-BAND-08 — calculations API electrical batch group extract

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** shared  
**Production commit:** `57a7ef6`  

## LOC

| File | Before | After |
|---|---:|---:|
| `api/calculations.ts` | 428 | **212** |
| `api/electricalBatchCalc.ts` | — | 244 |

## Extract

Batch/enqueue/select-cable/variant-copy endpoints + `ElectricalBatchOptions` / cable types.

## Invariants

- `@/api/calculations` re-exports preserve public symbols (`SelectionPolicy`, `batchCalcElectrical`, …).
- Payload shapes / routes / idempotency keys unchanged.

## Proof

```bash
npm run typecheck  # clean (WIP stories parked for gate)
npm run test:agent-dod  # PASS wall ≈239.3s
```

## Browser

Not required — API module split only.
