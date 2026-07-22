# Домен: спецификация (specification)

## Назначение

Формирование BOM/спецификации по результатам электрорасчёта выбранного ЭР:
базовая (все роли) и полная (сотрудник, mode full + ТНП accessories).

## Входы и выходы

| | |
|---|---|
| UI входы | mode basic/full, R/Ex/K coefficients (employee), line edits |
| API | generate/read/update specification scoped by ER UUID |
| Scope | тот же UUID ЭР, что calc (`ER-002`) |
| Выходы | items table, totals, stale markers when calc changes |
| Побочные эффекты | regenerate invalidates stale; role-gated full BOM |

## Владение данными

- Specification rows linked to project + electrical variant UUID.
- Accessories catalog: `reference_data/accessories.json` + employee extended DB.

## Точки входа

| Слой | Путь |
|---|---|
| UI page | `frontend/src/pages/SpecificationPage.tsx` (~1000 LOC, still flat) |
| UI parts | `frontend/src/components/specification/` |
| API client | `frontend/src/api/specifications.ts` |
| Backend | specification services + formulas/BOM rules in business contract |

## Путь выполнения

```text
SpecificationPage
  → api/specifications (UUID ER + optional number compatibility)
  → backend generate/update BOM
  → SpecTable / SpecBuilder
```

## Инварианты

- `ER-002`, `CALC-001` (qty from backend, not re-derived UI-only).
- Guest: basic BOM; full mode employee.
- Stale when electrical results for scope change.

## Зависимости

**Разрешено:** electrical results (read), accessories refs, role flags.  
**Запрещено:** silent fallback to another ER slot when UUID missing.

## Проверка

```bash
cd frontend && npm test -- --run src/__tests__/unit/components  # SpecTable if present
# + integration/e2e specification scenarios when UI changes
# backend: specification service/integration tests
```

## Связанное

- Guest specification case: `docs/tnp/cases/guest-specification/`
- API notes: `docs/api.md`
- Business contract BOM sections
- Frontend arch: god-shell candidate for next extract after electrical/heat

## Agent note

При работе со spec: сначала UUID scope + role matrix, потом UI table.
Decomposition namespace пока **не** создан — extract pure helpers рядом с page
по тому же safe-split budget, что heat/elec.
