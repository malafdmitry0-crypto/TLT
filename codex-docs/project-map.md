# Карта Проекта

## Коротко

HeatCalc / ТЛТ - веб-приложение для расчёта тепловых потерь, подбора
греющего кабеля ТЛТ, формирования спецификации и отчётов.

Текущий продукт: MVP с гостем, сотрудником и администратором. Основной поток:
теплорасчёт -> электрорасчёт -> спецификация -> отчёт.

## Стек

| Слой | Технологии |
|---|---|
| Frontend | React 18, Vite, TypeScript, Ant Design, Zustand, TanStack Query |
| Backend | Python 3.11, FastAPI, SQLAlchemy async, Alembic, Pydantic v2 |
| DB | PostgreSQL |
| Тесты | pytest, Vitest/RTL, Playwright |
| Инфраструктура | Docker Compose, Caddy, Makefile |

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
| `frontend/src/pages/` | Страницы рабочих режимов, проектов, админки, помощи |
| `frontend/src/components/` | UI-компоненты таблиц, мастеров, отчётов, спецификации |
| `frontend/src/api/` | Клиентские обёртки над API |
| `frontend/src/store/` | Zustand stores: auth/current project |
| `frontend/src/hooks/` | Query/mutation hooks и UI-оркестрация |
| `docs/` | SRS, QA, API, схема БД, playbooks |
| `e2e/tests/` | Playwright-сценарии по пользовательским потокам |

## Пользовательский поток

1. `HomePage` создаёт гостевую сессию или отправляет сотрудника на логин.
2. `WorkspacePage` ведёт в рабочий стол проекта.
3. `HeatCalcPage` добавляет трубы/резервуары, импортирует Excel/CSV, пересчитывает теплопотери.
4. `ElecCalcPage` запускает или показывает электрорасчёт и варианты CO.
5. `SpecificationPage` показывает и редактирует спецификацию в рамках роли.
6. `ReportPage` показывает HTML-превью и экспортирует отчёт для сотрудника.

## Важные контракты

| Контракт | Где смотреть |
|---|---|
| Единицы формы: геометрия в мм, API в метрах | `frontend/src/utils/objectWizardUtils.ts`, `CLAUDE.MD` |
| Расчёты выполняются на backend, не на frontend | `backend/app/services/calculation_service.py` |
| Гость работает только со своими session projects | `backend/app/services/project_service.py`, тесты security |
| Сотрудник видит все проекты, редактирует по правилам сервиса | `backend/app/tests/integration/api/test_projects.py` |
| Админ управляет пользователями, коэффициентами, внешней БД | `frontend/src/pages/admin/`, `backend/app/api/v1/admin.py` |
| Спецификация зависит от variant_number | `backend/app/models/specification.py`, `frontend/src/api/specifications.ts` |
| Отчёт принимает набор секций | `frontend/src/components/reports/ReportWizard.tsx`, `backend/app/reports/` |

## Документы рядом с кодом

`CLAUDE.MD`, `backend/CLAUDE.MD` и `frontend/CLAUDE.MD` полезны как историческая
карта проекта, но перед изменением всегда сверять с текущим кодом: часть статусов
в старых таблицах уже могла устареть.

