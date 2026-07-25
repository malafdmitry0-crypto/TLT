# Frontend refactor backlog

**Статус:** ACTIVE

**Актуально на:** 2026-07-26  
**Queue open reason:** explicit user goal — residual «optional residual, not
pending» (dense production 400-band + heavy test contexts) must be real
`pending`, not EMPTY QUEUE cosmetics.  
**Inventory at open:** **22** files in **400–445** LOC (production).  
**Last closed production:** P-TEST-02 HeatCalc basics @ `df94f01`

**Следующий незакрытый контракт:** `P-TEST-03`

Это **единственный** источник текущего `pending` для frontend. Одновременно
может существовать только одна ACTIVE frontend-очередь. Initiative plans,
archive summaries и audit snapshots **не** маршрутизируют `pending` и не
объявляют `COMPLETE` при непустом backlog.

Очереди RISK / AF10–AF12 и corrective P5–P9 **закрыты** как historical work.
Длинные Done narratives — в
[archive/risk-recovery-and-p-series-historical.md](./archive/risk-recovery-and-p-series-historical.md)
и [archive/af12-historical.md](./archive/af12-historical.md).

Постоянные правила: [стандарт](./agent-development-standard.md).  
Размер slice: [PR budget](./pr-budget.md).  
Исполняемый шаблон: [мастер-промпт](./agent-refactor-prompt.md).  
Viewport / UI Kit: [viewport-policy](./viewport-policy.md), [ui-kit](./ui-kit.md).  
Test split template: [split-large-tests-by-scenario](./prompts/split-large-tests-by-scenario.md).

## Правила очереди

- Один запуск выполняет один `pending` slice и одного owner.
- Пункт становится `done` только после focused proof (и DoD, если slice
  затрагивает runtime/tests/guardrails).
- Before-метрики пересчитываются из текущего дерева; audit snapshot не
  разрешает повысить baseline.
- Новый пункт — только по явной цели пользователя.
- Норматив хранит правила; счётчики — только в `docs/audit/YYYY-MM-DD-*/`.
- Не объявляй инициативу завершённой, пока в этом файле есть pending.
- Extract: behavior-preserving; characterization first for stateful owners;
  after owner **≤399 LOC**; no multi-owner cascade in one slice.

## Motivation (why this queue is ACTIVE)

После P5–P9 corrective backlog wrongly stayed **EMPTY QUEUE** while:

1. **22** production files still sit in the dense **400–445** LOC band
   (agent open cost + extract debt).
2. Heavy test contexts remain after partial scenario splits (integration /
   unit / e2e / harness open paths).

That residual was filed as «optional residual, not pending». User goal
overrides that: **these items are pending**.

Prior inventories / waves (evidence only, not queue authority):

- [P7 band classification](../audit/2026-07-25-p7-stateful-owner-inventory/snapshot.md)
- [Agent-friendliness residuals](../audit/2026-07-25-agent-friendliness-residuals/snapshot.md)
- [Heavy test files](../audit/2026-07-26-heavy-test-files/snapshot.md)
- [Five residual fixes (partial)](../audit/2026-07-26-agent-friendliness-five-fixes/snapshot.md)

---

## Pending — Track A: production 400-band extracts

**Goal:** leave the 400–445 production band empty (or only newly grown files
re-inventoried later). One file per slice. Recompute LOC at start of each slice.

Order = risk first (stateful hooks/pages → interactive components → pure
util/domain/api/types).

| # | ID | Status | Owner | Path (approx LOC at queue open) | Extract hint |
|---:|---|---|---|---|---|
| 1 | **P-BAND-01** | **done** `6cf5007` | heat | `useHeatCalcPreferences.ts` **445→323** | [audit](../audit/2026-07-25-p-band-01-prefs/snapshot.md) |
| 2 | **P-BAND-02** | **done** `9c21b70` | admin | `DatabasePage.tsx` **444→230** | [audit](../audit/2026-07-25-p-band-02-database/snapshot.md) |
| 3 | **P-BAND-03** | **done** `907d435` | electrical | `useElecCalcElectricalColumnRenderers.tsx` **443→255** | [audit](../audit/2026-07-25-p-band-03-elec-renderers/snapshot.md) |
| 4 | **P-BAND-04** | **done** `f1a3a64` | heat | `utils/heatCalcInlineEdit.ts` **442→322** | [audit](../audit/2026-07-26-p-band-04-inline-edit/snapshot.md) |
| 5 | **P-BAND-05** | **done** `503539c` | electrical | `utils/electricalCandidateTableColumnsCore.ts` **437→257** | [audit](../audit/2026-07-26-p-band-05-candidate-columns/snapshot.md) |
| 6 | **P-BAND-06** | **done** `83e4c08` | electrical | `ElectricalCandidateGlideGrid.tsx` **430→367** | [audit](../audit/2026-07-26-p-band-06-candidate-glide/snapshot.md) |
| 7 | **P-BAND-07** | **done** `bb0189c` | heat | `HeatCalcGlideGrid.tsx` **429→363** | [audit](../audit/2026-07-26-p-band-07-heat-glide/snapshot.md) |
| 8 | **P-BAND-08** | **done** `bc07b4f` | shared | `api/calculations.ts` **428→212** | [audit](../audit/2026-07-26-p-band-08-calculations-api/snapshot.md) |
| 9 | **P-BAND-09** | **done** `525c1a3` | heat | `utils/heatCalcExcelMode.ts` **427→256** | [audit](../audit/2026-07-26-p-band-09-excel-mode/snapshot.md) |
| 10 | **P-BAND-10** | **done** `99c5726` | heat | `heatCalcColumnRenderers.tsx` **423→293** | [audit](../audit/2026-07-26-p-band-10-heat-renderers/snapshot.md) |
| 11 | **P-BAND-11** | **done** `14e1059` | shared | `types/calculation.ts` **413→109** | [audit](../audit/2026-07-26-p-band-11-calculation-types/snapshot.md) |
| 12 | **P-BAND-12** | **done** `2d35d28` | heat | `domain/heatCalcFieldRules.ts` **412→254** | [audit](../audit/2026-07-26-p-band-12-field-rules/snapshot.md) |
| 13 | **P-BAND-13** | **done** `8538079` | heat | `useHeatCalcNormalGlideController.ts` **412→396** | [audit](../audit/2026-07-26-p-band-13-normal-glide-controller/snapshot.md) |
| 14 | **P-BAND-14** | **done** `b54cd23` | heat | `useHeatCalcTableColumns.tsx` **411→287** | [audit](../audit/2026-07-26-p-band-14-table-columns/snapshot.md) |
| 15 | **P-BAND-15** | **done** `498dfe8` | reports | `ReportWizardPage.tsx` **409→264** | [audit](../audit/2026-07-26-p-band-15-report-wizard/snapshot.md) |
| 16 | **P-BAND-16** | **done** `5040267` | electrical | `ElectricalCandidateColumnSettingsModal.tsx` **409→239** | [audit](../audit/2026-07-26-p-band-16-candidate-settings/snapshot.md) |
| 17 | **P-BAND-17** | **done** `61ef37f` | heat | `useObjectWizardFormSync.ts` **407→310** | [audit](../audit/2026-07-26-p-band-17-form-sync/snapshot.md) |
| 18 | **P-BAND-18** | **done** `8d3afae` | heat | `useHeatCalcObjectsDataModel.ts` **406→389** | [audit](../audit/2026-07-26-p-band-18-objects-data/snapshot.md) |
| 19 | **P-BAND-19** | **done** `ec34232` | heat | `InsulationLayersTable.tsx` **406→246** | [audit](../audit/2026-07-26-p-band-19-insulation-layers/snapshot.md) |
| 20 | **P-BAND-20** | **done** `a156bf0` | electrical | `utils/electricalTableColumns.ts` **405→387** | [audit](../audit/2026-07-26-p-band-20-electrical-columns/snapshot.md) |
| 21 | **P-BAND-21** | **done** `be25348` | heat | `useHeatCalcWorkspaceDataModel.ts` **405→303** | [audit](../audit/2026-07-26-p-band-21-workspace-data/snapshot.md) |
| 22 | **P-BAND-22** | **done** `8c57663` | specification | `useSpecificationPageModel.ts` **403→384** | [audit](../audit/2026-07-26-p-band-22-spec-model/snapshot.md) |

**Acceptance per P-BAND-NN:**

1. Single owner; ≤ budget from `pr-budget.md`.
2. Characterization for stateful/interactive before extract.
3. Owner file **≤399 LOC** after; extracted modules named by use-case.
4. Focused tests green; `test:agent-dod` if runtime/tests touched.
5. Audit note under `docs/audit/YYYY-MM-DD-p-band-NN-*/snapshot.md` with
   before/after LOC + HEAD.
6. Mark this row `done` in the same docs closure commit.

If a file is already ≤399 after recompute (another slice shrunk it), mark
done with evidence and take next pending — do not invent extra extract.

---

## Pending — Track B: heavy test contexts

**Goal:** reduce agent open cost for large suites/harnesses still above
comfortable scenario size. Prefer scenario split for suites; helpers extract
for ratchets/harnesses (do **not** fake scenario-split a machine gate).

Template: [split-large-tests-by-scenario](./prompts/split-large-tests-by-scenario.md).

| # | ID | Status | Owner | Path (approx LOC at queue open) | Action |
|---:|---|---|---|---|---|
| 1 | **P-TEST-01** | **done** `b6c7672` | qa | catalog-recalc **509 → 3 scenarios (≤217)** | [audit](../audit/2026-07-26-p-test-01-catalog-recalc/snapshot.md) |
| 2 | **P-TEST-02** | **done** `df94f01` | qa | basics **507 → 4 scenarios (≤278)** | [audit](../audit/2026-07-26-p-test-02-heat-basics/snapshot.md) |
| 3 | **P-TEST-03** | **pending** | qa | `integration/pages/ReportPage.test.tsx` (~481) | scenario split |
| 4 | P-TEST-04 | pending | architecture | `unit/architecture/inlineStyleRatchet.architecture.test.ts` (~582) | helpers extract (keep gate cohesive) |
| 5 | P-TEST-05 | pending | qa | `integration/…/elecCalcPageTestEnv.tsx` (~676 harness) | thin env barrel / pure fixtures (no scenario fiction) |
| 6 | P-TEST-06 | pending | qa | `unit/pages/HeatCalcPage.test-mocks.tsx` (~643) | further mock clusters if open-cost still high |
| 7 | P-TEST-07 | pending | qa | e2e `electrical-candidate-selection.spec.ts` (~667) | journey split |
| 8 | P-TEST-08 | pending | qa | e2e `inline-form-dependencies.spec.ts` (~643) | journey split |

**Order:** complete **Track A first** (production band), then Track B in table
order — unless the user names a specific test slice.

**Acceptance per P-TEST-NN:** same `it` titles/asserts; monolit removed or
thinned; focused green; no production change unless fixing test-only import
path; audit snapshot with before/after LOC.

Already done (do not re-open as monolit): HeatCalcNormalGlideGrid, ObjectWizard,
variant selection/tabs, objects data model, candidates, cable-meta, table-batch,
headers-scroll, cssArchitectureRatchet helpers, HeatCalcPage.test-utils barrel.
See [heavy-test audit](../audit/2026-07-26-heavy-test-files/snapshot.md) +
[five-fixes](../audit/2026-07-26-agent-friendliness-five-fixes/snapshot.md).

---

## Process notes (not pending unless user promotes)

These are product/ops targets, **not** a second queue and **not** a reason to
claim EMPTY QUEUE while Track A/B are open:

- DoD wall ≤120s — often unreachable on this host (integration alone can exceed
  120s); dual DoD path exists (`test:agent-dod:dual` / `dual-safe`).
- Deep browser blocked rows (wizard Add, elec system tabs seed) — environment /
  seed, not extract debt.
- Excel live UI source ungated (2026-07-26); served build must match source.

---

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
| P5–P9 corrective | [p59-corrective-closure](../audit/2026-07-25-p59-corrective-closure/snapshot.md) |
| Heavy-test wave + five residuals | [heavy-test](../audit/2026-07-26-heavy-test-files/snapshot.md), [five-fixes](../audit/2026-07-26-agent-friendliness-five-fixes/snapshot.md) |

### Corrective P5–P9 (closed)

- [x] **P7-CORRECTIVE** — all band files classified  
  [audit](../audit/2026-07-25-p7-stateful-owner-inventory/snapshot.md)
- [x] **P8-CORRECTIVE** — pre-extract char baseline  
  [audit](../audit/2026-07-25-p8-stateful-owner-char/snapshot.md)
- [x] **P9-CORRECTIVE** — excel selection gestures extract  
  [audit](../audit/2026-07-25-p9-stateful-owner-extract/snapshot.md)
- [x] **P59-CORRECTIVE-CLOSE-01** — DoD + browser evidence  
  [audit](../audit/2026-07-25-p59-corrective-closure/snapshot.md)

Representative audits: [P0](../audit/2026-07-24-p0-doc-truth/snapshot.md),
[RISK PASS](../audit/2026-07-25-frontend-risk-recovery/snapshot.md),
[AF12 UI Kit](../audit/2026-07-25-af12-uikit-agent-friendly/snapshot.md).

## Closure rule

После закрытия **последнего** pending (Track A **and** Track B):

1. статус **EMPTY QUEUE**, next=—;
2. evidence остаётся в archive/audit (не вторая очередь);
3. новый point-in-time audit при необходимости;
4. process notes may remain for honesty, but do not activate the queue alone;
5. новый `pending` — только по явной user goal (один owner, один slice).
