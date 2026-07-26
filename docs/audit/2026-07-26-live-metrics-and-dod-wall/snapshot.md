# Live metrics scorecard + DoD wall profile

**Status:** **PASS** (metrics refresh + wall levers landed; ≤120s still open)  
**UTC:** 2026-07-26  
**HEAD at collection:** `f6d9d85` (+ follow-up tooling commits on same day)  
**Owner:** tooling  

## Slice A — CONF-METRICS-01 (live scorecard)

### Commands

```bash
node scripts/frontend-agent-metrics.mjs
node scripts/agent-scope.mjs --coverage
cd frontend && npm run storybook:coverage && npm run test:agent-gates
# browser console seal (guest routes)
```

### Live vs plan baseline (`plan.md` §1.1 on `12c45b0`)

| Метрика | Plan baseline | Live @ `f6d9d85` | Delta |
|---|---:|---:|---|
| Production TS/TSX files | 439 | **459** | +20 |
| Prod files ≥400 LOC | **22** | **0** | Track A closed |
| Prod files >500 LOC | 0 | **0** | — |
| Max production LOC | (400-band) | **397** (`useHeatCalcNormalGlideController`) | under 400 |
| Max import-context | 20 | **20** (`main.tsx`) | — |
| Test files ≥500 LOC | 9 | **2** | Track B largely closed |
| agent-scope unowned | n/a | **0** | — |
| Storybook public coverage | ~70% (audit) | **13/13 · 100%** | — |
| Fast gate wall | ~8–10 s | **13.4 s** PASS | slightly higher host load |
| Console seal | **FAIL · 2 Ant** | **PASS · 0** (`antd_static=0` on `/`, heat, elec, ui-kit) | sealed |
| Full DoD wall (see §B) | 224–241 s midpoint 232.5 | **277.6 s** (baseline dual workers=2) | more tests / host |
| Запутанность (plan scale) | 3.0 / 10 | **~2.0–2.5** (qualitative after Track A/B + scope + seal) | improved |
| Здоровье кода (metrics script calib.) | 8.7 | **~8.7–9.0** | 400-band gone |

### Expert scale from `frontend-agent-metrics.mjs` (raw + calibration)

| Criterion | Score |
|---|---:|
| Docs entry | 9.4 |
| Confusion (lower better) | 3.0 *(script still hardcodes; live context better)* |
| Architecture gates | 9.3 |
| Locality | 8.2 |
| UI Kit / Ant façade | 8.7 |
| Test reliability | 9.0 |
| Small-change speed | 9.2 |
| Full-cycle speed | 6.8 |
| Browser/E2E | 8.0 |
| Reproducibility | 7.8 |
| **Adjusted average** | **~8.3 / 10** |

### Hygiene

| Signal | Live |
|---|---|
| Core docs present | 8/8 · 0 broken links |
| Dirty worktree at scan | 10 entries (other WIP — not part of this slice) |
| Architecture / type / CSS ratchets | green via agent-gates |

### Residual (metrics)

- Script still reports confusion **3.0** as calibrated constant — next: feed live 400-band / seal into score formula.
- Many agent-effectiveness metrics remain **NOT MEASURED** (need 30-slice window).
- Stale evidence in older audits — not bulk-rewritten; this snapshot is the current binding live card.

---

## Slice B — CONF-DOD-WALL-01 (profile + levers)

### Baseline profile (pre-lever dual-safe, workers unit=2/int=2, stagger=2000)

```text
test:agent-gates:                 13.89s
test:unit+integration concurrent: 254.05s
  unit observed:                   254.05s   ← long pole
  integration observed:            173.23s
build (tsc -b && vite):             9.63s
TOTAL:                            277.57s
```

**Finding:** unit suite is the wall bottleneck (not integration). Prior plan assumption “integration long pole” is **stale** on this host/inventory.

### Levers implemented

| Lever | Change |
|---|---|
| `AGENT_DOD_SKIP_ARCH_IN_UNIT=1` | unit excludes `**/architecture/**` (already in gates) |
| `AGENT_DOD_FAST_BUILD=1` | `build:vite` only after gates typecheck (~0.9s vs ~9.6s) |
| `AGENT_DOD_UNIT_STAGGER_MS` default | **500** (was 3000) |
| dual-safe unit workers | **4** (was 2) — unit is long pole |
| dual-safe | enables skip-arch + fast-build + stagger 500 |

Files:

- `frontend/scripts/agent-dod.mjs`
- `frontend/package.json` (`build:vite`, `test:agent-dod:dual-safe` env)

### Improved profiles (same machine, same day)

| Run | Config | gates | concurrent | unit | int | build | **total** |
|---|---|---:|---:|---:|---:|---:|---:|
| A baseline | unitW=2 intW=2 stagger=2000 | 13.9s | 254.1s | **254.1s** | 173.2s | 9.6s (`build`) | **277.6s** |
| B mid | unitW=4 intW=2 stagger=500 | 12.1s | 194.8s | 172.6s | **194.8s** | 7.1s (`build`) | **214.0s** |
| C full levers | B + skipArch + fastBuild | 11.4s | 217.7s | 180.9s | **217.7s** | **0.9s** (`build:vite`) | **230.0s** |

**Best measured wall:** **214.0s** (run B) ≈ **−63.6s / −23%** vs baseline A.  
**Full levers (C):** FAST_BUILD confirmed **0.92s** build; suite variance moved long pole to integration (**217s**).

| Lever | Effect on this host |
|---|---|
| unit workers 2→4 | main win when unit is long pole |
| stagger 2000→500 | small (≤2s) |
| skipArchInUnit | trims unit; helps when unit ≥ integration |
| FAST_BUILD | **~9s** saved vs `tsc -b && vite` |

### Path to ≤120s

Concurrent suites alone still **≥173s** (integration floor). Reaching **≤120s total** still requires:

1. Integration suite shrink / shard, and/or  
2. Unit suite shrink (HeatCalcPage scenario clusters), and/or  
3. Quiet host + repeated p50 (n≥5).

Do **not** claim ≤120s closed — residual gap **~94s+** vs best 214s.

---

## Proof

```bash
cd frontend
npm run test:agent-gates          # PASS · ~13s
# baseline:  AGENT_DOD_* workers=2 stagger=2000 → 277.57s PASS
# improved:  npm run test:agent-dod:dual-safe
node ../scripts/agent-scope.mjs --coverage   # 0 unowned
npm run storybook:coverage:strict            # 13/13
```

## Residual

- ≤120s DoD **open** (best 214s).
- Optional: bake live ≥400=0 + console seal into `frontend-agent-metrics.mjs` score formula.
- Next wall slice: profile slowest unit/integration files and shard.
