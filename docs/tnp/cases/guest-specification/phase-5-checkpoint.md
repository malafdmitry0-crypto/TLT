# Phase 5 checkpoint — specification / report / guest / CSV (local main)

- Ветка: **local `main`**
- Product decisions: PDL-ER-01…41
- Checkpoint: 19.07.2026
- Статус: **PARTIAL PASS — remaining open: perf 500 gate, Phase 4 data, corporate template**

## Closed

| Item | Status | Evidence |
|---|---|---|
| PDL-ER-01 multi-ЭР generate + «Выбрать все» | PASS | API + UI |
| PDL-ER-04 guest full BOM | PASS | guest generation allowed; manual PUT 403 |
| PDL-ER-07 settings snapshots versioned | PASS | project defaults + snapshot + stale |
| PDL-ER-08 dтр ≥ 57 inclusive | PASS | unit boundary |
| PDL-ER-26 guest TTL 3d defaults | PASS | config 4320 |
| CSV schema v3 + v2 import | PASS | project_io |
| barrel → tank (06) | PASS | project_io |
| Report UUID-first + multi chapters (39) | PASS | |
| PDL-ER-29 full-only | PASS | |
| PDL-ER-30 ≥1280 warning | PASS | MainLayout + e2e proof |
| PDL-ER-31 Rгр ≠ order reserve | PASS | |
| PDL-ER-32 proven tank/resistive partial | PASS | |
| **PDL-ER-33 catalog identity** | **PASS** | explicit mark/code/temp_group; SpecTable code column; no prefix oracle |
| **PDL-ER-34 PDF-first mapping** | **PASS** | `spec_source_mapping.json`; XLSX-only fail-closed |
| **PDL-ER-35 fail-closed + registry** | **PASS (data still external)** | `box_ex_rgr_matrix.json` status=missing; no silent defaults |
| PDL-ER-36 preflight | PASS | |
| PDL-ER-37 stale exclusion | PASS | |
| PDL-ER-38 grouping/merge | PASS | base+code |
| PDL-ER-41 guest manual import reject | PASS | |
| **ER5 write cutover (slots 1…5)** | **PASS** | migration 0031 + `_LEGACY_VARIANT_NUMBERS=1..5` |

## Actionable A pack (2026-07-19)

See `actionable-a-progress.md`. Closed without external data:
A1.1–A1.5, A1.7, A2.1 probe, A3 prep. A4 remaining partial.

## Still open / external

| Item | Status | Notes |
|---|---|---|
| PDL-ER-35 official matrix **data artifact** | EXTERNAL | code registry ready; needs source rows |
| PDL-ER-27 50→500 **full** wall-clock gate | PARTIAL | limit stays 50; probe script + unit probe |
| Phase 4 sections | BLOCKED | see phase-4-checkpoint.md |
| Phase 6 UUID-only execute | PREP ONLY | `docs/architecture/phase-6-uuid-cutover-prep.md` |
| PDL-ER-40 corporate template | OUT OF SCOPE | functional print ok |
| Full Playwright matrix beyond proof pack | PARTIAL | expanded `phase5-specification-proof.spec.ts` |
| A4 release hygiene | PARTIAL | HeatCalc settings fail / security drift outside ER slice |

## Commits (local main, no push)

- feat(phase5): catalog identity, PDF mapping, ER5 slots, residual gates
- 4270a02 settings snapshots, Ex/Rгр fail-closed, proven tank/resistive
- earlier Phase 5 slices
