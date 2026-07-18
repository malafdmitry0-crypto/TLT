# Dynamic ER — Phase 0 impact matrix

Дата: 18.07.2026. Ветка: `feature/tnp-dynamic-electrical-variants`.

Назначение: зафиксировать authoritative integer/`СО` path до перехода на UUID.
Исторические migrations и v2 compatibility останутся допустимыми legacy
совпадениями; production-совпадения после Phase 6 должны исчезнуть.

## Search baseline

Поиск выполнен в `backend/app`, `frontend/src`, `e2e`, `docs` и `codex-docs`:

| Pattern | Files |
|---|---:|
| `variant_number` | 119 |
| `variant_numbers` | 8 |
| `CALCULATION_VARIANTS` | 7 |
| `[1, 2, 3, 4]` | 5 |
| `СО1` | 34 |
| `СО4` | 26 |
| `ge=1, le=4` | 5 |
| `variant=99` | 3 |

Числа включают документацию и tests; они служат baseline для финального
search-gate, а не оценкой production diff.

## DB и migrations

### Authoritative models

- `backend/app/models/electrical_calculation.py`
- `backend/app/models/electrical_candidate.py`
- `backend/app/models/electrical_candidate_folder.py`
- `backend/app/models/specification.py`
- `backend/app/models/background_task.py` — integer пока скрыт в JSON payload.
- `backend/app/models/audit_event.py` — нет indexed UUID ЭР.
- `backend/app/models/project.py` — нет initialization/active ER state.
- `backend/app/models/project_object.py` — `version` пригоден для stale snapshot.

В этих таблицах integer входит в checks, unique constraints и indexes. Его
нельзя заменить только на уровне API.

### Исторические migrations

- `backend/alembic/versions/0001_initial.py`
- `backend/alembic/versions/0004_perf_indexes.py`
- `backend/alembic/versions/0005_db_query_indexes.py`
- `backend/alembic/versions/0007_electrical_bulk_upsert_constraint.py`
- `backend/alembic/versions/0021_specification_project_variant_unique.py`
- `backend/alembic/versions/0023_add_electrical_candidates.py`
- `backend/alembic/versions/0024_electrical_candidates_dedupe_key.py`
- `backend/alembic/versions/0025_electrical_candidate_folders.py`

Эти файлы не переписываются. Новые expand/contract migrations заменяют их
действующие constraints; исторические совпадения документируются.

## Backend production

### API и schemas

- `backend/app/api/v1/calculations.py`
- `backend/app/api/v1/calc_jobs.py`
- `backend/app/api/v1/reports.py`
- `backend/app/api/v1/specifications.py`
- `backend/app/api/v1/router.py`
- `backend/app/schemas/calculation.py`
- `backend/app/schemas/report.py`
- `backend/app/schemas/specification.py`

Затронуты direct calculation, page/query/capabilities, copy, candidates,
folders, apply/unapply, cable select, multi-variant select, batch/jobs,
specification CRUD/generation и report preview/export.

### Services и background flow

- `backend/app/services/calculation_service.py`
- `backend/app/services/electrical_query_service.py`
- `backend/app/services/project_io_service.py`
- `backend/app/services/report_service.py`
- `backend/app/services/specification_service.py`
- `backend/app/services/task_service.py`
- `backend/app/seeds.py`

Критичные side effects:

- object create/delete/update должен синхронно поддерживать assignments;
- electrical mutations должны scoped-помечать specification stale;
- copy должен клонировать независимый graph, а не только calculation rows;
- task payload/result/audit должен хранить UUID;
- queued v2 tasks надо дренировать либо читать через versioned compatibility;
- CSV v2 нельзя silently переписать как v3.

Security note: PostgreSQL RLS отсутствует. Specification и часть task mutations
сейчас используют project read-guard вместо owner/write-guard; UUID migration
обязана исправить authorization, а не только FK.

## Frontend production

### Persisted selection, types и API

- `frontend/src/store/calculationVariantStore.ts`
- `frontend/src/types/calculation.ts`
- `frontend/src/types/specification.ts`
- `frontend/src/api/calculations.ts`
- `frontend/src/api/specifications.ts`
- `frontend/src/api/reports.ts`

### Electrical page и model/hooks

- `frontend/src/pages/ElecCalcPage.tsx`
- `frontend/src/pages/electrical/ElectricalBatchActionBar.tsx`
- `frontend/src/pages/electrical/elecCalcVariantModel.ts`
- `frontend/src/pages/electrical/elecCalcQueryModel.ts`
- `frontend/src/pages/electrical/elecCalcPageModel.ts`
- `frontend/src/pages/electrical/useElecCalcBatchJobOrchestration.ts`
- `frontend/src/pages/electrical/useElecCalcCableMarkModalState.ts`
- `frontend/src/pages/electrical/useElecCalcCableSelectionMutationFlow.ts`
- `frontend/src/pages/electrical/useElecCalcCableSizingModalState.ts`
- `frontend/src/pages/electrical/useElecCalcCandidateState.ts`
- `frontend/src/pages/electrical/useElecCalcCandidateMutationFlow.ts`
- `frontend/src/pages/electrical/useElecCalcCableTypeState.ts`
- `frontend/src/pages/electrical/useElecCalcPageScopeEffects.ts`
- `frontend/src/pages/electrical/useElecCalcRowSelectionState.ts`
- `frontend/src/hooks/useElectricalStats.ts`

### Downstream pages/navigation

- `frontend/src/pages/SpecificationPage.tsx`
- `frontend/src/pages/ReportPage.tsx`
- `frontend/src/pages/ReportWizardPage.tsx`
- `frontend/src/components/reports/ReportWizard.tsx`
- `frontend/src/pages/WorkspacePage.tsx`
- `frontend/src/components/layout/Sidebar.tsx`

Critical characterization:

1. `ElecCalcPage.tsx` делает broad cache update для всех electrical-query keys.
2. `useElectricalStats.ts` выбирает calculation по максимальному integer.
3. Electrical/report используют previous variant data как placeholder.
4. Workspace/Sidebar progress не scoped по выбранному ЭР.
5. Навигация и report wizard не сохраняют будущий `?er=<uuid>`.

## Tests, fixtures и scripts

### Backend

- `backend/app/tests/integration/api/test_calc_jobs.py`
- `backend/app/tests/integration/api/test_calculations.py`
- `backend/app/tests/integration/api/test_reports.py`
- `backend/app/tests/integration/api/test_specifications.py`
- `backend/app/tests/integration/db/test_cascade_integrity.py`
- `backend/app/tests/integration/db/test_query_counts.py`
- `backend/app/tests/integration/db/test_race_conditions.py`
- `backend/app/tests/unit/api/test_reports_helpers.py`
- `backend/app/tests/unit/services/test_calculation_service_unit.py`
- `backend/app/tests/unit/services/test_electrical_candidate_dedupe.py`
- `backend/app/tests/unit/services/test_project_io_helpers.py`
- `backend/app/tests/unit/services/test_report_service_unit.py`
- `backend/app/tests/unit/services/test_specification_service_unit.py`
- `backend/app/tests/unit/services/test_task_service_unit.py`

### Frontend/e2e

- Integration: `ElecCalcPage.test.tsx`, `SpecificationPage.test.tsx`,
  `ReportPage.test.tsx`.
- Variant/candidate/batch/query/store unit tests under
  `frontend/src/__tests__/unit`.
- `e2e/tests/elec-calculation.spec.ts`
- `e2e/tests/electrical-candidate-selection.spec.ts`
- `e2e/tests/electrical-candidate-glide-default.spec.ts`
- `e2e/tests/cable-business-flows.spec.ts`
- `e2e/tests/helpers/electrical-glide.ts`
- `frontend/scripts/seed-guest-all-variants.mjs`

В тестах нужны UUID isolation, six-create race, last-delete, active fallback,
deep-copy independence, v2/v3 round-trip, no-mixing spec/report и explicit
multi-select. Legacy integer assertions сохраняются только у v2 compatibility
и migration fixtures с явной маркировкой.

## Документация и machine-readable contracts

- `docs/srs.md`, профильные `docs/srs/`, `docs/api.md`,
  `docs/tz-compliance.md` закрепляют legacy UI/API.
- `codex-docs/business-formula-contracts.json` содержит только legacy общий
  specification contract и не регистрирует PDF-BOM-01…07/sections.
- `docs/business-logic-contract.md` подтверждает действующий resistive flow и
  XLSX BOM, поэтому их нельзя удалять или переписывать без source decision.

## Final search-gate

Перед Phase 6 повторить поиск по:

```text
variant_number
variant_numbers
CALCULATION_VARIANTS
[1, 2, 3, 4]
СО1
СО4
CO1
CO4
ge=1, le=4
variant=99
```

Каждое оставшееся совпадение классифицируется как historical migration,
explicit v2 compatibility, legacy test или historical audit. Необъяснённое
production-совпадение блокирует Definition of Done.
