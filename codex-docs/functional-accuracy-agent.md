# Codex Playbook: Проверка функциональной точности приложения

Этот playbook описывает, как Codex должен проверять функционал приложения:
читать документацию, находить реализацию и доказывать точность поведения.

## Цель

Не ограничиваться вопросом "тесты зеленые". Нужно ответить на более сильный
вопрос: "реализованное поведение соответствует требованиям, бизнес-правилам и
пользовательскому сценарию?"

## Источники

| Что проверяется | Документы |
|---|---|
| Общая карта | `codex-docs/project-map.md`, `CLAUDE.MD` |
| Требования | `codex-docs/requirements-map.md`, `docs/srs.md`, `docs/srs/` |
| Бизнес-правила | `docs/business-logic-contract.md`, `docs/analysis/business-rules.md` |
| API | `docs/api.md` |
| Формулы | `docs/business-logic-contract.md`, `docs/tnp/README.md`, `docs/tnp/correctness-review.md`, `qa-agent/examples/tlt-formulas.registry.yaml`, `docs/context/formulas-summary.md`, `formules.md`, `coefficients.MD` |
| QA | `docs/qa/`, `docs/qa/business-logic-coverage.md`, `codex-docs/testing.md` |
| Пробелы | `TO_DO.md`, `docs/analysis/current-status-and-missing-info.md` |

## Поиск реализации

Для каждого функционала найти:

| Слой | Где искать |
|---|---|
| API | `backend/app/api/v1/**` |
| Сервис | `backend/app/services/**` |
| Схемы | `backend/app/schemas/**` |
| Модели/БД | `backend/app/models/**`, `backend/alembic/versions/**` |
| Формулы | `backend/app/formulas/**` |
| Frontend API | `frontend/src/api/**` |
| UI | `frontend/src/pages/**`, `frontend/src/components/**` |
| State/query | `frontend/src/store/**`, `frontend/src/hooks/**` |
| Тесты | `backend/app/tests/**`, `frontend/src/**/__tests__/**`, `e2e/tests/**` |

Рабочий поиск:

```bash
rg -n "ключевой термин|endpoint|field_name|use case id" docs backend frontend e2e
```

## Матрица Evidence

| Тип функционала | Минимальное evidence |
|---|---|
| Формула/алгоритм | `scripts/formula-qa.sh quick`; при API/service изменениях - `full` |
| Формула/алгоритм критичного контура | `scripts/codex-functional-audit.sh contracts` + `scripts/codex-functional-audit.sh mutation` |
| API endpoint | unit/service test + integration API test |
| Роль/доступ | backend security/integration test, не только UI guard |
| UI форма | frontend test или Playwright сценарий + проверка payload/API |
| UI доступность | `scripts/codex-functional-audit.sh accessibility` |
| UI разметка | `scripts/codex-functional-audit.sh layout` |
| Импорт/экспорт | backend parser/generator tests + один end-to-end sample |
| Отчет | generator test + frontend/report flow |
| DB behavior | migration/model/integration test + повторная загрузка данных + `db-invariants` |

## Алгоритм агента

1. Сформулируй scope одной фразой.
2. Прочитай `docs/business-logic-contract.md`, затем документы по scope.
3. Выпиши ожидаемое поведение: входы, выходы, роли, ошибки, side effects.
4. Найди код реализации по слоям.
5. Сверь расхождения business contract, ТНП-источников, registry и кода.
6. Найди существующие тесты.
7. Запусти минимальный gate или добавь недостающий focused test.
8. Подготовь отчет с evidence и residual risk.

## Команды

```bash
scripts/codex-functional-audit.sh docs
scripts/codex-functional-audit.sh contracts
scripts/codex-functional-audit.sh mcp
scripts/codex-functional-audit.sh db-invariants
scripts/codex-functional-audit.sh smoke
scripts/codex-functional-audit.sh calc
scripts/codex-functional-audit.sh mutation
scripts/codex-functional-audit.sh business
scripts/codex-functional-audit.sh user-flows
scripts/codex-functional-audit.sh layout
scripts/codex-functional-audit.sh accessibility
scripts/codex-functional-audit.sh warnings
scripts/codex-functional-audit.sh backend
scripts/codex-functional-audit.sh frontend
scripts/codex-functional-audit.sh all
scripts/codex-functional-audit.sh deep
```

## Deep Business Logic Gate

Когда пользователь просит глубокую проверку бизнес-логики, Codex должен
использовать уровни ниже.

| Уровень | Команда | Что доказывает |
|---|---|---|
| Documentation drift | `scripts/codex-functional-audit.sh docs` | AUTO-блоки и рабочая документация синхронизированы |
| Contract matrix | `scripts/codex-functional-audit.sh contracts` | У каждой критичной формулы есть связь: документы → backend → API → UI → тесты |
| MCP/Postgres | `scripts/codex-functional-audit.sh mcp` | MCP-конфиг валиден, DB доступна, базовые инварианты данных не нарушены |
| Smoke | `scripts/codex-functional-audit.sh smoke` | UI/API/логин/справочники/отчеты/RBAC отвечают в running stack |
| Calculation | `scripts/codex-functional-audit.sh calc` | Формулы, service guards, API/object integration |
| Mutation | `scripts/codex-functional-audit.sh mutation` | Тесты формул ловят искусственно испорченную бизнес-логику |
| Backend business | `scripts/codex-functional-audit.sh business` | RBAC, idempotency, import/export, specifications, reports, cascade/query invariants |
| User flows | `scripts/codex-functional-audit.sh user-flows` | Playwright-имитация: auth, projects, heat, electrical, cable flows, specification, reports |
| Layout regression | `scripts/codex-functional-audit.sh layout` | Desktop/tablet/mobile: overflow, clipping, overlapping interactive controls |
| Accessibility | `scripts/codex-functional-audit.sh accessibility` | Axe/WCAG serious/critical violations и базовая видимость keyboard focus |
| Warning gate | `scripts/codex-functional-audit.sh warnings` | Выбранные backend warnings становятся fail-сигналом |
| Full deep | `scripts/codex-functional-audit.sh deep` | Все выше + полный backend/frontend suites + selected warnings gate |

MCP-сервер не заменяет backend-тесты. Его задача — независимая проверка
состояния данных и инвариантов после сценариев: нет чужих проектов в сессии,
нет успешных объектов без результатов, все расчеты и спецификации привязаны к
допустимому `variant_number`, ошибки расчетов сохранены как диагностируемые
состояния.

Playwright настроен сохранять screenshot/video/trace на падениях в
`e2e/test-results` и HTML-отчет в `e2e/playwright-report`, чтобы агент мог
сразу открыть артефакт и понять, где сломался UI.

Для формул, алгоритмов и справочников актуальный порядок источников такой:
`docs/business-logic-contract.md` → `docs/tnp/` →
`qa-agent/examples/tlt-formulas.registry.yaml` → backend implementation →
tests/e2e evidence. Старые `formules.md` и `coefficients.MD` использовать как
подробный справочник, но не как более сильную истину при конфликте с
business contract.

## Шаблон отчета

```text
Functional Accuracy Report
Scope: <feature/use case>
Docs checked:
- ...
Expected behavior:
- ...
Implementation found:
- Backend: ...
- Frontend: ...
- Tests: ...
Verification:
- <command> -> pass/fail/not run
Findings:
- <severity>: <file:line> <issue>
Residual risk:
- ...
```

## Правила качества

- Не считать документацию истинной автоматически: если код и документ
  расходятся, это finding.
- Не считать frontend-проверку достаточной для прав доступа: права должны
  проверяться backend-тестом.
- Для расчетов не принимать тест, который просто повторяет формулу из кода.
- Для данных, которые сохраняются, всегда проверять reload/read-back сценарий.
