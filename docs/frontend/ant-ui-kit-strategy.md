# Ant UI Kit — стратегия

**Статус:** рабочий регламент внутренней основы UI-kit
**Актуально на:** 2026-07-25
**Владелец:** ui
**Pending / очередь:** только [refactor-backlog.md](./refactor-backlog.md);
исполняемая программа — [ant-ui-kit-agent-rollout.md](./ant-ui-kit-agent-rollout.md)

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

- **мигрируют** три форм-контрола на react-aria-components:
  `TltTextField`, `TltNumberField`, `TltSelect`;
- после них **удаляется зависимость** `react-aria-components` и
  `src/utils/reactAriaEnvironment.ts`;
- **восемь plain-HTML примитивов** (`TltButton`, `TltBadge`, `TltAlert`,
  `TltCard`, `TltEmptyState`, `TltSkeleton`, `TltTabs`, `TltTable`)
  остаются нативными до отдельного checkpoint-решения пользователя
  (см. rollout §4). Их миграция НЕ разрешена этим документом.

## 2. Mapping и обязательный паритет

| Публичный компонент | Ant-основа | Обязательное сохранение |
|---|---|---|
| `TltTextField` | `Input` | controlled/uncontrolled, aria, input classes, `data-testid` |
| `TltNumberField` | `InputNumber` | запятая→точка, `null` для пустого, min/max/step, Enter, wheel off, unit; paste и частичный ввод `1,` |
| `TltSelect` | `Select` | typed string/number values, disabled options, clear→`null`, popup classes |

Задокументированные изменения ARIA-ролей (фиксируются в характеризационных
тестах, не считаются регрессом):

- `TltNumberField`: `textbox` → `spinbutton`;
- `TltSelect`: react-aria listbox-паттерн → `combobox`.

Тесты не должны зависеть от внутреннего DOM react-aria или Ant; контракт —
роль, accessible name, значение и события публичного API.

## 3. Density-контракт

- `theme.defaultAlgorithm`; `compactAlgorithm` глобально не включается.
- Размеры контролов задаются явными токенами, а не арифметикой
  `APP_BUTTON_SCALE`: small `22 px`, middle `26 px`, large `32 px`
  (фиксируются только после замера фактических высот; расхождение >1px —
  STOP и решение пользователя).
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
