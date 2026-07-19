# TLT QA Agent

`qa-agent` is a minimal TypeScript SDK/CLI for documentation-driven QA of
frontend/backend applications with mathematical formulas, deterministic oracles
and optional LLM-assisted semantic checks.

It does not replace the existing TLT gates:

- `scripts/codex-functional-audit.sh`
- `scripts/formula-qa.sh`
- backend `pytest`
- Playwright `e2e/tests`
- Postgres DB invariants

Instead, it adds a programmable agent core that can later call those gates or
specialized TLT adapters.

## Architecture

```text
Documentation Parser
        ↓
Requirement Extractor
        ↓
Formula / Algorithm Registry
        ↓
Test Case Generator
        ↓
Reference Oracle
        ↓
App Runner
   ┌────┴────┐
Frontend   Backend
   ↓          ↓
Result Normalizer
        ↓
Deterministic Comparator
        ↓
LLM Semantic Judge
        ↓
Report Generator
```

## What Is Working

- Codex-core planner for local evidence-driven work: scope -> docs to read ->
  rg searches -> verification commands -> Markdown tickets -> Markdown board.
- Markdown documentation parser.
- LLM-isolated requirement extractor interface.
- YAML/JSON formula and algorithm registries.
- Explicit pipeline hook for loading registries before test generation.
- Formula oracle with whitelisted deterministic functions.
- Numeric comparator with absolute/relative tolerance.
- Mock app runner for local vertical slice.
- Backend HTTP API runner.
- Playwright frontend runner skeleton, guarded by `QA_AGENT_E2E=1`.
- JSON report generator.
- HTML report generator.
- TLT registry for formulas/algorithms discovered in `backend/app/formulas`.
- Backend endpoint catalog for `/api/v1/admin/formula-check`, `/api/v1/calc/*` and specifications.
- Deterministic TLT primitive oracles for pipe/tank/electrical subformulas and selection algorithms.
- Unit tests for comparator, formula oracle, algorithm oracle and pipeline.
- Working example that writes JSON and HTML reports.

## Full-Version QA Scope

- Full pipe/tank/electrical calculations are catalogued, but not all are independent oracles yet.
  The agent must not treat backend implementation code as the only source of truth.
- `AlgorithmOracle` implements selected TLT algorithms, but catalog-heavy flows still need
  explicit fixtures or external reference tables.
- `LlmRequirementExtractor` is implemented behind `LlmClient`, but tests use mocks only.
- Frontend runner is intentionally not executed by unit tests.

## Why LLM Is Not Source Of Truth

LLM is only allowed for:

- extracting requirements from documentation;
- proposing edge cases;
- semantic comparison of text/UI messages;
- explaining and grouping failures.

Numerical correctness is decided by deterministic oracle + deterministic
comparator. The LLM judge is skipped for deterministic numeric pass/fail.

## Codex Core Planner

`src/codex-core/` is the local operating layer for the larger system we are
building around Codex. It does not use Jira, GitHub issues, Linear or other
external trackers. It prepares the local Markdown work package for a functional
accuracy task:

- required TLT documentation and current availability;
- implementation searches for docs, backend, frontend, database and tests;
- minimum verification commands;
- draft findings when required sources are missing;
- local Markdown tickets and board columns;
- a `Functional Accuracy Report` template.

Run:

```bash
npm run qa-agent:codex-core -- --scope="pipe heat loss formula"
```

By default the command writes local artifacts into the ignored report folder:

- `reports/codex-core/plan.md`
- `reports/codex-core/tickets.md`
- `reports/codex-core/board.md`

Use `QA_AGENT_CODEX_CORE_SCOPE` or `--scope="..."` to change the feature scope.
Use `QA_AGENT_CODEX_CORE_OUTPUT_DIR` only when an explicit alternate local output
directory is needed; generated planner artifacts are not documentation sources.
Set `QA_AGENT_CODEX_CORE_WRITE_JSON=1` only if a machine-readable debug artifact
is explicitly needed.

## Add A Formula

Add an entry to `examples/requirements.example.yaml` or another registry file:

```yaml
formulas:
  - id: circle_area
    expression: "area = pi * r ** 2"
    variables: [r]
    output: area
    tolerance:
      absoluteTolerance: 0.000000001
      relativeTolerance: 0.000000001
    constraints:
      - "r >= 0"
```

Then register a deterministic function in `FormulaOracle`. Do not use unsafe
`eval`.

For TLT formulas use `examples/tlt-formulas.registry.yaml`. Each entry can include:

- `sourceRefs`: docs or source sections that define the formula.
- `implementationRefs`: backend files that implement it.
- `backendEndpoint`: endpoint metadata for backend runner tests.
- `oracle.status`: `implemented`, `external_reference_required`, `app_endpoint_only` or `not_implemented`.
- `engineeringReview`: notes about likely business-logic risks.

Current independent TLT primitives include outdoor alpha, pipe effective length,
cylindrical/external/ground resistance, no-double-K electrical handoff
primitives, tank surface areas, tank flat-wall external resistance, tank
heat-flux primitive, self-reg cable length, TT power curve and resistive
rho/cross-section primitives. `AlgorithmOracle` also includes the TNP climate
`K`/temperature rule, max winding coefficient, inclusive TT series limits,
tank cable length geometry, the passport-resistance resistive oracle
`R/P/I/65A`, and full-version resistive `tlt_resistive_vsdx_auto_select`
for `U/N/M`, `p2/p3`, `L1/L2` with fallback limits.

## Add A Backend Endpoint

Create a test case with backend metadata:

```json
{
  "id": "backend-compound-interest",
  "requirementId": "compound_interest",
  "kind": "fixed",
  "input": { "P": 1000, "r": 0.05, "n": 12, "t": 10 },
  "metadata": {
    "runner": "backend",
    "endpoint": "/api/v1/example/compound-interest",
    "resultPath": "value"
  }
}
```

`BackendApiRunner` sends `POST baseUrl + endpoint`, stores status code/raw
response and returns a structured error if `endpoint` is missing.

For admin formula checks, set `metadata.backendFormulaType`; the runner wraps the
input as `{ formula_type, params }`:

```yaml
metadata:
  endpoint: /api/v1/admin/formula-check
  backendFormulaType: tank_cable_geometry
  resultPath: cable_length
```

Real TLT endpoint mappings are listed in:

- `examples/tlt-backend-endpoints.example.json`
- `src/runners/TltBackendEndpointMappings.ts`

The formula/algorithm inventory with engineering review is in
`docs/tlt-formula-algorithm-inventory.md`.

## Add A Frontend Scenario

Use Playwright metadata:

```yaml
metadata:
  runner: frontend
  url: /calculator
  actions:
    - { type: fill, selector: "[data-testid='radius-input']", valueFromInput: r }
    - { type: click, selector: "[data-testid='calculate']" }
  resultSelector: "[data-testid='result']"
```

The runner is disabled in unit tests. Set `QA_AGENT_E2E=1` for real browser use.

## Configure LLM Provider

`OpenAiCompatibleClient` reads:

- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`

Tests use `MockLlmClient`; no real LLM calls are made during unit tests.
Real requirement extraction is disabled unless both are true:

- command includes `--llm-extract`;
- `QA_AGENT_ENABLE_LLM=1`.

Example controlled run:

```bash
QA_AGENT_ENABLE_LLM=1 npm run qa-agent:llm-extract
```

This writes extracted requirements to `reports/llm-requirements.json` by
default. Do not use this output as numeric truth; it is input for review and
registry/test generation.

## JSON Report

The report contains:

- `summary`: total/pass/fail/needsReview counts;
- `results`: expected, actual, deterministic comparison and optional LLM judge;
- `groupedFailures`: failures grouped by deterministic reason;
- `metadata`: run metadata and timestamp.

`HtmlReportGenerator` can render the same report shape to a standalone HTML file
for failure triage. Use it from custom runners by passing an output path to the
constructor.

## Commands

```bash
npm install
npm run typecheck
npm run qa-agent:test
npm run qa-agent:example
npm run qa-agent:tlt-ai-cases
npm run qa-agent:visual
npm run qa-agent:app-tests
npm run qa-agent:security
npm run qa-agent:llm-extract
```

The example writes:

```text
qa-agent/reports/qa-agent-example-report.json
qa-agent/reports/qa-agent-example-report.html
```

## TLT AI/Domain Heat-Loss Cases

`qa-agent:tlt-ai-cases` is the first real domain QA slice for pipe and tank
heat-loss calculations.

It can:

- generate realistic pipe/tank cases through an LLM;
- fall back to deterministic built-in fixtures when LLM is disabled;
- sanitize cases to backend-compatible SI-unit params;
- run baseline and metamorphic variants;
- check invariants such as:
  - thicker insulation lowers heat loss;
  - higher process temperature raises heat loss;
  - higher safety factor raises total heat loss without changing linear/surface heat loss;
  - longer pipe raises total heat loss without changing heat loss per meter;
- write JSON and HTML reports.

Default local run, no network or LLM:

```bash
npm run qa-agent:tlt-ai-cases
```

LLM case generation:

```bash
QA_AGENT_ENABLE_LLM=1 \
LLM_API_KEY=... \
LLM_MODEL=... \
npm run qa-agent:tlt-ai-cases
```

Live backend formula-check runner:

```bash
QA_AGENT_TLT_RUNNER=backend \
QA_AGENT_BACKEND_BASE_URL=http://127.0.0.1:8000 \
QA_AGENT_ADMIN_EMAIL=admin@example.com \
QA_AGENT_ADMIN_PASSWORD=... \
npm run qa-agent:tlt-ai-cases
```

or pass an already issued token:

```bash
QA_AGENT_TLT_RUNNER=backend \
QA_AGENT_AUTH_TOKEN=... \
npm run qa-agent:tlt-ai-cases
```

Reports are written to:

```text
qa-agent/reports/qa-agent-tlt-ai-cases-report.json
qa-agent/reports/qa-agent-tlt-ai-cases-report.html
```

The LLM is only allowed to generate scenarios. It is not the numeric source of
truth. Numeric correctness is checked by deterministic runners and invariant
checks.

## Visual QA With Screenshots

`qa-agent:visual` captures screenshots with Playwright at multiple viewport
sizes and sends those images to an LLM vision model for structured UI review.

Default viewports:

- `desktop:1440x900`
- `tablet:1024x768`
- `mobile:390x844`

Run:

```bash
QA_AGENT_ENABLE_LLM=1 \
LLM_API_KEY=... \
LLM_MODEL=... \
QA_AGENT_VISUAL_BASE_URL=http://127.0.0.1:3003 \
npm run qa-agent:visual
```

Useful options:

```bash
QA_AGENT_VISUAL_URLS="/,/login,/workspace"
QA_AGENT_VISUAL_VIEWPORTS="desktop:1440x900,tablet:1024x768,mobile:390x844"
QA_AGENT_VISUAL_WAIT_MS=1000
QA_AGENT_VISUAL_FULL_PAGE=1
```

Outputs:

```text
qa-agent/reports/screenshots/*.png
qa-agent/reports/qa-agent-visual-report.json
qa-agent/reports/qa-agent-visual-report.html
```

The LLM checks visible UX defects only: clipped text, overlaps, unreadable
controls, broken responsive layout, blank regions, hidden primary actions,
unexpected horizontal overflow and similar visual regressions.

## Application Test Agent

`qa-agent:app-tests` runs application test commands and writes a JSON/HTML
report. It can also ask an LLM to propose missing regression tests.

Default commands:

- `backend` -> `make test-backend`
- `frontend` -> `make test-frontend`

Run selected suites:

```bash
QA_AGENT_APP_TESTS="backend,frontend,e2e" \
npm run qa-agent:app-tests
```

For a quick smoke of the QA-agent itself:

```bash
QA_AGENT_APP_TESTS="qa-agent" npm run qa-agent:app-tests
```

Generate test proposals when failures or coverage gaps are found:

```bash
QA_AGENT_APP_TESTS="backend,frontend" \
QA_AGENT_GENERATE_TESTS=1 \
QA_AGENT_ENABLE_LLM=1 \
LLM_API_KEY=... \
LLM_MODEL=... \
npm run qa-agent:app-tests
```

By default generated tests are written as proposal files under:

```text
qa-agent/reports/generated-tests/
```

Direct repo writes are guarded:

```bash
QA_AGENT_ALLOW_TEST_WRITES=1 npm run qa-agent:app-tests
```

Even with direct writes enabled, proposals are allowed only under:

- `backend/app/tests/`
- `frontend/src/__tests__/`
- `e2e/tests/`
- `qa-agent/tests/`

Existing files are not overwritten unless `QA_AGENT_OVERWRITE_TESTS=1` is set.

## Local Defensive Security Agent

`qa-agent:security` runs local-only defensive security checks and writes a
JSON/HTML report. It is for the local TLT stack only; dynamic checks reject
non-local targets.

Default checks:

- `codebase-subagent` -> read-only heuristic codebase scanner;
- `backend-sast` -> Bandit inside `heatcalc_backend`;
- `backend-deps` -> pip-audit inside `heatcalc_backend`;
- `frontend-sast` -> eslint security rules inside `heatcalc_frontend`;
- `frontend-deps` -> npm audit inside `heatcalc_frontend`.

Run:

```bash
npm run qa-agent:security
```

Select checks:

```bash
QA_AGENT_SECURITY_SCANS="codebase-subagent,backend-sast,backend-deps,frontend-sast,frontend-deps,qa-agent-deps,e2e-deps" \
npm run qa-agent:security
```

The codebase subagent is in-process and read-only. It scans bounded roots,
skips generated/heavy directories, caps findings, redacts secret-like evidence,
and passes heuristic issues to the main security agent for optional LLM triage.

Known findings can be suppressed through `qa-agent/audit-baseline.json`:

```json
{
  "version": 1,
  "entries": [
    {
      "id": "rule:file:line",
      "status": "accepted_risk",
      "reason": "Local-only default, tracked separately",
      "expiresAt": "2026-12-31"
    }
  ]
}
```

Supported baseline statuses are `accepted_risk`, `false_positive`, `todo`, and
`fixed`. Expired entries are reported as `needs_review`.

Optional confirming probes:

```bash
QA_AGENT_AUDIT_PROBES=1 \
QA_AGENT_AUDIT_PROBE_HTTP=1 \
QA_AGENT_SECURITY_TARGET=http://127.0.0.1:3003 \
npm run qa-agent:security
```

Probes are safe and local-only. The HTTP probe currently checks common browser
security headers; the static probe summarizes active codebase findings for
triage.

Optional performance budgets:

```bash
QA_AGENT_PERFORMANCE_BUDGETS=1 \
QA_AGENT_PERF_MAX_AVG_LATENCY_MS=500 \
QA_AGENT_PERF_MAX_MAX_LATENCY_MS=2000 \
QA_AGENT_PERF_MAX_ERROR_RATE=0.05 \
npm run qa-agent:security
```

When enabled, the agent evaluates bounded local load results against configured
budgets. If no load result exists yet, it runs a small local bounded probe.

Optional metrics coverage audit:

```bash
QA_AGENT_METRICS_AUDIT=1 npm run qa-agent:security
```

The metrics audit is read-only and heuristic. It checks whether import,
heat-loss, electrical, report, and worker operation groups have detectable
metric signals.

Optional audit extensions:

```bash
QA_AGENT_AUDIT_LIFECYCLE=1 \
QA_AGENT_AUDIT_RECIPES=1 \
QA_AGENT_REGRESSION_PLAN=1 \
QA_AGENT_OWNERSHIP_PLAN=1 \
QA_AGENT_SCENARIO_PACKS=1 \
QA_AGENT_CONTRACT_DRIFT=1 \
QA_AGENT_UI_WORKFLOWS=1 \
QA_AGENT_BUSINESS_AUDIT=1 \
npm run qa-agent:security
```

What these add:

- lifecycle memory through `qa-agent/reports/audit-history.jsonl`;
- confirmation recipes for known finding categories;
- regression-test proposals by owner/framework;
- ownership/fix-size/test-command planning;
- reusable scenario packs such as `large-project-3000`, `guest-isolation`, and
  `import-export-roundtrip`;
- contract drift checks across backend schemas, frontend types, JSON field
  configs, and import/export services;
- UI workflow definitions with screenshot checkpoints;
- lightweight business correctness invariant audit.

Optional performance trend storage:

```bash
QA_AGENT_PERFORMANCE_BUDGETS=1 \
QA_AGENT_PERF_TRENDS=1 \
QA_AGENT_PERF_SCENARIO=objects-query-smoke \
npm run qa-agent:security
```

Trend records are appended to `qa-agent/reports/perf-history.jsonl`; a run is
marked `needs_review` if average latency regresses by more than 25% against the
previous record for the same scenario.

Audit journal:

```bash
QA_AGENT_AUDIT_JOURNAL=1 npm run qa-agent:security
```

The journal is enabled by default and appends JSONL records to
`qa-agent/reports/audit-journal.jsonl`. It stores active findings, confirmation
recipes, regression-test proposals, ownership plans, and a run summary. Disable
it with `QA_AGENT_AUDIT_JOURNAL=0`; override the path with
`QA_AGENT_AUDIT_JOURNAL_PATH=...`.

Optional flakiness detector:

```bash
QA_AGENT_FLAKINESS=1 \
QA_AGENT_FLAKINESS_TESTS=qa-agent \
QA_AGENT_FLAKINESS_REPEATS=3 \
npm run qa-agent:security
```

This repeats a selected existing test command and classifies it as
`stable_pass`, `stable_fail`, `flaky`, or `timeout_sensitive`.

Optional bounded local resilience/rate-limit smoke:

```bash
QA_AGENT_SECURITY_SCANS="local-load" \
QA_AGENT_SECURITY_TARGET=http://127.0.0.1:3003 \
QA_AGENT_SECURITY_LOAD_CONCURRENCY=2 \
QA_AGENT_SECURITY_LOAD_DURATION_MS=10000 \
npm run qa-agent:security
```

The load smoke is capped in code: local targets only, max concurrency 8, max
duration 30 seconds, max 500 requests.

Optional local OWASP ZAP baseline:

```bash
QA_AGENT_SECURITY_SCANS="zap-baseline" \
QA_AGENT_SECURITY_TARGET=http://127.0.0.1:3003 \
npm run qa-agent:security
```

Optional LLM triage of scan output:

```bash
QA_AGENT_SECURITY_REVIEW=1 \
QA_AGENT_ENABLE_LLM=1 \
LLM_API_KEY=... \
LLM_MODEL=... \
npm run qa-agent:security
```

Optional fix handoff mode:

```bash
QA_AGENT_AUDIT_FIX=1 \
QA_AGENT_AUDIT_FIX_DOMAIN=security \
npm run qa-agent:security
```

Fix mode only prepares an isolated `qa/audit/<domain>-fixes-*` branch and
writes a handoff file. Supported domains are `security`, `performance`, and
`metrics`. It does not auto-commit and does not apply destructive changes.

Outputs:

```text
qa-agent/reports/qa-agent-security-report.json
qa-agent/reports/qa-agent-security-report.html
qa-agent/reports/qa-agent-audit-fix-handoff.json
```

This mode does not implement destructive traffic generation. It treats load
checks as bounded local smoke tests for resilience and rate-limit behavior.
