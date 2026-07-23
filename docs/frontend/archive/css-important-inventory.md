# Inventory: `!important` by CSS owner (IMP1 + burn-down status)

> Архивный snapshot. Текущий baseline всегда читать из architecture baseline.

**Актуально на:** 2026-07-23 · after IMP2–IMP7 safe burn-down  
**Источник счёта:** `frontend/src/__tests__/unit/architecture/cssImportantBaseline.json`  
**Total:** **78** (was 475; hardening DoD ≤150 ✅; long-term ≤75 almost)

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

## Summary by file (post burn-down)

| File | Count | Target | Status |
|---|---:|---:|---|
| `src/components/ui-kit/compact-fields.css` | 27 | ≤40 (IMP2) | ✅ |
| `src/components/wizard/cable-algorithm-panel.css` | 12 | ≤15 (IMP5) | ✅ |
| `src/components/wizard/insulation-layers-table.css` | 12 | ≤25 (IMP4) | ✅ CSS-only |
| `src/pages/heatcalc/heatcalc-workspace.css` | 9 | ≤35 (IMP3) | ✅ |
| `src/pages/ui-kit.css` | 8 | part of IMP7 | ✅ |
| `src/components/wizard/heat-object-fields.css` | 6 | ≤10 (IMP6) | ✅ |
| `src/styles/calc-spreadsheet.css` | 3 | part of IMP7 | ✅ |
| `src/pages/specification/specification-page.css` | 1 | part of IMP7 | ✅ |
| others | 0 | — | cleared |
| **Total** | **78** | ≤150 DoD | ✅ |

### Burn-down method (repeatable)

1. Strip `!important` from pure owner selectors (no `.ant-*` / form-item).
2. Strip layout props (`flex`/`grid`/`gap`/`min-width`/…) globally.
3. Strip width/margin/padding/display/color/font-weight/line-height `!important`; keep `height`/`font-size`/`content`/`border-radius` (and print/z-index locks) where third-party still wins.

Proof: `npm run css:architecture` + `npm run test:architecture` + UIKitLibrary + FormControls.

Remaining 78 are mostly Ant height/font-size locks and intentional colon/`content` overrides — long-term path is Ant ConfigProvider density tokens + owner-root tokens without CSS-in-JS fights.

---

## Top remaining owners

### 1. `compact-fields.css` — 27 · `.tlt-compact-field*`

Primarily control height / font-size / Ant colon `content: none` under `--ant-form`.

### 2. `cable-algorithm-panel.css` — 12 · `.object-wizard-cable-panel`

Height/font locks vs Ant inputs in cable panel.

### 3. `insulation-layers-table.css` — 12 · `.insulation-layers-table`

Island cell height/font (TSX/formulas not touched).

### 4. `heatcalc-workspace.css` — 9 · Heat shell

Residual dual-form density locks.
