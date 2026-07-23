# Мастер-промпт frontend refactoring

**Статус:** исполняемый шаблон  
**Применение:** один vertical slice за запуск  
**Норматив:** [agent-development-standard.md](./agent-development-standard.md)

Скопируй блок ниже в coding agent. Заполни известные поля. Пустой `SLICE_ID`
разрешает агенту взять первый `pending` из
[refactor-backlog.md](./refactor-backlog.md).

```text
Ты выполняешь один безопасный frontend refactoring slice в проекте TLT:
/Users/dmalafey/Desktop/TLT

SLICE_ID:
DOMAIN:
GOAL:
USER_VISIBLE_SUCCESS:
ALLOWED_SCOPE:
NON_GOALS:
INVARIANTS:
FOCUSED_PROOF:
UI_STATES:

## Источники

Полностью прочитай:
1. frontend/AGENTS.md
2. docs/frontend/agent-development-standard.md
3. docs/frontend/refactor-backlog.md
4. релевантный production-код, ближайшие тесты и тематический документ

Порядок приоритета задан в AGENTS.md. Архивные документы не маршрутизируют
работу и не являются источником текущих метрик.

## Выбор slice

- Если SLICE_ID/GOAL/ALLOWED_SCOPE заполнены, выполняй только этот контракт.
- Если они пусты, возьми первый pending из refactor-backlog.md.
- Если pending нет, STOP: запроси конкретную пользовательскую цель.
- Не выбирай рефакторинг только потому, что файл длинный.
- Один запуск = один slice и один feature-owner.

## Preflight

1. Выполни git status --short.
2. Не трогай unrelated dirty files и не добавляй их в commit.
3. Через rg найди владельца поведения, callers, imports и ближайшие тесты.
4. Пересчитай текущие LOC/edges/селекторы; не копируй старые цифры из docs.
5. Сформулируй:
   - behavior before;
   - behavior after;
   - allowed files;
   - non-goals;
   - invariants;
   - focused и full proof.
6. Проверь budget:
   max 1 page/shell, 2 production helper/CSS, 2 test/baseline files.
   Если не помещается — спроектируй split и выполни только первую независимо
   проверяемую часть.

## Characterization first

До production-изменения зафиксируй существующий контракт тестом:
- happy path;
- один значимый edge/failure path;
- публичное поведение, а не внутреннюю форму реализации.

Если надежный characterization уже существует, укажи точный файл и assertions.
Не ослабляй и не удаляй тесты.

## Implementation

- Сделай минимальный patch только в allowed scope.
- Сохрани UX, copy, layout, API payload, query keys/invalidation, routes, units,
  формулы, permissions и ER UUID semantics, если задача явно не меняет их.
- Pure logic держи вне React/Ant/router/store/HTTP.
- Presentational UI: props-in/events-out.
- UI импортируй через @/components/ui-kit.
- Не создавай Heat↔Electrical↔Specification deep imports.
- Не добавляй feature CSS в src/styles.css, bare .ant-* или !important.
- Не используй any, @ts-ignore, as unknown as и broad casts.
- Удали только заменённый код или доказанный дубль.
- Не выполняй соседний cleanup.

## Proof

Сначала запусти FOCUSED_PROOF, затем полный gate:

cd frontend
npm run test:agent-gates
npm run test:unit
npm run test:integration
npm run build

Для DOM/CSS/interaction изменений browser proof обязателен:
- целевой desktop viewport;
- narrow/mobile viewport;
- затронутые loading/empty/error/disabled/permission states;
- keyboard/focus;
- overflow и geometry;
- console warnings/errors;
- failed network requests.

Используй релевантный Playwright spec и приложи evidence. Если browser proof
недоступен или показывает регрессию, статус blocked; готовый commit запрещён.
Красный full gate также означает blocked, даже если ошибка выглядит unrelated.

## Architecture baseline

Не повышай complexity/CSS/dependency baseline и не расширяй allowlist внутри
feature-slice. Если исключение действительно нужно, STOP и предложи отдельный
architecture-slice.

## Hard stops

STOP без готового commit, если:
- бизнес-правило неоднозначно;
- нужен touch формул, units, API/query/route или UUID semantics вне scope;
- целевой файл пересекается с чужим WIP;
- budget превышен;
- нужен weaker test или baseline increase;
- full gate красный;
- обязательный browser proof отсутствует;
- три содержательные попытки не устранили одну причину.

Сообщи FILE / EVIDENCE / DECISION NEEDED.

## Commit protocol

Только после полного DoD:
1. Добавь git add только явные файлы slice.
2. Создай conventional commit с SLICE_ID:
   refactor(frontend): <SLICE_ID> <результат>
3. Если slice пришёл из backlog, обнови его status=done, metrics и production
   commit hash.
4. Создай отдельный docs-only commit:
   docs(frontend): close <SLICE_ID>
5. Не push без явной команды пользователя.

## Финальный отчёт

Верни:
- Slice и behavior before → after;
- files changed;
- metrics before → after;
- focused proof;
- full gate;
- browser states/viewports/evidence;
- console/network summary;
- untested states;
- residual risk;
- production commit;
- backlog commit;
- следующий pending.

Не заявляй проверки, которые не запускались.
```

## Короткий запуск

```text
Прочитай frontend/AGENTS.md и выполни ровно один slice по
docs/frontend/agent-refactor-prompt.md. Если параметры не заданы, возьми первый
pending из docs/frontend/refactor-backlog.md. Соблюдай full DoD и hard stops.
```
