# Манифест расположения элементов формы резервуара HeatCalc

**Статус:** целевой UI-контракт для согласования и последующей реализации.
**Область:** `HeatCalcObjectFieldsPanel` при `objectType=tank`.
**Платформа:** desktop-only, CSS viewport от `1000px`.

Интерактивный макет:
[`heatcalc-tank-fields-grid.mockup.html`](./heatcalc-tank-fields-grid.mockup.html).

Документ дополняет общий контракт верхней формы и фиксирует особенности
резервуара: условную геометрию по форме, частичное заглубление, стенку и
дополнительные теплопотери.

## Манифест

1. **Форма резервуара задаётся раньше размеров.** Пользователь сначала выбирает
   форму, затем видит только необходимые для неё размеры.
2. **Длинные controls идут первыми.** Первая колонка содержит text, select и
   reference picker: наименование, форму, размещение, грунт, климат и tm.
3. **Размеры собраны вместе.** Вторая колонка содержит только геометрию
   резервуара и параметры стенки.
4. **Тепловые условия собраны вместе.** Третья колонка содержит температуры,
   дополнительные теплопотери, ветер и параметры заглубления.
5. **Shape-hidden не означает пустую строку.** Неиспользуемые размеры полностью
   выходят из flow; остальные размеры поднимаются внутри второй колонки.
6. **Placement-hidden не переносит поля.** Грунтовые и ветровые поля исчезают
   только из третьей группы и не мигрируют в геометрию.
7. **Подземный резервуар не равен подземной трубе.** Для tank при
   `placement=underground` одновременно видимы ветер и грунтовые параметры:
   backend разделяет поверхность на надземную и подземную части.
8. **Пара стенки остаётся рядом.** Толщина и λ стенки идут последовательно,
   независимо от формы резервуара.
9. **Q доп. относится к тепловому балансу.** Дополнительные теплопотери
   находятся рядом с температурами, а не среди линейных размеров.
10. **Свободное место не раздвигает пару.** Между label и control всегда
    `8px`; numeric-группы остаются content-sized.
11. **Края образуют вертикали.** В каждой группе совпадают начала labels и оба
    края controls.
12. **Сетка одна.** Форма, ruler и overlay используют одинаковые фактические
    треки.
13. **Required не съедает optional.** Optional имеет серый border со всех
    сторон; required заменяет левый край акцентным `3px`.
14. **DOM следует чтению.** В production DOM-, visual- и keyboard-порядок
    внутри каждой группы совпадают.

## Рабочая область и треки

На широком workspace HeatCalc занимает `40%`, соседняя область алгоритма
выбора кабеля — `60%`.

```text
workspace
├─ tank heat: minmax(850px, 2fr)
│  ├─ wide group: 1fr
│  │  └─ label 112px | gap 8px | control 5fr
│  ├─ geometry numeric: max-content
│  │  └─ label 120px | gap 8px | control 128px
│  └─ thermal numeric: max-content
│     └─ label 120px | gap 8px | control 128px
└─ cable: minmax(300px, 3fr)
```

У резервуара wide label шире трубопроводного: `112px`, потому что
`Форма резервуара` и `Режим температуры изоляции (tm)` должны читаться без
обрезания при переносе до трёх строк.

| Параметр | Контракт |
|---|---:|
| HeatCalc / cable | `40% / 60%` |
| Семантических групп | `3` |
| Tank wide label | `112px` |
| Geometry numeric label | `120px` |
| Thermal numeric label | `120px` |
| Wide control | fluid `5fr` |
| Numeric control вместе с unit | `128px` |
| Label → control | `8px` |
| Между группами | `10px` |
| Высота control | `36px` |
| Вертикальный шаг | `4px` |
| Максимум строк label | `3` |

```css
.tank-fields {
  grid-template-columns: minmax(0, 1fr) max-content max-content;
  column-gap: 10px;
}

.tank-wide-field {
  grid-template-columns: 112px 8px minmax(0, 5fr);
}

.tank-numeric-field {
  grid-template-columns: var(--group-label-width) 8px 128px;
}
```

## Реестр всех пользовательских полей

| Группа | Порядок | Поле | Тип | Видимость |
|---|---:|---|---|---|
| Wide | 1 | Наименование | text | всегда |
| Wide | 2 | Форма резервуара | select | всегда |
| Wide | 3 | Размещение | select | всегда |
| Wide | 4 | Тип грунта | reference | `placement=underground` |
| Wide | 5 | Климат | reference | всегда |
| Wide | 6 | Режим температуры изоляции (tm) | select | всегда |
| Geometry numeric | 1 | Диаметр | number + `мм` | cylinder, sphere |
| Geometry numeric | 2 | Высота | number + `мм` | cylinder, rectangular |
| Geometry numeric | 3 | Длина | number + `мм` | rectangular |
| Geometry numeric | 4 | Ширина | number + `мм` | rectangular |
| Geometry numeric | 5 | Толщина стенки | number + `мм` | всегда |
| Geometry numeric | 6 | Теплопроводность стенки λ | number + `Вт/мК` | всегда |
| Thermal numeric | 1 | Температура окружающей среды | number + `°C` | всегда |
| Thermal numeric | 2 | Требуемая температура объекта | number + `°C` | всегда |
| Thermal numeric | 3 | Дополнительные теплопотери | number + `Вт` | всегда |
| Thermal numeric | 4 | Скорость ветра | number + `м/с` | outdoor, underground |
| Thermal numeric | 5 | Высота подземной части | number + `м` | underground |
| Thermal numeric | 6 | Теплопроводность грунта λ | number + `Вт/мК` | underground |

## Матрица формы резервуара

### Базовое состояние: cylinder + outdoor

Это React-default для нового резервуара.

| Строка | Wide | Geometry numeric | Thermal numeric |
|---:|---|---|---|
| 1 | Наименование | Диаметр | Температура окружающей среды |
| 2 | Форма резервуара | Высота | Требуемая температура объекта |
| 3 | Размещение | Толщина стенки | Дополнительные теплопотери |
| 4 | Климат | Теплопроводность стенки λ | Скорость ветра |
| 5 | Режим температуры изоляции (tm) | — | — |

### Rectangular + outdoor

| Строка | Wide | Geometry numeric | Thermal numeric |
|---:|---|---|---|
| 1 | Наименование | Высота | Температура окружающей среды |
| 2 | Форма резервуара | Длина | Требуемая температура объекта |
| 3 | Размещение | Ширина | Дополнительные теплопотери |
| 4 | Климат | Толщина стенки | Скорость ветра |
| 5 | Режим температуры изоляции (tm) | Теплопроводность стенки λ | — |

### Spherical + outdoor

| Строка | Wide | Geometry numeric | Thermal numeric |
|---:|---|---|---|
| 1 | Наименование | Диаметр | Температура окружающей среды |
| 2 | Форма резервуара | Толщина стенки | Требуемая температура объекта |
| 3 | Размещение | Теплопроводность стенки λ | Дополнительные теплопотери |
| 4 | Климат | — | Скорость ветра |
| 5 | Режим температуры изоляции (tm) | — | — |

### Underground

К wide-группе добавляется `Тип грунта`. В thermal-группе одновременно
присутствуют:

- скорость ветра;
- высота подземной части;
- теплопроводность грунта.

Это намеренная tank-логика, а не диагностический режим.

## Алгоритм размещения

1. Определить `shape` и `placement`.
2. Вычислить видимость полей:
   - cylinder → diameter + height;
   - rectangular → height + length + width;
   - sphere → diameter;
   - outdoor → wind;
   - indoor → без wind и ground;
   - underground → wind + burial + ground.
3. Не менять назначенную полю группу.
4. Отсортировать видимые поля по постоянному `order`.
5. Удалить hidden-поля из layout и accessibility tree.
6. Сжать строки независимо внутри каждой группы.
7. Не заполнять свободную строку полем из соседней группы.
8. Пересчитать ruler и overlay после shape, placement и resize.

## Numeric-контракт

Все numeric controls имеют внешнюю ширину `128px`. Value использует
horizontal padding `6px`; стандартный unit-трек — `42px`, `Вт/мК` — `56px`.

| Поле | Диапазон | Проверочное максимальное отображение | Unit |
|---|---:|---:|---:|
| Диаметр | `100…30000` | `30000` | `мм` |
| Высота | `100…50000` | `50000` | `мм` |
| Длина | `100…100000` | `100000` | `мм` |
| Ширина | `100…100000` | `100000` | `мм` |
| Толщина стенки | `1…500` | `500` | `мм` |
| λ стенки | `0,001…400` | `400,000` | `Вт/мК` |
| Температура среды | `−70…70` | `−70` | `°C` |
| Температура объекта | `−90…600` | `600` | `°C` |
| Q доп. | от `0` | граничное значение из runtime-config | `Вт` |
| Скорость ветра | `0…20,0` | `20,0` | `м/с` |
| Высота подземной части | `0…200,00` | `200,00` | `м` |
| λ грунта | `0,50…3,00` | `3,00` | `Вт/мК` |

Источник диапазонов:
`frontend/src/config/heatcalc-fields.default.json`.

Для `q_additional` в default-config отсутствует конечный `max`. UI-slice не
должен выдумывать ограничение: acceptance использует фактический runtime
field setting и отдельно проверяет отсутствие бесконечного визуального роста.

## Required и optional

| Поля | Chrome |
|---|---|
| Форма, размещение, shape-required размеры, температуры, tm | required |
| Наименование, толщина стенки, λ стенки, Q доп., климат | optional |
| Грунт и связанные numeric | required только в underground-state |

- Optional: серый `1px` border со всех сторон.
- Required: акцентный левый border `3px`.
- Внешняя ширина control при этом не меняется.
- Error state меняет chrome и высоту сообщения, но не треки.

## Всегда hidden, только round-trip

Эти поля не участвуют в layout:

- `climate_city`;
- `climate_region`;
- `climate_temperature_basis`;
- `ambient_temperature_source`;
- `wind_speed_source`;
- `safety_factor_source`;
- `max_ambient_temperature`;
- `max_process_temperature`;
- `zone_classification`.

## Диагностический atlas

Макет предоставляет:

- shape: `Все размеры`, `Цилиндр`, `Параллелепипед`, `Сфера`;
- placement: `Все поля`, `Наружное`, `Помещение`, `Подземное`;
- overlay: `Показать сетку`.

`Все размеры` и `Все поля` нужны только для проверки композиции. Production
никогда не показывает взаимоисключающие shape-размеры одновременно.

Ruler получает фактический `grid-template-columns`. Overlay рисует реальные
`label-left`, `label-right`, `control-left`, `control-right` каждой группы.

## Таблица слоёв

Таблица изоляции занимает всю ширину tank HeatCalc-контейнера и не участвует в
трёхколоночной сетке верхних полей. Её собственный grid:

```css
grid-template-columns:
  72px
  minmax(216px, 1fr)
  154px
  124px
  minmax(190px, 1fr);
```

Control толщины слоя имеет ширину `128px` внутри колонки `154px`. Shape- и
placement-переключения не меняют grid таблицы.

## Поддерживаемая ширина

- Desktop contract начинается с `1000px`.
- На широком workspace HeatCalc/cable стремится к `40% / 60%`.
- Content minimum tank HeatCalc — `850px` и имеет приоритет над точными `40%`.
- Mobile и отдельный reflow для `<1000px` не проектируются.

Источник:
[`viewport-policy.md`](./viewport-policy.md).

## Инварианты production-реализации

1. Shape и placement определяют только visibility, не координатную группу.
2. DOM order внутри группы равен visual и keyboard order.
3. Поля группы используют общие label/control tracks.
4. Layout не зависит от `.ant-*` internals.
5. Используется `CompactFieldGrid`; новый параллельный form-grid kit не
   создаётся.
6. Условное поле использует `preserve={false}`, если это соответствует текущему
   React-контракту.
7. Tank-логика ветра не подменяется pipe-логикой.

## Acceptance будущего UI-slice

Проверяются состояния:

- cylinder + outdoor;
- cylinder + underground;
- rectangular + outdoor;
- rectangular + underground;
- spherical + indoor;
- диагностический atlas;
- максимальные numeric values;
- длинные reference/select values;
- required, optional и validation error.

Проверяются viewport: `1000×768`, `1280×800`, `1366×768` и широкий desktop.

Geometry assertions:

- wide label = `112px`;
- geometry и thermal numeric labels = `120px`;
- label/control gap = `8px`;
- numeric control = `128px`;
- control height = `36px`;
- ruler tracks равны form tracks;
- двенадцать overlay-линий совпадают с DOM-краями;
- shape-hidden и placement-hidden не оставляют дыр;
- underground показывает wind + burial + ground одновременно;
- нет clipping, overlap, unit wrap и page-level horizontal overflow.

Browser proof включает console errors/warnings и failed network requests.
Незапущенная проверка не считается зелёной.

## Связанные нормативы

- [`heatcalc-object-fields-grid.md`](./heatcalc-object-fields-grid.md);
- [`ui-kit.md`](./ui-kit.md);
- [`css-strategy.md`](./css-strategy.md);
- [`viewport-policy.md`](./viewport-policy.md).
