# AGENTS.md — точка входа для AI-агентов

HeatCalc / ТЛТ: веб-приложение расчёта теплопотерь, подбора греющего кабеля,
спецификации и отчётов систем электрообогрева.

**Основной поток:** теплорасчёт → электрорасчёт → спецификация → отчёт.

## Перед любой задачей

1. `git status --short` — не трогать чужие dirty-файлы.
2. Открыть карту домена (ниже) и локальный `AGENTS.md` рядом с кодом.
3. Менять минимальный срез внутри одной границы.
4. Запустить focused-проверку домена, затем расширить по риску.
5. Не коммитить, если пользователь не просил.

## Источники истины (ровно один на тип знания)

| Знание | Канон |
|---|---|
| Целевые требования | `ТЗ/`, подтверждённые PDL в `docs/tnp/cases/.../product-decisions.md` |
| Текущий бизнес-контракт | `docs/business-logic-contract.md` |
| HTTP API | `docs/api.md` + FastAPI OpenAPI / код |
| Схема БД | Alembic + `docs/db_schema.md` |
| Формулы | `backend/app/formulas/` + business contract; **не** frontend |
| UI / frontend-навигация | `frontend/AGENTS.md` + `docs/architecture/frontend-agent-architecture.md` |
| Карта репозитория | `codex-docs/project-map.md` |
| Иерархия документов | `codex-docs/source-documents.md` |
| Выбор тестов | `codex-docs/testing.md` |

`CLAUDE.MD` / `frontend/CLAUDE.MD` / `backend/CLAUDE.MD` — расширенная навигация;
при расхождении с кодом побеждает код + тесты + business contract.

## Карта доменов

| Домен | Карта | Frontend entry | Backend entry |
|---|---|---|---|
| Теплопотери | `docs/domains/heat-loss.md` | `HeatCalcPage`, `pages/heatcalc/`, `wizard/` | `formulas/heat_loss/`, objects API |
| Электрорасчёт / ЭР | `docs/domains/electrical.md` | `ElecCalcPage`, `pages/electrical/` | `formulas/electrical/`, calculations API |
| Спецификация | `docs/domains/specification.md` | `SpecificationPage` | `specification` services |
| Отчёт | `docs/domains/reporting.md` | `ReportPage`, `components/reports/` | `app/reports/` |
| Проекты / доступ | `codex-docs/project-map.md` | auth/project stores | `auth`, `project_service` |
| Справочники | business contract + JSON | `api/references.ts` | `reference_data/` |

## Критические инварианты

| ID | Правило |
|---|---|
| `UNIT-001` | Геометрия в форме — мм; API и формулы — метры |
| `CALC-001` | Окончательные расчёты только на backend |
| `ER-001` | Публичная identity ЭР — UUID; `1…5` только compatibility |
| `ER-002` | Spec/report используют тот же UUID scope, что calc |
| `AUTH-001` | Scope данных по роли/сессии; UI-guard ≠ security |
| `QK-001` | Mutation явно invalidate/update query keys |
| `WIZ-001` | Wizard islands изолированы (CSS + React imports) |

## Команды проверки

```bash
# Frontend all
make test-frontend
# Backend all (нужен Docker/test DB)
make test-backend

# Focused frontend (из frontend/)
npm test -- --run src/__tests__/unit/pages/electrical
npm test -- --run src/__tests__/unit/pages/heatcalc
npm run test:architecture          # feature boundaries + wizard islands

# Formulas
bash scripts/formula-qa.sh quick
```

Подробный выбор suite: `codex-docs/testing.md`.

## Маршрут агента (обязательный)

1. `AGENTS.md` (этот файл) → карта домена → локальный `AGENTS.md`.
2. Назвать затрагиваемые инварианты.
3. Одно изменение в одной архитектурной границе.
4. Focused test → отчёт: change / evidence / residual risk.
5. Канонический doc обновлять **только** если изменился контракт.

## Запреты

- Не дублировать формулы на frontend.
- Не mass-move каталогов «ради структуры».
- Не shared-abstraction Heat↔Elec без finding.
- Не править protected wizard islands без явного запроса.
- Не ослаблять assertions ради green.
- Не force-push / destructive git без запроса.

## Архитектура для агентов

- Общий план: `codex-docs/agent-readable-architecture.md`
- Frontend detail: `docs/architecture/frontend-agent-architecture.md`
- Frontend short map: `frontend/AGENTS.md`
