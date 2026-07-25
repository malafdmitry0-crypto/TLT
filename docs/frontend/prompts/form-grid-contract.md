# FORM-GRID-CONTRACT-01 — CompactFieldGrid form layout (strangler)

**Статус:** исполняемый prompt / норматив  
**Актуально на:** 2026-07-26  
**Pending authority:** только [refactor-backlog.md](../refactor-backlog.md)

Полный контракт: [ui-kit.md](../ui-kit.md) · CSS-механика: [css-strategy.md](../css-strategy.md).

## Scope

| Phase | Что | Когда |
|---|---|---|
| 0 | Baseline inventory | always |
| 1 | Docs MUST/MUST NOT | if contract unclear on HEAD |
| 2 | ONE form section migrate | only with explicit owner/section |
| 3 | Optional machine guard | separate slice if user asks |

## MUST (forms only)

- New form layout → `CompactField` + `CompactFieldGrid` (`@/components/ui-kit`)
- Layout coords on **section grid root**, not domain field classes
- Migrate: delete replaced path; no dual layout
- Desktop ≥1000; no mobile-by-default

## MUST NOT

- Mandatory CSS Grid for entire app (toolbar/shell/Glide/tables)
- Second form kit (Ant Row/Col as form system)
- Field-by-field permanent coordinate maps
- Mass migrate all features in one PR

## Phase 2 one-liner

```text
SLICE_ID: FORM-GRID-MIGRATE-<SECTION>
OWNER: heat | electrical | specification
GOAL: migrate one form section to CompactFieldGrid; remove legacy coords
CHARACTERIZATION first; agent-gates; browser 1000/1280/1440 if UI visible
```

## Proof

```bash
cd frontend
npm run test:agent-gates
# if runtime/tests: npm run test:agent-dod
```

Reference already on HEAD: `HeatCalcObjectFieldsPanel` + UI Kit showcase.
