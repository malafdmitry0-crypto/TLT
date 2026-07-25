# AF12-UIKIT-MOBILE-CSS-01

**Status:** **PASS**  
**UTC:** 2026-07-25  

## Change

Removed UI Kit-only `@media (max-width: 768px) { ... }` from
`frontend/src/pages/ui-kit-responsive.css`.

## Proof

- Inventory of removed block: `removed-768-media.css`
- Block applies only at width ≤768 px; supported product viewports start at **1000 px**, so desktop cascade is unchanged.
- Remaining media: `max-width: 1200px`, `prefers-reduced-motion: reduce`
- `totals.media` baseline **39 → 38** (shrink)
- `mediaConditionMaxWidths` still lists 768 for other non–UI-Kit feature CSS until their owners delete it

## Explicit

`Mobile <1000 px: OUT OF PRODUCT SCOPE, not tested, no support claim`.
