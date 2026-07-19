# Phase 5 checkpoint — specification / report / guest / CSV (local main)

- Ветка: **local `main`**
- Product decisions: PDL-ER-01…41
- Checkpoint: 19.07.2026
- Статус: **PARTIAL PASS — PDL-ER-29/37 landed; 30–36/38–41 and full DoD open**

## Closed

| Item | Status | Evidence |
|---|---|---|
| PDL-ER-01 multi-ЭР generate + «Выбрать все» | PASS | API + UI |
| PDL-ER-04 guest full BOM | PASS | guest generation allowed; manual PUT 403 |
| PDL-ER-08 dтр ≥ 57 inclusive | PASS | unit boundary |
| PDL-ER-26 guest TTL 3d defaults | PASS | config/live 4320 |
| CSV schema v3 export + v2 import | PASS | project_io |
| barrel/бочка → tank (06) | PASS | project_io |
| Report UUID-first preview | PASS | electrical_variant_id alone |
| **PDL-ER-29 full-only product mode** | **PASS** | UI switcher removed; API/service coerce `basic`→`full`; tests |
| **PDL-ER-37 stale out of report/export/print** | **PASS** | report context strips items when stale; red UI banner; print CSS hide table |
| **PDL-ER-36 preflight + confirm partial** | **PASS** | 409 PREFLIGHT_CONFIRMATION_REQUIRED + confirm_partial; UI Modal |

## Still open

- PDL-ER-30 desktop ≥1280 warning
- PDL-ER-31 Rгр vs 10% order reserve semantics fix
- PDL-ER-32 proven-only tank/resistive partial
- PDL-ER-33 catalog identity
- PDL-ER-34 PDF-first formula source
- PDL-ER-35 Ex/Rгр matrix data-blocked
- PDL-ER-38 pipe/tank/common grouping
- PDL-ER-39 multi-ЭР report chapters
- PDL-ER-40 print CSS corporate scope (partial functional ok)
- PDL-ER-41 guest manual import reject / source mismatch trust
- PDL-ER-07 settings snapshots
- PDL-ER-27 perf 50→500
- ER5 write cutover
- Phase 4 blocked 15/18/28

## Verification (this slice)

- backend `test_specifications` + `test_reports` — PASS
- frontend SpecificationPage + ReportPage — PASS
