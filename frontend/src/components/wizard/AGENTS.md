# Wizard — `components/wizard/`

Встроенная SC-03 форма объекта на HeatCalcPage. **Не** modal-first.

Полные isolation-правила: `WIZARD-ISLANDS.md`, `WIZARD-CSS-ISLANDS.md`.  
Registry: `isolation/wizardIslands.ts`.

## Islands

| Island | Component | CSS | Protected |
|---|---|---|---|
| heat-object-fields | `HeatCalcObjectFieldsPanel` | `heat-object-fields.css` | yes |
| insulation-layers-table | `InsulationLayersTable` | `insulation-layers-table.css` | **hard** |
| cable-algorithm | `CableAlgorithmPanel` | `cable-algorithm-panel.css` | no |

Shell composition: `ObjectWizard` → `ObjectWizardWidePanel` + zone boundaries.  
Islands **не** импортируют друг друга.

## Where to edit

| Change | Touch |
|---|---|
| Поля геометрии/климата/λ | `HeatCalcObjectFieldsPanel` + CSS island |
| Таблица слоёв | **только по явному запросу пользователя** |
| Cable algorithm UI | `CableAlgorithmPanel` |
| Dual-form shell grid | `ObjectWizard*`, shell rules in `styles.css` (layout only) |
| mm↔m, names, DN | `@/utils/objectWizardUtils.ts` |
| Visibility matrix / rules | `@/domain/heatCalcFieldRules.ts`, `utils/heatCalcWizardFieldRules.ts` |
| Climate/insulation models | `objectWizardClimateModel.ts`, `objectWizardInsulationModel.ts` |

## Инварианты

| ID | Правило |
|---|---|
| `UNIT-001` | Пользователь вводит мм; API — метры |
| `WIZ-001` | Нет cross-import islands; CSS selectors scoped root class |
| `CALC-001` | Форма только inputs теплорасчёта; электро round-trip скрыты (см. sc03 cleanup analysis) |

## Запреты

- Не style controls через `.object-wizard-wide-panel .ant-form-item`.
- Не nest islands.
- Не «уплотнять» dual-form правкой layers table «заодно».
- Не share one CSS file между heat fields и table.

## Проверка

```bash
cd frontend && npm run test:wizard-isolation
# или
npx vitest run src/__tests__/unit/wizard/wizardIsolation.architecture.test.ts
```

Ошибки: `[WizardIsolationError:CODE] … FIX: … ISLAND: …` — следуй FIX.

## Related

- Parent heat feature: `pages/heatcalc/AGENTS.md`
- Domain map: `docs/domains/heat-loss.md`
