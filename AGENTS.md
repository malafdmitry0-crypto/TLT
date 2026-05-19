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

## Универсальные усилители тестирования

Применяй к любому изменению, где ошибка может исказить расчет, отчет,
спецификацию, импорт/экспорт, права доступа или пользовательский workflow:

- Для формул и алгоритмов одного "green" unit-теста недостаточно: нужен
  независимый golden/oracle из документации, ТЗ, справочника или ручного
  инженерного расчета, плюс boundary/metamorphic cases по рабочему диапазону.
- Если результат зависит от формулы, коэффициентов, справочника или каталога,
  проверяй traceability: `formula_id`, версия/источник данных, категория
  результата, диагностируемый `error_code` и сохранение этих данных в БД.
- Для API/UI сценариев проверяй не только экран, но и payload, единицы
  измерения, сохранение, повторную загрузку и побочные эффекты в отчетах,
  спецификациях и связанных расчетах.
- Для отчетов и спецификаций отдельно доказывай бизнес-суммы: успешные,
  ошибочные, неподдержанные и устаревшие результаты не должны смешиваться;
  выбранный вариант расчета должен проходить через весь backend/frontend flow.
- Для импорта, batch-операций и reorder проверяй идемпотентность,
  стабильные ключи связей, частичный успех, лимиты и повторный запуск.
- Для критичной бизнес-логики проверяй структурные логи/аудит: кто, где,
  над каким проектом/объектом, какое действие, какой результат, correlation id,
  длительность и диагностический код. Секреты и персональные данные не логировать.
- Для поиска, списков, импорта и массовых расчетов оценивай масштаб:
  если возможен full scan или N+1, добавь focused performance/DB evidence
  или явно зафиксируй остаточный риск.

## Режимы агентной работы

Выбирай режим явно по задаче. Не запускай широкий `deep` вместо доказательства
конкретного пользовательского дефекта.

| Режим | Когда использовать | Definition of Done |
|---|---|---|
| `/audit-only` | Нужно только найти риски | Findings с файлами/строками, evidence и residual risk; без правок кода |
| `/fix-focused` | Есть конкретный баг или finding | Минимальная правка, focused test, проверка что тест падает без фикса или ловит риск |
| `/ui-proof` | Любой UI/layout/UX дефект | Before screenshot, DOM/CSS finding, fix, verifier/Playwright, after screenshot минимум на целевом viewport |
| `/release-gate` | Предрелизная проверка | `all`/`deep` gates, список блокеров; не подменять блокеры случайными refactor/fix вне scope |

## Жёсткие правила evidence

- Если пользователь назвал конкретный симптом, агент не имеет права уходить в
  легкие зелёные задачи вместо него. Этот симптом должен быть подтвержден,
  исправлен или явно помечен как blocked.
- Для UI/layout задач before/after screenshots обязательны. Если браузер,
  Playwright или screenshot недоступны, задача считается `blocked/fail`, а не
  `pass with residual risk`.
- UI verifier должен ловить не только overflow за границы, но и clipping,
  `text-overflow`, overlap, disabled controls, нечитаемый текст и горизонтальный
  scroll рабочего сценария.
- Нельзя массово менять expected/golden значения тестов без источника новой
  правды: ссылка на формулу, справочник, ТЗ, ручной инженерный расчёт или
  независимый oracle обязательна в комментарии, тесте или отчёте.
- Нельзя ослаблять assertions только ради зелёного gate. Если меняется
  ожидание, объясни какой продуктовый контракт изменился и чем это доказано.
- Residual risk допустим только вне scope. Если evidence входит в scope и не
  получено, итоговый статус — `blocked`, `needs verification` или finding.

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
- UI/layout задача не имеет before/after screenshot и программной проверки
  clipping/overflow/overlap/readability.
- Playwright/browser проверка входит в scope, но не запущена или упала по
  инфраструктуре; это blocked, а не успешная сдача.
- Golden/expected значения изменены без независимого источника новой правды.
