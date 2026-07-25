# AF11 — historical summary

**Статус:** HISTORICAL — не очередь и не норматив  
**Период:** 2026-07-25  
**Audits:**  
- [af11-agent-friendliness](../../audit/2026-07-25-af11-agent-friendliness/snapshot.md)  
- [af11-browser-final](../../audit/2026-07-25-af11-browser-final/snapshot.md)  
- [af11-feedback-profile](../../audit/2026-07-25-af11-feedback-profile/snapshot.md)  
- [af11-context-inventory](../../audit/2026-07-25-af11-context-inventory/snapshot.md)

Full runbook `af11-agent-friendliness-hardening-plan.md` removed from the
working tree. Recover via git history if needed.

## What closed

- Doc-truth / single ACTIVE queue discipline reinforced.
- Feedback loop profile for agent gates / DoD noise.
- Browser **contract** matrix introduced (schema + required states).
- Partial practical hardening; remaining deep seal moved to AF12.

## Living contracts (not this archive)

- [browser-state-matrix.md](../browser-state-matrix.md) — state × viewport
  evidence schema (thematic contract, not a queue).
- [viewport-policy.md](../viewport-policy.md), [css-strategy.md](../css-strategy.md).

## Residual

Deep state rows and full same-HEAD seal continued under AF12; see
[af12-historical.md](./af12-historical.md).
