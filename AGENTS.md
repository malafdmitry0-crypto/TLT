# TLT — root agent entrypoint

Маршрутизация, не правила. Контракты живут у владельцев — здесь только «куда идти».

## Куда идти

| Работаешь над | Читай первым | Запускай из |
|---|---|---|
| Frontend (React/TS, UI, тесты компонентов) | [`frontend/AGENTS.md`](./frontend/AGENTS.md) | `frontend/` |
| Backend (FastAPI, расчёты, миграции) | `backend/` — ближайший код и тесты | `backend/` |
| E2E / Playwright | [`e2e/package.json`](./e2e/package.json) | **`e2e/`** — единственный дом Playwright |
| QA-агент и его отчёты | `qa-agent/` | `qa-agent/` |
| Демо-стенд | `demo/docker-compose.yml` | корень |

Frontend — самая формализованная зона: у неё собственный обязательный вход,
стандарт разработки и agent gates. Начинать frontend-задачу без
`frontend/AGENTS.md` нельзя.

## Правила, действующие во всём репозитории

- **Динамические счётчики** (LOC, тайминги, scores, baseline totals) живут
  только в датированных `docs/audit/YYYY-MM-DD-*/snapshot.md`. Нормативные
  документы хранят правила, а не числа, которые устаревают за день.
- **Одна ACTIVE очередь на зону.** Для frontend это
  [`docs/frontend/refactor-backlog.md`](./docs/frontend/refactor-backlog.md);
  audit snapshots и планы не маршрутизируют работу.
- **Артефакты прогонов** (скриншоты, логи, отчёты) не остаются в корне
  репозитория — им место в датированной папке аудита или в `.gitignore`.
- **Не трогай чужой WIP.** `git status --short` перед стартом; в commit
  попадают только файлы своего slice.
- **Незапущенная проверка не является зелёной.** Не заявляй проверки, которые
  не выполнялись.

## Быстрая навигация

```text
frontend/AGENTS.md              вход для frontend
docs/frontend/                  стандарт, backlog, тематические справочники
docs/audit/YYYY-MM-DD-*/        измерения на конкретном HEAD
e2e/tests/                      Playwright-сценарии
scripts/                        общие repo-скрипты
```
