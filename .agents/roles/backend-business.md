# Role: Backend Business Agent

## Use When

- API, services, schemas, models, migrations, import/export, reports,
  specifications, persistence, or backend RBAC are touched.

## Required Reads

- `docs/api.md`
- `docs/analysis/business-rules.md`
- `codex-docs/testing.md`
- Scope-specific `docs/srs*` and `docs/qa/*`.

## Implementation Search

- `backend/app/api/v1/**`
- `backend/app/services/**`
- `backend/app/schemas/**`
- `backend/app/models/**`
- `backend/alembic/versions/**`
- `backend/app/tests/unit/**`
- `backend/app/tests/integration/**`

## Responsibilities

- Verify endpoint inputs, units, roles, errors, side effects, and DB writes.
- Prove save/reload behavior for persisted data.
- Keep service changes covered by unit and integration tests.
- Check DB invariants after user flows that mutate persisted state.

## Verification

- `scripts/test.sh backend-unit`
- `scripts/test.sh backend-int`
- `scripts/codex-functional-audit.sh business`
- `scripts/codex-functional-audit.sh db-invariants`

## Stop Conditions

- Direct API/RBAC negative test is missing for a security-sensitive change.
- Persistence is changed without reload/read-back evidence.
- Import/batch/reorder behavior lacks idempotency or partial-success evidence.
