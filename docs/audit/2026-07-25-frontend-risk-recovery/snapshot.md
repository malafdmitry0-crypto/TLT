# RISK-CLOSE-PROOF-01 — closure

**Status: PASS**

**Slice:** `RISK-CLOSE-PROOF-01`  
**Owner:** qa  
**Verdict:** **PASS** — double full DoD green on current HEAD; Projects/Heat browser matrix captured with live screenshots for required viewports; previous ReportPage flake blocker fixed by `AF10-REPORT-FLAKE-01`.

## Audited source

| Field | Value |
|---|---|
| Audited source HEAD | `faebfe0a4ce2ee31e881e2947c70532751f00866` |
| Short | `faebfe0` |
| Captured (UTC) | 2026-07-24T22:51:39Z |
| Host | dmitrys-MacBook-Pro.local |
| OS | Darwin 23.6.0 arm64 |
| Node | v23.5.0 |
| npm | 10.9.2 |

## git status (at audit)

```text
?? docs/audit/2026-07-25-af10-wizard-form-connection/
?? docs/audit/2026-07-25-frontend-risk-recovery/
```

Tracked production tree for this slice: docs/audit only (no production patch in this slice).  
Prior commits on HEAD: ReportPage flake fix + useForm connection fix (AF10 P01–P02).

## Commands and results

### `npm run test:agent-gates`

| Field | Value |
|---|---|
| Exit code | **0** |
| Embedded in both DoD runs | typecheck + lint + s0-gates + css:architecture green |

### `npm run test:agent-dod` × 2

| Run | Exit | Notes |
|---|---:|---|
| 1 (standalone earlier session) | **0** | after AF10-REPORT-FLAKE-01 |
| 2 (gates + dod + dod sequence) | **0** | duration ~450 s total; unit+integration+build green |

ReportPage focused suite: **10/10 green** after AF10-REPORT-FLAKE-01 (prerequisite of this closure).

### Browser matrix (live HEAD, not historical screenshots)

Evidence directory: `docs/audit/2026-07-25-frontend-risk-recovery/browser/`  
Machine JSON: `browser-evidence.json`

| Area | Viewports | Result |
|---|---|---|
| Employee login | all | pass (`petrov@heatcalc.io`) |
| Projects loaded | 1000×768, 1280×800, 1366×768, 1440×900, 1440×1000, 390×844 | pass |
| Projects create modal | same | pass |
| Heat employee workspace | same | pass |
| Page overflow-x | same | pass (none) |
| Console pageerrors | — | 0 |
| useForm not connected | — | 0 |
| Unexpected failed network | — | 0 |

Screenshots (selected):

- `projects-*.png`, `projects-create-modal-*.png`
- `heat-employee-*.png`
- `heat-guest-*.png` (Kontur extras)

## Residual risk (documented, non-blocking for RISK queue)

1. Guest «Войти без регистрации» path in automated matrix did not always land in authenticated heat chrome; employee Heat path is the closure proof.
2. Deep Heat form states (underground/climate/wind with populated objects, wide vs side with layers) were not fully exercised when the employee project has no objects — covered by subsequent AF10 heat load-state and debt slices, not by inventing production patches here.
3. Projects query-error / bulk-actions edge states not separately forced (would require API fault injection).

## Decision

- `RISK-CLOSE-PROOF-01` → **done**
- Frontend backlog → **EMPTY QUEUE**
- Continue AF10 runbook from Prompt 04 (Heat load-state model)

## Related commits

- `99f054c` test(frontend): AF10-REPORT-FLAKE-01 stabilize ReportPage userEvent races
- `faebfe0` fix(frontend): AF10-WIZARD-FORM-CONNECTION-01 connect range modal form
