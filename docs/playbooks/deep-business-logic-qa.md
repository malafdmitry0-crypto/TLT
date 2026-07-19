# Playbook: глубокое тестирование бизнес-логики

Цель: проверять не только отдельные функции, а весь бизнес-контур приложения:
требования, роли, расчеты, сохранение данных, спецификации, отчеты и
пользовательские сценарии.

## Уровни проверки

| Уровень | Команда | Назначение |
|---|---|---|
| Документация | `scripts/codex-functional-audit.sh docs` | Нет drift в авто-блоках документации |
| Contract matrix | `scripts/codex-functional-audit.sh contracts` | Каждая критичная формула связана с документом, backend, API, UI и тестом |
| MCP/Postgres | `scripts/codex-functional-audit.sh mcp` | MCP-конфиг, доступ к БД, SQL-инварианты |
| DB invariants | `scripts/codex-functional-audit.sh db-invariants` | Чистая проверка данных после smoke/e2e без повторного MCP-конфига |
| Smoke | `scripts/codex-functional-audit.sh smoke` | Быстрая проверка running stack |
| Расчеты | `scripts/codex-functional-audit.sh calc` | Формулы + service/API guards |
| Mutation | `scripts/codex-functional-audit.sh mutation` | Проверяет, что тесты формул ловят испорченную формулу |
| Backend business | `scripts/codex-functional-audit.sh business` | RBAC, import/export, idempotency, reports, DB |
| User simulation | `scripts/codex-functional-audit.sh user-flows` | Playwright-путь пользователя через UI и API |
| Layout regression | `scripts/codex-functional-audit.sh layout` | Desktop/tablet/mobile: overflow, clipping, overlap |
| Accessibility | `scripts/codex-functional-audit.sh accessibility` | Axe/WCAG + keyboard focus visibility |
| Warning gate | `scripts/codex-functional-audit.sh warnings` | Выбранные backend warnings считаются падением gate |
| Full deep | `scripts/codex-functional-audit.sh deep` | Полный локальный gate: `all` + backend/frontend + warning gate |

## MCP/Postgres smoke

MCP используется как независимый канал инспекции данных после сценариев. В
проекте настроен `.mcp.json` с `postgres` server. Минимальные проверки:

- `.mcp.json` валиден как JSON;
- Docker-сеть `tlt_default` существует;
- `heatcalc_db` отвечает на `pg_isready`;
- нет проектов без владельца и без session id;
- нет `is_valid=true` объектов без `results`;
- у `electrical_calculations` и `specifications` compatibility
  `variant_number` в диапазоне `1..5`, а `electrical_variant_id` указывает на
  тот же project-scoped ЭР.
- электротехнический расчет относится к объекту того же проекта;
- у сохраненных электротехнических расчетов есть `cable_type` и `results`;
- `specifications.items` — JSON array;
- у background tasks есть владелец и корректный progress.

## Что должен делать Codex при проверке фичи

1. Найти требование в `docs/srs*`, `docs/analysis/business-rules.md`,
   `docs/qa/*` или отметить отсутствие требования.
2. Найти реализацию по слоям: API, service, schema, model, frontend API,
   page/component/hook.
3. Найти тесты и понять, какой риск они закрывают.
4. Запустить минимальный уровень из таблицы выше.
5. Для пользовательского сценария запустить `user-flows` или конкретный
   Playwright spec.
6. Для UI-изменения запустить `layout`, чтобы поймать проблемы разметки.
7. Для доступности запустить `accessibility`; axe ловит label/input, contrast,
   aria и другие serious/critical нарушения.
8. После сценария проверить DB-инварианты через `db-invariants` или `mcp`.
9. В отчете указать evidence и residual risk.

## Правило in-scope evidence

Если проверка входит в scope, её нельзя заменить residual risk. Например:

- UI/layout scope требует Playwright/screenshot/verifier. Если browser
  automation не работает, итог — `blocked`, а не `pass`.
- Формула требует golden/metamorphic/boundary evidence. Если есть только
  повторение текущего кода, итог — `needs verification`.
- Отчёт требует controlled dataset и проверку бизнес-сумм. Если проверен только
  HTML status 200, итог — finding.
- RBAC требует прямого backend/API теста. UI guard не закрывает security scope.

## Риски, которые должны быть покрыты

- Гость не видит и не меняет данные другого гостя.
- Сотрудник не редактирует чужие проекты, если бизнес-правило запрещает.
- Админские endpoints недоступны сотруднику и гостю.
- Расчетные коэффициенты не применяются дважды.
- UI отправляет единицы измерения, ожидаемые backend.
- именованные UUID ЭР не смешивают результаты, спецификации и главы отчёта.
- Ошибка расчета сохраняется и видна пользователю после reload.
- Import/export round-trip не теряет параметры, результаты и variant.
- Спецификация и отчет строятся из актуального варианта расчета.
- Удаление проекта каскадно удаляет производные сущности.
- Разметка не ломается на desktop/tablet/mobile: нет page-level horizontal scroll,
  критичные контролы не выходят за viewport, текст в кнопках/меню не обрезан,
  интерактивные элементы не перекрывают друг друга.
- Доступность не регрессирует: нет serious/critical axe violations, фокус не
  уходит в невидимый элемент.
- При падении Playwright есть screenshot/video/trace в `e2e/test-results`.

## Отчет

```text
Deep Business QA Report
Scope: ...
Docs checked: ...
MCP/DB invariants: pass/fail/not run
Smoke: pass/fail/not run
Backend business tests: pass/fail/not run
User-flow simulation: pass/fail/not run
Layout regression: pass/fail/not run
Accessibility: pass/fail/not run
Warning gate: pass/fail/not run
Findings:
- ...
Residual risk:
- ...
```
