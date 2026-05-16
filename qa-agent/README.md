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

## MVP Skeleton

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
`K`/temperature rule, max winding coefficient, inclusive TT series limits and
tank cable length geometry.

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
npm run qa-agent:llm-extract
```

The example writes:

```text
qa-agent/reports/qa-agent-example-report.json
qa-agent/reports/qa-agent-example-report.html
```
