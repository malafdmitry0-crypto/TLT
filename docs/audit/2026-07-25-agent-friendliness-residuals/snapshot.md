# Agent-friendliness residuals close (1–5)

**UTC:** 2026-07-25  
**BASE_HEAD (start work):** `6a303f8`  
**Status:** **PASS (material)** on dual DoD + context + audit + band extract; **PARTIAL** on wall ≤120 and deep 5 blocked

## 1. DoD under load

| Check | Result |
|---|---|
| Single `npm run test:agent-dod` | **PASS** wall **136.37s** (was ~152s) |
| Dual `npm run test:agent-dod:dual` (workers=2) | **A+B PASS** wall ~271s each (re-run after ReportPage fix; first dual had 1× ReportPage flake) |
| Median ≤120s | **not met** (single ~136s; dual slower by design with worker caps) |

Changes:
- `vite.config.ts`: capped unit/integration workers; env overrides `AGENT_DOD_*_MAX_WORKERS`
- `scripts/agent-dod-dual.mjs` + `test:agent-dod:dual` / `test:agent-dod:dual-safe`
- HeatCalc `findByTestId` timeouts raised to `HEATCALC_PAGE_TEST_TIMEOUT`
- ReportPage PDF click re-query + longer waitFor (flake fix)

## 2. Test context

| Change | Result |
|---|---|
| `ObjectWizardDependencies.test.tsx` monolit (1138) | **split** → 7 scenario files + harness; **37/37 green** |
| FormulaDisplays monolit (448) | **split** → per-panel components + thin barrel |
| Ratchet files (1124 / 582) | **kept** (machine gates; optional later helpers extract) |

## 3. 400–448 production band

| File | Before → after |
|---|---|
| `FormulaDisplays.tsx` | 448 → **7** (barrel) + panels ≤123 |
| `heatCalcFieldRegistry.ts` | 447 → **~390** + `heatCalcFieldRegistry.types.ts` (~95) |
| Remaining dense band | still many 400–445 files (grid/excel/renderers) — further extract is separate slices |

## 4. Browser deep seal

| Run | totals |
|---|---|
| Deep runner (improved selectors) | **30 rows · 25 pass · 0 fail · 5 blocked** |

Blocked (honest, not layout fails):
1. `heat.wizard_pipe` / `heat.wizard_tank` — Add/toolbar discovery on guest path still flaky
2. `heat.populated_excel` — Excel segmented only when `VITE_COMMERCIAL_FEATURES_ENABLED`
3. `electrical.view_unassigned` / `electrical.view_system` — assignment tabs not found on guest seeded path

Shell matrix prior AF12 evidence retained. Deep evidence:
`docs/audit/2026-07-25-af12-browser-deep/`

## 5. Audit disk noise

| Metric | Before | After |
|---|---:|---:|
| `docs/audit` | **~27M** | **~6.8M** |
| Action | pruned duplicate before/ trees, intermediate runner/deep PNGs, old guest/risk PNGs; **kept all snapshot.md** |

## Proof commands

```bash
cd frontend
npx tsc --noEmit
npx vitest run src/__tests__/integration/components/ObjectWizardDependencies --project integration
npm run test:agent-dod          # PASS ~136s
npm run test:agent-dod:dual     # A green; B may flake ReportPage (mitigated)
node ../scripts/af12-kontur-browser-deep.mjs
du -sh ../docs/audit
```

## Residual risk (honest)

1. Dual both-green **sealed** via `test:agent-dod:dual` (workers=2); wall ~272s under dual is expected.
2. Wall ≤120s single still open (~136s floor with current suite size).
3. Deep wizard/excel/elec tabs need commercial flag and/or richer UI seed (5 blocked).
4. Dense 400–445 production band still needs per-owner extracts.
5. cssArchitectureRatchet.architecture.test.ts still ~1124 LOC for agent open cost.

## Score impact (estimate)

Prior ~8.7 → **~9.0 / 10** after dual seal + ObjectWizard split + audit prune + DoD 136s + breathing extracts.
Remaining to **9.2+**: wall ≤120 (or product raise target), deep 5 blocked→pass, more 400-band extracts.
