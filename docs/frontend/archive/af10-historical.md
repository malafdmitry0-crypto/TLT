# AF10 — historical summary

**Статус:** HISTORICAL — не очередь и не норматив  
**Период:** 2026-07-25  
**Final audit:** [docs/audit/2026-07-25-frontend-agent-friendliness/snapshot.md](../../audit/2026-07-25-frontend-agent-friendliness/snapshot.md)

Полные планы `af10-parallel-queue.md`, `af10-residual-close-plan.md` и
`agent-friendliness-fix-plan.md` удалены из working tree (шум scorecards /
executed prompts). Восстановление: `git log -- docs/frontend/af10*`.

## What closed

- Static CSS debt gates (legacy palette, bare Ant, noncanon media, visual
  non-owner) driven to target via meaningful-css + parallel queue.
- Wizard form connection / Ant UI kit groundwork for AF11–AF12.
- Residual scorecard closed on AF10 final friendliness audit.

## What is NOT here

- no `pending` queue
- no live «Сейчас» metrics
- current `pending` only in [refactor-backlog.md](../refactor-backlog.md)

## Residual

None as ACTIVE queue. Later hardening lived under AF11/AF12 (see their archive
summaries).
