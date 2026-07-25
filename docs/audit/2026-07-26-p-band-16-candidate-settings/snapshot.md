# P-BAND-16 — ElectricalCandidateColumnSettingsModal rows

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** electrical  
**Production commit:** `5040267`  

## LOC

| File | Before | After |
|---|---:|---:|
| `ElectricalCandidateColumnSettingsModal.tsx` | 409 | **239** |
| `ElectricalCandidateColumnSettingsModalRows.tsx` | — | 185 |

## Extract

Sortable + hidden candidate column row components (mirrors ElectricalColumnSettingsModalRows).

## Proof

```bash
npx tsc --noEmit  # green
npx vitest run \
  src/__tests__/unit/pages/electrical/useElecCalcWorkspaceColumnSettingsController.test.tsx \
  src/__tests__/unit/pages/electrical/useElecCalcColumnSettingsDraftState.test.tsx \
  --project unit
```

## Browser

Not required — structure-preserving row extract; no prop contract change.

## Residual

- Window drag chrome stays on modal owner.
- Next Track A: P-BAND-17 useObjectWizardFormSync.
