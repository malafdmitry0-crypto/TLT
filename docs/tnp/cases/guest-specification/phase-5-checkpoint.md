# Phase 5 checkpoint — specification / report / guest / CSV (local main)

- Ветка: **local `main`**
- Product decisions: PDL-ER-01…41
- Checkpoint: 19.07.2026
- Статус: **PARTIAL PASS — major Phase 5 slices landed; PDL-ER-29…41 not yet verified; DoD not complete**

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
- Canonical full-only product mode and basic compatibility removal (PDL-ER-29)
- Desktop min-width warning / print contract (PDL-ER-30)
- Separate `Rгр` semantics and snapshot without double reserve (PDL-ER-31)
- Proven-only tank/resistive partial without formula substitution (PDL-ER-32)
- Exact catalog identity/default without prefix/row-order inference (PDL-ER-33)
- PDF-first formula source policy and no automatic XLSX-only rules (PDL-ER-34)
- Official per-row `Ex/Rгр` matrix; dependent boxes stay data-blocked (PDL-ER-35)
- One preflight/confirmation + atomic multi-ЭР partial generation (PDL-ER-36)
- Stale read-only and excluded from totals/print/report/export (PDL-ER-37)
- Default pipe/tank/common grouping with optional base+code merge (PDL-ER-38)
- Multi-ЭР report with independent chapters and no cross-ЭР sums (PDL-ER-39)
- Functional report acceptance separated from corporate template (PDL-ER-40)
- CSV v3 trust/RBAC cases: v2 import-only, source mismatch stale, guest manual-row reject (PDL-ER-41)
- Full Playwright flow 1–17 + browser UI proof after multi-select
- Phase 6 legacy removal search-gate

## Phase 4

**BLOCKED** PDL-ER-15/18/28 until official numeric catalog.
