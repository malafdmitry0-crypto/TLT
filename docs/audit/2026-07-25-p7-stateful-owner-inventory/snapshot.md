# P7-STATEFUL-OWNER-INVENTORY-01 (corrective complete)

**Status:** **PASS** (corrective — full classification of all band files)  
**UTC:** 2026-07-25T20:24:28Z  
**Verified HEAD (inventory base):** `6a303f8abda8bb93edb8500ac26099dfdcb79df8`  
**Worktree:** `/Users/dmalafey/Desktop/TLT-p59-closure` (branch `p59-corrective-closure`)  
**Host:** dmitrys-MacBook-Pro.local  
**OS:** Darwin arm64  
**Node:** v23.5.0  

## Commands

```bash
cd frontend
find src \( -name '*.ts' -o -name '*.tsx' \) ! -path '*/__tests__/*' -print0 \
  | xargs -0 wc -l | awk '$1>=400 && $1<=448 && $2!="total"' | sort -nr
# plus kind/effects/state classification via AST-free keyword scan
```

## Count

**25** production files in **400–448** LOC inclusive at HEAD `6a303f8` (pre-corrective P9 extract).  
None ≥449 at inventory time in spill-over check.

## Full classification (all 25)

Risk heuristic: 5 = stateful hook + effects; 4 = hook + effects; 3 = interactive component/page; 2 = pure util/domain/api/types / renderers without React state.

| Risk | LOC | Kind | Effects | React state | Path |
|---:|---:|---|---|---|---|
| 5 | 445 | hook | yes | yes | `src/pages/heatcalc/useHeatCalcPreferences.ts` |
| 5 | 401 | hook | yes | yes | `src/hooks/useHeatCalcExcelSelection.ts` |
| 5 | 412 | hook | yes | yes | `src/hooks/useHeatCalcNormalGlideController.ts` |
| 5 | 407 | hook | yes | yes | `src/components/wizard/useObjectWizardFormSync.ts` |
| 5 | 403 | hook | yes | yes | `src/pages/specification/useSpecificationPageModel.ts` |
| 4 | 406 | hook | yes | no | `src/pages/heatcalc/useHeatCalcObjectsDataModel.ts` |
| 4 | 404 | hook | yes | no | `src/pages/heatcalc/useHeatCalcWorkspaceDataModel.ts` |
| 4 | 444 | page | yes | yes | `src/pages/admin/DatabasePage.tsx` |
| 3 | 430 | component | yes | yes | `src/components/electrical/ElectricalCandidateGlideGrid.tsx` |
| 3 | 429 | component | yes | yes | `src/components/heatcalc/HeatCalcGlideGrid.tsx` |
| 3 | 409 | component | yes | yes | `src/components/electrical/ElectricalCandidateColumnSettingsModal.tsx` |
| 3 | 406 | component | yes | yes | `src/components/wizard/InsulationLayersTable.tsx` |
| 3 | 409 | page | no | yes | `src/pages/ReportWizardPage.tsx` |
| 2 | 448 | component | no | no | `src/components/admin/formulas/FormulaDisplays.tsx` |
| 2 | 447 | domain | no | no | `src/domain/heatCalcFieldRegistry.ts` |
| 2 | 443 | hook | no | no | `src/pages/electrical/useElecCalcElectricalColumnRenderers.tsx` |
| 2 | 442 | util | no | no | `src/utils/heatCalcInlineEdit.ts` |
| 2 | 437 | util | no | no | `src/utils/electricalCandidateTableColumnsCore.ts` |
| 2 | 428 | api | no | no | `src/api/calculations.ts` |
| 2 | 427 | util | no | no | `src/utils/heatCalcExcelMode.ts` |
| 2 | 423 | page | no | no | `src/pages/heatcalc/heatCalcColumnRenderers.tsx` |
| 2 | 413 | types | no | no | `src/types/calculation.ts` |
| 2 | 412 | domain | no | no | `src/domain/heatCalcFieldRules.ts` |
| 2 | 411 | hook | no | no | `src/hooks/useHeatCalcTableColumns.tsx` |
| 2 | 405 | util | no | no | `src/utils/electricalTableColumns.ts` |

## P8–P9 selection (unchanged rationale)

**Owner:** `useHeatCalcExcelSelection` (`src/hooks/useHeatCalcExcelSelection.ts`, **401 LOC at 6a303f8**)

**Why:**

- Stateful Excel selection (cell/range/drag/context menu) with clear pure seams.
- Existing unit characterization base.
- Extract target: pure nav + gesture helpers (see P8/P9 corrective audits).

**Non-goals:** preferences mega-extract, multi-hook cascade, query keys.

## Prior defect corrected

Original snapshot listed **count 25** but only **6** ranked rows. This file classifies **all 25**.
