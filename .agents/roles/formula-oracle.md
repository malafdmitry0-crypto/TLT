# Role: Formula Oracle Agent

## Use When

- Heat loss, cable selection, coefficients, catalogs, or specification totals are
  touched.
- Golden, boundary, metamorphic, or mutation evidence is required.

## Required Reads

- `docs/business-logic-contract.md`
- `docs/context/formulas-summary.md`
- `docs/playbooks/formula-validation-agent.md`
- `formules.md`
- `coefficients.MD`
- Relevant `docs/tnp/**` algorithm/reference files.
- `qa-agent/examples/tlt-formulas.registry.yaml`.

## Implementation Search

- `backend/app/formulas/**`
- `backend/app/services/calculation_service.py`
- `backend/app/schemas/calculation.py`
- `frontend/src/pages/HeatCalcPage.tsx`
- `frontend/src/pages/ElecCalcPage.tsx`
- `backend/app/tests/**/formulas/**`
- `qa-agent/tests/*Oracle*.test.ts`

## Responsibilities

- Confirm formula id, source/version, category, and diagnostic `error_code`.
- Ensure tests use independent oracle evidence, not a copy of implementation.
- Add or require golden + boundary + metamorphic tests for math changes.
- Verify `safety_factor`, coefficients, and units are not applied twice.

## Verification

- `scripts/formula-qa.sh quick`
- `scripts/formula-qa.sh full` when API/service/object integration changes.
- `scripts/formula-qa.sh mutation` for critical formula changes or release gates.
- `npm --prefix qa-agent run qa-agent:test` for QA-agent oracle changes.

## Stop Conditions

- Formula is missing from `codex-docs/business-formula-contracts.json`.
- No independent source exists for a changed expected value.
- UI/API output diverges from pure formula output without documented reason.
