# HeatCalc feature — `pages/heatcalc/`

Namespace SC-03 (теплопотери + таблица объектов). Route shell: `../HeatCalcPage.tsx`.

## Назначение

CRUD объектов (труба/резервуар), встроенная форма ObjectWizard, таблица
результатов (normal + Excel mode), preferences колонок, bulk actions,
heat-loss jobs, импорт/экспорт.

## Слои внутри namespace

| Паттерн | Роль |
|---|---|
| `useHeatCalc*.ts` | orchestration: data, drafts, grid, preferences, resize, bulk |
| `HeatCalc*.tsx` | toolbar, wizard shell panel, overlays, modals |
| `heatCalcColumnRenderers.tsx` | cell render specs |
| `heatCalcObjectWizardLoader.ts` | lazy/load helper for wizard |

Pure table engines и adapters живут в `@/utils/heatCalc*` и `@/domain/heatCalc*`.

## Ключевые entry points

| Concern | Файл |
|---|---|
| Objects query / visible rows | `useHeatCalcObjectsDataModel.ts` |
| Table UI state (filters/sort/mode) | `useHeatCalcTableState.ts` |
| Inline drafts / save | `useHeatCalcInlineDraftModel.ts`, `useHeatCalcDraftSaveModel.ts` |
| Excel interaction | `useHeatCalcExcelInteractionModel.ts` + hooks in `@/hooks/useHeatCalcExcel*` |
| Grid projection | `useHeatCalcGridModel.ts` |
| Preferences / columns | `useHeatCalcPreferences.ts`, `@/utils/heatCalcTableViewSettings.ts` |
| Object editor / wizard open | `useHeatCalcObjectEditor.ts`, `HeatCalcWizardFormPanel.tsx` |
| Bulk actions | `useHeatCalcBulkActions.ts` |
| Heat job | `useHeatCalcHeatLossJob.ts` |
| Mutations API wrapper | `@/hooks/useHeatCalcMutations.ts` |
| mm↔m + names | `@/utils/objectWizardUtils.ts` (`UNIT-001`) |
| Field registry | `@/domain/heatCalcFields.ts`, `heatCalcFieldRegistry.ts` |
| Wizard UI | `@/components/wizard/` (см. local AGENTS) |
| Table UI | `@/components/heatcalc/` |

## Инварианты

| ID | Правило |
|---|---|
| `UNIT-001` | Form mm → API m; reverse при edit. Только `objectWizardUtils`. |
| `CALC-001` | Теплопотери считает backend при save/recalc. |
| `QK-001` | После CRUD/import — invalidate objects list keys. |

## Запреты

- Не импортировать `pages/electrical/**`.
- Не shared hooks с ElecCalc.
- Не восстанавливать legacy `PipeTable`/`TankTable` как SoT.
- Не править insulation layers table без прямого запроса (`WIZ-001`).
- Не дублировать column definitions: registry + `heatCalcTableColumns`.

## Где тесты

```text
src/__tests__/unit/pages/heatcalc/
src/__tests__/unit/utils/heatCalc*.test.ts
src/__tests__/integration/pages/  (HeatCalc*)
```

```bash
cd frontend && npm test -- --run src/__tests__/unit/pages/heatcalc
cd frontend && npm test -- --run src/__tests__/unit/utils/heatCalc
```

## Safe-split

Ledger: `docs/playbooks/heatcalc-page-decomposition-prompts.md`.  
Related: `heatcalc-*-safe-split-runner-prompt.md`, `god-components-safe-split-nightly-prompt.md`.

## Карта домена

`docs/domains/heat-loss.md`
