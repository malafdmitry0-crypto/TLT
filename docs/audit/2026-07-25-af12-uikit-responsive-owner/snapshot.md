# AF12-UIKIT-RESPONSIVE-OWNER-01

**SLICE_ID:** AF12-UIKIT-RESPONSIVE-OWNER-01  
**Status:** **PASS**  
**UTC:** 2026-07-25  
**BASE_HEAD:** `bd69ec622b98f793ba0e745b4bc7c57fbfa37c91` (`bd69ec6`)  
**Worktree:** isolated `TLT-af12-uikit-responsive` (user main WIP not touched)

## User decision

Previous **MIXED_OWNERSHIP** acceptance is **superseded**.

Option 3 executed: move entire responsive media blocks (including page-shell selectors) into `ui-kit-responsive.css` as one cascade owner.

## Product viewport decision

**Mobile &lt;1000 px: OUT OF PRODUCT SCOPE, not tested, no support claim.**

Desktop acceptance viewports only:

1000×768, 1024×768, 1280×800, 1366×768, 1440×900, 1440×1000, 1920×1080.

`@media (max-width: 768px)` still transferred mechanically (AST-equal); no mobile browser proof required.

## Production changes

| File | Role |
|---|---|
| `frontend/src/pages/ui-kit.css` | base page/showcase geometry, **0** `@media` |
| `frontend/src/pages/ui-kit-responsive.css` | **new** responsive owner, 3 media blocks |
| `frontend/src/pages/UIKitPage.tsx` | import responsive CSS **last** |
| `frontend/src/__tests__/unit/architecture/cssArchitectureBaseline.json` | exact after metrics |

Import order after:

```ts
import './ui-kit.css';
import './ui-kit-primitives-showcase.css';
import './ui-kit-heatcalc-reference.css';
import './ui-kit-responsive.css';
```

## Media counts before → after

| File | media before | media after | loc after |
|---|---:|---:|---:|
| `src/pages/ui-kit.css` | 3 | **0** | 608 |
| `src/pages/ui-kit-responsive.css` | — | **3** | 308 |
| `src/pages/ui-kit-primitives-showcase.css` | 0 | 0 | unchanged |
| `src/pages/ui-kit-heatcalc-reference.css` | 0 | 0 | unchanged |
| **totals.media** | **39** | **39** | shrink-only |

## AST equivalence

Three media blocks transferred byte-for-byte (SHA-256 match):

1. `@media (max-width: 1200px)`
2. `@media (max-width: 768px)`
3. `@media (prefers-reduced-motion: reduce)`

Selector lists not split; shell + showcase mixed selectors intentional.

## Browser proof (desktop)

Same state×viewport matrix before vs after on worktree Vite `:3010`:

**States:** default compact, comfortable density, heat reference section, primitives alerts/metrics, keyboard focus header  

**Viewports:** 7 desktop profiles above  

| Metric | Before | After |
|---|---:|---:|
| rows | 35 | 35 |
| overflowX fails | 0 | 0 |
| console errors | 0 | 0 |
| pageerrors | 0 | 0 |
| unexpected network fails | 0 | 0 |
| **max geometry delta** | — | **0.0 px** |
| computed display/grid/gap/padding/overflow mismatches | — | **0** |

Kontur Playwright MCP: navigate + screenshot + console on `http://127.0.0.1:3010/ui-kit` @ 1440×1000 — 0 warnings at warning level.

## Focused proof

- `git diff --check` clean  
- AST inventory equal  
- `npm run css:architecture` PASS  
- UIKit unit + integration PASS  
- `npm run typecheck` PASS  
- `npm run lint` PASS  

## Full DoD

`npm run test:agent-dod` **PASS** total wall=154.11s (gates 16.10 + unit||int 130.44 + build 7.57).

## Residual risk

- Legacy `@media (max-width: 768px)` remains in CSS ownership file; product does not support &lt;1000 px.  
- Main user worktree still holds unrelated WIP; this slice lives in isolated worktree until integrated.  

## Explicit

`Mobile <1000 px: OUT OF PRODUCT SCOPE, not tested, no support claim`.
