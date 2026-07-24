# RISK-CLOSE-PROOF-01 — final closure attempt

**Status: BLOCKED**

**Slice:** `RISK-CLOSE-PROOF-01`
**Owner:** frontend-process
**Verdict:** **BLOCKED** — full DoD failed; required browser matrix not completed with kontur_playwright; backlog must remain/return ACTIVE.

## Audited source

| Field | Value |
|---|---|
| Audited source HEAD | `4462374a84ba4975bc3d38429f908b9dd526481c` |
| Short | `4462374` |
| Expected source HEAD | `4462374a84ba4975bc3d38429f908b9dd526481c` (match) |
| Diff vs expected | none — exact match |
| Captured (UTC) | 2026-07-24T09:51:26Z |
| Host | `dmitrys-MacBook-Pro.local` |
| OS | Darwin 23.6.0 arm64 |
| Node | v23.5.0 |
| npm | 10.9.2 |

## git status

### Before checks

```text
?? agent-score-electrical-desktop.md
?? agent-score-electrical-empty-desktop.png
?? agent-score-electrical-empty-mobile.png
```

Tracked production tree: **clean** (no WIP in `frontend/src`, CSS, tests, baselines).

### After docs-only audit work

Same untracked `agent-score-electrical-*` (not staged / not deleted).
Plus this audit directory and backlog edits (docs only).

`git diff --check` on tracked tree: **green** at start of slice.

## Commands and results

### `npm run test:agent-gates` (standalone)

| Field | Value |
|---|---|
| Exit code | **0** |
| Start UTC | 2026-07-24T09:46:49Z |
| End UTC | 2026-07-24T09:47:06Z |
| Duration | **17 s** |
| typecheck | pass (`tsc --noEmit`) |
| lint | pass (`eslint .`) |
| s0-gates | 13 files / 45 tests pass |
| css:architecture | 2 files / 7 tests pass |

### `npm run test:agent-dod` (full)

| Field | Value |
|---|---|
| Exit code | **1** |
| Start UTC | 2026-07-24T09:47:25Z |
| End UTC | 2026-07-24T09:50:52Z |
| Duration | **207 s** |
| gates (embedded) | typecheck+lint+s0+css green |
| unit | **233 files / 1117 tests pass** (~99 s) |
| integration | **1 failed / 21 passed files**; **1 failed / 167 passed tests** (~91 s) |
| production build | **not reached** (pipeline stops on integration fail) |

#### Integration failure (blocker)

```text
FILE: frontend/src/__tests__/integration/pages/ReportPage.test.tsx
TEST: ReportPage (integration) > passes the exact selected ER UUID to the standalone report wizard URL
EVIDENCE: AssertionError — window.open spy called 0 times; expected
  open(`/report-wizard?er=${thirdVariant.id}`, 'tlt-report-wizard', …)
DECISION NEEDED: product/report owner — fix ReportPage open behavior or
  restore test contract; out of ALLOWED_SCOPE for RISK-CLOSE-PROOF-01
  (docs/QA only; production/test patches prohibited).
```

This failure is **unrelated** to RISK R1–R13 production patches in the sense that
this slice must not fix it; it still **blocks honest DoD green** and therefore
blocks EMPTY QUEUE closure.

## Static metrics (recomputed from tree at audited HEAD)

Not copied from older audits — recalculated 2026-07-24T09:47Z.

| Metric | Fact |
|---|---|
| Production type escapes (baseline) | **0** files / **0** entries |
| Production type escapes (source scan `as never` / `as unknown as`) | **0** |
| Inline styles total | **496** |
| Inline by class | static debt **262** · runtime geometry **86** · third-party **148** |
| ProjectsPage inline occurrences | **7** |
| Coordinate-layout total | **72** |
| heatcalc-side-form-layout.css coords | **35** |
| Ant primitive baseline | **44 files / 90 primitives** |
| `useHeatCalcPageModel.ts` | imports **23**, LOC **256** |
| `useElecCalcWorkspaceModel.tsx` | imports **20**, LOC **370** |

All metric targets from RISK acceptance remain met. Metrics alone do **not**
justify EMPTY QUEUE while DoD/browser are open.

## Browser proof

### Tooling constraint

| Tool | Result |
|---|---|
| `kontur_playwright` MCP | **UNAVAILABLE** in this session (`search_tool` → 0 tools) |
| Local Playwright e2e (`e2e/`) | smoke attempted; not a substitute for kontur matrix |

### Local stack probe

| Endpoint | Result |
|---|---|
| `http://127.0.0.1:3003/` | HTTP **200** (frontend up) |
| `http://127.0.0.1:8000/docs` | HTTP **200** |
| `http://127.0.0.1:8000/api/v1/health` | 404 body `{"detail":"Not Found"}` (API process responds) |

Fixtures: **none injected**. Real local frontend + API.

### Smoke (non-matrix, local Playwright)

```bash
cd e2e
E2E_BASE_URL=http://127.0.0.1:3003 E2E_API_BASE=http://127.0.0.1:8000 \
  npx playwright test tests/projects.spec.ts --reporter=list
```

| Result | Detail |
|---|---|
| Exit | **1** |
| Duration | ~14.6 s |
| Passed | 2 |
| Failed | 1 — guest auto-project CSV import button not found (`Загрузить проект (CSV)`) |

This smoke does **not** satisfy required Projects/Heat matrix at
1000×768 / 1280×800 / 1440×900 / 1366×768.

### Required browser matrix — status

| Area | Required states | Evidence | Result |
|---|---|---|---|
| Projects | loading, error/retry, empty, list/cards, filters, create modal, bulk, long name | none complete | **BLOCKED** |
| Heat | pipe/tank, wide/side, above/under ground, climate selected/manual, wind visible/hidden | none complete | **BLOCKED** |
| Viewports | 1000×768, 1280×800, 1440×900, 1366×768 | not executed under kontur | **BLOCKED** |
| Per-state artifacts | screenshot, a11y snapshot, scrollWidth, boxes, keyboard, console, network | not produced | **BLOCKED** |

### Console / network (matrix)

Not collected — matrix not run.

### Untested states

All required Projects and Heat states listed in the slice prompt remain untested
under the mandatory kontur_playwright path.

## Truth decision

| Gate | Required | Actual |
|---|---|---|
| agent-gates | green | **green** |
| full agent-dod | green | **RED** (ReportPage integration) |
| browser matrix | full PASS + evidence | **BLOCKED** (tooling + incomplete) |
| EMPTY QUEUE allowed? | only if all above green | **NO** |

### FILE / EVIDENCE / DECISION NEEDED

1. `frontend/src/__tests__/integration/pages/ReportPage.test.tsx` / openSpy 0 calls on wizard open / **report** / fix product or test; re-run `npm run test:agent-dod`
2. `kontur_playwright` MCP / tool not registered in session / **tooling** / enable MCP or explicit alternate browser proof path approved by user
3. Projects/Heat browser matrix / no evidence artifacts under this audit / **qa** / run full matrix after DoD green; store under `browser/`

## Residual risks

```text
ReportPage integration openSpy failure / agent-dod red / report / DECISION NEEDED above
Browser matrix not executed / kontur unavailable + incomplete smoke / qa / re-run CLOSE-PROOF
ObjectWizard.tsx 29 imports / import-context baseline / wizard / outside this slice
useElecCalcWorkspaceDataPlane 22 imports / import-context / electrical / outside this slice
Pre-close snapshot 2026-07-24-frontend-risk-recovery / incomplete DoD+browser / docs / superseded by this BLOCKED audit
```

## Relation to older snapshot

`docs/audit/2026-07-24-frontend-risk-recovery/snapshot.md` is **pre-close /
incomplete working-tree evidence**. It must not be treated as final closure.
Its numbers are not rewritten here; this file is the authoritative attempt at
HEAD `4462374`.

## Explicit verdict

**BLOCKED**

Do not declare R1–R13 fully closed. Do not create a closure commit claiming
PASSED. Backlog must show **ACTIVE** with next contract **`RISK-CLOSE-PROOF-01`**
until DoD and browser matrix are honestly green.
