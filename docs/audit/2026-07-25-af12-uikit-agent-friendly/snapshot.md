# AF12-UIKIT-AGENT-FRIENDLY-01 — CSS ownership close

**Status:** **PASS**  
**UTC:** 2026-07-25  
**Program:** UI Kit agent-friendly CSS ownership (slices 06A–06H)

## Acceptance checklist

| Criterion | Result |
|---|---|
| No mixed production `ui-kit.css` | **PASS** — deleted |
| No `ui-kit-responsive.css` production blob | **PASS** — deleted |
| JSX section → CSS owner | **PASS** — shell / foundation / data / primitives / heatcalc |
| Responsive rules next to owner base | **PASS** — 1200px per owner; reduced-motion on shell |
| No UI Kit `max-width: 768px` | **PASS** |
| Product contract ≥1000 px | **PASS** (06A) |
| Foreign selector / owner gate | **PASS** |
| Media contract (conditions shrink-only, contracts) | **PASS** (06B) |
| New breakpoints forbidden | **PASS** |
| Owner CSS ≤400 LOC | **PASS** (all owners under cap) |
| Import order in UIKitPage | **PASS** (owner gate) |
| Desktop browser matrix | **PASS** (runner 35 rows, 0 fails) |
| console/pageerrors/net | **0** |
| `npm run test:agent-dod` | **PASS** wall≈133 s |

## Target architecture (landed)

```text
UIKitPage.tsx
├── ui-kit-page-shell.css
├── ui-kit-foundation.css
├── ui-kit-primitives-showcase.css
├── ui-kit-data-showcase.css
└── ui-kit-heatcalc-reference.css
```

## Commits (slice chain)

- `docs(frontend): AF12-UIKIT-DESKTOP-CONTRACT-01 retire mobile acceptance`
- `test(frontend): AF12-CSS-MEDIA-CONTRACT-01 track responsive owners`
- `test(frontend): AF12-UIKIT-OWNER-GATE-01 enforce selector ownership`
- `refactor(frontend): AF12-UIKIT-MOBILE-CSS-01 remove unsupported layout`
- `refactor(frontend): AF12-UIKIT-HEAT/PRIMITIVES-RESPONSIVE-01 colocate owner rules`
- `refactor(frontend): AF12-UIKIT shell/foundation/data owners and retire ui-kit.css`
- (+ browser runner + this close)

## Residual

- Other product areas may still contain `max-width: 768px` outside UI Kit.
- Dual DoD / wall ≤120 s remain program-level AF12 residuals, not UI Kit ownership.
- Full deep state matrix for non–UI-Kit features is out of this close.

## Explicit

`Mobile <1000 px: OUT OF PRODUCT SCOPE, not tested, no support claim`.
