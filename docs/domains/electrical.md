# Домен: электрорасчёт (electrical / ЭР)

## Назначение

Именованные UUID электротехнические решения (до 5), assignment объектов в
систему (самрег/резистив/…), batch и manual подбор кабеля, candidates,
диагностика failed/stale/unsupported.

## Входы и выходы

| | |
|---|---|
| UI входы | variant tabs, assignment panel, params, cable mark, candidate modal |
| API | electrical variants, assignments, calc batch/query, candidates/folders |
| Scope | **UUID** `electrical_variant_id` (`ER-001`); number 1…5 compatibility only |
| Выходы | per-object electrical results, summary, candidate lists, job status |
| Побочные эффекты | background batch jobs; cleanup dirty unassigned; query invalidation |

## Владение данными

- ER variants, assignments (version optimistic), calculations scoped by ER UUID.
- Cable catalogs: builtin / extended; references JSON + optional external DB.

## Точки входа

| Слой | Путь |
|---|---|
| UI page | `frontend/src/pages/ElecCalcPage.tsx` |
| Feature | `frontend/src/pages/electrical/` + `AGENTS.md` |
| UI grids | `frontend/src/components/electrical/` |
| API client | `frontend/src/api/calculations.ts`, `electricalVariants.ts`, `electricalQueryKeys.ts` |
| Backend formulas | `backend/app/formulas/electrical/` |
| Backend services | `calculation_service`, `electrical_variant_service`, `electrical_assignment_service` |
| ADR / phases | `docs/architecture/dynamic-electrical-variants.md` |

## Путь выполнения

```text
ElecCalcPage
  → useElectricalVariantSelection + useElecCalc* + pure elecCalc*Model
  → api/calculations | electricalVariants
  → services (scope UUID, assignment compatibility)
  → formulas (self_regulating / resistive)
  → query page results → tables / modals
```

## Инварианты

- `ER-001`, `ER-002`, `CALC-001`, `QK-001`.
- Assignment type и state независимы; mutation uses optimistic `version`.
- Spec/report consumers must pass same UUID (mismatch → 409).
- Не дублировать selection formulas на frontend.

## Зависимости

**Разрешено:** project objects read model, cable references, auth role flags.  
**Запрещено:** import heatcalc feature internals; invent slot-only public API.

## Проверка

```bash
cd frontend && npm test -- --run src/__tests__/unit/pages/electrical
# backend focused (Docker examples):
# pytest app/tests/unit/formulas/electrical -q
# pytest app/tests/integration/api/test_electrical_variants.py -q
```

## Связанное

- Product decisions PDL-ER: `docs/tnp/cases/guest-specification/product-decisions.md`
- Decomposition ledger: `docs/playbooks/eleccalc-page-decomposition-prompts.md`
- Project map contracts: `codex-docs/project-map.md` (electrical section)
- Frontend arch: `docs/architecture/frontend-agent-architecture.md`
