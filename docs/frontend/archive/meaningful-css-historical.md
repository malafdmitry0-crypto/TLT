# Meaningful CSS plan — historical summary

**Статус:** HISTORICAL — не очередь и не норматив  
**Период:** 2026-07-25  
**Related audit:** [frontend-agent-friendliness](../../audit/2026-07-25-frontend-agent-friendliness/snapshot.md)

Full `meaningful-css-plan.md` (PROPOSED runbook + prompts) removed from the
working tree. Live CSS rules live in [css-strategy.md](../css-strategy.md).

## What landed as policy (still normative elsewhere)

- CSS LOC is **observational** for audit, not a hard pass/fail.
- Quality gates: ownership, hotspot shrink-only, orphan detection, `!important`,
  raw colors, bare Ant, legacy palette, noncanonical breakpoints, static-inline
  ratchet.
- Static JSX `style`/`styles` debt is not a template for new code.

## What is NOT here

- no pending CSS queue
- no duplicate scorecards
- recover full prompts via git history
