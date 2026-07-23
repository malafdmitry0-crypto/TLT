# Heat CSS inventory (CSS1)

> Архивный snapshot завершённого CSS split; line ranges больше не нормативны.

**Актуально на:** 2026-07-23  
**Owner file:** `frontend/src/pages/heatcalc/heatcalc-workspace.css` (~2561 LOC)  
**Importer:** `HeatCalcWorkspaceLayout.tsx`  
**Цель CSS2–CSS4:** move-only splits by section; parent shrinks; no visual rewrite.

## Section map (line ranges)

| Lines | Section | Proposed owner file | CSS slice |
|---:|---|---|---|
| 1–197 | Workspace shell/layout/resize handle | `heatcalc-workspace-shell.css` | CSS2 |
| 198–448 | Dual-forms shell, heat-structured SC-03 pane, media | `heatcalc-dual-form-shell.css` | CSS2 |
| 449–857 | Side-form shell + wide/inline placement maps | `heatcalc-side-form-layout.css` | CSS3 |
| 858–1676 | Dual-form field chrome (non-insulation) | `heatcalc-field-chrome.css` | CSS3 |
| 1677–2290 | SC-03 banner/table/errors residual | `heatcalc-workspace-table.css` | CSS2 residual |
| 2291–2561 | Insulation page-scope residual (island SoT stays in wizard) | `heatcalc-insulation-page.css` | CSS4 |

## Class roots

| Root | Role |
|---|---|
| `.heatcalc-workspace-shell` / `--layout` / `--form-pane` | chrome layout |
| `.heatcalc-dual-forms*` | heat\|cable dual columns |
| `.inline-object-form*` / `.object-wizard-*-panel` | wizard form host |
| `.form-grid-srs--heat-structured` | SC-03 grid |
| `.insulation-*` under workspace | page-scope only; table island = `insulation-layers-table.css` |

## Rules

- Do not edit InsulationLayersTable TSX.
- Island SoT remains `components/wizard/insulation-layers-table.css`.
- After each move: update `cssArchitectureBaseline.json` (per-file LOC), parent shrinks, total LOC ≤ baseline total.
- Import order preserved (shell → dual → side → chrome → residual → insulation).

## Proof after splits

```bash
npm run css:architecture
npm run test:architecture
# focused heat form unit/integration if available
```
