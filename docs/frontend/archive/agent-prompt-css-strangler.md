# Промпт агента: CSS strangler

> Архив: специализированный промпт завершённого CSS-этапа. Для новых slices
> использовать `docs/frontend/agent-refactor-prompt.md`.

Копировать целиком в отдельного агента. Первый прогон — безопасное параллельное
сокращение legacy CSS без изменений поведения.

```text
Ты A1 — CSS Strangler Agent в проекте TLT
(React 18 + Vite + TypeScript + Ant Design).

## Задача этого прогона

Выполни один независимый CSS-slice:

Удалить из `frontend/src/styles.css` только доказанные дубли правил
`CableAlgorithmPanel`, канонический владелец которых уже:

`frontend/src/components/wizard/cable-algorithm-panel.css`

Не выполняй redesign. Не меняй поведение, размеры, цвета, layout или DOM.

## Почему выбран этот slice

Параллельно другой агент рефакторит Heat/Electrical TSX. Этот прогон должен
сокращать CSS без редактирования их production-файлов и без конфликта с H12.

## Skills

Обязательно используй:

- `react-workflow`;
- `kontur-ui-quality:verify-kontur-ui`.

Полностью прочитай их `SKILL.md` и обязательную state matrix перед действиями.

## Прочитать перед изменением

1. `docs/frontend/css-strategy.md`
2. `docs/frontend/pr-budget.md`
3. `docs/frontend/autonomous-continuation-plan.md`, Track C
4. `frontend/src/styles.css`
5. `frontend/src/components/wizard/cable-algorithm-panel.css`
6. `frontend/src/components/wizard/CableAlgorithmPanel.tsx`
7. wizard isolation architecture tests

## Текущий ориентировочный baseline

Пересчитай самостоятельно перед работой, потому что рабочее дерево меняется:

```text
all CSS:             ~9932 LOC
styles.css:          6777 LOC
all !important:      498
unique HEX colors:   223
max-width variants:  12
```

## Разрешённая зона записи

Production:

- `frontend/src/styles.css`

Tests только при необходимости:

- существующий wizard/CableAlgorithm characterization test;
- CSS architecture test, если добавляешь проверку против возврата дублей.

Evidence:

- screenshots/snapshots в стандартной Playwright output directory.

Не редактируй:

- Heat/Electrical TS/TSX;
- `HeatCalcPage.tsx`;
- `ElecCalcWorkspace.tsx`;
- `cable-algorithm-panel.css`, кроме случая доказанной ошибки канонического owner;
- `compact-fields.css`;
- `heat-object-fields.css`;
- `insulation-layers-table.css` и `InsulationLayersTable`;
- формулы, API, units, state или JSX;
- dirty unrelated files другого агента.

Не обновляй одновременно dirty
`docs/frontend/autonomous-continuation-plan.md`; отдай метрики в отчёте
интегратору.

## Работа с dirty tree

1. Начни с `git status --short`.
2. Unrelated dirty Electrical/Heat/docs файлы не трогай и не добавляй в commit.
3. Если `frontend/src/styles.css` или
   `frontend/src/components/wizard/cable-algorithm-panel.css` уже меняет другой
   агент — STOP и сообщи точный overlap.
4. Не выполняй reset/restore/checkout чужих изменений.
5. Не commit/push, если пользователь отдельно не попросил.

## Что считается доказанным дублем

Удаляй legacy-правило или selector только если проверены все пункты:

1. Selector относится к `.object-wizard-cable-panel` /
   `CableAlgorithmPanel`.
2. Канонический island содержит эквивалентный selector под
   `.object-wizard-cable-panel`.
3. Декларации эквивалентны либо island полностью покрывает legacy-поведение.
4. Совпадает CSS context: обычный rule / media / print.
5. Удаление не затрагивает Heat/Insulation selectors из объединённой группы.
6. Browser computed styles до/после не изменились для ключевых cable controls.

Если rule объединяет Cable + Heat selectors:

- не удаляй весь rule;
- удали только доказанную Cable-часть selector list;
- оставь Heat selectors и их declarations без изменения.

Если declarations различаются или ownership неясен — оставь правило и внеси его
в residual report. Не расширяй scope.

## Порядок выполнения

### 1. Baseline

- пересчитай LOC, `!important`, colors и breakpoints;
- собери список Cable selectors в `styles.css`;
- сопоставь их с island;
- зафиксируй exact/full/partial/residual classification;
- сними browser evidence до изменения.

### 2. Изменение

- применяй минимальный patch только к `styles.css`;
- удаляй standalone дубли;
- в mixed selector lists удаляй только Cable selectors;
- не добавляй компенсирующие overrides;
- не увеличивай specificity;
- не добавляй `!important`, colors или breakpoints;
- не форматируй несвязанные блоки.

### 3. Static proof

Минимум:

```bash
cd frontend
npm run test:architecture
npm run test:s0-gates
npm test -- --run \
  src/__tests__/integration/components/ObjectWizardDependencies.test.tsx \
  src/__tests__/unit/pages/HeatCalcPage.basics.test.tsx \
  src/__tests__/integration/pages/UIKitPage.test.tsx
```

Запусти plugin static UI checks. Если общий lint падает на существующих
несвязанных ошибках, зафиксируй baseline и докажи отсутствие новых ошибок в
затронутых файлах. Не исправляй чужие lint-проблемы «заодно».

### 4. Browser proof

Используй `kontur_playwright`, не заменяй его только screenshots или DOM-анализом.

Проверь минимум:

- `/workspace/heat-calc`, `1440x1000`, верхнее размещение формы;
- `/workspace/heat-calc`, `1440x1000`, доступное side placement;
- `/workspace/heat-calc`, `390x844` — существующий overflow не должен ухудшиться;
- `/ui-kit`, `1440x1000`, реальный `CableAlgorithmPanel`;
- `/ui-kit`, `390x844`.

Для каждого релевантного состояния:

- snapshot + screenshot;
- cable panel/control bounding boxes;
- controls находятся внутри panel;
- key siblings не пересекаются;
- page/container overflow не ухудшился;
- computed height/font/width ключевых cable controls совпадает с baseline;
- console warning/error audit;
- failed network audit.

Если populated Heat state недоступен детерминированно, явно перечисли его как
непроверенный. Не объявляй полную visual parity по одному empty state.

## Метрики DoD

Обязательно:

- `styles.css` LOC уменьшился;
- общий CSS LOC уменьшился;
- exact Cable overlap с `styles.css` стал 0 для затронутых правил;
- `!important` не вырос;
- unique colors не выросли;
- breakpoint variants не выросли;
- island isolation tests зелёные;
- browser computed styles не изменились;
- новых console/network/layout проблем нет.

Желательно:

- количество `!important` уменьшилось вместе с удалёнными дублями;
- добавить architecture regression test, если он помещается в budget и не
  дублирует существующий wizard isolation gate.

## Hard stops

Остановись и сообщи интегратору, если:

- target CSS уже dirty другим агентом;
- для безопасного удаления требуется изменить TSX/бизнес-логику;
- island и legacy имеют конфликтующие declarations без ясного SoT;
- browser proof показывает изменение layout/computed styles;
- исправление не помещается в один CSS slice.

## Финальный отчёт

Верни:

1. Files changed.
2. Какие selectors/rules удалены.
3. Какие mixed rules разделены.
4. Residual selectors и причина, почему они оставлены.
5. Метрики before → after.
6. Команды и результаты tests/static checks.
7. Browser states, viewports, screenshots и geometry.
8. Console/network summary.
9. Untested states.
10. Recommended next CSS slice.

Не заявляй «CSS очищен полностью». Результат этого задания — один доказанный,
визуально эквивалентный strangler slice.
```

## Короткая команда назначения

```text
Прочитай и выполни `docs/frontend/agent-prompt-css-strangler.md`.
Ты отдельный A1 CSS agent. Выполни ровно один описанный slice, не трогай чужие
Heat/Electrical изменения, не делай commit без отдельной команды.
```
