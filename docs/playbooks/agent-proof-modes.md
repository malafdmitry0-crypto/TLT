# Playbook: Agent Proof Modes

Этот playbook фиксирует, как запускать агентов так, чтобы они не заменяли
пользовательское доказательство зелёными тестами.

## Проблема

Широкий prompt вроде "проверь проект и исправь findings" часто уводит агента
в лёгкие pass-сигналы: test maintenance, warnings, expected values. Для
продуктового дефекта это недостаточно. Агент должен доказывать именно scope,
который важен пользователю.

## Режимы

### `/audit-only`

Использовать, когда нужно понять риски без изменения файлов.

```text
Режим audit-only.
Scope: <модуль/сценарий>.
Ничего не меняй. Найди требования, реализацию, тесты и дай findings с severity,
file:line, evidence, residual risk.
```

Готово, если есть findings или явное "issues not found" с перечислением
проверенного evidence.

### `/fix-focused`

Использовать для одного подтверждённого бага.

```text
Режим fix-focused.
Scope: <конкретный defect>.
Сначала воспроизведи или докажи дефект, затем исправь минимально, добавь focused
test/verifier, запусти проверки. Не трогай unrelated files.
```

Готово, если есть root cause, patch, test/verifier и результат проверки.

### `/ui-proof`

Использовать для любой жалобы на layout, читаемость, disabled controls,
таблицу, форму, toolbar, clipping или overlap.

```text
Режим ui-proof.
Scope: <экран/симптом>.
Обязательное evidence: before screenshot, DOM/CSS root cause, fix, verifier,
after screenshot на 1280/1366/1920 или согласованных viewport. Если browser
automation не работает, статус blocked, не success.
```

Минимальный verifier должен ловить:

- clipped text: `scrollWidth > clientWidth` или `scrollHeight > clientHeight`
  при `overflow: hidden/clip`, `text-overflow` или line clamp;
- overlap интерактивных элементов;
- page-level horizontal scroll;
- disabled critical control в сценарии, где пользователь должен продолжить;
- нечитаемый текст внутри кнопок, ячеек и labels.

### `/release-gate`

Использовать перед релизом или крупным merge.

```text
Режим release-gate.
Scope: <ветка/релиз>.
Запусти docs/contracts/business/user-flows/layout/accessibility/db-invariants
или deep по ситуации. Не чинить unrelated issues без явного подтверждения.
In-scope failed gate = blocker.
```

Готово, если gates завершены, блокеры отделены от residual risks, а все
инфраструктурные блокеры названы с командами и логами.

## Общие Stop Conditions

- In-scope evidence не может быть перенесено в residual risk.
- UI/layout без before/after screenshot не принимается как fixed.
- Playwright/Chrome failure для UI-scope — blocked.
- Security/RBAC без прямого backend/API теста — не принимается.
- Формула без independent golden/metamorphic/boundary evidence — не
  принимается.
- Отчёт/спецификация без controlled dataset и проверки бизнес-сумм — не
  принимается.
- Изменённые expected/golden values без источника новой правды — blocker.

## Golden Number Checklist

Перед изменением expected number ответь:

1. Что изменилось в источнике истины?
2. Где документ/формула/справочник/каталог?
3. Есть ли independent oracle или ручной расчёт?
4. Старое число было неверным или изменился продуктовый контракт?
5. Новый допуск отражает физику/бизнес-инвариант или просто текущий вывод кода?

Если хотя бы на один вопрос нет ответа, expected value не менять.

## Финальный Отчёт

```text
Agent Proof Report
Mode: /ui-proof | /fix-focused | /audit-only | /release-gate
Scope: ...
Root cause / Findings:
- ...
Evidence:
- before: ...
- after: ...
- tests/verifiers: ...
Files changed:
- ...
Blocked / residual risk:
- ...
```
