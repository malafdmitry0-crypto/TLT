# AF12 final audit

**UTC:** 2026-07-25  
**Program BASE_HEAD (start):** `efdf5a0` (wave5 tests) / planning seed `c03498b`  
**Status:** **PARTIAL PASS** — production 01–04 done; 05 docs done; 06/07/08 residual  

## Slice results

| Slice | Result | Evidence |
|---|---|---|
| AF12-HEAT-INSULATION-GEOMETRY-01 | **DONE** | removed `contain: inline-size` from layers host; e2e matrix expanded |
| AF12-HEAT-RANGE-FORM-01 | **DONE** | `Form.useForm` only in editable child; reference branch has no modal form |
| AF12-TLT-NUMBER-ADDON-01 | **DONE** | `addonAfter` → `Space.Compact` + unit sibling; CSS compressed under baseline |
| AF12-TLT-SELECT-POPUP-01 | **DONE** | `popupClassName` → `classNames.popup.root`; portal class test |
| AF12-CSS-OWNER-MAP-01 | **DONE** | `docs/audit/2026-07-25-af12-css-owner-map/snapshot.md` |
| AF12-UIKIT-RESPONSIVE-OWNER-01 | **BLOCKED** | mechanical move grew CSS media total 39→43 (ratchet); needs careful co-locate without media inflation |
| AF12-BROWSER-FINAL-SEAL-01 | **BLOCKED** | Kontur Playwright MCP unavailable |
| AF12-DOD-REPEATABILITY-01 | **PARTIAL** | single green DoD wall≈**155.92s** (median≤120 not met; dual-concurrent not run this session) |
| AF12-FINAL-AUDIT-01 | **THIS FILE** | |

## Full proof (this environment)

```text
npm run test:agent-dod
  agent-gates: exit=0 ~16.5s
  unit+integration: exit=0 ~131.7s
  build: exit=0 ~7.7s
  PASS total wall=155.92s
```

Kontur live browser: **not available** → geometry/deprecation seals are unit/e2e/DoD only.

## Note on test tree

Scenario-split files from waves 1–5 introduced `noUnusedLocals` typecheck failures (shared preambles).  
For green agent-gates, monolithes restored from pre-split commits under `frontend/src/__tests__` where needed.  
**Residual:** re-split with harness-only exports (no unused imports) without losing scenario filenames.

## Residual risk

1. Browser matrix not sealed (Kontur)
2. DoD median still ~156s (>120s); dual concurrent not proven
3. ui-kit.css still MIXED_OWNERSHIP for foreign responsive families
4. Insulation e2e AF12 viewports need live stack to confirm hostWidthRatio ≥0.85 after containment removal

## SAFE NEXT

1. Kontur: AF12-BROWSER-FINAL-SEAL-01  
2. AF12-UIKIT-RESPONSIVE-OWNER-01 with media-preserving co-location (no new `@media` wrappers)  
3. AF12-DOD-REPEATABILITY-01 profile + optional harness only if isolation-safe  
4. Test harness cleanup for scenario files (typecheck-clean splits)
