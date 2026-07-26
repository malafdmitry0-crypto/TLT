# Frontend agent metrics refresh

**Status:** **PARTIAL PASS** — static code/tests/build are green, but current
desktop acceptance is red on console, accessibility and page overflow.  
**Source HEAD:** `452ec99`  
**Collected:** 2026-07-26 UTC  
**Worktree before collection:** clean  
**Product viewport contract:** desktop `>=1000 px`; mobile is out of scope  
**Binding evidence:** [evidence.json](./evidence.json)

This snapshot supersedes older metric summaries as the current binding card.
Historical audits remain provenance and are not rewritten.

## 1. Updated assessment

The machine collector still prints its calibrated **8.34/10**, but that score
does not ingest the newly found browser, accessibility, lint and bundle
signals. The evidence-adjusted assessment is therefore lower:

| Area | Weight | Score | Evidence |
|---|---:|---:|---|
| Code and architecture | 20% | **9.1** | typecheck/tests/build green; architecture ratchets present |
| Clarity and locality | 15% | **8.8** | production `>=400 LOC` is zero; owner routing complete |
| Agent workflow and evidence | 15% | **8.3** | clean scope and current manifest; historical stale cards remain |
| Test/build reliability | 15% | **8.6** | 1346/1346 tests pass; lint has 5 warnings |
| Feedback speed | 10% | **7.2** | fast gate acceptable; full cycle remains above target |
| Browser/UI acceptance | 15% | **6.2** | console, a11y and `/workspace` overflow are red |
| Reproducibility/toolchain | 10% | **7.5** | lockfiles exist; running Node does not match `engines` |
| **Weighted agent-friendly score** | **100%** | **8.1/10** | current evidence-adjusted result |

**Запутанность, где меньше — лучше:** **2.5/10**. Production/test context and
scope routing improved materially, but contradictory acceptance evidence,
desktop/mobile policy drift and incomplete runtime gates prevent `<=2.0`.

## 2. Static code and context metrics

| Metric | Current |
|---|---:|
| Production TS/TSX files | **459** |
| Production LOC | **63,616** |
| Production files `>=400 / >=450 / >500 LOC` | **0 / 0 / 0** |
| Maximum production owner | **397 LOC** — `useHeatCalcNormalGlideController.ts` |
| Production files with `>20` imports | **0** |
| Maximum imports | **20** — `main.tsx` |
| Production files `<=300 LOC` | **89.8%** |
| Production TODO/FIXME/HACK | **0** |
| Named-test discoverability | **240/459 · 52.3%** |
| Test-related TS/TSX files | **374** |
| Test-related files `>=500 LOC` | **2** |
| Largest test helper | **709 LOC** — `cssArchitectureRatchet.helpers.ts` |
| Second `>=500` test context | **598 LOC** — `heat-form-layout-split.spec.ts` |

## 3. UI Kit and Ant boundary

| Metric | Current |
|---|---:|
| UI Kit production modules | **6** |
| UI Kit story files | **14** |
| Public UI Kit components with stories | **13/13 · 100%** |
| Public barrel consumers in production | **90** |
| Direct Ant imports in production | **139** |
| Story files without public barrel export | `PageChrome` |

The Ant-based strategy remains coherent, but direct Ant usage is still broad
and the generated `ui-kit` chunk is the largest production chunk.

## 4. Tests, gates and speed

| Check | Result | Single observation |
|---|---|---:|
| ESLint | **PASS WITH WARNINGS** | **0 errors · 5 warnings** |
| TypeScript | **PASS** | `tsc --noEmit` |
| Vitest | **PASS** | **310/310 files · 1346/1346 tests · 373.35s** |
| Architecture tests | **15 files** | included in green Vitest run |
| Ratchet tests | **9 files** | included in green Vitest run |
| Production build | **PASS WITH WARNING** | **3821 modules · 0.90s** |
| Last fast-gate proof | **PASS** | **11.4s** |
| Current canonical DoD | **NOT RUN** | intentionally not duplicated |
| Latest optimized DoD profile | **PASS** | **230.0s** |
| Best same-day optimized profile | **PASS** | **214.0s** |
| Full-cycle target | **FAIL** | target `<=120s`; residual `>=94s` |

### Lint warnings

- `InsulationOuterLayerRow.tsx`: **2**
  `react-refresh/only-export-components` warnings.
- `appFeedback.tsx`: **3**
  `react-refresh/only-export-components` warnings.

### Build/performance signal

- `ui-kit` chunk: **757.00 kB**, **235.58 kB gzip**.
- Vite emits the `>500 kB` chunk warning.
- No approved frontend bundle/runtime budget gate is configured, so performance
  acceptance is **NOT CONFIGURED**, not PASS.

## 5. Browser acceptance

Runtime: `http://127.0.0.1:3003`, container `heatcalc_frontend`, repository
`frontend/` bind-mounted into `/app`.

### Route health at `1440x900`

| Route | Page overflow | Console warning/error | Failed network |
|---|---:|---:|---:|
| `/` | **0 px** | **0** | **0** |
| `/workspace` | **2 px · FAIL** | **0** | **0** |
| `/workspace/heat-calc` | **0 px** | **1 · FAIL** | **0** |
| `/ui-kit` | **0 px** | **0** | **0** |

The HeatCalc error is reproducible after both visible guest login and direct
reload:

```text
Warning: Instance created by `useForm` is not connected to any Form element.
Forget to pass `form` prop?
```

### Desktop viewport matrix

| Viewport | `/workspace` | `/workspace/heat-calc` | Outside controls | Failed network |
|---|---|---|---:|---:|
| `1000x768` | **FAIL · overflow 2 px** | geometry PASS; console FAIL | **0** | **0** |
| `1280x800` | **FAIL · overflow 2 px** | geometry PASS; console FAIL | **0** | **0** |
| `1440x900` | **FAIL · overflow 2 px** | geometry PASS; console FAIL | **0** | **0** |
| `1920x1080` | **FAIL · overflow 2 px** | geometry PASS; console FAIL | **0** | **0** |

The `1000 px` narrow-viewport warning is visible; it is absent at `>=1280 px`.
Mobile was not run because `<1000 px` is outside the product contract.

### Accessibility gate

Desktop-only run at `1440x900`:

| Scenario | Result |
|---|---|
| Public home + login | **PASS** |
| Guest Heat/Electrical | **FAIL** — `aria-allowed-attr`, critical, 2 nodes |
| Employee workspace/projects | **BLOCKED** — login harness cannot find `Пароль` |
| Overall desktop gate | **FAIL · 1 pass / 1 product fail / 1 blocked** |

Critical nodes expose unsupported `aria-required="true"` on:

- `div[data-testid="placement-select"]`;
- the insulation temperature-basis Ant Select shell.

The canonical accessibility spec also contains `390x844`, contradicting the
desktop-only viewport policy. That mobile branch was deliberately not run.

## 6. Evidence and reproducibility

| Metric | Current |
|---|---:|
| Agent scope fixtures | **10/10 PASS** |
| Unowned production files | **0** |
| Core entry docs | **8/8** |
| Core relative links | **113 checked · 0 broken** |
| Canonical commands documented | **2/2** |
| Binding evidence completeness | **1/1 · 100%** |
| Binding snapshot freshness | **1/1 · 100%** at source `452ec99` |
| Failed browser requests | **0** |
| Worktree before collection | **clean** |
| `.nvmrc` / `.node-version` | **22.13.0 / 22.13.0** |
| `frontend#engines.node` | `^20.19.0 || ^22.13.0 || >=24.0.0` |
| Collector runtime | **Node 23.5.0 — outside declared engines** |
| CI Node | major `20`, patch not pinned |
| Package lockfiles | frontend/e2e/qa-agent present |

Toolchain reproducibility is therefore **PARTIAL**, not PASS.

## 7. Priority after refresh

| Order | Finding | Urgency | Criticality | Improvement |
|---:|---|---|---|---|
| 1 | Desktop accessibility critical violation | `U0 NOW` | `K0 BLOCKER` | `I3 LARGE` |
| 2 | Heat route console error | `U0 NOW` | `K1 HIGH` | `I2 MEDIUM` |
| 3 | `/workspace` page overflow at 4/4 viewports | `U0 NOW` | `K1 HIGH` | `I2 MEDIUM` |
| 4 | Accessibility harness + mobile-policy contradiction | `U1 NEXT` | `K1 HIGH` | `I2 MEDIUM` |
| 5 | Full-cycle wall `214-230s` vs `120s` | `U1 NEXT` | `K1 HIGH` | `I3 LARGE` |
| 6 | No frontend performance budget; `ui-kit` 757 kB | `U1 NEXT` | `K1 HIGH` | `I2 MEDIUM` |
| 7 | Runtime Node outside declared engines | `U1 NEXT` | `K1 HIGH` | `I2 MEDIUM` |
| 8 | Five lint warnings | `U1 NEXT` | `K2 MEDIUM` | `I1 SMALL` |
| 9 | Two test contexts `>=500 LOC` | `U2 PLANNED` | `K2 MEDIUM` | `I2 MEDIUM` |
| 10 | Direct production Ant imports: 139 | `U2 PLANNED` | `K2 MEDIUM` | `I2 MEDIUM` |

## 8. Evidence files

Browser screenshots and accessibility snapshots are stored in
[`browser/`](./browser/). The manifest lists exact routes, viewports, console,
network and geometry results.

