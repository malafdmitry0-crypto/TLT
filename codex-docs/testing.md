# Тестирование

## Быстрые команды

```bash
make test-backend
make test-frontend
```

E2E:

```bash
cd e2e
npx playwright test
```

Через Docker из README:

```bash
docker exec -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  heatcalc_backend python3 -m pytest app/tests/

docker exec heatcalc_frontend npm test -- --run
```

## Что запускать по типу изменения

| Изменение | Минимум |
|---|---|
| Формула | `scripts/formula-qa.sh quick` |
| Формула + API/service/reference data | `scripts/formula-qa.sh full` |
| Критичная формула | `scripts/codex-functional-audit.sh contracts` + `scripts/codex-functional-audit.sh mutation` |
| Endpoint/service | backend unit + integration API по модулю |
| Модель/миграция | migration/db tests + зависимые integration |
| UI-компонент | Vitest/RTL по компоненту |
| Страница рабочего потока | frontend integration + релевантный Playwright + `layout` |
| Доступность UI | `scripts/codex-functional-audit.sh accessibility` |
| Импорт/экспорт | backend import/export tests + e2e при изменении UI |
| Отчёты | report service/generator tests + frontend ReportPage tests |
| Роли/доступ | security boundary tests + frontend guards |
| Сохранение/side effects | `scripts/codex-functional-audit.sh db-invariants` после сценария |

## Усилители доказательности

Базовый gate показывает, что регрессия не воспроизвелась. Для важных
изменений дополнительно доказывай именно бизнес-смысл:

- **Расчеты и формулы:** golden/oracle из независимого источника,
  boundary cases на краях допустимых диапазонов, metamorphic checks на
  монотонность/масштабирование/симметрии, mutation gate для критичного ядра.
- **Версионирование результата:** если менялись формулы, коэффициенты,
  справочники или каталоги, проверяй сохранение `formula_id`,
  версии/источника данных, категории результата и `error_code`.
- **API + UI:** тест должен ловить расхождение единиц измерения, обязательных
  параметров, дефолтов, payload и повторной загрузки данных из backend.
- **Отчеты и спецификации:** проверяй суммы и группировки на маленьком
  контролируемом наборе данных. Failed/unsupported/stale результаты не должны
  попадать в успешные итоги; выбранный вариант расчета должен быть явным.
- **Импорт/экспорт и batch:** проверяй повторный запуск, дедупликацию,
  стабильные object keys, лимиты, частичный успех и понятный статус для UI.
- **Права и роли:** UI guard не считается доказательством. Нужен backend
  security/integration тест на прямой запрос к API.
- **Логи бизнес-действий:** для критичных действий проверяй структурные поля:
  actor/session, project_id, object_id, action, result/category, `error_code`,
  correlation id и duration. Секреты и чувствительные значения не логировать.
- **Масштаб:** для поиска, таблиц, импорта и массового пересчета добавляй
  focused performance/DB evidence при риске full scan, N+1 или долгой очереди.

## Текущие ориентиры покрытия

README фиксирует актуальные счётчики автотестов в AUTO-блоке. После массовых
изменений документацию можно синхронизировать через:

```bash
python scripts/sync-docs.py
```

## Formula QA

Для расчетного ядра используется отдельный gate:

```bash
make test-formulas          # unit/golden/metamorphic + service guards
make test-formulas-full     # плюс API/object integration
make test-formulas-mutation # mutmut по backend/app/formulas
```

Методика: [docs/playbooks/formula-validation-agent.md](../docs/playbooks/formula-validation-agent.md).

## Functional Accuracy Audit

Для Codex-проверки "документы -> реализация -> тесты":

```bash
scripts/codex-functional-audit.sh docs       # drift документации
scripts/codex-functional-audit.sh contracts  # матрица docs -> formula -> API -> UI -> tests
scripts/codex-functional-audit.sh mcp        # MCP/Postgres + DB-инварианты
scripts/codex-functional-audit.sh db-invariants # только Postgres business invariants
scripts/codex-functional-audit.sh smoke      # API/UI smoke running stack
scripts/codex-functional-audit.sh calc       # расчетный контур
scripts/codex-functional-audit.sh mutation   # mutmut по формулам
scripts/codex-functional-audit.sh business   # глубокая backend business logic проверка
scripts/codex-functional-audit.sh user-flows # Playwright-имитация пользователя
scripts/codex-functional-audit.sh layout     # программная проверка разметки
scripts/codex-functional-audit.sh accessibility # axe/WCAG + keyboard focus
scripts/codex-functional-audit.sh warnings   # selected backend warnings fail gate
scripts/codex-functional-audit.sh backend    # backend unit + integration
scripts/codex-functional-audit.sh frontend   # frontend tests
scripts/codex-functional-audit.sh all        # docs/contracts + MCP + smoke + calc + business + user flows + UI gates
scripts/codex-functional-audit.sh deep       # all + полный backend/frontend + warnings
```

Методика: [functional-accuracy-agent.md](functional-accuracy-agent.md).

Playwright сохраняет screenshot/video/trace на падениях в `e2e/test-results`.
В CI эти артефакты надо прикладывать к workflow run, чтобы Codex мог
диагностировать UI-регрессию без повторного запуска.

## TypeScript QA Agent

Каркас SDK/CLI для pipeline `документация -> требования -> registry -> oracle
-> runner -> comparator -> LLM semantic judge -> JSON report` находится в
`qa-agent/`.

```bash
make qa-agent-install
make qa-agent-typecheck
make qa-agent-test
make qa-agent-example
```

LLM не является source of truth для чисел: численные проверки выполняются через
`FormulaOracle` и `NumericComparator`; LLM изолирована за `LlmClient` и
используется только для extraction/semantic review/explanation.

## Проверка перед финальным ответом

- Все затронутые тесты запущены или явно указано, почему не запускались.
- Если менялся API, проверена обратная совместимость frontend/backend.
- Если менялась схема БД, есть миграция и тест миграций.
- Если менялся UX, нет регресса ролей гостя/сотрудника/админа.
- Документация обновлена в том же изменении.
