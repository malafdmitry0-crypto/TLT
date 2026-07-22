# Electrical feature — `pages/electrical/`

Namespace SC-04 (электрорасчёт). Route shell: `../ElecCalcPage.tsx`.

## Назначение

До 5 именованных UUID ЭР, assignment объектов, batch/manual подбор кабеля,
candidates, table/glide, переход в спецификацию.

## Слои внутри namespace

| Префикс / паттерн | Роль | React? |
|---|---|---|
| `elecCalc*Model.ts` | pure logic, request builders, projections | нет |
| `useElecCalc*.ts(x)` | state, effects, mutations orchestration | да |
| `ElecCalc*.tsx` / `Electrical*.tsx` | UI panels/modals/tabs | да |
| `elecCalcApiResponseGuards.ts` | type guards responses | нет |

Shell `ElecCalcPage.tsx` **только** wiring: store, query, composition hooks, JSX layout.

## Ключевые entry points

| Concern | Файл |
|---|---|
| Query request / page | `elecCalcQueryModel.ts` |
| Assignment scope / compatibility | `elecCalcAssignmentScopeModel.ts` |
| Main table labels/status | `elecCalcMainTableModel.ts` |
| Result fields / cable mark | `elecCalcResultValueModel.ts` |
| Layout cell edit (pitch/threads) | `elecCalcLayoutModel.ts` |
| Candidates compare | `elecCalcCandidateCompareModel.ts` |
| Variant tabs | `ElectricalVariantTabs.tsx` + `useElectricalVariantSelection.ts` |
| Assignment DnD panel | `ElectricalAssignmentPanel.tsx` |
| Batch job | `useElectricalBatchJobTracker.ts`, `useElecCalcBatchJobOrchestration.ts` |
| Cable mark modal | `ElecCalcCableMarkModal.tsx` + `useElecCalcCableMarkModalState.ts` |
| Candidate sizing | `ElecCalcCableSizingModal.tsx` + `useElecCalcCandidateState.ts` |
| Query keys | `@/api/electricalQueryKeys.ts` |
| HTTP | `@/api/calculations.ts`, `@/api/electricalVariants.ts` |

Presentational grids (lazy): `@/components/electrical/*`.

## Инварианты

| ID | Правило |
|---|---|
| `ER-001` | Публичный scope — `electrical_variant_id` (UUID). Number 1…5 только через explicit compatibility. |
| `ER-002` | Consumers (spec/report) несут тот же UUID; mismatch → 409 backend. |
| `CALC-001` | Не считать мощность/ток на клиенте; показывать backend results. |
| `QK-001` | Invalidate через `electricalDataQueryKeys` / documented keys. |

## Запреты

- Не импортировать `pages/heatcalc/**`.
- Не создавать shared abstraction с HeatCalc.
- Не менять UUID/slot semantics «упростить».
- Не править pure model без unit-теста (characterization first).
- Не класть fetch/axios в `components/electrical` — только props + callbacks.

## Где тесты

```text
src/__tests__/unit/pages/electrical/
src/__tests__/integration/pages/ElecCalcPage*.tsx  (если есть)
```

```bash
cd frontend && npm test -- --run src/__tests__/unit/pages/electrical
```

## Safe-split

Ledger: `docs/playbooks/eleccalc-page-decomposition-prompts.md`.  
Nightly: `docs/playbooks/eleccalc-safe-split-nightly-prompt.md`.

Budget на slice: ≤1 production helper + ≤2 test files + shell wiring; без UI redesign.

## Карта домена

`docs/domains/electrical.md`
