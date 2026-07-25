# AF12-UIKIT-RESPONSIVE-OWNER-01 — BLOCKED

**UTC:** 2026-07-25  
**Status:** **BLOCKED** (architecture ratchet)  
**BASE_HEAD at decision:** `e45b83f` (+ local typecheck-clean re-split WIP)

## Why blocked

`cssArchitectureBaseline.json`:

| File | baseline media |
|---|---:|
| `src/pages/ui-kit.css` | 3 |
| `src/pages/ui-kit-heatcalc-reference.css` | **0** |
| `src/pages/ui-kit-primitives-showcase.css` | **0** |
| **totals.media** | **39** (shrink-only) |

Foreign responsive rules (`.uikit-heatcalc-*`, `.uikit-alerts`, `.uikit-primitive-*`, `.uikit-metrics`) live inside **mixed** `@media (max-width: 1200|768)` blocks that also hold page-shell rules.

Moving them into owner files requires **new `@media` blocks** on owners with **media baseline 0** → per-file `CSS_MEDIA_GREW` and usually `CSS_TOTAL_MEDIA_GREW`.

Prior mechanical attempt grew totals media **39 → 43** and was reverted.

## Options (user decision)

1. **Keep mixed media in `ui-kit.css`** — accept MIXED_OWNERSHIP as page-level media co-location (recommended default).
2. **Raise media baseline** for showcase files (+ totals) with explicit exception.
3. **Larger redesign** — move entire media blocks including shell selectors (out of AF12 scope).

## SAFE NEXT without decision

Do not attempt ownership move; continue DoD repeatability + typecheck-clean scenario re-split.
