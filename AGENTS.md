# Codex Agent Instructions — TLT

Работай как агент проверки функциональной точности приложения: сначала
установи, что обещано в документации, затем найди реализацию в коде, затем
докажи поведение тестами или точной ручной проверкой.

## Обязательный старт для задач про функциональность

Перед изменением или оценкой функционала прочитай:

1. `codex-docs/README.md`
2. `codex-docs/project-map.md`
3. `codex-docs/requirements-map.md`
4. `codex-docs/testing.md`
5. `codex-docs/business-formula-contracts.json`
6. профильные документы:
   - формулы: `formules.md`, `coefficients.MD`,
     `docs/context/formulas-summary.md`,
     `docs/playbooks/formula-validation-agent.md`
   - API: `docs/api.md`
   - бизнес-правила: `docs/analysis/business-rules.md`
   - QA-сценарии: `docs/qa/`
   - SRS/ТЗ: `docs/srs.md`, `docs/srs/`, `docs/tz-compliance.md`

## Протокол проверки точности

Для каждого проверяемого функционала фиксируй цепочку:

`Документация -> код backend -> код frontend -> тесты -> результат проверки`

Минимальный порядок работы:

1. Найди требование в документации или явно отметь, что требование не описано.
2. Найди реализацию через `rg`: API endpoint, service, schema/model,
   frontend page/component/hook, e2e/unit tests.
3. Сверь документацию с кодом: входы, единицы измерения, роли, ошибки,
   side effects, сохранение в БД, UI-состояния.
4. Запусти минимально достаточные проверки:
   - формулы и расчетные алгоритмы: `scripts/formula-qa.sh quick` или `full`;
   - общий backend: `scripts/test.sh backend-unit` / `backend-int`;
   - frontend: `scripts/test.sh frontend`;
   - пользовательский поток: релевантный Playwright/e2e.
5. Если автотеста нет, добавь focused test или укажи остаточный риск.
6. В финальном ответе дай evidence: какие документы читались, какие файлы
   кода проверялись, какие команды запущены и что осталось непроверенным.

## Команды

MCP/Postgres smoke и инварианты БД:

```bash
scripts/codex-functional-audit.sh mcp
```

Проверка только SQL-инвариантов после пользовательского сценария:

```bash
scripts/codex-functional-audit.sh db-invariants
```

Матрица `документация -> формула -> API -> UI -> тесты`:

```bash
scripts/codex-functional-audit.sh contracts
```

API/UI smoke работающего стека:

```bash
scripts/codex-functional-audit.sh smoke
```

Документационный drift:

```bash
scripts/codex-functional-audit.sh docs
```

Формулы и расчетный контур:

```bash
scripts/codex-functional-audit.sh calc
```

Mutation testing формул:

```bash
scripts/codex-functional-audit.sh mutation
```

Backend/API:

```bash
scripts/codex-functional-audit.sh backend
```

Глубокие backend-проверки бизнес-логики:

```bash
scripts/codex-functional-audit.sh business
```

Имитация пользовательских сценариев через Playwright:

```bash
scripts/codex-functional-audit.sh user-flows
```

Проверка проблем разметки:

```bash
scripts/codex-functional-audit.sh layout
```

Accessibility gate:

```bash
scripts/codex-functional-audit.sh accessibility
```

Selected backend warnings gate:

```bash
scripts/codex-functional-audit.sh warnings
```

Frontend:

```bash
scripts/codex-functional-audit.sh frontend
```

Функциональный audit gate:

```bash
scripts/codex-functional-audit.sh all
```

Самый глубокий локальный gate:

```bash
scripts/codex-functional-audit.sh deep
```

`all` включает contract matrix, smoke, бизнес-тесты, user-flow, layout,
accessibility и DB-инварианты. `deep` дополнительно запускает полный backend,
frontend и selected warnings gate.

## Report Format

```text
Functional Accuracy Report
Scope: ...
Docs checked: ...
Implementation found:
- Backend: ...
- Frontend: ...
- Tests: ...
Verification:
- Command: ...
- Result: pass/fail/not run
Findings:
- ...
Residual risk: ...
```

## Stop Conditions

Не принимай функционал как точный, если:

- документация и код расходятся, а расхождение не зафиксировано;
- расчетный результат не имеет golden/metamorphic/boundary evidence;
- формула отсутствует в `codex-docs/business-formula-contracts.json`;
- frontend отправляет параметры в других единицах, чем ожидает backend;
- права ролей проверены только визуально, без backend/security теста;
- нет проверки сохранения/повторной загрузки результата, когда функционал
  должен сохраняться в БД.
- UI-сценарий прошел, но `db-invariants` после него не запускался.
