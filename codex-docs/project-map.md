# Карта Проекта

> Точка входа для AI-агентов: корневой [`AGENTS.md`](../AGENTS.md).
> Frontend agent map: [`frontend/AGENTS.md`](../frontend/AGENTS.md),
> `docs/architecture/frontend-agent-architecture.md`, `docs/domains/`.

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
   другой системы. После migration `0031` compatibility graph использует slots
   `1…5`; пятый ЭР имеет собственный slot 5 и не подставляет данные другого ЭР.
   Известный остаток: создание candidate/candidate folder для slot 5 пока
   отклоняется двумя service guards `1…4`.
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
| Новые electrical/report tasks UUID-first v3; number `1…5` — deprecated adapter | `backend/app/services/task_service.py`, `backend/alembic/versions/0028_background_task_electrical_variant.py` |
| Numeric compatibility writes readiness-gated; calculation/candidate flow дополнительно требует compatible assignment; sparse slot 5 создаёт только `ЭР1 + ЭР5` | `backend/app/services/electrical_variant_service.py`, `backend/app/services/electrical_assignment_service.py`, `backend/app/api/v1/calculations.py` |
| Project duplicate: ready copy создаёт `ЭР1` и unassigned matrix без guessed electrical batch; not-ready остаётся heat-only | `backend/app/api/v1/projects.py`, `backend/app/tests/integration/api/test_projects.py` |
| Calculation/candidate/folder/task writes требуют exact compatible assignment; state sync и specification stale ограничены UUID ЭР | `backend/app/services/electrical_assignment_service.py`, `backend/app/services/calculation_service.py`, `backend/app/services/task_service.py` |
| Dirty unassigned graph требует `CLEANUP_REQUIRED` → UI confirmation → exact scoped cleanup с сохранением heat; copy не регенерирует spec | `backend/app/services/electrical_assignment_service.py`, `frontend/src/pages/electrical/ElectricalAssignmentPanel.tsx`, `docs/api.md` |
| Task `Idempotency-Key`: namespace principal/type/project, binding full payload/ER, heat terminal lock, truthful replay audit, changed binding → 409 | `backend/app/services/task_service.py`, `docs/api.md` |
| Candidate apply/delete используют общую project lock; проигранная гонка даёт stable 404/409 | `backend/app/services/calculation_service.py`, `backend/app/tests/integration/api/test_electrical_variants.py` |
| Direct calculation/specification/report consumers передают UUID вместе с переходным number и получают 409 при несовпадении; report jobs UUID-only | `backend/app/services/electrical_variant_service.py`, `frontend/src/api/calculations.ts`, `frontend/src/api/specifications.ts`, `frontend/src/api/reports.ts` |
| Project export всегда CSV v3; import принимает v3 и legacy v2 slots `1…5` | `backend/app/services/project_io_service.py`, `docs/api.md` |
| Отчёт принимает набор секций | `frontend/src/components/reports/ReportWizard.tsx`, `backend/app/reports/` |
| Бизнес-аудит мутаций хранится в Postgres | `backend/app/models/audit_event.py`, `backend/app/services/audit_service.py`, `docs/db_schema.md` |
| Технические логи коррелируются через `X-Request-Id` | `backend/app/core/logging_config.py`, `backend/app/main.py`, `frontend/src/api/client.ts` |

## Документы рядом с кодом

`CLAUDE.MD`, `backend/CLAUDE.MD`, `frontend/CLAUDE.MD`, этот файл и
`codex-docs/requirements-map.md` — рабочая карта проекта. Датированные
`docs/analysis/*status*.md` являются историческими срезами. Перед изменением
всё равно сверять конкретный контракт с текущим кодом и тестами.

Dynamic-ER Phase 1–3 имеют статус **PASS**, Phase 5 — **PARTIAL PASS** по
`phase-5-checkpoint.md`. Schema head — `0031`; ER5 slots `1…5`, settings,
multi-ЭР specification/report preview, guest full BOM и CSV v3 имеют focused
evidence. Не закрыты full performance gate 500, официальный Phase 4
section-каталог, corporate template/release hygiene и два 4-slot guard для
создания candidate/candidate folder. Общий PDF/DoD и product release поэтому не
завершены; актуальные числа тестов читать только из generated-блока `README.md`.
