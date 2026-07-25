# P-BAND-06 — ElectricalCandidateGlideGrid data adapters

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** electrical  
**Production commit:** `83e4c08`  

## LOC

| File | Before | After |
|---|---:|---:|
| `components/electrical/ElectricalCandidateGlideGrid.tsx` | 430 | **367** |
| `components/electrical/electricalCandidateGlideAdapters.ts` | — | 115 |
| `components/electrical/useOutsidePointerDismiss.ts` | — | 31 |

## Extract

- Pure Glide data adapters: editor columns, cell content, row theme, theme fonts, header filter hit zone, header control visibility.
- Outside-pointer / Escape dismiss hook for filter popup + action menu (shared within owner).
- Owner keeps grid chrome (DataEditor wiring, draw callbacks, overlay JSX).

## Proof

```bash
npx vitest run \
  src/__tests__/unit/components/ElectricalCandidateGlideGrid.test.tsx \
  src/__tests__/unit/components/electricalCandidateGlideAdapters.test.ts \
  --project unit
# 7/7 green
npx tsc --noEmit  # green
```

## Browser

Not required — behavior-preserving extract; existing unit characterization covers
cell content, mark toggle, actions/folder menu, sort/filter header wiring.

## Residual

- Header canvas draw path still co-located on owner (under 399).
- Next Track A: P-BAND-07 `HeatCalcGlideGrid.tsx`.
