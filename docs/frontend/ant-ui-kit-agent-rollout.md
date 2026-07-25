# Ant UI Kit — agent rollout

**Статус:** APPROVED программа (план утверждён пользователем 2026-07-25);
маршрутизация pending — только [refactor-backlog.md](./refactor-backlog.md)
**Стратегия:** [ant-ui-kit-strategy.md](./ant-ui-kit-strategy.md)
**Владелец программы:** ui

## 1. Порядок slices и статусы

| Slice | Содержание | Статус |
|---|---|---|
| A1 | strategy + rollout доки | done 2026-07-25 |
| A2 | AF10 доки → HISTORICAL/CLOSED | done 2026-07-25 |
| A3 | AF11: PROPOSED, без mobile acceptance и blanket `<450 LOC` | done 2026-07-25 |
| A4 | Fast Refresh warning → owner-local `electricalVariantAsyncHelpers.ts`; lint 0/0 | done 2026-07-25 |
| A5 | `TltBadge` → `forwardRef` + Tooltip/findDOMNode regression test | done 2026-07-25 |
| A6 | action bar `max-width: 1200` → `1400`: на 1280/1366 wrap, не scroll | done 2026-07-25 (browser proof — в финальном seal) |
| B | density: замер фактических высот → явные small 22 / middle 26 / large 32 + parity-тесты | pending |
| C1 | `TltTextField` → Ant `Input` | pending |
| C2 | `TltNumberField` → Ant `InputNumber` (самый рискованный) | pending |
| C3 | `TltSelect` → Ant `Select` | pending |
| C4 | удалить `react-aria-components` + `reactAriaEnvironment.ts` + lockfile | pending |
| CHK | checkpoint по 8 plain-HTML примитивам (см. §4) | pending, после C4 |
| D | stories форм-контролов, `a11y.test='error'`, `@storybook/addon-vitest` + `test-storybook` | pending |

Порядок фиксирован: B до C1 (иначе визуальный паритет C-slices недоказуем);
C1→C2→C3→C4 строго последовательно; D после C4.

## 2. Роли и параллелизм

- Один координатор: backlog, публичный контракт, merge order.
- Максимум два read-only scout: contract/tests/API inventory и browser
  geometry/console verification.
- На каждый runtime slice ровно один mutating writer. Параллельно нельзя
  менять: barrel `ui-kit/index.ts`, `appTheme.ts`, UI-kit CSS, architecture
  baselines, `package-lock.json`.
- После writer — независимый verifier на неизменном commit.

Handoff каждого slice: exact HEAD, один компонент, разрешённые файлы,
before-contract, focused tests, viewports, stop conditions.

## 3. Proof

Per slice:

1. characterization tests до production patch;
2. focused unit/integration tests;
3. `npm run test:agent-gates`;
4. для форм-контролов (high fanout) — полный `npm run test:agent-dod`;
5. `npm run build-storybook` (после подключения — `npm run test-storybook`).

Финальный browser proof (desktop-only, по
[browser-state-matrix.md](./browser-state-matrix.md)):

- `/ui-kit` и реальная HeatCalc-форма/action bar;
- `1000×768`, `1280×800`, `1366×768`, `1440×900` (+`1920×1080` для wide);
- compact и comfortable density; keyboard/focus, select popup, запятая в
  number input, disabled/error/loading, длинный русский текст;
- плотные формы дополнительно с `--blink-settings=minimumFontSize=12`;
- ноль console errors, нет page-level overflow, на `1280+` action bar без
  horizontal scroll; mobile viewports не входят в acceptance.

## 4. Checkpoint по примитивам (после C4)

Отдельный decision-документ: мигрировать ли `TltButton`, `TltBadge`,
`TltAlert`, `TltCard`, `TltEmptyState`, `TltSkeleton`, `TltTabs`, `TltTable`
на Ant. До явного решения пользователя они остаются нативными; их миграция
вне checkpoint — нарушение программы.

## 5. Stop conditions

- изменение feature UX/API, query keys, формул, единиц, маршрутов;
- необходимость нового CSS breakpoint вне канонического набора;
- рост architecture/CSS baseline;
- потеря accessible name или необъяснимое изменение geometry/bundle;
- невозможность доказать пиксельный паритет density (B) — STOP, решение
  пользователя;
- один и тот же дефект не устранён после трёх содержательных попыток.

Формат остановки: `FILE / EVIDENCE / INVARIANT AT RISK / DECISION NEEDED /
SAFE NEXT SLICE`.

## 6. Финальное состояние программы

- lint `0/0`; все существующие (1303+) и новые тесты зелёные;
- Storybook build + a11y зелёные; `react-aria-components` отсутствует;
- публичный API `@/components/ui-kit` сохранён;
- AF10 закрыт документально; AF11 — отдельное неактивное предложение;
- Ant/React major upgrade, массовый LOC-рефакторинг, новый Layout Kit и
  feature redesign не выполняются.
