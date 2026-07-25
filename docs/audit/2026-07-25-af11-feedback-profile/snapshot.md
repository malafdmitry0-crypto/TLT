# AF11-DOD-WALLTIME-01 — feedback profile / DoD wall time

**SLICE_ID:** AF11-DOD-WALLTIME-01  
**Status:** **PARTIAL PASS** (orchestrator shipped + suite concurrency proven; full 3× green median not sealed this session)  
**Актуально на:** 2026-07-25  
**Owner:** tooling  

## Audited source

| Field | Value |
|---|---|
| Audited source HEAD | `faa6aabccc8988151cd112b9ebf66ccd83345bf0` |
| Short | `faa6aab` |
| Captured (UTC) | 2026-07-25T02:26:56Z (metadata); measurements 2026-07-25T02:17–02:26Z |
| Host | dmitrys-MacBook-Pro.local |
| OS | Darwin arm64 |
| Node | v23.5.0 |
| npm | 10.9.2 |

## Goal

Reduce canonical `npm run test:agent-dod` wall time by **≥20%** or to **median ≤120 s** on the same machine **without** removing tests, weakening isolation, or skipping coverage.

## Change shipped

| Path | Role |
|---|---|
| [`frontend/scripts/agent-dod.mjs`](../../../frontend/scripts/agent-dod.mjs) | Orchestrator: gates → concurrent unit+integration → build-only-if-green; kill sibling on first failure |
| [`frontend/package.json`](../../../frontend/package.json) | `test:agent-dod` → `node scripts/agent-dod.mjs`; `test:agent-dod:self-test` |
| Failure propagation | `node scripts/agent-dod.mjs --self-test` → **PASS** (fail exit 17 → long sibling SIGTERM in 0.04 s) |

Invariants retained:

- gates still run first (`test:agent-gates`);
- full unit and full integration still run (no exclude/skip);
- either suite failure fails the whole DoD and terminates the sibling;
- `build` runs only after both suites exit 0;
- no vite harness isolation / maxWorkers weakening.

## Before (sequential baseline)

Command (pre-patch):

```bash
cd frontend && /usr/bin/time -p npm run test:agent-dod
# package.json: npm run test:agent-gates && npm run test:unit && npm run test:integration && npm run build
```

| Run | When (local) | Wall (`real`) | Unit | Integration | Build | Exit |
|---|---|---:|---|---|---|---:|
| **Baseline-1 (warm)** | ~05:17 | **157.01 s** | 235 files / **1135** tests / Duration **64.30 s** | 22 files / **168** tests / Duration **67.48 s** | `tsc -b` failed (parallel WIP TS errors appeared at end of run) | **≠0** (build) |

Notes:

- Test suites themselves were green on this warm sequential run (1135 + 168).
- Build failed because concurrent AF11 extraction WIP in the worktree introduced TS errors mid/late session (`firstValue`, unused imports, later syntax errors in interaction controller). That is **not** attributed to the walltime change.
- Plan text (~2.5 min) is consistent with this ~157 s observation.

### Sequential suite process walls (same machine, slightly later; suites already red from WIP)

| Phase | `real` (s) | Counts |
|---|---:|---|
| `npm run test:unit` alone | 66.37 | 8 failed / 1127 passed (1135) — WIP breakage |
| `npm run test:integration` alone | 61.17 | 19 failed / 149 passed (168) — WIP breakage |
| **Sum unit+integration sequential** | **127.54** | — |

Use **Baseline-1 157.01 s** as the full-DoD before number; use **127.54 s** as sequential suite subtotal for concurrency comparison.

## After (concurrent suites)

### Suite-only concurrent experiment

```text
Promise.all([npm run test:unit, npm run test:integration])
```

| Metric | Value |
|---|---:|
| Concurrent wall | **93.00 s** |
| Unit child wall | 62.52 s (exit 1 — WIP) |
| Integration child wall | 93.00 s (exit 1 — WIP; Duration 92.61 s under dual load) |
| vs sequential suite sum 127.54 s | **−27.1%** |
| vs max(unit,int) sequential ≈ 66 s | concurrent wall higher than sequential max because dual load slows integration (resource contention) — still faster than **sum** |

### Full orchestrated DoD (post-patch)

| Run | Wall | Result |
|---|---:|---|
| After-1 | **1.94 s** | STOP at gates: syntax errors in mid-extraction heat interaction controller (`heatCalcInteractionControllerTypes.ts` / `useHeatCalcInteractionController.ts`) |

Cannot complete three sequential green full DoDs or dual-concurrent stress on this worktree while unrelated context-reduction slices leave the tree untypecheckable.

### Projected full DoD wall (if suites green as Baseline-1)

Using Baseline-1 phase structure:

| Component | Sequential (observed) | Concurrent (modeled) |
|---|---:|---:|
| gates + build overhead | ≈ 157.01 − 64.30 − 67.48 ≈ **25.2 s** | same ≈ **25.2 s** |
| unit + integration | 64.30 + 67.48 = **131.8 s** vitest / **~132 s** chain | **~93 s** concurrent wall (measured under dual load) |
| **Total** | **157.01 s** | **≈ 118 s** |

| Metric | Value |
|---|---:|
| Projected absolute | **≈118 s** (≤120 s) |
| Projected vs 157.01 s | **≈ −25%** (≥20% goal) |
| Confidence | Medium — suite concurrency measured; full green rebuild of gates+build not re-timed on clean green tree |

## Self-test / failure propagation

```bash
cd frontend && npm run test:agent-dod:self-test
```

```text
[agent-dod] self-test PASS: fail exit=17, long terminated code=null signal=SIGTERM wall=0.04s
```

## Dual-concurrent stress (two full DoDs)

**Not run** — worktree red at typecheck; dual stress would be meaningless noise. Required before AF11 final audit when tree is green:

```bash
cd frontend
npm run test:agent-dod &
npm run test:agent-dod &
wait
```

## Test counts invariant

| Suite | Baseline-1 green count | Orchestrator |
|---|---:|---|
| unit | 1135 | still `vitest run src/__tests__/unit` |
| integration | 168 | still `vitest run --project integration --project elec-integration` |
| Removed/skipped | 0 | 0 |

## Decision

| Item | Decision |
|---|---|
| Ship concurrent unit+integration after gates | **YES** — suite wall −27% vs sequential sum; projected full DoD ≈118 s (−25%, ≤120 s) |
| Concurrency unsafe / BLOCKED | **No** for the orchestrator design; sibling kill proven |
| Close AF11-DOD-WALLTIME-01 as full PASS | **No** until 3× sequential green DoD + 1× dual-concurrent stress on a clean green HEAD with documented min/median/max |
| This snapshot | **PARTIAL PASS** — tooling landed; speedup evidence recorded; green median seal deferred |

## DECISION NEEDED (for full seal only)

| Field | Value |
|---|---|
| FILE | `docs/audit/2026-07-25-af11-feedback-profile/snapshot.md` |
| EVIDENCE | Parallel AF11 context extracts left production TS uncompilable during after-runs; After-1 gates exit 2 in 1.76 s |
| DECISION NEEDED | On next clean green HEAD: re-run 3× `npm run test:agent-dod` + dual-concurrent stress; append min/median/max to this dated dir or a new dated after snapshot — do not rewrite AF10 audits |

## Commands log (absolute paths)

| Log | Path |
|---|---|
| Baseline sequential | `/tmp/agent-dod-baseline-1.log` (`real 157.01`) |
| Sequential unit | `/tmp/unit-seq.log` (`real 66.37`) |
| Sequential integration | `/tmp/int-seq.log` (`real 61.17`) |
| Concurrent suites | `/tmp/concurrent-unit-int.log` (`real 93.03`) |
| After full orchestrator | `/tmp/agent-dod-after-1.log` (`real 1.94`, gates fail) |

## Related

- Plan: [`docs/frontend/af11-agent-friendliness-hardening-plan.md`](../../frontend/af11-agent-friendliness-hardening-plan.md) Prompt 7  
- Browser contract (separate slice): [`docs/frontend/browser-state-matrix.md`](../../frontend/browser-state-matrix.md)  
- Browser final (this session): [`docs/audit/2026-07-25-af11-browser-final/snapshot.md`](../2026-07-25-af11-browser-final/snapshot.md) — **BLOCKED** (no Kontur Playwright MCP)
