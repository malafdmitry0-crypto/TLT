# Playbook: Агентная проверка формул и алгоритмов

Цель playbook: агент должен не только запускать тесты, а доказывать, что расчет
корректен относительно источника, физических инвариантов и бизнес-правил.

## Контур проверки

Агент проверяет четыре уровня:

1. **Источник формулы** — `formules.md`, `coefficients.MD`,
   `docs/context/formulas-summary.md`, `docs/analysis/business-rules.md`.
2. **Чистая математика** — `backend/app/formulas/**`.
3. **Склейка приложения** — Pydantic-схемы, service layer, API, сохраненный result.
4. **Регрессии тестов** — качество тестов через метаморфные и mutation-проверки.

## Обязательные классы тестов

Для каждой расчетной функции нужен минимум:

| Класс | Что ловит | Пример |
|---|---|---|
| Golden test | Сдвиг численного результата | пример из `formules.md` или Excel |
| Метаморфный тест | Ошибки знака, степени, множителя | `Q(2L) = 2Q(L)`, толще изоляция -> меньше `q` |
| Boundary/error test | Неверные входы и пределы | нулевая длина, `T_process <= T_ambient`, неподходящий кабель |
| Service guard | Ошибки передачи коэффициентов | `safety_factor` применяется ровно один раз |
| Integration/API guard | Ошибки сериализации и сохранения | endpoint вернул и сохранил ожидаемый result |

Важно: тестовый oracle не должен быть копией реализации. Эталон берется из
документации, независимого ручного расчета, справочника или физического инварианта.

## Команды

Быстрая проверка формул:

```bash
scripts/formula-qa.sh quick
```

Полная проверка формульного контура с API/object integration:

```bash
scripts/formula-qa.sh full
```

Mutation testing по `backend/app/formulas/**`:

```bash
scripts/formula-qa.sh mutation
```

Эквивалентные Makefile-цели:

```bash
make test-formulas
make test-formulas-full
make test-formulas-mutation
```

## Рабочий протокол агента

1. Определи расчетный scope: `pipe`, `tank`, `self_regulating`, `resistive`,
   `specification`, `calculation_service`.
2. Прочитай источник формулы и текущую реализацию.
3. Найди релевантные тесты в `backend/app/tests/unit/formulas/**`.
4. Если менялась математика, добавь или обнови golden + metamorphic + boundary тест.
5. Если менялись коэффициенты, API или сервисы, добавь service/integration guard.
6. Запусти `quick` или `full` в зависимости от scope.
7. Для крупной правки математического ядра запусти `mutation` или явно зафиксируй,
   что он не запущен и почему.

## Формат отчета

```text
Formula QA Report
Scope: ...
Source checked: ...
Evidence:
- Golden: ...
- Metamorphic: ...
- Boundary/error: ...
- Service/API: ...
Commands:
- ...
Result: pass/fail
Remaining risk: ...
```

## Stop conditions

Агент не должен принимать изменение формулы, если:

- нет источника формулы или численного эталона;
- тест повторяет реализацию вместо независимого oracle;
- `safety_factor` или другой коэффициент может применяться дважды;
- результат UI/API расходится с результатом чистой функции;
- изменены справочники, но нет теста на выбор конкретной строки справочника.
