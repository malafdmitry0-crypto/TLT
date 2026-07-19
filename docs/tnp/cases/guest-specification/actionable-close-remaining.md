# Actionable close-all progress (2026-07-19)

Everything closable without external data / Phase 6 execute.

| ID | Item | Status | Evidence |
|---|---|---|---|
| C3 | Expand Playwright pack | **DONE** | `phase5-specification-proof` + `phase5-actionable-close` |
| C1 | Perf gate @50 | **DONE** | `scripts/perf-gate-phase5.sh` green (builder probe) |
| C5 | Guest TTL expiry path | **DONE** | `test_guest_ttl_expiry_path.py` (short TTL sim + 401) |
| C2 | Phase 6 soft characterization | **DONE** | slot alignment + model bridge markers |
| C9 | Report no-mixing matrix | **DONE** | `test_report_no_mixing.py` |
| R2 | Alembic heads | **DONE** | `alembic heads` = `current` = **0031** |
| R1 | Security deps | **PARTIAL** | bumped PyJWT 2.13.0, python-multipart 0.0.31; residual: starlette (via fastapi), setuptools, weasyprint (no clean fix) |
| C6 | Firefox smoke | **SKIPPED** | Playwright config chromium-only; no firefox project |
| C8 | Docs | **DONE** | this file + checkpoint/README touch |

## Still cannot close

- Phase 4 data, Ex/Rгр matrix data, 500 wall-clock raise, Phase 6 execute, corporate template
