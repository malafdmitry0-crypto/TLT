# Резервуар: памятка по входам и выходам расчета

Этот документ нужен инженеру, который вводит резервуар и проверяет результат.
Он описывает текущую реализацию TLT.

## Минимальный Ввод

Для любого резервуара нужны:

```text
shape
geometry for shape
insulation_thickness
insulation_material
ambient_temperature
process_temperature
insulation_temperature_basis
location
```

`process_temperature` должна быть выше `ambient_temperature`.

## Геометрия По Форме

Цилиндр:

```text
shape = cylindrical
diameter
height
```

Параллелепипед:

```text
shape = rectangular
length
width
height
```

Сфера:

```text
shape = spherical
diameter
```

Подземный расчет работает только для цилиндра и параллелепипеда.

## Изоляция

Однослойный режим:

```text
insulation_thickness
insulation_material
```

Многослойный режим:

```text
insulation_layers = [
  { thickness, material },
  ...
]
```

Максимум `3` слоя.

Если материал слоя `other`, нужно задать:

```text
conductivity
temperature_range
```

Иначе система не сможет ни посчитать `lambda`, ни проверить допустимость
температуры слоя.

## Режим Температуры Изоляции

Для справочных материалов надо указать `insulation_temperature_basis`.

Типовые значения:

| Условие | Значение |
|---|---|
| Помещение | `indoor` |
| Улица зимой | `outdoor_winter` |
| Улица летом | `outdoor_summer` |
| Канал | `channel` |
| Тоннель | `tunnel` |
| Техническое подполье | `technical_subfloor` |
| Чердак | `attic` |
| Подвал | `basement` |

Если объект создается через UI/object flow, для помещения и улицы это поле
часто подставляется автоматически. Для подземного размещения его лучше задавать
явно.

## Стенка

Если нужно учитывать сопротивление стенки, задавать надо пару:

```text
wall_thickness
wall_lambda
```

Нельзя задавать только одно из двух в сохраненном объекте: validator отметит
объект как незаполненный.

## Наружные Условия

Для улицы можно задать скорость ветра:

```text
wind_speed
```

Тогда:

```text
alpha = 11.6 + 7*sqrt(wind_speed)
```

Если есть инженерное значение коэффициента теплоотдачи, можно задать:

```text
alpha_vnesh
```

Оно имеет приоритет над скоростью ветра.

Для помещения система использует:

```text
alpha = 9.0
```

## Подземная Часть

Для подземного или частично заглубленного резервуара нужны:

```text
burial_depth
ground_conductivity
```

В object flow также требуется `ground_type`, но физическая формула использует
только `ground_conductivity`.

Важно: `burial_depth` для резервуара - это высота подземной части `h`. Она не
должна превышать общую `height`.

## Запас И Дополнительные Потери

`safety_factor`:

```text
1.05..1.7
```

Если не задан, обычно используется `1.1`.

`q_additional`:

```text
дополнительные теплопотери, Вт
```

Это ручная добавка для потерь, которые модель не считает отдельно: днище,
крышки, люки, патрубки, арматура, монтажные особенности. Добавка прибавляется
к итоговому `Q` без умножения на запас.

## Что Смотреть В Выходе

Для быстрой проверки:

```text
heat_loss_per_m2  -> насколько интенсивно теряется тепло с 1 м2
surface_area      -> какая площадь умножалась на q
total_heat_loss   -> итоговая мощность теплопотерь, Вт
```

Для проверки физики:

```text
wall_resistance
insulation_resistance
external_resistance
alpha_vnesh
```

Для проверки коэффициентов:

```text
safety_factor
location_factor
q_additional
```

Для подземного резервуара:

```text
air_surface_area
ground_surface_area
heat_loss_air_per_m2
heat_loss_ground_per_m2
ground_resistance
ground_conductivity
```

## Быстрые Инженерные Проверки

Если увеличить толщину изоляции, `heat_loss_per_m2` должен уменьшиться.

Если увеличить `process_temperature` при той же среде, `heat_loss_per_m2` должен
увеличиться.

Если увеличить площадь резервуара при той же конструкции стенки,
`heat_loss_per_m2` почти не изменится, но `total_heat_loss` увеличится.

Если добавить `q_additional = 500`, `total_heat_loss` должен вырасти ровно на
`500 Вт`, а `heat_loss_per_m2` не должен измениться.

Если задать `alpha_vnesh`, изменение `wind_speed` уже не должно менять
наружную теплоотдачу.

## Частые Ошибки

- Перепутали `burial_depth` трубы и резервуара: для резервуара это высота
  подземной части.
- Для сферы пытаются включить подземный расчет.
- Задали `wall_thickness`, но не задали `wall_lambda`.
- Выбрали generic-семейство изоляции вместо конкретного справочного материала.
- Не задали `temperature_range` для материала `other`.
- Смотрят на `heat_loss_per_m2` как на итоговую мощность. Итоговая мощность -
  это `total_heat_loss`.

