# LLM-понятный стиль фронта

**Актуально на:** 2026-07-23

> Тематический справочник. Обязательные workflow, budget, proof и hard stops:
> [agent-development-standard.md](./agent-development-standard.md).

## Проблема

Фронт — это **граф зависимостей + неявный runtime** (CSS cascade, hooks order, Ant context, router, query cache).  
LLM плохо держит большой неявный граф. Значит, код и структуру надо писать так, чтобы граф был **мелким и явным**.

```text
Маленький явный контекст > «элегантный» общий слой
1 файл ≈ 1 история, которую можно понять за 1 экран
```

## Почему «много зависимостей» убивает качество

| Что видит LLM | Что происходит |
|---|---|
| Page тянет 40 hooks + antd + query + router | теряет half of wiring |
| CSS из 3 мест на один input | «починит» не тот слой |
| `utils` с 30 heat* файлами | тащит нерелевантное |
| shared hook «на всё» | ломает соседний экран |

**Цель:** задача «поменять поле диаметра» открывает **3–7 файлов**, не 25.

## Правила

### A. Колокация по use-case

**Плохо:** `hooks/` + `utils/` + `components/` + `pages/` без owner.  
**Хорошо:**

```text
pages/heatcalc/
  HeatCalcPage.tsx
  useHeatCalcObjects.ts
  heatCalcGeometryFields.tsx
  heatCalcGeometryModel.ts
```

Один вопрос продукта → **одна папка**.

### B. Лимиты на файл

| Тип | Max imports (ориентир) | Max LOC |
|---|---|---|
| pure model | 0–3 | 200 |
| presentational | 5–8 | 150 |
| feature hook | 8–12 | 250 |
| page shell | 15–20 | 400–600 |

Признак плохого файла: **30+ строк import**.

### C. Односторонние слои

```text
page shell
  → feature hooks
    → pure models (no React)
    → ui-kit only (no domain)
    → api/* (HTTP only)
```

Запреты:

- `ui-kit` ↛ pages/domain  
- `components` ↛ pages  
- heat ↛ electrical  
- pure model ↛ react/antd  

### D. Pure first

```ts
// heatCalcGeometryModel.ts — без React
export function toApiDiameterMm(mm: number): number {
  return mm / 1000;
}
```

UI только рисует. Логика + unit-тест рядом.

### E. Props-in, events-out

```tsx
type Props = {
  value: GeometryForm;
  errors: FieldErrors;
  onChange: (patch: Partial<GeometryForm>) => void;
  onSubmit: () => void;
};
```

View не ходит в store/query/api сам.

### F. Имена use-case first

| Плохо | Хорошо |
|---|---|
| `useTable` | `useHeatCalcObjectsTable` |
| `process` | `buildElectricalQueryRequest` |
| `Helper` | `pipeFormToApiParams` |

### G. Side effects — один hook = одна ответственность

```ts
/**
 * Owns: excel draft map by objectId
 * Writes: local state only
 * Does NOT: call electrical API
 */
```

### H. CSS

- 1 feature root class (`.heat-object-fields`)
- стили рядом с компонентом
- плотность только через `--tlt-field-*`
- поля только через ui-kit

### I. Public barrel

```ts
// pages/heatcalc/public.ts — что можно снаружи
```

Deep imports внутренних hooks снаружи запрещены.

### J. Тесты как спека

| Слой | Тест |
|---|---|
| pure | unit |
| field layout | parity e2e kit↔heat |
| page wiring | RTL integration |

**Нет extract без characterization.**

## Header в feature-файле

```ts
/**
 * @module heatcalc/geometry-fields
 * @owner heat
 * @depends ui-kit, objectWizardUtils
 * @does-not electrical, specification
 * @inputs form values (mm)
 * @outputs patch to parent form (still mm); API convert elsewhere
 * @tests unit/..., e2e ui-kit-heatcalc-parity
 */
```

## Анти-паттерны

- God page 1–2k LOC  
- Barrel `utils/index` re-export всего  
- Shared hook Heat+Elec  
- 5 React contexts без явного flow  
- CSS без root scope  
- HOC/render props 4 уровня  

## Метрики

| Метрика | Цель |
|---|---|
| imports на production file | &lt; 15 (soft) |
| LOC page shell | &lt; 500 |
| файлов, чтобы сменить 1 поле | ≤ 5 |
| deep imports across domains | 0 |

## Итог

LLM-понятный фронт = **меньше неявных зависимостей**: колокация, pure models, dumb UI + ui-kit, односторонние границы, короткие shell, локальные headers, тесты как спека.
