# Open-six residual close wave

**Status:** **PARTIAL PASS** — lint, engines, bundle budget, Ant ratchet, LOC≥500, dual-safe green; DoD ≤120 and browser re-seal still open  
**UTC:** 2026-07-26  
**HEAD:** (this commit)  
**Prior dual-safe:** 147.34 s → **143.68 s**

## Checklist

| # | Item | Result |
|---:|---|---|
| 1 | DoD ≤120 | **OPEN** dual-safe **143.68 s** (unit+int concurrent **130.56 s**, gates 12.36 s). Gap ~24 s. Int still long pole. |
| 2 | LOC cap ≤350 | **PROGRESS** · >350: **22→19** · >400: **11→6** · ≥500: **2→0** (css helpers + e2e layout split) |
| 3 | Browser re-seal | **BLOCKED** · Docker daemon unavailable; no live frontend on :3003 |
| 4 | Lint warnings (react-refresh) | **PASS** · already closed `f9bcd28` (max-warnings 0 + export splits); gates lint green |
| 5 | Node 23.5 engines | **PASS** · `engines.node` includes `^23.0.0` |
| 6 | Ant direct + bundle budget | **PASS** · antImportRatchet baseline **139** shrink-only; `npm run budget:bundle` caps raw≤800 gzip≤250 (ui-kit ~740/227) |

## Landed artifacts

- CSS ratchet helpers split: `cssArchitectureRatchet.{constants,parse,collect,helpers}.ts`
- Slow unit suites split: cable selection + candidate mutation flows (4 scenario files)
- E2E heat-form-layout helpers/inspect extract (inspect-dom ≤400)
- `scripts/bundle-budget.mjs` + package scripts `budget:bundle` / `budget:bundle:build`
- `antImportRatchet.architecture.test.ts` + `antImportBaseline.json`
- engines.node: `^20.19.0 \|\| ^22.13.0 \|\| ^23.0.0 \|\| >=24.0.0`

## Dual-safe profile (n=1)

| Phase | Wall |
|---|---:|
| gates | 12.36 s |
| unit+int concurrent | 130.56 s |
| build:vite | 0.76 s |
| **total** | **143.68 s** |

## Residual next

1. DOD-WALL-INT harness extract on remaining int long poles (glide-modals / results-settings / cable-meta).
2. Continue LOC cap on 6 files still >400.
3. Browser re-seal when Docker/runtime up: a11y aria-required, useForm console, workspace overflow.
4. Optional: further ui-kit/antd chunk split only if measured win without budget thrash.

## Proof

- `npm run test:agent-gates` PASS
- focused mutation + css ratchet PASS
- `npm run test:agent-dod:dual-safe` PASS 143.68 s
- `npm run build:vite` + `node scripts/bundle-budget.mjs` PASS
