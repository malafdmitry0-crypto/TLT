# Промпт: AF100-11 — direct Ant inventory и shrink-only boundary

**Статус:** executable residual prompt (architecture / ui)  
**Актуально на:** 2026-07-27  
**Pending authority:** только [refactor-backlog.md](../refactor-backlog.md)  
**Policy source:** [Ant UI Kit — стратегия](../ant-ui-kit-strategy.md),
[UI-kit контракт](../ui-kit.md) и
[стандарт разработки](../agent-development-standard.md)

## Зачем

Сделать каждый production-импорт из `antd` однозначным для человека и агента,
не превращая метрику в цель.

Нормативный результат:

> Новый direct Ant import либо разрешён машинно-проверяемой политикой, либо
> отклонён. Существующие capability-gap исключения объяснены и shrink-only.
> Нулевое число direct imports не является целью.

Этот файл — исполняемый prompt, а не очередь и не источник текущих счётчиков.
Количество файлов, символов и исключений пересчитывается при запуске и
фиксируется только в датированном `docs/audit/YYYY-MM-DD-*/snapshot.md`.

## Decision rule

| Класс | Решение |
|---|---|
| Public TLT equivalent | Feature импортирует `@/components/ui-kit`; direct Ant запрещён |
| Conditional façade (`Table`, `Tabs`, `Empty`, `Skeleton`) | TLT façade, если его контракт достаточен; иначе явное capability-gap исключение |
| Нет TLT equivalent | Raw `antd` разрешён до появления повторяемого product contract |
| UI-kit / form-control internal | Raw `antd` разрешён как внутренняя реализация фасада |
| Ant type | Допустим локально; не должен протекать в публичный feature API |
| Feedback | Только `appMessage` / `appModal`; static `message` / `Modal.confirm` запрещены |

Новый TLT-компонент создаётся только для повторяемого продуктового поведения,
а не как переименование Ant.

## Копируй в агент

```text
Работай из корня репозитория TLT.

Прочитай полностью:
  AGENTS.md
  frontend/AGENTS.md
  docs/frontend/agent-development-standard.md
  docs/frontend/refactor-backlog.md
  docs/frontend/pr-budget.md
  docs/frontend/ant-ui-kit-strategy.md
  docs/frontend/ui-kit.md
  docs/frontend/viewport-policy.md
  frontend/src/__tests__/unit/architecture/antdPrimitivePolicy.architecture.test.ts
  frontend/src/components/ui-kit/index.ts
  frontend/src/components/ui-kit/UiPrimitives.tsx
  frontend/src/components/ui-kit/TltTable.tsx
  frontend/src/components/ui-kit/TltTabs.tsx

До изменений:
  git status --short

Не трогай чужой WIP. Не меняй ACTIVE очередь: этот prompt исполняется только
когда AF100-11 стал NEXT или пользователь явно запросил этот slice.

PROGRAM GOAL
============

Классифицировать каждый production direct import из `antd`, закрыть
неоднозначность Table/Tabs/Empty/Skeleton fail-closed guard-тестом и оставить
только объяснённые capability-gap исключения. Не стремиться к нулю импортов.

PROGRAM SPLIT
=============

Программа состоит из независимых slices:

  AF100-11a  architecture inventory + executable policy; NO production UI changes
  AF100-11b+ one proven migration, one feature owner per slice

В одном запуске выполняй только один slice.

══════════════════════════════════════════════════════════════════════════════
AF100-11a — INVENTORY + GUARD
══════════════════════════════════════════════════════════════════════════════

OWNER: architecture

ALLOWED_SCOPE:
  - antdPrimitivePolicy architecture test и максимум 2 его helper/manifest файла
  - package script только если без него guard невозможно вызвать
  - датированный audit snapshot
  - точечная синхронизация ant-ui-kit-strategy при найденном противоречии

NON_GOALS:
  - production-компоненты;
  - CSS и визуальные изменения;
  - массовая замена imports;
  - расширение Tlt façades;
  - изменение UX или Ant dependency;
  - рост существующего forbidden baseline.

1. Построй inventory через TypeScript AST, не regex.

   Scope:
   - frontend/src/**/*.ts и **/*.tsx;
   - production only;
   - исключить tests, stories, declarations и generated files;
   - учитывать named, aliased, default, namespace и `import type`;
   - один файл может содержать несколько классификаций.

2. Для каждого imported symbol назначь ровно один класс:

   A. `tlt-equivalent-forbidden`
      Button, Input, InputNumber, Select, Card, Alert, Tag и другие примитивы,
      для которых стратегия объявляет обязательный public TLT equivalent.

   B. `conditional-capability-gap`
      Table, Tabs, Empty, Skeleton и другие фасады, чей текущий публичный API
      может не покрывать advanced Ant behavior.

   C. `raw-allowed-no-equivalent`
      Form, Modal, Space, Tooltip, Dropdown, Typography, types и другие
      символы без TLT equivalent.

   D. `facade-internal`
      импорт внутри ui-kit/form-controls/theme/feedback implementation,
      разрешённый направлением dependency.

   E. `forbidden-feedback`
      static message / Modal.confirm вне feedback boundary.

   Не используй catch-all `allowed`. Неизвестный новый symbol должен упасть
   как UNCLASSIFIED и потребовать отдельного архитектурного решения.

3. Conditional capability-gap manifest.

   Для каждого feature-файла, который напрямую использует conditional façade,
   manifest хранит:
   - точный repo-relative path;
   - symbols;
   - owner;
   - конкретную недостающую capability, например:
     `pagination`, `rowSelection`, `expandable`, `virtual scroll`,
     `tabBarExtraContent`, `card tabs`, `Skeleton.Input`;
   - краткое решение `keep raw Ant`.

   Запрещены причины:
   - `legacy`;
   - `too hard`;
   - `temporary`;
   - пустой комментарий;
   - копирование общего текста без привязки к используемым props.

   Manifest — policy registry, не хранилище totals. Новая запись не добавляется
   внутри обычного feature-slice. Расширение требует отдельного architecture
   decision; существующая очередь остаётся shrink-only.

4. Guard обязан быть bidirectional и fail-closed:

   - forbidden equivalent в feature production → FAIL;
   - conditional import без точного manifest entry → FAIL;
   - symbol/path/capability в manifest уже не используется → STALE → FAIL;
   - неизвестный antd symbol → UNCLASSIFIED → FAIL;
   - один import получил 0 или >1 классов → FAIL;
   - public feature export протащил Ant type → FAIL либо точный доказанный
     exception;
   - static feedback вне feedback boundary → FAIL;
   - UI-kit импортирует feature/domain/store/API → FAIL;
   - новый обычный raw-allowed symbol проходит только после явного добавления
     в централизованную policy map.

5. Characterization / red-demo fixtures:

   Минимум:
   - Button в feature → FAIL;
   - Form в feature → allowed;
   - Table с зарегистрированным pagination gap → allowed;
   - Table без manifest → FAIL;
   - stale Table manifest → FAIL;
   - неизвестный symbol → FAIL;
   - type-only local import → allowed;
   - Ant type в public feature props → FAIL;
   - UI-kit internal Button → allowed;
   - static message / Modal.confirm в feature → FAIL.

   Fixture-тесты работают на временном source tree или pure classifier input.
   Они не создают реальные нарушения в production.

6. Audit:

   Создай новый датированный snapshot и зафиксируй на текущем HEAD:
   - команду inventory;
   - число production-файлов и import declarations;
   - totals по пяти классам;
   - conditional files по owner;
   - список capability gaps;
   - число unclassified/ambiguous/stale;
   - кандидатов на миграцию, где façade уже покрывает фактические props.

   Эти числа не копируй в нормативные документы или этот prompt.

ACCEPTANCE AF100-11a
====================

- Каждый production `antd` import классифицирован ровно один раз.
- UNCLASSIFIED = 0; AMBIGUOUS = 0; STALE = 0.
- Feature direct imports обязательных TLT equivalents = 0.
- Conditional raw imports имеют точное capability-gap объяснение.
- Guard ловит рост и устаревшие исключения.
- Production UI diff = 0.
- Нулевая цель direct imports нигде не объявлена.

FOCUSED PROOF AF100-11a
=======================

Из frontend/:
  npx vitest run \
    src/__tests__/unit/architecture/antdPrimitivePolicy.architecture.test.ts \
    --project unit
  npm run typecheck
  npm run lint

Затем рассчитай diff-wide minimum:
  npm run agent:scope -- --changed --json
  npm run agent:proof-run -- --changed
  npm run agent:proof-check -- --changed

Полный `test:agent-dod:dual-safe` запускай только по явному запросу
пользователя. Если он не запрошен, отчитай `NOT RUN`.

COMMIT AF100-11a
================

  test(frontend): AF100-11a classify direct Ant boundaries

Если slice взят из backlog, обнови его только после production/test commit и
закрой отдельным docs commit по Git protocol стандарта.

══════════════════════════════════════════════════════════════════════════════
AF100-11b+ — TARGETED MIGRATION
══════════════════════════════════════════════════════════════════════════════

Запускай только если audit AF100-11a нашёл импорт, где текущий TLT façade
полностью покрывает используемое поведение.

OWNER: реальный feature owner (`heat`, `electrical`, `specification`, `admin`,
`projects`, `reports` и т. д.), не `architecture`.

Один slice:
  - один component/use-case;
  - characterization текущего behavior до production patch;
  - замена direct Ant на существующий public `@/components/ui-kit`;
  - удаление только ставшего ненужным CSS/adapter кода;
  - удаление соответствующего manifest entry;
  - никакого соседнего cleanup.

STOP и оставь raw Ant, если façade не сохраняет хотя бы один контракт:
  - props/callback semantics;
  - pagination/selection/expand/scroll;
  - loading/empty/error/disabled state;
  - keyboard/focus/a11y;
  - geometry/density;
  - public types;
  - test selectors и observable DOM contract.

Не расширяй façade ради одного consumer. Новый или расширенный Tlt primitive —
отдельный ui-owner slice только при доказанном повторяемом product behavior.

PROOF AF100-11b+
================

- focused component/feature tests;
- architecture policy test;
- diff-wide minimum через agent:proof-run/check;
- для видимого UI обязательный browser proof по viewport-policy:
  affected states, keyboard/focus, overflow, console и failed requests.

Полный DoD — только по явному запросу пользователя; иначе `NOT RUN`.

COMMIT AF100-11b+
=================

  refactor(frontend): AF100-11b migrate <component> to TLT facade

PROGRAM DONE
============

AF100-11 завершён, когда:
  - inventory/guard acceptance зелёный;
  - каждый оставшийся conditional import имеет реальный capability gap;
  - все найденные простые совместимые кандидаты либо мигрированы отдельными
    owner-slices, либо audit объясняет, почему миграция не нужна;
  - direct Ant total может оставаться большим — это не failure;
  - backlog и датированный audit отражают фактический HEAD.

Финальный отчёт каждого slice:
  - classification/migration before → after;
  - изменённые файлы;
  - фактически выполненные команды;
  - browser states/viewports или NOT RUN;
  - full DoD PASS/FAIL/NOT RUN;
  - residual capability gaps;
  - commit hash;
  - текущий NEXT из backlog без самовольной перестановки.
```

