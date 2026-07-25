# AF12-BROWSER-FINAL-SEAL-01 — browser / Kontur seal

**SLICE_ID:** AF12-BROWSER-FINAL-SEAL-01  
**Status:** **PARTIAL PASS** — tooling unblocked + shell matrix green; deep state matrix residual  
**UTC:** 2026-07-25  
**HEAD:** `63c0ff1`

## Verdict

| Layer | Status |
|---|---|
| MCP registration + enable in session | **PASS** — `kontur_playwright` 21 tools, agent `use_tool` works |
| Live stack | **PASS** — `:3003` / `:8000` 200 |
| Shell routes × Kontur/TLT viewports (5 areas + home + ui-kit) | **PASS** — 28/28 ([matrix audit](../2026-07-25-af12-browser-matrix/snapshot.md)) |
| Full AF11/AF12 per-state Prompt-14 matrix | **not complete** — residual deep states |

## Evidence index (same HEAD)

| Package | Path | Result |
|---|---|---|
| Matrix shell | [`../2026-07-25-af12-browser-matrix/`](../2026-07-25-af12-browser-matrix/) | 28/28 pass |
| MCP smoke screenshots | `../2026-07-25-af12-browser-matrix/mcp-smoke/` | heat/elec/spec/reports |
| Config | [`.grok/config.toml`](../../../.grok/config.toml), [`.mcp.json`](../../../.mcp.json) | kontur_playwright |

## Area seal index (shell level)

| Area | Shell route @ multi-viewport | Deep states |
|---|---|---|
| Projects | **pass** (`/workspace` guest) | residual |
| Heat | **pass** (`/workspace/heat-calc`) | residual |
| Electrical | **pass** (`/workspace/elec-calc`) | residual |
| Specification | **pass** (`/workspace/specification`) | residual |
| Reports | **pass** (`/workspace/report`) | residual |

## What unblocked it

1. Register MCP (`kontur_playwright` → local `playwright-core` cli-stub + Chrome).  
2. In TUI `/mcps`: focus server → **Space** enable → wait **`[ready]`**.  
3. Agent session can then `search_tool` / `use_tool` `kontur_playwright__browser_*`.

## SAFE NEXT (depth only)

1. Prompt-14 style deep states per area (error, excel, wizard, A→B, permissions).  
2. Re-run final seal only when deep rows share this HEAD family.
