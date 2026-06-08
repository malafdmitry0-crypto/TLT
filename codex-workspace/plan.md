# Codex Core Functional Accuracy Plan

Scope: local markdown board
Mode: fix_focused
Generated: 2026-06-03T21:23:35.430Z

## Docs To Check
- [exists] AGENTS.md - Repo-level evidence protocol, routing, stop conditions and report format.
- [exists] .agents/routing.yaml - Primary role and verification mode routing.
- [exists] .agents/roles/functional-accuracy.md - Functional accuracy lead responsibilities and verification gates.
- [exists] codex-docs/README.md - Working documentation navigation and source-of-truth map.
- [exists] codex-docs/project-map.md - TLT architecture, product flow and important contracts.
- [exists] codex-docs/requirements-map.md - Requirement sources, current implementation boundaries and traceability rules.
- [exists] codex-docs/testing.md - Minimum verification command selection by change type.
- [exists] codex-docs/business-formula-contracts.json - Machine-readable docs -> formula -> API -> UI -> tests matrix.
- [exists] codex-docs/functional-accuracy-agent.md - Functional accuracy audit playbook.
- [exists] docs/srs.md - Top-level product requirements and acceptance expectations.
- [exists] docs/api.md - API contract, roles, persistence and side effects.
- [exists] docs/analysis/business-rules.md - Business rules and implementation references.
- [exists] docs/qa/README.md - QA scenario catalog and automation coverage entry point.
- [exists] docs/srs/01-user-stories.md - User stories and acceptance criteria.
- [exists] docs/srs/02-use-cases.md - Formal user flows and postconditions.
- [exists] docs/srs/03-elements-list.md - Screens, fields, units, tables and entity contracts.
- [exists] docs/srs/04-validation.md - Input validation and error expectations.
- [exists] docs/srs/05-functional-nonfunctional.md - Formal functional and non-functional requirements.
- [exists] docs/srs/06-test-program.md - Acceptance test program.
- [exists] docs/srs/07-report-requirements.md - Report composition, role-specific exports and CO variant expectations.
- [exists] docs/tz-compliance.md - Current TЗ compliance status, blockers and automated evidence summary.

## Implementation Search
- documentation: rg -n "local markdown board" docs codex-docs formules.md coefficients.MD
  Reason: Find the requirement or explicitly mark it as undocumented.
- backend: rg -n "local markdown board" backend/app/api/v1 backend/app/services backend/app/schemas backend/app/models backend/app/formulas
  Reason: Find API endpoints, service behavior, schemas, models and formulas.
- frontend: rg -n "local markdown board" frontend/src/pages frontend/src/components frontend/src/api frontend/src/store frontend/src/hooks
  Reason: Find UI workflow, payload shaping and client-side state.
- tests: rg -n "local markdown board" backend/app/tests frontend/src e2e/tests qa-agent/tests
  Reason: Find existing unit, integration, e2e and agent tests.

## Verification Commands
- qa-agent-typecheck: npm --prefix qa-agent run typecheck
  Reason: The Codex-core scaffold is TypeScript and must compile before use.
- qa-agent-test: npm --prefix qa-agent test
  Reason: Focused tests prove the planning layer remains deterministic.
- contracts: scripts/codex-functional-audit.sh contracts
  Reason: Contract matrix verifies docs -> formula -> API -> UI -> tests traceability for critical functions.

## Draft Findings
- none

## Ticket Drafts
- FA-local-markdown-board-001 [high] Build evidence chain for local markdown board
  Status: triage
  Verify: qa-agent-typecheck, qa-agent-test, contracts
- FA-local-markdown-board-002 [medium] Close test coverage gaps for local markdown board
  Status: triage
  Verify: qa-agent-typecheck, qa-agent-test, contracts

## Functional Accuracy Report Template

```text
Functional Accuracy Report
Scope: local markdown board
Docs checked:
- AGENTS.md
- .agents/routing.yaml
- .agents/roles/functional-accuracy.md
- codex-docs/README.md
- codex-docs/project-map.md
- codex-docs/requirements-map.md
- codex-docs/testing.md
- codex-docs/business-formula-contracts.json
- codex-docs/functional-accuracy-agent.md
- docs/srs.md
- docs/api.md
- docs/analysis/business-rules.md
- docs/qa/README.md
- docs/srs/01-user-stories.md
- docs/srs/02-use-cases.md
- docs/srs/03-elements-list.md
- docs/srs/04-validation.md
- docs/srs/05-functional-nonfunctional.md
- docs/srs/06-test-program.md
- docs/srs/07-report-requirements.md
- docs/tz-compliance.md
Implementation found:
- Backend: ...
- Frontend: ...
- Tests: ...
Verification:
- qa-agent-typecheck
- qa-agent-test
- contracts
Findings:
- ...
Residual risk:
- Is the requirement undocumented or ambiguous?
- Do frontend payload units match backend schemas?
- Is persistence/reload evidence required for this scope?
- Does a formula result need independent golden/metamorphic/boundary evidence?
- Does UI proof require before/after screenshots?
```
