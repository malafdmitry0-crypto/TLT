# AF12 typecheck-clean scenario re-split (pilot)

**UTC:** 2026-07-25  
**Status:** **DONE** (pilot only — two monolit families)  
**BASE_HEAD before WIP:** `e45b83f`

## Problem

Waves 1–5 scenario splits left shared preambles → `noUnusedLocals` typecheck failures.  
Monolithes were restored (`e45b83f`) so agent-gates stayed green.

## Approach (pilot)

1. Split monolit by **scenario** into focused `*.test.ts` files.
2. Move shared helpers into a **harness** module that exports only used symbols (no tests registered).
3. Each scenario file imports only what it needs → typecheck-clean.

## Delivered

### `objectWizardUtils` (was 1 monolit)

| File | Role |
|---|---|
| `objectWizardUtils.defaults.test.ts` | defaults |
| `objectWizardUtils.form-roundtrip.test.ts` | form roundtrip |
| `objectWizardUtils.naming.test.ts` | naming |
| `objectWizardUtils.pipe-form-api.test.ts` | pipe form ↔ API |
| `objectWizardUtils.tank-form-api.test.ts` | tank form ↔ API |
| ~~`objectWizardUtils.test.ts`~~ | **deleted** monolit |

### `heatCalcExcelMode` (was 1 monolit)

| File | Role |
|---|---|
| `heatCalcExcelMode.test-harness.ts` | shared helpers only |
| `heatCalcExcelMode.columns.test.ts` | columns |
| `heatCalcExcelMode.draft-rows.test.ts` | draft rows |
| `heatCalcExcelMode.errors.test.ts` | errors |
| `heatCalcExcelMode.parse.test.ts` | parse |
| `heatCalcExcelMode.selection.test.ts` | selection |
| ~~`heatCalcExcelMode.test.ts`~~ | **deleted** monolit |

## Proof

- `npx tsc --noEmit -p tsconfig.json` → exit 0 (on WIP tree)
- Sequential `npm run test:agent-dod` ×2 green after re-split complete (see AF12-DOD-REPEATABILITY-01)
- Pattern ready to extend to other large monolit unit files without repeating noUnusedLocals regressions

## Residual

Other large monolithes (page suites, etc.) not re-split in this pilot. Extend only with harness pattern + typecheck gate.
