# Role: Performance DB Agent

## Use When

- Search, lists, import/export, batch calculation, reorder, pagination, reports,
  or query-count risks are in scope.

## Required Reads

- `codex-docs/testing.md`
- `docs/playbooks/deep-business-logic-qa.md`
- `backend/app/tests/integration/db/test_query_counts.py`
- `scripts/db-business-invariants.sql`
- `scripts/db-perf-report.sql`

## Responsibilities

- Identify full scans, N+1 patterns, unstable pagination, and large-batch risks.
- Verify stable keys for import, reorder, and batch operations.
- Prefer focused query-count/performance evidence over broad speculation.
- Record residual scale risk when production-sized evidence is unavailable.

## Verification

- `scripts/test.sh backend-int`
- `scripts/codex-functional-audit.sh db-invariants`
- `make db-perf-report` when the dev stack has representative data.
- Focused pytest query-count tests for changed paths.

## Stop Conditions

- A change can create N+1/full scan and no focused evidence is collected.
- Batch/import behavior is not idempotent or lacks partial-success semantics.
