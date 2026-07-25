# Risk recovery + P0–P9 — historical summary

**Статус:** HISTORICAL — не очередь  
**Период:** 2026-07-24 — 2026-07-25  
**Audits:**  
- [P0 doc-truth](../../audit/2026-07-24-p0-doc-truth/snapshot.md)  
- [RISK recovery](../../audit/2026-07-25-frontend-risk-recovery/snapshot.md)  
- [P5 inventory](../../audit/2026-07-25-p5-test-context-inventory/snapshot.md)  
- [P7–P9 owner extract](../../audit/2026-07-25-p9-stateful-owner-extract/snapshot.md)  
- [AF12 UI Kit agent-friendly](../../audit/2026-07-25-af12-uikit-agent-friendly/snapshot.md)

Long Done narratives and full slice prompts previously embedded in
`refactor-backlog.md` were removed from the live queue file to cut agent noise.
Recover detailed prompt text via git history of `docs/frontend/refactor-backlog.md`.

## Motivation (short)

Problem was **not** LOC for its own sake, but **orchestration coupling**:
session / data / editing / presentation / effects in one page model. Green
typecheck can still break temporal invariants (project A→B switch, selection
reset, query invalidation, Excel vs normal mode).

## Closed programs (index only)

| Track | Result |
|---|---|
| P0–P4 residual | doc-truth, guardrail truth, elec feedback, type boundary, context reduction |
| RISK R1–R13 | heat/elec session extracts, type events, climate dead CSS, close proof |
| P5–P9 | test inventory, HeatCalcNormalGlideGrid scenario split, prod 400–448 audit, char + selection nav extract |
| AF12 UI Kit desktop | owner CSS map, desktop ≥1000, 768 media removal, browser runner |

## Agent rules that remain live

- characterization before production change
- one vertical slice / one owner
- project-switch isolation tests as canaries
- extract only consumer-owned use cases; parent stays composition root
- queue authority: [refactor-backlog.md](../refactor-backlog.md) only

## What is NOT here

- no live pending from these tracks
- no score «9/10» as permanent badge — re-score only in dated audit if needed
