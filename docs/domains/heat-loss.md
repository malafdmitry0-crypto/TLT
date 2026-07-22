# Домен: теплопотери (heat-loss)

## Назначение

Расчёт тепловых потерь труб и резервуаров; ввод геометрии, изоляции, климата;
хранение объектов проекта; подготовка к электрорасчёту.

## Входы и выходы

| | |
|---|---|
| UI входы | ObjectWizard (мм), Excel/CSV import, inline table edit |
| API | `POST/PUT .../objects`, import-excel, heat jobs, reorder |
| Единицы | форма мм → API м (`UNIT-001`) |
| Выходы | `params`, heat `results`, `is_valid`, error messages |
| Побочные эффекты | auto heat calc on save; invalidate objects queries |

## Владение данными

- Таблицы: `objects` (params/results JSONB), project ownership/session.
- Справочники: insulation, pipe materials, soil, climate JSON/DB.

## Точки входа

| Слой | Путь |
|---|---|
| UI page | `frontend/src/pages/HeatCalcPage.tsx` |
| Feature | `frontend/src/pages/heatcalc/` + `AGENTS.md` |
| Wizard | `frontend/src/components/wizard/` + `AGENTS.md` |
| API client | `frontend/src/api/projects.ts`, mutations hooks |
| Backend formulas | `backend/app/formulas/heat_loss/` |
| Backend service | `calculation_service.recalculate_object` (и objects CRUD) |

## Путь выполнения

```text
HeatCalcPage
  → useHeatCalc* models / useHeatCalcMutations
  → api/projects | calculations
  → backend objects + heat formulas
  → results back → table/wizard
```

## Инварианты

- `UNIT-001`, `CALC-001`, `QK-001`, `WIZ-001` (см. корневой `AGENTS.md`).
- Не восстанавливать PipeTable/TankTable как SoT.
- Не считать heat loss на клиенте.

## Зависимости

**Разрешено:** references, auth/project scope, shared common UI.  
**Запрещено:** electrical pure models; invent formulas; cross-island wizard CSS.

## Проверка

```bash
cd frontend && npm test -- --run src/__tests__/unit/pages/heatcalc
cd frontend && npm test -- --run src/__tests__/unit/utils/heatCalc
cd frontend && npm run test:wizard-isolation
# backend heat formulas (Docker):
# docker exec heatcalc_backend pytest -q app/tests/unit/formulas/heat_loss
```

## Связанное

- Business contract: `docs/business-logic-contract.md`
- Decomposition: `docs/playbooks/heatcalc-page-decomposition-prompts.md`
- Frontend arch: `docs/architecture/frontend-agent-architecture.md`
