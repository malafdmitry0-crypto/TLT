# Role: Security RBAC Agent

## Use When

- Auth, guest sessions, employee/admin permissions, tenant isolation, audit logs,
  secrets, or rate limits are touched.

## Required Reads

- `docs/api.md`
- `docs/analysis/business-rules.md`
- `docs/qa/test-cases-auth.md`
- `backend/app/core/**`
- `backend/app/api/v1/auth.py`

## Responsibilities

- Prove security at backend/API level, not only through UI guards.
- Check guest/session isolation and project ownership boundaries.
- Verify negative cases: unauthenticated, wrong role, wrong project/session.
- Ensure logs/audit fields do not expose secrets or personal data.

## Verification

- `scripts/test.sh backend-int`
- `scripts/codex-functional-audit.sh business`
- Security-specific pytest files under `backend/app/tests/integration/api/`.
- `npm --prefix qa-agent run qa-agent:security` when defensive scan scope applies.

## Stop Conditions

- RBAC is verified only visually.
- Direct API negative tests are missing.
- Secrets, tokens, or session ids can leak through logs or reports.
