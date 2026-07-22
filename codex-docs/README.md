# Codex Docs

Рабочая навигация для дальнейшей разработки проекта. Эти файлы не заменяют ТЗ,
`CLAUDE.MD` и SRS, а дают короткую карту: где искать правду, как менять код и
какие риски проверять перед задачей.

## Как пользоваться

1. Для общего понимания открыть [project-map.md](project-map.md).
2. Для требований и статуса открыть [requirements-map.md](requirements-map.md).
3. Перед изменением кода проверить [development-guide.md](development-guide.md).
4. Перед сдачей задачи свериться с [testing.md](testing.md).
5. Для выбора следующей работы смотреть [backlog-and-risks.md](backlog-and-risks.md).
6. Для общего аудита улучшений приложения смотреть
   [application-improvement-checklist.md](application-improvement-checklist.md).
7. Для проверки точности функционала по цепочке "документы -> код -> тесты"
   смотреть [functional-accuracy-agent.md](functional-accuracy-agent.md).
8. Для предложений по архитектуре и навигации, понятной AI-агентам, смотреть
   [agent-readable-architecture.md](agent-readable-architecture.md).

## Источники правды

| Тема | Главный источник | Рабочая заметка |
|---|---|---|
| Назначение, архитектура, текущие границы | `CLAUDE.MD` | [project-map.md](project-map.md) |
| Backend | `backend/CLAUDE.MD` + код `backend/app/` | [development-guide.md](development-guide.md) |
| Frontend | `frontend/CLAUDE.MD` + код `frontend/src/` | [development-guide.md](development-guide.md) |
| ТЗ/SRS | `docs/srs.md`, `docs/srs/`, `docs/tz-compliance.md` | [requirements-map.md](requirements-map.md) |
| Формулы | `formules.md`, `coefficients.MD`, `backend/app/formulas/` | [project-map.md](project-map.md) |
| Приёмка и QA | `docs/qa/`, `e2e/tests/`, тесты backend/frontend | [testing.md](testing.md) |
| Текущие пробелы | `TO_DO.md`, `docs/analysis/current-status-and-missing-info.md` | [backlog-and-risks.md](backlog-and-risks.md) |
| Технический аудит приложения | код frontend/backend, тесты, текущие замечания | [application-improvement-checklist.md](application-improvement-checklist.md) |
| Функциональная точность | SRS/QA/API/код/тесты | [functional-accuracy-agent.md](functional-accuracy-agent.md) |
| Понятность архитектуры для AI-агента | Код, карты проекта, контракты и проверки | [agent-readable-architecture.md](agent-readable-architecture.md) |

## Правило актуализации

Если меняется поведение системы, обновлять не только код и тесты, но и минимум
один документ-источник: `CLAUDE.MD`, `docs/srs*`, `docs/api.md`,
`docs/db_schema.md`, `docs/qa/*` или профильный playbook.
