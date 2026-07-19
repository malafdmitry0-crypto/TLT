# Actionable checklist A — progress (2026-07-19)

Branch: local `main`. Super-prompt residual work without external data.

| ID | Item | Status | Evidence |
|---|---|---|---|
| A1.1 | Playwright Phase 5 proof pack | **DONE** | `e2e/tests/phase5-specification-proof.spec.ts` + `helpers/phase5-api.ts` |
| A1.2 | Post-UI / post-flow DB invariants | **DONE** | `scripts/db-business-invariants.sql` (slots 1..5 + settings_version); `test_phase5_actionable_flow.py` |
| A1.3 | CSV v3 round-trip path | **DONE** | flow test export asserts `schema_version;3` |
| A1.4 | Corrupt + guest manual import reject | **DONE** | corrupt CSV keeps project; manual BOM guest reject; unit helper tests already covered detector |
| A2.1 | Perf probe 50 | **DONE** | `scripts/perf-probe-phase5.py` + unit probe; live: N=10 ~0.6ms, N=50 ~0.3ms pure builder (2026-07-19) |
| A1.7 | Report multi-ER explicit UUID / no implicit selection | **DONE** | flow + e2e report tests |
| A3.1–A3.3 | Phase 6 prep | **DONE** | `docs/architecture/phase-6-uuid-cutover-prep.md` + `test_phase6_prep_inventory.py` |
| A1.5 | Guest TTL 3d semantics | **DONE** | auth integration: 1d idle kept; >TTL removed with product 4320 |
| A4.* | Release hygiene | **PARTIAL** | documented; HeatCalc settings separator / security gate not fixed in this slice |

## Still external (not A)

- Phase 4 section catalog data
- Ex/Rгр matrix rows
- Full 500×5 wall-clock gate before limit raise
- Phase 6 UUID-only execute
- Corporate template (40)
