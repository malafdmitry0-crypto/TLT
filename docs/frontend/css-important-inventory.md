# Inventory: `!important` by CSS owner (IMP1)

**Актуально на:** 2026-07-23 · HEAD after IMP0  
**Источник счёта:** `frontend/src/__tests__/unit/architecture/cssImportantBaseline.json`  
**Total:** **475** (сумма per-file = 475, совпадает с IMP0 gate)

Категории причины:

| Code | Meaning |
|---|---|
| `third-party` | beat Ant Design / CSS-in-JS / browser defaults |
| `inline` | fight inline styles |
| `specificity` | avoidable cascade war (candidate for root/token fix) |
| `duplicate` | likely duplicate/dead after island moves |
| `print` | print media color-adjust / hide chrome |
| `layout-lock` | intentional layout contract (dual-form density) |

---

## Summary by file

| File | Count | Share | Primary reason |
|---|---:|---:|---|
| `src/components/ui-kit/compact-fields.css` | 115 | 24.2% | third-party + layout-lock |
| `src/pages/heatcalc/heatcalc-workspace.css` | 106 | 22.3% | layout-lock + specificity |
| `src/components/wizard/insulation-layers-table.css` | 88 | 18.5% | third-party + layout-lock |
| `src/components/wizard/cable-algorithm-panel.css` | 45 | 9.5% | third-party + layout-lock |
| `src/components/wizard/heat-object-fields.css` | 28 | 5.9% | third-party + layout-lock |
| `src/styles/calc-spreadsheet.css` | 27 | 5.7% | third-party (table cells) |
| `src/pages/electrical/elec-workspace.css` | 17 | 3.6% | third-party (button variants) |
| `src/pages/ui-kit.css` | 15 | 3.2% | third-party (showcase parity) |
| `src/styles/print.css` | 9 | 1.9% | print |
| `src/pages/specification/specification-page.css` | 7 | 1.5% | third-party |
| `src/styles/form-grid-srs.css` | 7 | 1.5% | layout-lock (a11y hide) |
| `src/styles/app-base.css` | 5 | 1.1% | third-party |
| `src/pages/workflow-params.css` | 2 | 0.4% | layout-lock |
| `src/styles/table-chrome.css` | 2 | 0.4% | layout-lock |
| `src/components/ui-kit/primitives.css` | 1 | 0.2% | third-party |
| `src/pages/projects-page.css` | 1 | 0.2% | layout-lock (media) |
| **Total** | **475** | 100% | |

Top 5 owners: **115+106+88+45+28 = 382 (~80.4%)**.

---

## Top-5 owners (detail)

### 1. `compact-fields.css` — 115 · owner root `.tlt-compact-field*`

| Selector family | ~N | Category | States to preserve | Replacement path | Focused proof |
|---|---:|---|---|---|---|
| ant-form adapter label/row/item (`.tlt-compact-field-grid--ant-form .ant-form-item*`) | ~55 | third-party | horizontal label\|control, required mark off, error/extra | Ant Form `labelCol`/`colon` + ConfigProvider density tokens; stronger owner vars without !important | UIKitLibrary + Heat form |
| Tlt number/text/unit inside compact field | ~30 | layout-lock | height 26px, unit 9px, padding | component tokens on Tlt* only | FormControls + UIKit |
| labels-top side layout overrides | ~15 | specificity | side panel label-above | separate BEM modifier without fighting Ant | ObjectWizard side |
| media / grid collapse | ~15 | layout-lock | narrow 1-col | standard @media without !important where possible | narrow viewport |

**IMP2 target:** ≤40.  
**Route:** `/ui-kit`, HeatCalc wide+side form.

---

### 2. `heatcalc-workspace.css` — 106 · owner Heat workspace shell

| Selector family | ~N | Category | States | Replacement | Proof |
|---|---:|---|---|---|---|
| `.form-grid-srs--heat-structured` layout lock | ~25 | layout-lock | fields/layers stack | grid areas without !important if island isolation holds | Heat dual-form |
| dual-form banners | ~10 | layout-lock | banner density | tokens | Heat |
| insulation page-scope under `.inline-object-form` | ~40 | specificity / duplicate | wide/side layer chrome | CSS4 move to coherent owner; then reduce | Heat + wizard isolation |
| form-item labels/required | ~15 | third-party | required amber, no asterisk | Ant requiredMark + CSS vars | Heat form |
| media 1400/1500/1180 | ~16 | layout-lock | reflow | pure media | narrow/desktop |

**IMP3 target:** ≤35 sum Heat workspace owners after CSS1–4 split.  
**Route:** HeatCalc SC-03 dual-form.

---

### 3. `insulation-layers-table.css` — 88 · island root `.insulation-layers-table`

| Selector family | ~N | Category | States | Replacement | Proof |
|---|---:|---|---|---|---|
| layer group / cell form-item | ~45 | third-party + layout-lock | 5-col grid, dense cells | island-only Ant Form token; kill dual-form leaks | InsulationLayers + isolation |
| reference-picker in cell | ~15 | third-party | truncated value | picker CSS under island | wizard |
| number/unit inputs | ~15 | layout-lock | 26px track | Tlt contracts | unit tests |
| header/index | ~13 | layout-lock | sticky index | normal cascade | UI |

**IMP4 target:** ≤25. **Kill-list:** do not edit InsulationLayersTable TSX/formulas; CSS-only with visual proof.  
**Route:** Heat form with 1–3 insulation layers.

---

### 4. `cable-algorithm-panel.css` — 45 · root `.object-wizard-cable-panel`

| Selector family | ~N | Category | States | Replacement | Proof |
|---|---:|---|---|---|---|
| form-item label/row/control | ~30 | third-party | horizontal compact | same as compact-fields path | CableAlgorithm + isolation |
| mirror field labels | ~8 | layout-lock | read-only mirror | Tlt text styles | Cable panel |
| inputs | ~7 | third-party | 26px | TltNumberField | Cable panel |

**IMP5 target:** ≤15. Depends B3 (`allowClear` contract) for control API clarity.  
**Route:** Heat dual-form right cable panel.

---

### 5. `heat-object-fields.css` — 28 · root `.heat-object-fields`

| Selector family | ~N | Category | States | Replacement | Proof |
|---|---:|---|---|---|---|
| geometry/climate controls width/height | ~15 | third-party | content-sized controls | `--tlt-field-ctrl-*` without !important | Heat fields |
| insulation-settings-row | ~8 | third-party | settings row | CompactFieldGrid settings slot | Heat |
| hidden form items | ~5 | third-party | hidden slots | Ant `hidden` / noStyle | Heat |

**IMP6 target:** ≤10.  
**Route:** Heat object fields panel.

---

## Remaining files (brief)

| File | N | Category | Note |
|---|---:|---|---|
| `calc-spreadsheet.css` | 27 | third-party | table cell borders/backgrounds |
| `elec-workspace.css` | 17 | third-party | ER action button colors |
| `ui-kit.css` | 15 | third-party | showcase Ant parity |
| `print.css` | 9 | print | keep until print tokens |
| `specification-page.css` | 7 | third-party | tabs/table padding |
| `form-grid-srs.css` | 7 | layout-lock | pdf column title clip |
| `app-base.css` | 5 | third-party | global ant tweaks |
| others | ≤5 each | mixed | IMP7 |

---

## Burn-down order (from plan)

```text
IMP2 compact-fields (115→≤40)
IMP3 heat workspace owners after CSS1–4 (106→≤35)
IMP4 insulation island CSS-only (88→≤25)
IMP5 cable panel (45→≤15)
IMP6 heat-object-fields (28→≤10)
IMP7 rest (93→≤25)
```

Milestones: 475 → ≤350 → ≤250 → ≤150 (hardening DoD).

## Integrity

```text
sum(inventory file counts) = 475
IMP0 baseline total         = 475
match: YES
```
