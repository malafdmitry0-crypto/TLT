# Phase 5 checkpoint — specification / report / guest / CSV (local main)

- Ветка: **local `main`**
- Product decisions: PDL-ER-01…41
- Checkpoint: 19.07.2026
- Статус: **PARTIAL PASS — major product slices closed; residual open below**

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
| **PDL-ER-29 full-only product mode** | **PASS** | UI switcher removed; coerce `basic`→`full` |
| **PDL-ER-37 stale out of report/export/print** | **PASS** | strip stale items; red banner; print hide |
| **PDL-ER-36 preflight + confirm partial** | **PASS** | 409 + confirm_partial; UI Modal |
| **PDL-ER-41 guest manual import reject** | **PASS** | import blocks guest+manual BOM rows |
| **PDL-ER-31 Rгр ≠ cable order reserve** | **PASS** | cable qty without Rгр; kits use Rгр |
| **PDL-ER-38 object_section grouping + merge** | **PASS** | Трубопроводы/Ёмкости/Общие + merge base+code |
| **PDL-ER-39 multi-ЭР report chapters** | **PASS** | multi UUID preview + independent chapters |
| **PDL-ER-30 desktop ≥1280 warning** | **PASS** | MainLayout banner when width < 1280 |

## Still open

- PDL-ER-32 proven-only tank/resistive partial (methodology)
- PDL-ER-33 catalog identity (full explicit fields)
- PDL-ER-34 PDF-first formula source mapping
- PDL-ER-35 Ex/Rгр matrix **data-blocked**
- PDL-ER-40 corporate template (functional print ok; not final brand)
- PDL-ER-07 settings snapshots versioned
- PDL-ER-27 perf 50→500 + 30s
- ER5 write cutover (composite FK)
- Phase 4 blocked 15/18/28
- Full Playwright 1–17 + desktop UI proof pack

## Commits (local main, no push)

- `26a1107` feat(phase5): BOM grouping, multi-ER report chapters, 1280px warning
- `93647d5` guest import trust and Rгр cable semantics
- `0afed5d` preflight confirmation for partial multi-ER BOM
- `5a9037b` full-only BOM and stale report exclusion
- earlier: CSV v3, UUID report, PDL docs 29–41
