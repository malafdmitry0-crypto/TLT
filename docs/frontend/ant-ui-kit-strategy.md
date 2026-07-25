# Ant UI Kit — стратегия

**Статус:** APPROVED; runtime A–D **DONE** (E Storybook a11y / F browser seal deferred)
**Актуально на:** 2026-07-25
**Владелец:** ui
**Pending / очередь:** только [refactor-backlog.md](./refactor-backlog.md);
исполняемая программа — [ant-ui-kit-agent-rollout.md](./ant-ui-kit-agent-rollout.md);
audit — [docs/audit/2026-07-25-ant-ui-kit-rollout/snapshot.md](../audit/2026-07-25-ant-ui-kit-rollout/snapshot.md)

Нормативы, которые этот документ не заменяет:
[стандарт разработки](./agent-development-standard.md),
[UI-kit контракт](./ui-kit.md), [CSS-стратегия](./css-strategy.md),
[viewport policy](./viewport-policy.md), [PR budget](./pr-budget.md).

## 1. Решение

Внутренней основой интерактивных примитивов UI-kit становится Ant Design 5,
уже используемый во всём app shell. Публичный фасад `@/components/ui-kit`
(`Tlt*`, `CompactField`, `CompactFieldGrid`) сохраняется byte-for-byte по
API; feature-код по-прежнему не импортирует `antd`-примитивы напрямую —
это закреплено architecture-ратчетами.

Утверждённый объём миграции (решение пользователя от 2026-07-25):

- все публичные `Tlt*`-компоненты, для которых в Ant есть эквивалент,
  постепенно переходят на Ant внутри фасада;
- три form controls (`TltTextField`, `TltNumberField`, `TltSelect`) мигрируют
  первыми, после чего удаляются `react-aria-components` и
  `src/utils/reactAriaEnvironment.ts`;
- `CompactField`, `CompactFieldGrid` и feature-композиции остаются
  собственными TLT-примитивами: Ant не заменяет product layout contract;
- миграция выполняется без redesign, mobile-вёрстки и массовой переделки
  feature-кода.

## 2. Mapping и обязательный паритет

| Публичный компонент | Ant-основа | Обязательное сохранение |
|---|---|---|
| `TltTextField` | `Input` | controlled/uncontrolled, aria, input classes, `data-testid` |
| `TltNumberField` | `InputNumber` | запятая→точка, `null` для пустого, min/max/step, Enter, wheel off, unit; paste и частичный ввод `1,` |
| `TltSelect` | `Select` | typed string/number values, disabled options, clear→`null`, popup classes |
| `TltButton` | `Button` | variants, loading, ref, disabled и размеры 26/32 px |
| `TltBadge` | `Tag` | tone, dot, DOM ref и совместимость с `Tooltip` |
| `TltAlert` | `Alert` | `status`/`alert` role, action и dismiss |
| `TltCard` | `Card` | semantic `article`/`section`, title, description, actions |
| `TltEmptyState` | `Empty` | title, description, action и custom icon |
| `TltSkeleton` | `Skeleton` | rows, text/panel modes и `aria-busy` |
| `TltTabs` | `Tabs` | публичный item shape, keyboard и controlled state |
| `TltTable` | `Table` | readonly columns/rows, selection, keyboard и empty state |

Задокументированные изменения ARIA-ролей (фиксируются в характеризационных
тестах, не считаются регрессом):

- `TltNumberField`: `textbox` → `spinbutton`;
- `TltSelect`: react-aria listbox-паттерн → `combobox`.

Тесты не должны зависеть от внутреннего DOM react-aria или Ant; контракт —
роль, accessible name, значение и события публичного API.

## 3. Density-контракт

- `theme.defaultAlgorithm`; `compactAlgorithm` глобально не включается.
- Размеры контролов задаются явными токенами, а не арифметикой
  `APP_BUTTON_SCALE`: small `22 px`, middle `26 px`, large `32 px`.
- TLT-контракты неизменны: form controls `26 px`, comfortable `32 px`,
  radius поля `2 px`.
- Parity-тесты доказывают, что Ant theme, CSS tokens, Storybook и `/ui-kit`
  используют одни значения.

## 4. Правила границы

- Feature-импорты — только через `@/components/ui-kit`; Ant-типы и DOM не
  протекают в публичные props.
- `CompactField`, `CompactFieldGrid` и feature-композиция остаются
  собственными TLT-примитивами.
- Затронутый миграцией компонент переезжает из `UiPrimitives.tsx` в
  собственный файл в своём же slice; массовый move запрещён.
- CSS удаляется только вместе с мигрированным компонентом.
- Один slice — один компонент; characterization tests до production patch.
- Storybook остаётся каноническим изолированным каталогом, `/ui-kit` —
  интеграционным эталоном.
- Desktop acceptance: `1000×768`, `1280×800`, `1366×768`, `1440×900`;
  `1920×1080` только для wide/max-width. Mobile не входит в scope.

## 5. Не входит в план

- Ant/React major upgrade;
- полный визуальный redesign;
- mobile/responsive slice ниже `1000 px`;
- массовая замена разрешённых прямых Ant-компонентов в feature-коде;
- новый Layout Kit или schema-driven form DSL;
- дробление файлов только ради LOC;
- оптимизация Storybook bundles без production performance-проблемы.
