# P-BAND-19 — InsulationLayersTable outer rows

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** heat  
**Production commit:** `ec34232`  

## LOC

| File | Before | After |
|---|---:|---:|
| `components/wizard/InsulationLayersTable.tsx` | 406 | **246** |
| `components/wizard/InsulationOuterLayerRow.tsx` | — | 211 |

## Extract

Configurable outer-layer row (layers 2–3): material / thickness / λ / temp range.

## Proof

```bash
npx vitest run \
  src/__tests__/integration/components/ObjectWizardDependencies.visibility-matrix.test.tsx \
  --project integration -t 'слоёв изоляции'
# green
```

## Browser

Not required — structure-preserving row extract; wizard isolation integration green.

## Residual

- Layer-1 ThermalStep still co-located on owner.
- Next: P-BAND-21 useHeatCalcWorkspaceDataModel (P-BAND-20 already done).
