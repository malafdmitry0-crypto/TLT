# PR budget — frontend refactor / UI kit

**Актуально на:** 2026-07-23  
**Статус:** S0-lite factory rule (обязателен для agent и human PR).

## Budget (строго)

```text
max 1 page/shell file edited
max 2 production helper/CSS files
max 2 test files
1 domain only: heat | electrical | specification | ui | shared
characterization first
styles.css: net LOC ≤ 0 (prefer delete/move only)
```

Если нужно больше — **split PR** или stop + «Recommended next slice».

## Domain isolation

| Forbidden |
|---|
| heat ↔ electrical imports |
| `components/*` → `pages/*` (кроме allowlist; **не расширять** без shrink plan) |
| domain logic inside `ui-kit` |
| new feature CSS in `styles.css` |

## Proof by change type

| Change | Minimum proof |
|---|---|
| pure model | unit |
| ui-kit / form density | `npm run test:architecture` + UIKitLibrary + e2e ui-kit-parity |
| Heat form / layout | parity e2e + focused heat form e2e if available |
| Elec extract | focused electrical unit + relevant e2e |
| CSS move | parity or screen smoke; styles.css not grown |

## Commands

```bash
# Architecture + wizard islands
cd frontend && npm run test:architecture

# UI kit unit
cd frontend && npm test -- --run src/__tests__/unit/components/UIKitLibrary.test.tsx

# UI kit ↔ Heat SC-03 parity (dev stack on :3003)
cd e2e && E2E_BASE_URL=http://127.0.0.1:3003 npm run test:ui-kit-parity:chrome
```

## Agent prompt

Full strangler prompt: [agent-prompt-ui-kit-strangler.md](./agent-prompt-ui-kit-strangler.md)

## Next recommended slice

**Не угадывать.** Брать первый `pending` из  
[agent-hardening-plan.md](./agent-hardening-plan.md).

Сейчас: **ELEC1** Elec workspace table controller extract (P2 model-thin).  
Heat CSS split + `!important` 78. Proof: `cd frontend && npm run test:agent-gates`.

## Anti-goals

- Layout kit
- Glide rewrite «for beauty»
- Rewrite frontend from scratch
- Touch InsulationLayersTable without explicit request
- Weaken test assertions
