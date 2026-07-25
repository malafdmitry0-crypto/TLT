# Frontend docs cleanup

**SLICE_ID:** DOC-CLEANUP-FRONTEND-01  
**UTC:** 2026-07-25  
**BASE_HEAD (before commit):** `6a303f8`  
**Status:** **PASS** (docs-only; no runtime changes)

## Commands / environment

```text
find docs/frontend -type f | sort
find docs/frontend -name '*.md' -print0 | xargs -0 wc -l
python3 link-resolve check on docs/frontend/** + frontend/AGENTS.md
grep authority / stale-scorecard heuristics
# runtime DoD not required (0 production TS/CSS/test changes)
```

## Before → after

| Metric | Before | After |
|---|---:|---:|
| `docs/frontend` markdown LOC | 6375 | 2034 |
| `docs/frontend` files | 21 | 20 (7 dumps deleted, 6 archive summaries added, backlog/README condensed) |
| `docs/frontend` disk | 352K | ~same class |
| `docs/audit` disk | 27M | 27M (binary prune **skipped**) |
| LOC reduction | — | **~68%** (≥50% target met) |

## Deleted (full body)

| Path | Reason |
|---|---|
| `docs/frontend/af10-parallel-queue.md` | HISTORICAL/CLOSED queue + scorecard noise |
| `docs/frontend/af10-residual-close-plan.md` | HISTORICAL/CLOSED stale scorecard |
| `docs/frontend/agent-friendliness-fix-plan.md` | HISTORICAL full runbook (~822 LOC) |
| `docs/frontend/af11-agent-friendliness-hardening-plan.md` | PROPOSED/partial dump (~786 LOC) |
| `docs/frontend/af12-agent-friendliness-residual-prompts.md` | executed + residual prompt dump (~1164 LOC) |
| `docs/frontend/meaningful-css-plan.md` | PROPOSED prompts; policy folded into css-strategy + archive |
| `docs/frontend/ant-ui-kit-agent-rollout.md` | A–D PASS execution board |

Recover via `git log -- docs/frontend/<name>`.

## Archived (new short summaries)

- `docs/frontend/archive/af10-historical.md`
- `docs/frontend/archive/af11-historical.md`
- `docs/frontend/archive/af12-historical.md`
- `docs/frontend/archive/meaningful-css-historical.md`
- `docs/frontend/archive/ant-ui-kit-rollout-historical.md`
- `docs/frontend/archive/risk-recovery-and-p-series-historical.md`
- Updated `docs/frontend/archive/README.md`

## Condensed

| Path | Change |
|---|---|
| `refactor-backlog.md` | 802 → ~70 LOC; EMPTY QUEUE; Done index + optional residual |
| `README.md` | navigator only KEEP + archive; removed PROPOSED runbook table |
| `prompts/split-large-tests-by-scenario.md` | residual ObjectWizard only; HeatCalc marked done |
| `css-strategy.md` | links → archive |
| `ant-ui-kit-strategy.md` | rollout board → archive |
| `browser-state-matrix.md` | AF11 plan link → archive |
| `ui-kit.md` | owner CSS / 768 / retired mixed ui-kit.css truth |

## Retained normative / thematic

- `agent-development-standard.md`
- `pr-budget.md`
- `agent-refactor-prompt.md`
- `css-strategy.md`
- `ui-kit.md`
- `viewport-policy.md`
- `ant-ui-kit-strategy.md`
- `browser-state-matrix.md` (contract, not queue)
- `refactor-backlog.md` (EMPTY)
- `agent-friendly-9-plan.md` (thin pointer)
- `frontend/AGENTS.md` (unchanged; links still valid)

## Proof

| Check | Result |
|---|---|
| Second ACTIVE queue file | **no** (only backlog claims pending authority) |
| Live stale scorecards in non-archive | **0** matches |
| Broken relative links from KEEP docs | **0** after this snapshot exists |
| Runtime production touched | **no** |
| Audit binary prune | **skipped** (retain evidence trees) |

## Residual risk

1. `docs/audit` still ~27M (png/json geometry). Optional future prune of intermediate before/after trees if disk pressure.
2. Optional process residuals (dual DoD, wall ≤120s, deep browser, ObjectWizard split) documented as non-pending in backlog + af12 archive — not reopened by this slice.
3. Historical audit markdown still links to deleted plan paths (immutable audits; intentional).

## SAFE NEXT

None required. User may request optional residual process slices or audit binary prune as separate goals.
