# HeatCalc (ТЛТ)

Веб-приложение для автоматизированного расчёта тепловых потерь и составления
спецификаций оборудования систем электрообогрева (греющий кабель ТЛТ).

## Быстрый старт

Локальная frontend-разработка рассчитана на Node.js из `.nvmrc` / `.node-version`
(`22.13.0`). Это убирает engine warnings у Vitest/ESLint tooling; Docker и CI
остаются на совместимом Node 20.x.

```bash
cp .env.example .env

# Разработка (hot-reload, bind-mount кода)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Продакшен
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Миграции Alembic применяются автоматически в entrypoint. Для наполнения
демо-данными (идемпотентно): `RUN_SEEDS=1 docker compose up -d` либо один раз
`docker compose exec backend python -m app.seeds`.

- **Frontend**: http://localhost:3003 (dev и prod базовый) / :80 при
  `docker-compose.prod.yml` / :8080 для `demo/` (переопределяется `FRONTEND_PORT`)
- **Backend Swagger**: http://localhost:8000/docs
- **PostgreSQL**: :5433 (в проде порт наружу не публикуется)

Для демо-поставки заказчику — см. [`demo/README.md`](demo/README.md)
(готовые multi-arch образы amd64+arm64 в одном tar.gz, пошаговая инструкция
без технических терминов). Сборка: `./scripts/build-multiarch-demo.sh`.

Гостевой вход — сразу без регистрации. Сотрудник и админ — через `/login`
(первый админ создаётся из `FIRST_ADMIN_EMAIL`/`FIRST_ADMIN_PASSWORD` в `.env`).

## Что умеет текущая версия

Подробная сверка с ТЗ — в `CLAUDE.MD` §15. Кратко:

- Расчёт тепловых потерь для трубопроводов и резервуаров по действующему
  ТНП-контракту
- Автоподбор греющего кабеля ТЛТ (10 марок, 10–100 Вт/м)
- Импорт объектов из **Excel (.xlsx) и CSV** (см. `docs/samples/`)
- Drag-and-drop сортировка строк в таблицах
- Базовая спецификация (кабель + аксессуары)
- HTML-отчёт с предпросмотром + экспорт PDF/DOCX/XLSX (сотрудник)
- Пошаговый прогресс 1→2→3→4 в Sidebar и WorkflowSteps

## Структура репозитория

```
backend/            FastAPI + SQLAlchemy async + Alembic
frontend/           React 18 + Vite + TypeScript + Ant Design + dnd-kit
e2e/                Playwright
docs/               Документация: analysis/, qa/, samples/, api.md, db_schema.md
docs/samples/       Тестовые файлы для импорта (100 записей)
scripts/            Утилиты: dev-setup.sh, gen_import_samples.py
CLAUDE.MD           Корневой «source of truth» (архитектура, API, матрица доступа)
docs/business-logic-contract.md
                    Текущий контракт формул, алгоритмов и справочников
formules.md         Формулы с примерами и пояснениями переменных
coefficients.MD     Корректирующие коэффициенты
```

## Документация

| Файл | Что внутри |
|---|---|
| `CLAUDE.MD` | Архитектура, навигация, API, матрица доступа, full-version target |
| `docs/business-logic-contract.md` | Действующий контракт формул, алгоритмов, справочников и evidence |
| `docs/context/full-version-rule.md` | Правило: частичная реализация не принимается как бизнес-статус |
| `backend/CLAUDE.MD` | Структура backend, сервисы, эндпоинты, тесты |
| `frontend/CLAUDE.MD` | Структура frontend, компоненты, сторы, стили |
| `formules.md` | Все формулы расчёта с примерами (текст для человека) |
| `docs/analysis/` | User stories, story map, business rules, диаграммы |
| `docs/qa/` | Чек-листы и тест-кейсы для приёмки |
| `docs/samples/README.md` | Форматы импорта Excel/CSV |
| `docs/db_schema.md` | Схема БД и миграции |

## Тесты

```bash
# Backend (unit + integration; integration требуют БД heatcalc_test)
docker exec -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  heatcalc_backend python3 -m pytest app/tests/

# Frontend (vitest + React Testing Library)
docker exec heatcalc_frontend npm test -- --run

# E2E (Playwright — запускается поверх docker-compose.e2e.yml)
npx playwright test
```

Текущее состояние:
<!-- AUTO:test-counts -->
**1291 backend** (942 unit + 349 integration) ✅ · **815 frontend vitest** ✅ · **92 e2e Playwright** ✅
<!-- /AUTO -->

> Цифры синхронизируются `scripts/sync-docs.py` (правит этот блок на месте).
