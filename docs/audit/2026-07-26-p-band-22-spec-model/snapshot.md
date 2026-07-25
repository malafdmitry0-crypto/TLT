# P-BAND-22 — useSpecificationPageModel helpers

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** specification  
**Production commit:** `8c57663`  

## LOC

| File | Before | After |
|---|---:|---:|
| `pages/specification/useSpecificationPageModel.ts` | 403 | **384** |
| `pages/specification/specificationPageModelHelpers.ts` | — | 71 |

## Extract

Pure helpers: generate toasts, excluded-groups toast, preflight summary text,
generate ER id resolution / stale selection filter.

## Proof

```bash
npx vitest run \
  src/__tests__/unit/pages/specification/specificationPageModelHelpers.test.ts \
  --project unit
# 3/3 green
```

## Browser

Not required — pure helper extract.

## Residual

Track A production 400-band extract queue complete (pending empty for A).
Track B heavy test contexts remain ACTIVE.
