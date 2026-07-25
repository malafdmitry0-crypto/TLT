# AF12-DOD-REPEATABILITY-01

**UTC:** 2026-07-25T16:44:37Z  
**Host:** dmitrys-MacBook-Pro.local · Darwin arm64 · Node v23.5.0  
**BASE_HEAD (committed):** `e45b83f`  
**Worktree:** local typecheck-clean scenario re-split WIP (objectWizardUtils + heatCalcExcelMode)

## Goal

3× sequential green `npm run test:agent-dod` + 1× dual-concurrent stress; record min/median/max wall; target median ≤120 s (AF11 carry-over).

## Sequential 3×

| Run | Result | agent-dod total wall | `/usr/bin/time -p` real | Notes |
|---|---|---:|---:|---|
| 1 | **FAIL** | 113.04 s | 113.18 s | Missing monolit mid re-split: `objectWizardUtils.test.ts` not found (WIP race) |
| 2 | **PASS** | **152.69 s** | 152.86 s | gates 16.46s · unit+int 128.64s · build 7.59s |
| 3 | **PASS** | **152.20 s** | 152.34 s | gates 16.10s · unit+int 128.36s · build 7.73s |

**Green sample (run2–3 only):** min **152.20** · median **152.45** · max **152.69** s  
**vs AF11 goal median ≤120 s:** **not met** (~+27% over target).  
**vs prior single green ~155.92 s:** slight improvement on stable tree (~−2%).

Logs: `/tmp/af12-dod-runs/run{1,2,3}.{out,time}`

## Dual-concurrent stress

```bash
cd frontend
npm run test:agent-dod &   # A
npm run test:agent-dod &   # B
wait
```

| Process | Result | total wall | real | Failure |
|---|---|---:|---:|---|
| A | **FAIL** | 276.85 s | 277.03 s | unit: `HeatCalcPage.basics` + `HeatCalcPage.project-isolation` (findByTestId timeouts) |
| B | **FAIL** | 276.91 s | 277.09 s | same two unit tests under load |

- Gates passed on both processes.
- Sibling kill after unit fail: integration exit 143 (SIGTERM) — expected orchestrator behavior.
- Failure mode: **resource contention / timing flakiness** under 2× full DoD, not a deterministic production regression (sequential green immediately before).

Logs: `/tmp/af12-dod-runs/dual/{a,b}.{out,time}`

## Verdict

| Claim | Status |
|---|---|
| 3× sequential green | **NO** (2/3; run1 WIP race only) |
| 2× consecutive sequential green on complete re-split tree | **YES** (run2 + run3) |
| Dual concurrent both green | **NO** (both FAIL under contention) |
| Median ≤120 s | **NO** (median greens ≈152.5 s) |
| Slice overall | **PARTIAL PASS** |

## Decision / SAFE NEXT

1. Treat sequential DoD as **agent-ready** on quiet machine; do not claim dual-stress green.
2. Optional: re-run dual when no other heavy CPU load; if still red, open isolation work on `HeatCalcPage.basics` / `project-isolation` findBy timeouts (out of AF12 production scope).
3. Wall-time ≤120 s remains open (AF11 residual): needs further suite/orchestrator profiling without dropping coverage.
