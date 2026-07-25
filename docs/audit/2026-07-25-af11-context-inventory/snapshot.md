# AF11-CONTEXT-INVENTORY-01

**HEAD:** `faa6aabccc8988151cd112b9ebf66ccd83345bf0`  
**UTC:** 2026-07-25T02:16:51Z  
**Environment:** local macOS, frontend package Vitest/TypeScript  
**Slice:** read-only inventory (production patch deferred to CONTEXT-NEXT / SPEC-*)

## Method

```bash
# production TS/TSX, exclude __tests__, count LOC (JS splitlines), imports, hooks
```

## Count

**15 production files with LOC ≥ 450** (planning seed said 14 in 450–498; live includes one at 450).

## Ranked candidates (priority: multi-effect orchestration first)

| Rank | LOC | Imports | useEffect | useState | useCallback | File | Owner | First seam | Proof |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | 499 | 15 | 3 | 1 | 0 | `pages/specification/useSpecificationPageModel.ts` | specification | query/session → items → generation | SpecificationPage + model unit |
| 2 | 498 | 12 | 0 | 0 | 0 | `pages/electrical/useElecCalcElectricalColumnRenderers.tsx` | electrical | renderer families | column renderer unit |
| 3 | 491 | 16 | 5 | 0 | 2 | `pages/heatcalc/useHeatCalcObjectsDataModel.ts` | heat | query/load session vs projection | heat data model unit |
| 4 | 484 | 4 | 0 | 0 | 0 | `utils/heatCalcInlineEdit.ts` | heat | draft state vs form projection | heatCalcInlineEdit.test |
| 5 | 483 | 1 | 0 | 2 | 0 | `components/ui-kit/UiPrimitives.tsx` | ui | primitive families + public barrel | UIKitLibrary tests |
| 6 | 483 | 17 | 0 | 0 | 0 | `hooks/useHeatCalcTableColumns.tsx` | heat | assembly vs cell render adapters | useHeatCalcTableColumns.test |
| 7 | 475 | 11 | 4 | 5 | 21 | `hooks/useHeatCalcNormalGlideController.ts` | heat | editor/filter/resize owners | HeatCalcNormalGlide tests |
| 8 | 468 | 7 | 0 | 4 | 13 | `hooks/useElectricalVariantCommandsController.ts` | electrical | mutation transport vs commands | ElectricalVariantTabs tests |
| 9 | 464 | 18 | 0 | 0 | 0 | `pages/heatcalc/useHeatCalcInteractionController.ts` | heat | named workspace slices | interaction controller unit |
| 10 | 460 | 8 | 0 | 0 | 0 | `utils/heatCalcPageUtils.ts` | heat | query/filter vs formatters | heatCalcPageUtils.test |
| 11 | 457 | 11 | 2 | 2 | 16 | `components/heatcalc/HeatCalcGlideGrid.tsx` | heat | pure adapter vs React shell | HeatCalcGlideGrid tests |
| 12 | 457 | 1 | 0 | 0 | 0 | `utils/objectWizardFormMappers.ts` | heat | form→API vs API→form (partial already) | objectWizardUtils.test |
| 13 | 454 | 11 | 3 | 4 | 11 | `components/electrical/ElectricalCandidateGlideGrid.tsx` | electrical | overlay state vs grid adapter | ElectricalCandidateGlideGrid tests |
| 14 | 452 | 4 | 0 | 0 | 0 | `components/electrical/cablePickerCharacteristicsModel.ts` | electrical | object vs cable fields | CablePickerCharacteristics.test |
| 15 | 450 | 9 | 3 | 2 | 0 | `components/electrical/ElectricalCandidateColumnSettingsModal.tsx` | electrical | rows already extracted; remaining chrome | column settings tests |

## Cohesive registry note

- `UiPrimitives.tsx`, `heatCalcPageUtils.ts`, `cablePickerCharacteristicsModel.ts`, `objectWizardFormMappers.ts` may be **cohesive pure registries** — split by family still helps agent navigation but coupling is lower than orchestration hooks.

## Exit for AF11 Context DoD

No production TS/TSX `>=450` LOC after CONTEXT-NEXT / SPEC extracts.

## Next

Execute extracts starting with `useSpecificationPageModel` (query/session → items → generation), then remaining inventory rows.
