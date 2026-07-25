# AF12-BROWSER-FINAL-SEAL-01 — browser / Kontur seal

**SLICE_ID:** AF12-BROWSER-FINAL-SEAL-01  
**Status:** **BLOCKED**  
**UTC:** 2026-07-25  
**BASE_HEAD reference:** `e45b83f` (+ local WIP re-splits)

## Verdict

**BLOCKED** — live browser matrix cannot be sealed in this session.

## DECISION NEEDED

| Item | Detail |
|---|---|
| **FILE** | `docs/audit/2026-07-25-af12-browser-final/snapshot.md` |
| **EVIDENCE** | MCP tool discovery for Kontur / Playwright browser (`kontur playwright browser`) returned **no matching tools**. Same blocker as AF11: no `mcp__kontur_playwright__browser_*` (or approved equivalent) attached. |
| **DECISION NEEDED** | Re-run browser matrix (Projects, Heat, Electrical, Spec, Reports) + AF12 viewports for insulation geometry in an environment with Kontur Playwright MCP (or documented substitute). Do **not** promote historical AF10/AF11 screenshots as AF12 seal. |

## Contract ready (not executed)

- State matrix: [`docs/frontend/browser-state-matrix.md`](../../frontend/browser-state-matrix.md)
- Evidence schema (AF11): [`docs/audit/2026-07-25-af11-browser-contract/evidence.schema.json`](../2026-07-25-af11-browser-contract/evidence.schema.json)
- Insulation e2e matrix expanded in-repo (AF12-HEAT-INSULATION-GEOMETRY-01) — unit/e2e only until live stack confirms `hostWidthRatio ≥ 0.85`

## Area seal index

| Area | Result |
|---|---|
| Projects | **not_run** / tooling blocked |
| Heat | **not_run** / tooling blocked |
| Electrical | **not_run** / tooling blocked |
| Specification | **not_run** / tooling blocked |
| Reports | **not_run** / tooling blocked |

## Explicit non-claims

- No PASS from source inspection alone.
- No reuse of AF10/AF11 screenshots as AF12 proof.
- Dual DoD / unit green is **not** a browser seal.

## Next action

1. Attach Kontur Playwright browser MCP (or approved substitute).
2. Execute full matrix on one clean production HEAD shared with DoD greens.
3. Only then mark this slice PASS.
