# AF12-UIKIT-DESKTOP-CONTRACT-01

**Status:** **PASS**  
**UTC:** 2026-07-25  
**HEAD:** post-`a675780` docs slice  

## Decision

Product UI acceptance for UI Kit starts at **1000 px** CSS viewport.

| Viewport | Contract |
|---|---|
| &lt;1000 px | Out of product scope — not developed, not fixed, not required in matrix |
| ≥1000 px | Supported desktop matrix |
| `390×844`, `768×1024` | Removed from required UI Kit browser matrix |
| UI Kit `@media (max-width: 768px)` | Legacy → delete in AF12-UIKIT-MOBILE-CSS-01 |

Agents must not add mobile CSS/breakpoints for UI Kit without a separate product decision.

## Docs updated

- `docs/frontend/viewport-policy.md`
- `docs/frontend/ui-kit.md`
- this snapshot

## Explicit

`Mobile <1000 px: OUT OF PRODUCT SCOPE, not tested, no support claim`.
