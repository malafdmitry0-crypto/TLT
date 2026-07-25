# P-BAND-15 — ReportWizardPage step extract

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** reports  
**Production commit:** `498dfe8`  

## LOC

| File | Before | After |
|---|---:|---:|
| `pages/ReportWizardPage.tsx` | 409 | **264** |
| `pages/ReportWizardSidebarSteps.tsx` | — | 190 |
| `pages/reportWizardFormats.tsx` | — | 19 |

## Extract

- Format label/icon map
- Left-column step panels (sections / format / export summary)

## Proof

```bash
npx vitest run \
  src/__tests__/integration/pages/ReportWizardPage.test.tsx \
  src/__tests__/unit/components/reports/ReportWizard.test.tsx \
  --project integration --project unit
# 4/4 green
npx tsc --noEmit  # green
```

## Browser

Not required — structure-preserving step extract; integration covers export/navigation.

## Residual

- Gate screens + preview column remain on page owner.
- Next Track A: P-BAND-16 ElectricalCandidateColumnSettingsModal.
