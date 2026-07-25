# AF12 final audit

**UTC:** 2026-07-25 (updated residual close)  
**Program BASE_HEAD (start):** `efdf5a0` (wave5 tests) / planning seed `c03498b`  
**Committed baseline at residual measure:** `e45b83f`  
**Status:** **PARTIAL PASS** — production 01–05 done; 06/07 blocked with evidence; 08 partial; scenario re-split pilot done

## Slice results

| Slice | Result | Evidence |
|---|---|---|
| AF12-HEAT-INSULATION-GEOMETRY-01 | **DONE** | removed `contain: inline-size` from layers host; e2e matrix expanded |
| AF12-HEAT-RANGE-FORM-01 | **DONE** | `Form.useForm` only in editable child; reference branch has no modal form |
| AF12-TLT-NUMBER-ADDON-01 | **DONE** | `addonAfter` → `Space.Compact` + unit sibling; CSS compressed under baseline |
| AF12-TLT-SELECT-POPUP-01 | **DONE** | `popupClassName` → `classNames.popup.root`; portal class test |
| AF12-CSS-OWNER-MAP-01 | **DONE** | [`2026-07-25-af12-css-owner-map/snapshot.md`](../2026-07-25-af12-css-owner-map/snapshot.md) |
| AF12-UIKIT-RESPONSIVE-OWNER-01 | **BLOCKED** | [`2026-07-25-af12-uikit-responsive-blocked/snapshot.md`](../2026-07-25-af12-uikit-responsive-blocked/snapshot.md) — media ratchet 39→43 reverted |
| AF12-BROWSER-FINAL-SEAL-01 | **TOOLING UNBLOCKED** / matrix pending | [`2026-07-25-af12-browser-final/snapshot.md`](../2026-07-25-af12-browser-final/snapshot.md) — `kontur_playwright` MCP registered (21 tools); five-area seal not yet run |
| AF12-DOD-REPEATABILITY-01 | **PARTIAL** | [`2026-07-25-af12-dod-repeatability/snapshot.md`](../2026-07-25-af12-dod-repeatability/snapshot.md) — 2× sequential green ~152.5 s median; dual FAIL contention; ≤120 s not met |
| AF12-SCENARIO-RESPLIT-PILOT | **DONE** | [`2026-07-25-af12-scenario-resplit/snapshot.md`](../2026-07-25-af12-scenario-resplit/snapshot.md) — objectWizardUtils + heatCalcExcelMode harness pattern |
| AF12-FINAL-AUDIT-01 | **THIS FILE** | |

## Full proof (this environment, residual)

```text
Sequential agent-dod (after typecheck-clean re-split complete):
  run2 PASS total wall=152.69s
  run3 PASS total wall=152.20s
  green min/median/max ≈ 152.20 / 152.45 / 152.69 s

Dual concurrent (two full DoDs in parallel):
  A FAIL total=276.85s  (HeatCalcPage.basics + project-isolation timeouts)
  B FAIL total=276.91s  (same under load)
  → dual stress NOT green (resource contention)

Kontur MCP: registered as kontur_playwright (21 tools) via .grok/config.toml + .mcp.json
  → refresh /mcps or new session, then run five-area matrix seal
UIKIT responsive owner move: BLOCKED (shrink-only media baseline)
```

## Residual risk

1. Browser **matrix** not sealed yet (MCP tooling unblocked; Prompt 14 ×5 + final seal pending)
2. DoD median ~152 s (>120 s goal); dual concurrent not green
3. `ui-kit.css` MIXED_OWNERSHIP for foreign responsive families (user decision)
4. Insulation live geometry (`hostWidthRatio ≥ 0.85`) needs live Kontur pass
5. Broader monolit re-split backlog (pilot only for two util families)

## SAFE NEXT

1. Refresh MCP (`/mcps` → `r` or new session) → run AF browser matrix (Projects→Reports) on clean HEAD  
2. User decision on AF12-06: keep mixed media in `ui-kit.css` (recommended) / baseline exception / larger redesign  
3. Optional dual re-run under quiet CPU; else isolate flaky HeatCalc findBy under load  
4. Extend typecheck-clean scenario re-split harness pattern to next monolithes as needed  
5. Wall-time work only if product priority (≤120 s still open)
