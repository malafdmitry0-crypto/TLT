# Карта Проекта

## Коротко

HeatCalc / ТЛТ - веб-приложение для расчёта тепловых потерь, подбора
греющего кабеля ТЛТ, формирования спецификации и отчётов.

Текущий продукт: рабочий контур полной версии с гостем, сотрудником и
администратором. Основной поток: теплорасчёт -> электрорасчёт ->
спецификация -> отчёт.

## Стек

| Слой | Технологии |
|---|---|
| Frontend | React 18, Vite, TypeScript, Ant Design, Zustand, TanStack Query |
| Backend | Python 3.11, FastAPI, SQLAlchemy async, Alembic, Pydantic v2 |
| DB | PostgreSQL |
| Тесты | pytest, Vitest/RTL, Playwright |
| Инфраструктура | Docker Compose, Caddy, Makefile, Loki/Grafana/Alloy для локальных логов |

## Основные директории

| Путь | Назначение |
|---|---|
| `backend/app/api/v1/` | HTTP API: auth, projects, objects, calculations, specifications, reports, admin |
| `backend/app/services/` | Бизнес-логика и оркестрация операций |
| `backend/app/formulas/` | Расчётные формулы теплопотерь, электрорасчёта и спецификации |
| `backend/app/models/` | SQLAlchemy-модели |
| `backend/app/schemas/` | Pydantic-схемы API |
| `backend/app/reference_data/` | Встроенные справочники JSON |
| `backend/app/reports/` | Генерация HTML/PDF/DOCX/XLSX |
| `observability/` | Локальные конфиги Loki, Grafana datasource и Alloy Docker logs collector |
| `frontend/src/pages/` | Страницы рабочих режимов, проектов, админки, помощи |
| `frontend/src/components/` | UI-компоненты таблиц, мастеров, отчётов, спецификации |
| `frontend/src/api/` | Клиентские обёртки над API |
| `frontend/src/store/` | Zustand stores: auth/current project |
| `frontend/src/hooks/` | Query/mutation hooks и UI-оркестрация |
| `docs/` | SRS, QA, API, схема БД, playbooks |
| `docs/tnp/cases/guest-specification/phase-1-checkpoint.md` | Candidate-evidence и переходные ограничения dynamic-ER Phase 1 |
| `docs/tnp/cases/guest-specification/phase-2-checkpoint.md` | Frontend/consumer evidence dynamic-ER Phase 2 и границы UUID cutover |
| `docs/tnp/cases/guest-specification/phase-3-checkpoint.md` | Authoritative assignment API/UI, scoped cleanup, races и verification status |
| `e2e/tests/` | Playwright-сценарии по пользовательским потокам |

## Пользовательский поток

1. `HomePage` создаёт гостевую сессию или отправляет сотрудника на логин.
2. `WorkspacePage` ведёт в рабочий стол проекта.
3. `HeatCalcPage` добавляет трубы/резервуары через встроенную SC-03 форму,
   импортирует Excel/CSV и пересчитывает теплопотери.
4. `ElecCalcPage` управляет до пяти именованных UUID ЭР и распределяет объекты
   выбранного ЭР в `Самрег` или `Резистив`; `Скин/Минеральный` доступны для
   просмотра migrated unsupported rows и unassign, но disabled как target.
   Assignment type/state независимы, mutation использует optimistic `version`,
   а row/batch/inline/recalculation остаются strict-compatible с системой
   назначения. `Выбор`/`Подбор` доступны для supported assignment даже без
   сохранённого расчёта или при его несовместимом типе: модалка выбирает
   безопасный тип системы (`resistive → single_core`) и не показывает типы
   другой системы. Legacy graph `1…4` остаётся переходным; пятый ЭР
   поддерживает assignments, но не подставляет расчётные данные другого
   варианта.
5. `SpecificationPage` показывает и редактирует спецификацию в рамках роли.
6. `ReportPage` показывает HTML-превью и экспортирует отчёт для сотрудника.

## Важные контракты

| Контракт | Где смотреть |
|---|---|
| Единицы формы: геометрия в мм, API в метрах | `frontend/src/utils/objectWizardUtils.ts`, `CLAUDE.MD` |
| Расчёты выполняются на backend, не на frontend | `backend/app/services/calculation_service.py` |
| Гость работает только со своими session projects | `backend/app/services/project_service.py`, тесты security |
| Гость видит только свои session projects; сотрудник видит user-owned проекты других сотрудников и не видит гостевые; админ видит все | `backend/app/services/project_service.py`, `backend/app/tests/integration/api/test_projects.py` |
| Админ управляет пользователями, коэффициентами, внешней БД | `frontend/src/pages/admin/`, `backend/app/api/v1/admin.py` |
| Dynamic-ER lifecycle/readiness: до 5 UUID ЭР, первый `ЭР1` readiness-gated | `backend/app/api/v1/electrical_variants.py`, `backend/app/services/electrical_variant_service.py` |
| Authoritative assignment: object × ЭР, type отдельно от state, optimistic version и exact cleanup | `backend/app/services/electrical_assignment_service.py`, `backend/alembic/versions/0029_electrical_assignment_versions.py`, `docs/db_schema.md` |
| Новые electrical/report tasks UUID-first v3; number `1…4` — deprecated adapter | `backend/app/services/task_service.py`, `backend/alembic/versions/0028_background_task_electrical_variant.py` |
| Numeric compatibility writes readiness-gated; calculation/candidate flow дополнительно требует compatible assignment; sparse slot 4 создаёт только `ЭР1 + ЭР4` | `backend/app/services/electrical_variant_service.py`, `backend/app/services/electrical_assignment_service.py`, `backend/app/api/v1/calculations.py` |
| Project duplicate: ready copy создаёт `ЭР1` и unassigned matrix без guessed electrical batch; not-ready остаётся heat-only | `backend/app/api/v1/projects.py`, `backend/app/tests/integration/api/test_projects.py` |
| Calculation/candidate/folder/task writes требуют exact compatible assignment; state sync и specification stale ограничены UUID ЭР | `backend/app/services/electrical_assignment_service.py`, `backend/app/services/calculation_service.py`, `backend/app/services/task_service.py` |
| Dirty unassigned graph требует `CLEANUP_REQUIRED` → UI confirmation → exact scoped cleanup с сохранением heat; copy не регенерирует spec | `backend/app/services/electrical_assignment_service.py`, `frontend/src/pages/electrical/ElectricalAssignmentPanel.tsx`, `docs/api.md` |
| Task `Idempotency-Key`: namespace principal/type/project, binding full payload/ER, heat terminal lock, truthful replay audit, changed binding → 409 | `backend/app/services/task_service.py`, `docs/api.md` |
| Candidate apply/delete используют общую project lock; проигранная гонка даёт stable 404/409 | `backend/app/services/calculation_service.py`, `backend/app/tests/integration/api/test_electrical_variants.py` |
| Direct calculation/specification/report consumers передают UUID вместе с переходным number и получают 409 при несовпадении; report jobs UUID-only | `backend/app/services/electrical_variant_service.py`, `frontend/src/api/calculations.ts`, `frontend/src/api/specifications.ts`, `frontend/src/api/reports.ts` |
| Project CSV v2 строит sparse UUID graph, но export не переносит full dynamic state | `backend/app/services/project_io_service.py`, `docs/api.md` |
| Отчёт принимает набор секций | `frontend/src/components/reports/ReportWizard.tsx`, `backend/app/reports/` |
| Бизнес-аудит мутаций хранится в Postgres | `backend/app/models/audit_event.py`, `backend/app/services/audit_service.py`, `docs/db_schema.md` |
| Технические логи коррелируются через `X-Request-Id` | `backend/app/core/logging_config.py`, `backend/app/main.py`, `frontend/src/api/client.ts` |

## Документы рядом с кодом

`CLAUDE.MD`, `backend/CLAUDE.MD`, `frontend/CLAUDE.MD` и
`docs/analysis/current-status-and-missing-info.md` — рабочая карта проекта.
Перед изменением всё равно сверять конкретный контракт с текущим кодом и
тестами.

Dynamic-ER Phase 1, Phase 2 и Phase 3 имеют статус **PASS**. Authoritative
assignments проверены root backend/browser/DB gate. Schema head Phase 3 —
`0029`; post-UI DB invariants — 28/28. Focused frontend Phase 3 —
6 files / 95 tests PASS; full frontend — 1052 passed / 1 pre-existing failed,
то есть не green только из-за
missing accessible separator test. Dependency security gate и общий Alembic metadata drift также
не green вне dynamic-ER diff. Phase 5 pending, Phase 4 заблокирована
PDL-ER-15/18 до официального числового section-каталога;
семантика обработки данных утверждена PDL-ER-18…25. Общий PDF/DoD и product
release не завершены.
