# AF12-BROWSER-FINAL-SEAL-01 — browser / Kontur seal

**SLICE_ID:** AF12-BROWSER-FINAL-SEAL-01  
**Status:** **TOOLING UNBLOCKED** — matrix seal still pending  
**UTC:** 2026-07-25  
**BASE_HEAD reference:** `d997064`

## Verdict history

| Stage | Status |
|---|---|
| Earlier this session | **BLOCKED** — no MCP tools |
| After config land | **TOOLING UNBLOCKED** — `kontur_playwright` healthy, 21 tools |
| Full five-area seal | **pending** — run Prompt 14 ×5 + Prompt 15 after MCP tools visible in agent session |

## What was blocked

Tool discovery returned no `kontur_playwright` / Playwright browser tools.  
Root cause: **MCP server never registered in Grok** (`grok mcp list` empty).  
Stack itself was fine (`http://127.0.0.1:3003` and `:8000/health` → 200).

## Unblock (done)

### Registered server

| Field | Value |
|---|---|
| Name | `kontur_playwright` |
| Transport | stdio |
| Binary | `node e2e/node_modules/playwright-core/lib/tools/mcp/cli-stub.js` |
| Browser | Chrome headless |
| Default viewport | `1440×1000` (Kontur desktop profile) |
| Output dir | `.playwright-mcp/` (gitignored) |
| Config (Grok project) | [`.grok/config.toml`](../../../.grok/config.toml) |
| Config (compat `.mcp.json`) | [`.mcp.json`](../../../.mcp.json) |

### Proof

```text
$ grok mcp doctor kontur_playwright
  ✓ command found
  ✓ server started
  ✓ handshake OK
  ✓ 21 tools discovered

$ grok inspect
  MCP Servers (2)
  └ kontur_playwright (stdio)  config
  └ postgres (stdio)           .mcp.json
```

Tools exposed by the server (namespaced as `kontur_playwright__*` in Grok):

- `browser_navigate`, `browser_snapshot`, `browser_take_screenshot`
- `browser_click`, `browser_type`, `browser_fill_form`, `browser_press_key`
- `browser_tabs`, `browser_resize`, `browser_console_messages`, `browser_network_requests`
- + select/hover/drag/dialog/file/wait/evaluate/run_code/close/navigate_back

### Activate in a running Grok session

Config is on disk; **this agent turn may still show 0 tools until MCP list is refreshed**:

1. Open `/mcps` and press **`r`** (refresh), **or**
2. Start a **new** Grok session in the TLT repo.

Then verify:

```text
search_tool("kontur_playwright browser")
# expect kontur_playwright__browser_navigate etc.
```

## Full seal still pending

Contract ready:

- [`docs/frontend/browser-state-matrix.md`](../../frontend/browser-state-matrix.md)
- Evidence schema: [`docs/audit/2026-07-25-af11-browser-contract/evidence.schema.json`](../2026-07-25-af11-browser-contract/evidence.schema.json)

| Area | Result |
|---|---|
| Projects | **not_run** (tooling ready) |
| Heat | **not_run** (tooling ready) |
| Electrical | **not_run** (tooling ready) |
| Specification | **not_run** (tooling ready) |
| Reports | **not_run** (tooling ready) |

## SAFE NEXT

1. Refresh MCP in session (`/mcps` → `r`) or new session.  
2. Run AF browser matrix Prompt 14 per area on HEAD `d997064` (or newer clean HEAD).  
3. AF12-BROWSER-FINAL-SEAL only when all five area evidence packages share one HEAD.
