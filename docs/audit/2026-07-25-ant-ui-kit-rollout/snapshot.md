# Ant UI Kit rollout — runtime execution snapshot

**UTC:** 2026-07-25  
**Status:** **RUNTIME PASS** (browser seal F still optional/deferred)  
**Strategy:** [ant-ui-kit-strategy.md](../../frontend/ant-ui-kit-strategy.md)  
**Rollout:** [ant-ui-kit-agent-rollout.md](../../frontend/ant-ui-kit-agent-rollout.md)

## Slices

| Slice | Result |
|---|---|
| A1 strategy/rollout MD | done (pre-existing) |
| A2 AF10 HISTORICAL | done |
| A3 AF11 PROPOSED | done |
| A4 Fast Refresh / lint 0/0 | done |
| A5 TltBadge forwardRef + Tooltip test | done |
| A6 action bar 1400 | done (already canonical) |
| B density 22/26/32 | done (`appTheme` + tokens + parity test) |
| C1–C3 form controls → Ant | done |
| C4 remove react-aria-components | done |
| D1–D8 primitives → Ant façades | done |
| E Storybook addon-vitest | deferred (stories already exist) |
| F full browser seal | deferred (contract matrix exists; Kontur MCP optional) |

## Proof (latest re-seal)

- `react-aria-components` removed from package.json / lockfile
- `src/utils/reactAriaEnvironment.ts` removed
- Public API `@/components/ui-kit` preserved
- `npm run lint` → 0/0
- `npm run test:agent-dod` → **PASS** wall≈154.97s
  - agent-gates exit=0 (~16s)
  - unit+integration exit=0 (~131s)
  - build exit=0 (~7.5s)
- ReportWizardPage ER5 preview re-verified green (was prior flake)

## Visual intent

Engine swap under Tlt façade; no feature redesign. Documented ARIA: number →
spinbutton; select → combobox. Micro engine chrome diffs possible; product
layout/contracts preserved.

## Deferred (not blockers for runtime close)

- **E:** `@storybook/addon-vitest` + a11y `test='error'` + `test-storybook`
- **F:** full desktop browser matrix (Kontur / manual) per
  [browser-state-matrix.md](../../frontend/browser-state-matrix.md)
