# План переписывания фронта (strangler, LLM-friendly)

> Архив: исходная стратегия миграции, основные milestones завершены.

**Актуально на:** 2026-07-23  
**Подход:** не greenfield rewrite. Strangler: новый стиль — норма; старый уезжает кусками с proof.

## Definition of Done всей миграции

| Критерий | Цель |
|---|---|
| Page shell | ≤ 500 LOC, ≤ ~20 imports |
| Feature file | ≤ 250 LOC, ≤ ~12 imports |
| Pure model | 0 React/antd, unit-тест рядом |
| UI полей | только `@/components/ui-kit` |
| Cross-domain | heat ↛ elec ↛ spec |
| components ↛ pages | 0 |
| styles.css | freeze → &lt; 2–3k |
| Задача «1 поле» | ≤ 5 файлов |
| Proof | unit + focused e2e; parity kit↔heat в CI |

**Не DoD:** Tailwind, Next, отказ от Ant, monorepo packages.

## Целевая структура (логическая)

```text
frontend/src/
  app/                    # main, App, providers
  routes/
  shared/                 # api, store, types, constants, config
  ui/                     # = ui-kit (единственный design entry)
  domains/
    heat/
    electrical/
    specification/
    reporting/
    projects/
    admin/
  wizard/                 # dual-form islands
```

Фазы 1–2: можно жить в `pages/heatcalc`, `pages/electrical` **без mass rename**.  
`domains/*` — фаза 6, после thin shells.

## Стандарт кода с сегодня

### Три типа файлов

| Тип | Делает | Не делает |
|---|---|---|
| Model | pure transform | React, antd, fetch |
| Hook | 1 side-effect / 1 resource | JSX, чужие домены |
| View | props in / events out | store, api, query |

### Budget одного PR

```text
max 1 shell file
max 2 production extracts
max 2 test files
1 domain only
characterization first
styles.css: net LOC ≤ 0
```

## Фазы

### Фаза 0 — Завод (3–5 дней)

- PR template (domain, budget, proof)
- Architecture tests: heat↛elec, components↛pages
- Freeze styles.css
- UI kit = единственный public UI entry
- CI: ui-kit-heatcalc-parity

### Фаза 1 — UI layer (1–2 недели)

- form-controls → detail ui-kit
- tokens `--tlt-field-*`
- Strangler: Heat geometry → CompactFieldGrid
- e2e parity green
- удалить дубли CSS

### Фаза 2 — Thin Heat shell (2–3 недели)

- HeatCalcPage ≤ 500 LOC
- extract toolbar, drafts, grid wiring
- characterization per slice

### Фаза 3 — Thin Elec shell (3–5 недель)

- ElecCalcPage ≤ 500–600 LOC
- break inverted components→pages
- barrel models
- 1 business characterization per slice
- **не** shared hooks с Heat

### Фаза 4 — Spec + Report (2–3 недели)

- `pages/specification/` namespace
- params на ui-kit
- thin report page

### Фаза 5 — CSS strangler (параллельно)

- tokens.css, layout.css
- heat/electrical/spec chrome files
- styles.css ↓

### Фаза 6 — Физический domains/* (optional)

Только после thin shells + stable barrels. `git mv` без смены поведения.

## Критический путь

```text
Фаза 0 gates
  → 1 UI kit real Heat
  → 2 Heat shell
  → 3 Elec shell
  → 4 Spec/Report
  → 5 CSS continuous
  → 6 rename domains (optional)
```

**Не** стартовать с Elec rewrite или mass rename.

## Proof matrix

| Изменение | Proof |
|---|---|
| pure model | unit |
| kit migrate | UIKitLibrary + parity e2e + heat form e2e |
| shell extract | unit/integration + e2e |
| CSS move | parity + screen e2e |
| electrical slice | elec unit + focused e2e |

## Kill-list / do-not-touch

**Резать:** ElecCalcPage, HeatCalcPage, SpecPage, HeatCalcNormalGlideGrid, styles.css, inverted imports.

**Не трогать без решения:** formula goldens, ER UUID semantics, InsulationLayersTable, full Glide rewrite, layout kit.

## Метрики

| Метрика | Старт (порядок) | 6–8 нед | 4–6 мес |
|---|---|---|---|
| ElecCalcPage LOC | ~1936 | &lt;1200 | ≤500 |
| HeatCalcPage LOC | ~1046 | &lt;700 | ≤500 |
| SpecPage | ~1005 | namespace | ≤500 |
| styles.css | ~7200 | &lt;5000 | &lt;2500 |
| inverted imports | ~5 | 2 | 0 |
| kit form coverage | showcase | Heat geometry | Heat+panels |

## 30 дней

| Неделя | Фокус |
|---|---|
| 1 | Фаза 0: gates, freeze, parity CI |
| 2 | Фаза 1: Heat geometry → ui-kit |
| 3 | Фаза 2: 2 Heat shell slices |
| 4 | Фаза 3 start: barrel + invert + 1 elec extract |

## Вердикт

| Подход | |
|---|---|
| Rewrite с нуля | Нет |
| Strangler по этому плану | **Да** |
| Только ui-kit без shells | Недостаточно |
| Только extract без freeze CSS | Layout drift вернётся |

**Итог:** переписываем не React-app, а способ организации сложности — под людей и LLM.
