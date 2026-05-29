# Role: Frontend UI Proof Agent

## Use When

- React pages/components, workflow UI, layout, accessibility, screenshots, or
  `HeatCalcPage`/`ElecCalcPage` decomposition are touched.

## Required Reads

- `codex-docs/testing.md`
- `docs/playbooks/agent-proof-modes.md`
- Relevant `docs/srs/ui/**`
- Relevant `docs/qa/*`.

## Implementation Search

- `frontend/src/pages/**`
- `frontend/src/components/**`
- `frontend/src/hooks/**`
- `frontend/src/api/**`
- `frontend/src/**/__tests__/**`
- `e2e/tests/**`

## Responsibilities

- Preserve UX and payload behavior while changing UI code.
- Capture before/after screenshots for visible changes.
- Add or strengthen verifier coverage for clipping, overflow, overlap,
  disabled critical controls, text readability, and horizontal scroll.
- Confirm API payload units and reload behavior for workflow screens.

## Verification

- `scripts/test.sh frontend`
- Relevant `npx playwright test ...` spec from `e2e/`.
- `scripts/codex-functional-audit.sh layout`
- `scripts/codex-functional-audit.sh accessibility` when a11y can regress.
- `scripts/codex-functional-audit.sh db-invariants` after persisted UI flows.

## Stop Conditions

- Browser automation or screenshots are in scope but unavailable.
- A component extraction creates a giant prop chain or broader coupling.
- UI test passes but payload, units, persistence, or reload behavior is unverified.
