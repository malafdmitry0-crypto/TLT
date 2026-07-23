# UI Kit: что есть и нужен ли layout kit

**Актуально на:** 2026-07-23

> Тематический справочник. Обязательные workflow, budget, proof и hard stops:
> [agent-development-standard.md](./agent-development-standard.md).

## UI kit уже есть

### Путь

```text
frontend/src/components/ui-kit/
  CompactField.tsx
  CompactFieldGrid.tsx
  CompactUi.tsx
  UiPrimitives.tsx
  compact-fields.css
  primitives.css
  index.ts          # public API
  README.md
```

### Public API (import only from barrel)

```ts
import {
  CompactField,
  CompactFieldGrid,
  TltNumberField,
  TltSelect,
  TltTextField,
  TltButton,
  TltBadge,
  TltAlert,
  TltCard,
  TltEmptyState,
  TltSkeleton,
  TltTable,
  TltTabs,
} from '@/components/ui-kit';
```

- **Поля:** CompactField / Grid + Tlt* (Tlt* живут в `form-controls/`, re-export)
- **Примитивы:** Button, Badge, Alert, Card, Empty, Skeleton, Table, Tabs
- **Витрина:** `/ui-kit` → `pages/UIKitPage.tsx`
- **Тесты:** unit UIKitLibrary, integration UIKitPage, e2e `ui-kit-heatcalc-parity`

### Контракт плотности (SC-03 / Heat dual-form)

| Token / metric | Value |
|---|---|
| control height | 26px |
| label / control / select / unit | 8.5 / 12 / 9 / 9 px |
| label track | 98px |
| num / name / climate / tm | 4rem / 7.5rem / 8.75rem / 8rem |
| radius | 2px |
| column / row gap | 10px / 4px |
| reflow | max 5 fields per column |

Токены: `--tlt-field-*`.

### Чего ещё нет

- Полный design system на **все** экраны (Heat/Elec runtime частично на Ant Form + islands)
- Layout kit (и не обязателен как большая библиотека)
- Полный отказ от `form-controls/` path (implementation detail)

## Поможет ли kit рефакторингу?

**Да** для: форм, токенов, CSS drift, скорости UI, онбординга агентов.  
**Нет** (сам по себе) для: ElecCalc god-shell, ER/batch, Excel drafts, Spec flat structure.

Оценка: kit закрывает **~20–30%** фронтового долга (UI/CSS), не 70% (orchestration).

### Условия окупаемости

1. Один public API `@/components/ui-kit`
2. Реальный Heat form strangler, не только showcase
3. Parity e2e в CI
4. Freeze styles.css
5. Не тащить domain в kit

## Нужен ли kit лейаутов?

**Отдельный большой Layout Kit — нет.**

Нужен **тонкий** layer:

```text
AppShell (MainLayout)
layout tokens (--layout-*)
PageBody / ToolbarRow (если реально дублируется)
```

**Не** универсальный Page template на 10 variants.  
Heat dual-form / Elec assignment — **feature layouts**, не design-system layouts.

### ROI

| Идея | Делать? |
|---|---|
| Form/control kit | да (есть) |
| Layout tokens + AppShell cleanup | да |
| ToolbarRow / PageBody (2–3 шт) | по факту дубля |
| Полный Layout Kit | **нет** сейчас |

## Стратегия дальше

```text
Form kit (есть) → strangler на Heat → thin shells → optional thin layout chrome
```
