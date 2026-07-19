# Phase 5 checkpoint — specification / report / guest / CSV (local main)

- Ветка: **local `main`**
- Product decisions: PDL-ER-01…28
- Checkpoint: 19.07.2026
- Статус: **PARTIAL PASS — major Phase 5 slices landed; DoD not complete**

## Closed in Phase 5 so far

| Item | Status | Commit / evidence |
|---|---|---|
| PDL-ER-01 multi-ЭР generate + «Выбрать все» | PASS | earlier Phase 5 partial |
| PDL-ER-04 guest full BOM | PASS | earlier Phase 5 partial |
| PDL-ER-08 dтр ≥ 57 inclusive | PASS | earlier Phase 5 partial |
| PDL-ER-26 guest TTL 3d defaults | PASS | config + live stack |
| CSV schema v3 export + v2/v3 import | PASS | `feat(project-io): export CSV schema v3…` |
| barrel/бочка → tank (PDL-ER-06) | PASS | project_io normalize |
| Report UUID-first preview | PASS | electrical_variant_id alone; ER5 no legacy block |
| Report service filters by UUID | PASS | calcs/specs scoped by electrical_variant_id |

## Still open for full Phase 5 DoD

- UUID-only write data plane for ER5 (composite FK / CHECK cutover for calc/spec writes)
- Settings snapshots (PDL-ER-07) versioned + stale-on-defaults-change
- Order-length procurement vs Lсек×Nсек (depends on Phase 4 sections)
- Perf gate before raising 50→500 (PDL-ER-27)
- Full Playwright flow 1–17 + browser UI proof after multi-select
- Phase 6 legacy removal search-gate

## Phase 4

**BLOCKED** PDL-ER-15/18/28 until official numeric catalog.
