# Frontend refactor backlog

**Статус:** EMPTY QUEUE (after P5–P9 corrective)

**Актуально на:** 2026-07-25  
**BASE (contested close):** `6a303f8`  
**Corrective branch:** `p59-corrective-closure`  
**Closure audit:** [p59-corrective-closure](../audit/2026-07-25-p59-corrective-closure/snapshot.md)

**Следующий незакрытый контракт:** —

Это **единственный** источник текущего `pending` для frontend. Одновременно
может существовать только одна ACTIVE frontend-очередь (когда pending есть).
Initiative plans, archive summaries и audit snapshots **не** маршрутизируют
`pending` и не объявляют `COMPLETE` при непустом backlog.

Очереди RISK / AF10–AF12 и corrective P5–P9 **закрыты** как ACTIVE work. Длинные
Done narratives — в
[archive/risk-recovery-and-p-series-historical.md](./archive/risk-recovery-and-p-series-historical.md)
и [archive/af12-historical.md](./archive/af12-historical.md).

### P5–P9 corrective (review response) — done

EMPTY QUEUE after `6a303f8` was **premature**. Corrective on isolated
`p59-corrective-closure` worktree:

- [x] **P7-CORRECTIVE** — all **25** band files classified  
  [audit](../audit/2026-07-25-p7-stateful-owner-inventory/snapshot.md)
- [x] **P8-CORRECTIVE** — pre-extract char baseline `b20f022` (400 LOC)  
  [audit](../audit/2026-07-25-p8-stateful-owner-char/snapshot.md)
- [x] **P9-CORRECTIVE** — owner **401→369** + `heatCalcExcelSelectionGestures.ts`  
  [audit](../audit/2026-07-25-p9-stateful-owner-extract/snapshot.md)
- [x] **P59-CORRECTIVE-CLOSE-01** — `test:agent-dod` **×2 PASS** (~151s / ~150s);
  ReportPage + cable-meta harden; populated desktop browser PASS;
  Excel UI **BLOCKED** by commercial flag (documented)

### Residual (not pending)

- Excel-selection live UI when `VITE_COMMERCIAL_FEATURES_ENABLED=true` on served build.
- Optional dual concurrent DoD re-proof.

Постоянные правила: [стандарт](./agent-development-standard.md).  
Размер slice: [PR budget](./pr-budget.md).  
Исполняемый шаблон: [мастер-промпт](./agent-refactor-prompt.md).  
Viewport / UI Kit: [viewport-policy](./viewport-policy.md), [ui-kit](./ui-kit.md).

## Правила очереди

- Один запуск выполняет один `pending` slice и одного owner.
- Пункт становится `done` только после focused proof (и DoD, если slice
  затрагивает runtime/tests/guardrails).
- Before-метрики пересчитываются из текущего дерева; audit snapshot не
  разрешает повысить baseline.
- Новый пункт — только по явной цели пользователя.
- Норматив хранит правила; счётчики — только в `docs/audit/YYYY-MM-DD-*/`.
- Не объявляй инициативу завершённой, пока в этом файле есть pending.

## Done index (short)

| Track | Where |
|---|---|
| AF9 | [archive/agent-friendly-9-plan-historical.md](./archive/agent-friendly-9-plan-historical.md) |
| RISK + P0–P9 | [archive/risk-recovery-and-p-series-historical.md](./archive/risk-recovery-and-p-series-historical.md) |
| AF10 | [archive/af10-historical.md](./archive/af10-historical.md) |
| AF11 | [archive/af11-historical.md](./archive/af11-historical.md) |
| AF12 + UI Kit | [archive/af12-historical.md](./archive/af12-historical.md) |
| Ant rollout A–D | [archive/ant-ui-kit-rollout-historical.md](./archive/ant-ui-kit-rollout-historical.md) |
| Meaningful CSS policy | [archive/meaningful-css-historical.md](./archive/meaningful-css-historical.md) + [css-strategy.md](./css-strategy.md) |

Representative audits: [P0](../audit/2026-07-24-p0-doc-truth/snapshot.md),
[RISK PASS](../audit/2026-07-25-frontend-risk-recovery/snapshot.md),
[AF12 UI Kit](../audit/2026-07-25-af12-uikit-agent-friendly/snapshot.md),
[docs cleanup](../audit/2026-07-25-frontend-docs-cleanup/snapshot.md).

## Optional residual risk (not pending)

Честные остатки; **не** делают очередь ACTIVE. Открыть slice — только user goal.
Progress 2026-07-25: [agent-friendliness residuals audit](../audit/2026-07-25-agent-friendliness-residuals/snapshot.md).

1. Dual both-green: **PASS** via `npm run test:agent-dod:dual` (~272s each, workers=2).
2. DoD median wall ≤120 s (single ~136 s — still open).
3. Deep browser blocked rows: wizard Add, Excel commercial flag, elec system tabs.
4. Further large-test / ratchet context splits (ObjectWizard **done**; ratchet optional).
5. Further 400–445 production extracts (FormulaDisplays + field registry types **done**).

Подробнее: [archive/af12-historical.md](./archive/af12-historical.md).

## Closure rule

После закрытия последнего pending:

1. статус **EMPTY QUEUE**, next=—;
2. evidence остаётся в archive/audit (не вторая очередь);
3. новый point-in-time audit при необходимости;
4. residual risk table может оставаться для честности, но не активирует очередь;
5. новый `pending` — только по явной user goal (один owner, один slice).
