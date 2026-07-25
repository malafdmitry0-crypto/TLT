# AF10 residual close plan

**Статус:** HISTORICAL / CLOSED — residual scorecard closed on AF10 final audit  
**Актуально на:** 2026-07-25 (закрыт)  
**Исходный runbook:** [agent-friendliness-fix-plan.md](./agent-friendliness-fix-plan.md)  
**Финальный audit:** [docs/audit/2026-07-25-frontend-agent-friendliness/snapshot.md](../audit/2026-07-25-frontend-agent-friendliness/snapshot.md)  
**Pending:** только [refactor-backlog.md](./refactor-backlog.md)  

> Не ACTIVE-очередь. Дальнейший hardening — [af11-agent-friendliness-hardening-plan.md](./af11-agent-friendliness-hardening-plan.md) (PROPOSED).

## Где мы сейчас

| Метрика | Сейчас | Цель | Закрыто? |
|---|---:|---:|---|
| Production >500 LOC | 0 | 0 | ✅ |
| Import contexts >20 | 0 | 0 | ✅ |
| Static inline debt | 0 | 0 | ✅ |
| Type escapes / `!important` / CSS raw colors outside tokens | 0 | 0 | ✅ |
| Architecture gates + agent-gates | green | green | ✅ |
| `test:agent-dod` (1 run observed) | green | 2× consecutive | ⚠️ 1/2 |
| Visual literals non-owner | 10 | 0 | ❌ |
| Ant primitives (core+ext) | 112 | 0 | ❌ |
| Legacy `--c-*`/`--a-*` вне tokens | 414 | 0 | ❌ |
| Bare `.ant-*` | 18 | 0 | ❌ |
| Noncanonical breakpoints | 31 | 0 | ❌ |
| Full browser/Kontur matrix + dual DoD audit | partial | PASS | ❌ |
| **Score** | **~8.6** | **≥9.0** | ❌ |

Нормативы slice: [agent-refactor-prompt.md](./agent-refactor-prompt.md), [pr-budget.md](./pr-budget.md), [css-strategy.md](./css-strategy.md), [ui-kit.md](./ui-kit.md), [viewport-policy.md](./viewport-policy.md).  
CSS residual предпочтительно вести per-owner runner из [meaningful-css-plan.md](./meaningful-css-plan.md).

**Правило:** один vertical slice = один debt class = один owner. Baseline только shrink. Не смешивать palette + Ant + breakpoints в одном PR.

---

## Фаза R0 — quick win (1–2 slices)

**Цель:** снять дешёвые нули, не блокирующие UI-kit.

### R0.1 — visual literals → 0
- **Debt:** visual non-owner (10)
- **Targets (сейчас):**
  1. `src/pages/uikit/uiKitModel.ts` (6)
  2. `src/components/layout/Sidebar.tsx` (3)
  3. `src/pages/electrical/ElecCalcElectricalTypeControls.tsx` (1)
- **Как:** presentation → owner CSS/tokens; demo colors UIKit — в CSS showcase / tokens; не в draw-loop CSS variables.
- **Proof:** `visualLiteralRatchet` + focused owner test; baseline `totalNonOwner=0`.

### R0.2 — dual agent-dod smoke (read-only)
- Уже был 1× green `test:agent-dod`.
- Перед финальным аудитом: **2× подряд** `npm run test:agent-dod` на чистом HEAD.
- Если flake — отдельный flake slice, не debt.

---

## Фаза R1 — Ant primitives → 0 (mapped only)

**Debt order (как в P15):** после static (уже 0) → Ant.

**Счётчик:** ~112 named mapped imports в core+extended baselines.

### R1.A — easy mapped (Button/Alert/Card/Tag/Input/InputNumber без hard Select)

Приоритет по count (пересканировать baseline перед стартом):

| Priority | File | Typical mapped |
|---|---|---|
| 1 | admin formula tabs (`formulas*Tab.tsx`) | Alert, Button, InputNumber, Select* |
| 2 | `ReportPage` / `ReportWizardPage` | Alert, Button, Card, Tag |
| 3 | admin `DatabasePage`, `UsersPage`, `ReferencesPage`, `CoefficientsPage` | Button/Card/Input/Tag |
| 4 | modal rows / settings rows | Button, InputNumber, Tag |
| 5 | wizard steps, summaries already partially migrated | leftovers |

\*Select: мигрировать только simple single-value. **STOP** на multi/search/filter combos.

**Правило STOP → capability slice:**
- multi-select / `showSearch` Select
- `Input.Password`
- dense table cell editor Select+InputNumber combos

Тогда отдельный slice:

```text
SLICE_ID: AF10-UIKIT-CAPABILITY-<SelectSearch|SelectMulti|Password|…>
OWNER: ui
ALLOWED: один Tlt component + CSS + unit + story
THEN: feature migration отдельным slice
```

### R1.B — filter dropdowns cluster (harder)

| File | Debt |
|---|---|
| `ElectricalColumnFilterDropdown.tsx` | Button, Input, InputNumber, Select |
| `ElectricalGlideColumnFilterDropdown.tsx` | same |
| `HeatCalcColumnFilterDropdown.tsx` | same |

Возможно потребует R1 capability slices **до** обнуления baseline.

### R1 exit
- `antdPrimitiveBaseline.json` files = `{}`
- `antdPrimitiveExtendedBaseline.json` files = `{}`
- `antdPrimitivePolicy` green

**Оценка объёма:** 12–25 slices (зависит от capability gaps).

---

## Фаза R2 — CSS residual (meaningful per-owner)

Порядок debt classes (после Ant/visual):

1. legacy palette  
2. bare Ant  
3. noncanonical breakpoints  

### R2.1 — legacy palette 414 → 0

**Правило:** ≤25 refs одной selector family за slice; semantic tokens only; при отсутствии смысла — один alias в `tokens.css`.

**Top owners (сейчас):**

| Refs | File |
|---:|---|
| 55 | `styles/table-chrome.css` |
| 44 | `components/ui-kit/primitives.css` |
| 41 | `pages/electrical/elec-workspace-summary.css` |
| 37 | `pages/ui-kit.css` |
| 32 | `pages/electrical/elec-workspace.css` |
| 29 | `styles/calc-spreadsheet-base.css` |
| 23 | `styles/tlt-form-controls.css` |
| 22 | `pages/ui-kit-primitives-showcase.css` |
| 20 | `styles/app-shell.css` |
| 18 | `components/wizard/insulation-layers-table.css` |
| … | heatcalc-* chrome, actionbar, form-grid |

**Оценка:** ~20–30 slices (414/25 ≈ 17 min; + token design friction).

**Proof each slice:** `css:architecture` (legacy total shrink) + no visual regression on owner (browser if visible).

### R2.2 — bare Ant 18 → 0

Сейчас total `bareAnt=18` в baseline (основные носители: `print.css`, `form-grid-srs.css`, `vendor-overrides.css`, `tlt-form-controls.css` — пересканировать measure).

**Как:** scope `.ant-*` под owner root class; не растить bare count.

**Оценка:** 4–8 slices.

### R2.3 — noncanonical breakpoints 31 → 0

**Mapping (из P15):**
- 520/640/720/760 → **768**
- 900/980/1100/1180 → **1200**
- 1500 → **1400**

**Правило:** один `@media` block за slice; geometry proof boundary±1 (старая и новая).

**Top owners (сейчас):** heatcalc insulation/app-shell (3), elec workspace/summary, ui-kit, CablePicker, heat dual-form/field-chrome/table, projects/spec/workflow/actionbar…

**Оценка:** 20–31 slices (часто 1 block = 1 slice).

---

## Фаза R3 — final audit (P16)

Только когда scorecard все zeros (кроме allowed runtime geometry / third-party adapters).

```text
SLICE_ID: AF10-FINAL-AUDIT-02
OWNER: qa
GOAL: доказать ≥9.0 на production HEAD
```

### Acceptance checklist
- [ ] ReportPage focused suite 10× sequential green  
- [ ] `npm run test:agent-gates` green  
- [ ] `npm run test:agent-dod` ×2 consecutive green  
- [ ] `npm run build-storybook` green  
- [ ] LOC>500 = 0, imports>20 = 0, static debt = 0  
- [ ] Ant core+ext baselines empty  
- [ ] visual non-owner = 0  
- [ ] legacy palette outside tokens = 0  
- [ ] bare Ant = 0  
- [ ] noncanonical media = 0  
- [ ] type escapes / !important / raw CSS colors / cycles = 0  
- [ ] Browser + Kontur: Projects, Heat, Electrical, Spec, Reports  
  - viewports: 1000×768, 1280×800, 1366×768, 1440×900, 1920×1080, + 1440×1000 / 390×844 Kontur  
  - states: empty/loading/error/populated/mutation/modal/keyboard  
  - console clean, no unexpected failed network  

### Deliverable
- `docs/audit/<date>-frontend-agent-friendliness/snapshot.md` status **PASS**  
- score **≥9.0** only after full PASS  
- backlog/pending update only after PASS  

---

## Рекомендуемый порядок исполнения

```text
R0.1 visual → 0
R1.A easy Ant (admin formulas, reports, admin pages)
R1 capability gaps as discovered
R1.B filter dropdowns
R2.1 legacy palette (largest CSS files first)
R2.2 bare Ant
R2.3 noncanonical breakpoints
R0.2 dual agent-dod (can re-run anytime; mandatory before R3)
R3 final audit
```

**Не делать параллельно** два debt class на одном owner.  
**Можно** параллелить независимые owners **только** если каждый PR — один class и baselines не конфликтуют (осторожно с shared `tokens.css` / architecture baselines).

---

## Оценка трудоёмкости (грубо)

| Phase | Slices | Effort band |
|---|---:|---|
| R0 visual + dod | 2–3 | small |
| R1 Ant | 12–25 | medium–large |
| R2.1 palette | 17–30 | large |
| R2.2 bare Ant | 4–8 | small–medium |
| R2.3 breakpoints | 20–31 | large (geometry proofs) |
| R3 audit | 1 | medium (browser matrix) |
| **Total** | **~55–100** | multi-session |

Практичный cut-line до **≥9.0 по plan acceptance** — все zeros.  
Практичный cut-line до **«agent-ready structural 9.0»** без полного CSS paint debt — уже почти достигнут; plan scorecard всё же требует CSS zeros.

---

## Готовые стартовые промпты

### Next recommended slice

```text
Работай из корня TLT. Один slice через docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF10-DEBT-VISUAL-01
OWNER: ui-kit / layout
GOAL: Обнулить raw visual color literals вне approved owners.
TARGETS in order:
  1. src/pages/uikit/uiKitModel.ts
  2. src/components/layout/Sidebar.tsx
  3. src/pages/electrical/ElecCalcElectricalTypeControls.tsx
DEBT_CLASS: visual literals only.
ALLOWED: target files + owner CSS/tokens + visualLiteralBaseline.json (+ css baseline if new CSS).
NON_GOALS: Ant migration, palette mass-replace, breakpoints.
INVARIANTS: shrink-only baselines; no UX change; no draw-loop CSS var reads.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/architecture/visualLiteralRatchet.architecture.test.ts
  + tsc --noEmit
EXIT: visualLiteralBaseline.totalNonOwner === 0.
```

### Then Ant admin formulas

```text
SLICE_ID: AF10-DEBT-ANT-FORMULAS-01
OWNER: admin/formulas
GOAL: Replace all mapped Ant primitives in one formulas*Tab.tsx with @/components/ui-kit.
If Select multi/search required → STOP and open UIKIT-CAPABILITY slice.
Update antdPrimitiveExtendedBaseline shrink-only.
FOCUSED_PROOF: antdPrimitivePolicy + FormulasPage tests + tsc.
```

---

## Definition of Done (residual close)

1. Все метрики scorecard = target zeros (кроме allowed runtime geometry / third-party adapters).  
2. Architecture suite + agent-gates + dual agent-dod green.  
3. Audit snapshot **PASS**, score ≥9.0.  
4. Нет незакоммиченного baseline slack (STALE_BASELINE forbidden).  

## Что уже не входит

- Heat mobile redesign `<1000px`  
- Полное удаление Ant Design (только mapped Tlt analogs)  
- Повышение baselines  
- Параллельный multi-class debt burn в одном PR  
