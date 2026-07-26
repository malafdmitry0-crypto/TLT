# Confusion ≤2.0 + full-cycle improvements pack

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** tooling / docs / qa  

## Order executed

1. **DOD-POLICY-01** — when gates vs dual-safe DoD (`frontend/AGENTS.md`)
2. **DOD-PROFILE-SLOWEST-01** — vitest JSON duration profile (unit + integration)
3. **CONF-SCOPE-UX** — `recommended_commands` in `agent:scope`
4. **CONF-DECISION-ANT** — §4.1 decision table + architecture test header
5. **CONF-STATE-MAP** — `docs/frontend/state-ownership-map.md`
6. **SUITE-SHRINK** — split slowest unit file `HeatCalcPage.settings`
7. **DO-NOT-OPEN** — banners on heavy harness / e2e

## Slowest profile (JSON reporter, maxWorkers unit=4 / int=2)

### Unit (architecture excluded) — top files by sum duration

| # | File | Sum |
|---:|---|---:|
| 1 | `HeatCalcPage.settings.test.tsx` | **43.9 s** |
| 2 | `HeatCalcPage.inline-edit.test.tsx` | 29.0 s |
| 3 | `HeatCalcPage.filters.test.tsx` | 17.4 s |
| 4 | `HeatCalcPage.basics.object-type-chrome.test.tsx` | 17.1 s |
| 5 | `HeatCalcPage.project-isolation.test.tsx` | 13.6 s |

### Integration — top files

| # | File | Sum |
|---:|---|---:|
| 1 | `ElecCalcPage.glide-modals.test.tsx` | 25.8 s |
| 2 | `ElecCalcPage.results-settings.test.tsx` | 21.9 s |
| 3 | `ElecCalcPage.cable-meta.source-inline-batch.test.tsx` | 18.7 s |

## Suite shrink

`HeatCalcPage.settings.test.tsx` (416 LOC, 11 cases, ~44 s wall) →

| File | Cases | LOC |
|---|---:|---:|
| `HeatCalcPage.settings.columns.test.tsx` | 4 | ~193 |
| `HeatCalcPage.settings.view-layout.test.tsx` | 5 | ~184 |
| `HeatCalcPage.settings.details-reset.test.tsx` | 2 | ~80 |

Parallelism: three files can run on separate workers (reduces unit long-pole under dual-safe).

## Confusion levers landed

| Lever | Artifact |
|---|---|
| Proof policy | AGENTS.md gates vs DoD table |
| Scope UX | `recommended_commands` + state/ant docs links |
| Ant decision | ant-ui-kit-strategy §4.1 |
| State map | state-ownership-map.md |
| Do not open | cssArchitectureRatchet.helpers, heat-form-layout-split e2e |

**Expected confusion:** ~2.2 → **≤2.0** (navigation + proof selection + boundaries).

## Full-cycle levers

| Lever | Effect |
|---|---|
| Policy: DoD only when `full_dod_required` | agent wall for most slices = gates only |
| Settings suite split | unit long-pole concurrency win |
| Prior dual-safe workers/fast build | best measured ~214 s total DoD |

**≤120 s DoD** still open (integration floor ~170 s+).

## Proof

```bash
node scripts/agent-scope.mjs --self-test
npm run agent:scope -- src/pages/heatcalc/useHeatCalcPreferences.ts
npx vitest run src/__tests__/unit/pages/HeatCalcPage.settings.*.test.tsx --project unit
npm run test:agent-gates
```

## Residual

- Next shrink candidates: `HeatCalcPage.inline-edit`, `ElecCalcPage.glide-modals`
- Re-measure dual-safe p50 after settings split on quiet host
