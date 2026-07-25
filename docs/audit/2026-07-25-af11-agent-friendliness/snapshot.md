# AF11 agent-friendliness hardening — audit

**SLICE_ID:** AF11-FINAL-AUDIT-01  
**UTC:** 2026-07-25  
**HEAD (worktree):** dirty WIP after AF11 extracts (base AF10 `faa6aab`)  
**Status:** **PARTIAL PASS** (execution stopped by user 2026-07-25)  
context/docs/lint/noise/DoD green; browser seal BLOCKED; wall-time target not fully sealed

## Definition of Done checklist

### Context

| Criterion | Result |
|---|---|
| No production TS/TSX `>=450` LOC | **PASS** (0 files) |
| Extracts with named seams / owners | **PASS** (16+ new modules) |
| No mega-bag rename only | **PASS** |
| Query keys / API / formulas unchanged | **PASS** (characterization-preserving extracts) |
| Architecture baselines not grown | **PASS** |

### Documentation truth

| Criterion | Result |
|---|---|
| Only `refactor-backlog.md` routes pending | **PASS** (AF10 queue HISTORICAL) |
| AF10 residual/parallel not ACTIVE | **PASS** |
| meaningful-css PROPOSED without routing | **PASS** |
| Old AF10 audit not rewritten | **PASS** |

### Feedback loop

| Criterion | Result |
|---|---|
| `npm run lint` 0 errors / 0 warnings | **PASS** |
| ErrorBoundary/Wizard expected noise scoped helper | **PASS** |
| Canonical `test:agent-dod` keeps full coverage | **PASS** (`scripts/agent-dod.mjs`) |
| Wall time −20% or ≤120s median | **PARTIAL** (measured ~149s concurrent full DoD vs ~157s sequential baseline; unit+int concurrent −27% vs sequential sum; 3-run median + dual-stress not fully sealed on this session) |
| Green agent-dod | **PASS** (1× full green @ 149s after concurrent suite) |

### Browser/Kontur

| Criterion | Result |
|---|---|
| browser-state-matrix.md contract | **PASS** (docs only) |
| evidence schema | **PASS** |
| Feature area proofs on same HEAD | **BLOCKED** — no Kontur Playwright MCP in session |
| Final browser seal | **BLOCKED** — see `docs/audit/2026-07-25-af11-browser-final/snapshot.md` |

## Scorecard (recompute)

| Metric | Value |
|---|---:|
| Production LOC ≥450 | 0 |
| Production LOC >500 | 0 |
| Import >20 | 0 |
| Static debt | 0 |
| Ant mapped debt files | 0 |
| Visual non-owner | 0 |
| Legacy palette / bare Ant / noncanon | 0 |
| Lint warnings | 0 |

## Artifacts

| Path | Role |
|---|---|
| `docs/frontend/af11-agent-friendliness-hardening-plan.md` | runbook |
| `docs/audit/2026-07-25-af11-context-inventory/snapshot.md` | inventory |
| `docs/audit/2026-07-25-af11-feedback-profile/snapshot.md` | wall-time profile |
| `docs/frontend/browser-state-matrix.md` | browser contract |
| `docs/audit/2026-07-25-af11-browser-contract/evidence.schema.json` | evidence schema |
| `docs/audit/2026-07-25-af11-browser-final/snapshot.md` | BLOCKED seal |
| `frontend/scripts/agent-dod.mjs` | concurrent DoD orchestrator |

## FILE / EVIDENCE / DECISION NEEDED (blockers)

```text
FILE: browser Kontur Playwright MCP / real app stack
EVIDENCE: no browser_* tools in session; seal explicitly BLOCKED
INVARIANT AT RISK: AF11 browser DoD rows unproven on this HEAD
DECISION NEEDED: run AF11-BROWSER-* with kontur-ui-quality + live stack, or accept PARTIAL

FILE: DoD wall time median
EVIDENCE: one green concurrent full DoD ≈149s; baseline sequential ≈157s
INVARIANT AT RISK: AF11 target ≤120s or −20% median over 3 warm runs
DECISION NEEDED: accept PARTIAL speed win, or further harness work (not coverage cut)
```

## Verdict

**AF11 not fully CLOSED** (browser + strict wall-time median missing).  
**Practical agent-friendliness improved:** zero ≥450 contexts, docs truth fixed, lint clean, scoped test noise, concurrent DoD, green full DoD.

Recommended next: browser matrix on live stack; optional 3× DoD median stamp after clean commit.
