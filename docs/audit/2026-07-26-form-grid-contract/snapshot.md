# FORM-GRID-CONTRACT-01 — docs contract (Phase 0–1)

**Status:** **PASS** (docs-only; no production runtime change)  
**UTC:** 2026-07-26  
**Verified HEAD (start):** `12c45b0`  
**Host:** dmitrys-MacBook-Pro.local · Node v23.5.0  
**Owner:** frontend-process  

## Commands

```bash
git rev-parse HEAD
git status --short
# CompactFieldGrid usage
grep -rn 'CompactFieldGrid' frontend/src --include='*.tsx' --include='*.ts'
# grid coordinates sample
grep -rn 'grid-column\|grid-row' frontend/src --include='*.css' | head
```

## Phase 0 baseline

| Item | Finding |
|---|---|
| Primitive | `frontend/src/components/ui-kit/CompactFieldGrid.tsx` (columns, flow, density, antFormAdapter) |
| Barrel | `@/components/ui-kit` exports CompactFieldGrid |
| Reference adoption | `HeatCalcObjectFieldsPanel` (3× CompactFieldGrid + antFormAdapter) |
| Showcase | `UIKitPage`, `UIKitHeatReferenceSection` |
| Shared form chrome | `styles/form-grid-srs.css` (legacy/shared SRS form grid) |
| Prior docs | ui-kit already had form contract; **lacked** crisp MUST/MUST NOT vs “all CSS Grid” |

## Phase 1 changes

| File | Change |
|---|---|
| `docs/frontend/ui-kit.md` | Status → норматив; MUST/MUST NOT/MAY table; SAFE NEXT migrate list; ban “all UI grid” |
| `docs/frontend/css-strategy.md` | Form section: MUST CompactFieldGrid; clarify not shell/table mandate |
| `docs/frontend/prompts/form-grid-contract.md` | Executable short prompt for Phase 2+ |

## Production code

**None** (docs-only slice).

## Phase 2 not executed

No explicit form section named by user. SAFE NEXT (one slice each):

1. Heat wizard / side-form legacy islands (if still on field-level coords)
2. Electrical form islands on planned touch
3. Specification form sections on touch

## DoD (docs-only)

- [x] MUST/MUST NOT clear in ui-kit
- [x] Explicit: not global CSS Grid mandate
- [x] css-strategy aligned
- [x] audit snapshot with HEAD/UTC/commands
- [x] no production behavior change

## Residual

- Legacy forms remain until touched (by design)
- No new architecture ratchet (optional separate slice)
- Runtime API unchanged; agents must read ui-kit before form layout work
