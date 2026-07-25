# AF12-CSS-OWNER-MAP-01 — CSS ownership audit

**UTC:** 2026-07-25  
**BASE_HEAD (planning):** `c03498b` (Ant UI-kit A–D)  
**BASE_HEAD (execution inventory):** current worktree after AF12 production patches  
**Status:** **PASS (docs-only inventory)** — live Kontur browser matrix **not** available in this environment  
**Owner:** css

## Method

```bash
find frontend/src -name '*.css' -print0 | xargs -0 wc -l | sort -n
# total ≈ 10229 lines (planning seed was 10247; delta from form-control compact CSS compress)
```

CSS architecture ratchet: green after AF12 number-addon CSS compression.

## Files >400 LOC

| LOC | File | Import / DOM owner | Verdict |
|---:|---|---|---|
| 910 | `pages/ui-kit.css` | `UIKitPage.tsx` | **MIXED_OWNERSHIP** — page chrome + foreign `.uikit-heatcalc-*` / primitive families in shared `@media` blocks |
| 637 | `pages/electrical/elec-workspace.css` | ElecCalc workspace shell | **COHESIVE_LARGE** — electrical workspace layout |
| 572 | `components/ui-kit/primitives.css` | ui-kit primitives / Tlt* | **COHESIVE_LARGE** — design-system primitives |
| 554 | `components/ui-kit/compact-fields.css` | CompactField / form density | **COHESIVE_LARGE** |
| 499 | `pages/heatcalc/heatcalc-field-chrome-core.css` | Heat form field chrome | **COHESIVE_LARGE** |
| 479 | `styles/table-chrome.css` | shared table chrome (heat/elec consumers) | **COHESIVE_LARGE** (shared chrome owner; multi-consumer by design) |
| 455 | `styles/calc-spreadsheet-base.css` | spreadsheet base shared | **COHESIVE_LARGE** (shared) |
| 405 | `pages/electrical/elec-workspace-summary.css` | electrical summary strip | **COHESIVE_LARGE** |

File at exactly 400 (`insulation-layers-table.css`) excluded by AF12 rule `>400`.

## MIXED: `ui-kit.css`

**Seam (for AF12-UIKIT-RESPONSIVE-OWNER-01):**

1. Responsive rules rooted in `.uikit-heatcalc-*` / `.uikit-heatcalc-reference*` → `ui-kit-heatcalc-reference.css`
2. `.uikit-alerts`, `.uikit-primitive-*`, `.uikit-metrics` responsive rules → `ui-kit-primitives-showcase.css`
3. Keep page shell (header, grids, colors) in `ui-kit.css`
4. Preserve import order: `ui-kit.css` → `ui-kit-primitives-showcase.css` → `ui-kit-heatcalc-reference.css`

**Risk:** media blocks currently interleave shell + foreign selectors; move must split selector lists without changing declarations.

**Browser states to catch regression (when Kontur available):**

| State | Viewport |
|---|---|
| `/ui-kit` heat reference + action bar | 1000×768, 1440×1000, 1920×1080 |
| `/ui-kit` primitives alerts/tabs/metrics | 1280×800, 1440×900 |
| Prefer reduced-motion only observational | — |

## Browser proof this run

**BLOCKED:** Kontur Playwright MCP not available in execution environment.  
No production CSS moved in this audit slice.

## Residual

- AF12-UIKIT-RESPONSIVE-OWNER-01 remains the only justified CSS move from this map
- Shared `table-chrome` / `calc-spreadsheet-base` are cohesive shared owners — do **not** split only for LOC
