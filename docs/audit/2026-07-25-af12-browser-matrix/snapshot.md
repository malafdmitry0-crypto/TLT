# AF12 browser matrix (Kontur unblocked)

**UTC:** 2026-07-25T17:02:37Z  
**HEAD:** `63c0ff1` (`63c0ff1def9592a848efe669a76511cde2de9cd6`)  
**Status:** **PASS (shell routes)** / deep AF11 state rows still open  

## What was re-tried (previous blockers)

| Previously failed | Result now |
|---|---|
| `search_tool(kontur_playwright)` empty | **21 tools** discovered |
| `use_tool(kontur_playwright__browser_navigate)` | **works** (home, heat, elec, spec, report) |
| `browser_take_screenshot` / `browser_console_messages` | **works** |
| Live stack | fe/be **200** |
| Browser matrix | **28/28 pass** workspace routes × viewports |

## MCP smoke (this session)

Guest bootstrap: `POST /api/v1/auth/guest` → `localStorage` session.

MCP screenshots (agent-driven):

- `mcp-smoke/af12-mcp-heat-1440x1000.png`
- `mcp-smoke/af12-mcp-electrical-1440x1000.png`
- `mcp-smoke/af12-mcp-specification-1440x1000.png`
- `mcp-smoke/af12-mcp-reports-1440x1000.png`

Console on heat (warning level): **0** messages returned.

## Automated matrix

Script: [`scripts/af12-kontur-browser-matrix.mjs`](../../../scripts/af12-kontur-browser-matrix.mjs)  
Engine: `playwright-core` + Chrome (same stack as `kontur_playwright` MCP)

| Metric | Value |
|---|---:|
| rows | **28** |
| pass | **28** |
| fail | **0** |

### Coverage

**Areas:** home, projects/workspace, heat, electrical, specification, reports, ui-kit  

**Viewports:**

| Profile | Size |
|---|---:|
| `kontur-desktop` | 1440×1000 |
| `tlt-primary-qa` | 1440×900 |
| `tlt-dense-1280` | 1280×800 |
| `tlt-shell-1000` | 1000×768 |

Per row: screenshot + geometry JSON + overflow + console counts + failed network.

Evidence: [`evidence.json`](./evidence.json), [`screenshots/`](./screenshots/), [`geometry/`](./geometry/)

### kontur-desktop sample (all pass)

| Area | overflowX | pageerrors | unexpected net |
|---|---|---:|---:|
| home | false | 0 | 0 |
| projects/workspace | false | 0 | 0 |
| heat | false | 0 | 0 |
| electrical | false | 0 | 0 |
| specification | false | 0 | 0 |
| reports | false | 0 | 0 |
| ui-kit | false | 0 | 0 |

## Explicit non-claims

This package **does not** claim full AF11 Prompt-14 depth for every `state_id` in
[`browser-state-matrix.md`](../../frontend/browser-state-matrix.md)
(error injection, Excel mode, all wizard/permission variants, A→B isolation UI, etc.).

It **does** claim:

1. Kontur Playwright MCP is **connected and usable** in agent session.
2. Guest workspace shell for all five product areas + UI kit is green on required Kontur desktop + core TLT viewports with no pageerrors / horizontal overflow / unexpected API failures in this run.

## Reproduce

```bash
# stack on :3003 and :8000
node scripts/af12-kontur-browser-matrix.mjs
# + in Grok with kontur_playwright [ready]: browser_navigate / screenshot
```
