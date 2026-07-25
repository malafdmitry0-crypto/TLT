# Ant UI Kit — agent rollout

**Статус:** RUNTIME **PASS** (A–D done + agent-dod green; E/F deferred); pending — only
[refactor-backlog.md](./refactor-backlog.md);
audit — [docs/audit/2026-07-25-ant-ui-kit-rollout/snapshot.md](../audit/2026-07-25-ant-ui-kit-rollout/snapshot.md)
**Стратегия:** [ant-ui-kit-strategy.md](./ant-ui-kit-strategy.md)
**Владелец программы:** ui

## 1. Порядок slices и статусы

| Slice | Содержание | Статус плана |
|---|---|---|
| A1 | strategy + rollout Markdown | **done** |
| A2 | AF10 доки → `HISTORICAL/CLOSED`; backlog остаётся единственной очередью | **done** |
| A3 | AF11 остаётся `PROPOSED`, без mobile acceptance и blanket `<450 LOC` | **done** |
| A4 | Fast Refresh warning → owner-local async helper; lint `0/0` | **done** |
| A5 | `TltBadge` → `forwardRef` + Tooltip/findDOMNode regression test | **done** |
| A6 | action bar `1200` → canonical `1400`: на 1280/1366 wrap, не scroll | **done** |
| B | явные density-токены small 22 / middle 26 / large 32 + parity-тесты | **done** |
| C1 | `TltTextField` → Ant `Input` | **done** |
| C2 | `TltNumberField` → Ant `InputNumber` | **done** |
| C3 | `TltSelect` → Ant `Select` | **done** |
| C4 | удалить `react-aria-components`, environment adapter и lockfile-записи | **done** |
| D1 | `TltButton` → Ant `Button` | **done** |
| D2 | `TltBadge` → Ant `Tag` | **done** |
| D3 | `TltAlert` → Ant `Alert` | **done** |
| D4 | `TltCard` → Ant `Card` | **done** |
| D5 | `TltEmptyState` → Ant `Empty` | **done** |
| D6 | `TltSkeleton` → Ant `Skeleton` | **done** |
| D7 | `TltTabs` → Ant `Tabs` | **done** |
| D8 | `TltTable` → Ant `Table` | **done** |
| E | stories, `a11y.test='error'`, `@storybook/addon-vitest`, `test-storybook` | deferred |
| F | полный desktop browser seal и docs closure | deferred |

Порядок фиксирован: A2→A6, затем B; C1→C2→C3→C4 строго последовательно;
D1→D8 по одному компоненту; E после runtime migration; F последним.

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

## 4. Stop conditions

- изменение feature UX/API, query keys, формул, единиц, маршрутов;
- необходимость нового CSS breakpoint вне канонического набора;
- рост architecture/CSS baseline;
- потеря accessible name или необъяснимое изменение geometry/bundle;
- невозможность доказать пиксельный паритет density (B) — STOP, решение
  пользователя;
- один и тот же дефект не устранён после трёх содержательных попыток.

Формат остановки: `FILE / EVIDENCE / INVARIANT AT RISK / DECISION NEEDED /
SAFE NEXT SLICE`.

## 5. Финальное состояние программы

- lint `0/0`; все существующие (1303+) и новые тесты зелёные;
- Storybook build + a11y зелёные; `react-aria-components` отсутствует;
- публичный API `@/components/ui-kit` сохранён;
- AF10 закрыт документально; AF11 — отдельное неактивное предложение;
- Ant/React major upgrade, массовый LOC-рефакторинг, новый Layout Kit и
  feature redesign не выполняются.
