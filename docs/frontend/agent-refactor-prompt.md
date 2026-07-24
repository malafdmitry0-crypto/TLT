# Мастер-промпт frontend refactoring

**Статус:** исполняемый шаблон

**Актуально на:** 2026-07-24

**Применение:** один vertical slice за запуск

**Норматив:** [agent-development-standard.md](./agent-development-standard.md)

Этот файл задаёт только форму task contract. Он не копирует hard stops, CSS,
layout, viewport или Git policy: агент читает их у соответствующих владельцев.

```text
Работай из корня текущего репозитория TLT.

SLICE_ID:
OWNER:
GOAL:
USER_VISIBLE_SUCCESS:
ALLOWED_SCOPE:
NON_GOALS:
INVARIANTS:
FOCUSED_PROOF:
UI_STATES:

1. Полностью прочитай:
   - frontend/AGENTS.md;
   - docs/frontend/agent-development-standard.md;
   - docs/frontend/refactor-backlog.md;
   - docs/frontend/pr-budget.md;
   - ближайший production-код и tests.

2. Для UI/CSS дополнительно прочитай только релевантных владельцев:
   - docs/frontend/ui-kit.md;
   - docs/frontend/css-strategy.md;
   - docs/frontend/viewport-policy.md.

3. Если SLICE_ID и контракт заполнены, выполняй только их. Если они пусты,
   возьми первый pending из refactor-backlog.md. Если pending нет — STOP и
   запроси конкретную цель.

4. До изменения:
   - выполни git status --short;
   - остановись при dirty target-файле, который не принадлежит этому slice;
   - найди owner/callers/tests через rg;
   - пересчитай локальные метрики;
   - проверь budget;
   - зафиксируй behavior before и characterization.

5. Внеси минимальный patch одного owner. Следуй стандарту и тематическим
   политикам; не добавляй соседний cleanup и не ослабляй baseline/tests.

6. Запусти FOCUSED_PROOF, затем:

   cd frontend
   npm run test:agent-dod

7. Для видимого UI выполни обязательный browser proof по viewport-policy.md:
   exact width×height, states, keyboard/focus, geometry/overflow,
   console и failed network requests.

8. Красный full DoD, отсутствующий browser proof или другой hard stop из
   стандарта означает blocked без готового commit. Сообщи:
   FILE / EVIDENCE / DECISION NEEDED.

9. После полного DoD следуй Git protocol стандарта. Если slice взят из
   backlog, production commit и отдельный docs closure commit обязательны.
   Для пользовательской задачи вне backlog не придумывай backlog entry.

Финальный отчёт:
- Slice и behavior before → after;
- files changed;
- metrics before → after;
- focused proof и full DoD;
- browser states/viewports, console/network;
- untested states и residual risk;
- production/backlog commits, если применимо;
- следующий pending.

Не заявляй проверки, которые не запускались.
```

## Короткий запуск

```text
Прочитай frontend/AGENTS.md и выполни один slice через
docs/frontend/agent-refactor-prompt.md. Если контракт не задан, возьми первый
pending из docs/frontend/refactor-backlog.md.
```
