# P-BAND-01 — useHeatCalcPreferences extract

**Status:** **PASS**  
**UTC:** 2026-07-25  
**Owner:** heat  
**Production commit:** `6cf5007`  
**BASE before:** `9d7d296`  
**Host:** dmitrys-MacBook-Pro.local · Darwin arm64 · Node v23.5.0  

## Goal

Leave `useHeatCalcPreferences.ts` out of the dense 400–445 production band
(≤399 LOC) without behavior change.

## Extract modules

| Module | Role | LOC |
|---|---|---:|
| `pages/heatcalc/heatCalcPreferencesModel.ts` | pure resolve / change detect / hydrate & guest write plans | 159 |
| `pages/heatcalc/useHeatCalcPreferenceServerSync.ts` | React Query queries + mutations | 189 |
| `pages/heatcalc/useHeatCalcPreferences.ts` | composition owner | **323** |

## LOC delta (owner)

| Stage | LOC |
|---|---:|
| Before | **445** |
| After | **323** (−122) |

## Invariants

- Public hook return shape unchanged
- Preference query keys / API / guest localStorage paths unchanged
- No UX / formula / route changes

## Focused proof

```bash
cd frontend
npx tsc --noEmit
npx vitest run \
  src/__tests__/unit/pages/heatcalc/heatCalcPreferencesModel.test.ts \
  src/__tests__/unit/pages/heatcalc/useHeatCalcColumnSettingsDialog.test.tsx \
  src/__tests__/unit/pages/heatcalc/useHeatCalcResizeModel.test.tsx \
  src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx \
  src/__tests__/unit/pages/HeatCalcPage.settings.test.tsx \
  src/__tests__/unit/pages/HeatCalcPage.basics.test.tsx \
  --project unit
# 6 files · 45 tests · green
```

## Full gate

```bash
npm run test:agent-dod
# PASS total wall ≈210.8s
```

## Browser

Not required — no visible UI change (internal hook composition only).

## Residual

- Track A continues at `P-BAND-02` (`DatabasePage.tsx`).
