# Теплопотери трубы: как читать поля и результат

Этот документ предназначен для инженера, который смотрит на параметры объекта и
результат расчета. Он описывает текущую реализацию backend, а не требования ТЗ.

## Минимальный Набор Для Расчета

Для трубы программа должна получить:

```text
outer_diameter
pipe_length
ambient_temperature
process_temperature
изоляцию
режим температуры изоляции
```

Для сохраненного объекта часть параметров может быть добавлена автоматически:

```text
wall_thickness = 0.004
pipe_material = carbon_steel
safety_factor = 1.1
valve_count = 2
flange_count = 2
support_count = 2
local_element_equiv_length = 1.5
```

## Основные Входные Группы

### Геометрия

| Поле | Простое объяснение |
|---|---|
| `outer_diameter` | Наружный диаметр трубы, м. Нужен для радиуса и сопротивлений. |
| `pipe_length` | Длина участка, м. Умножает потери на метр. |
| `wall_thickness` | Толщина стенки, м. Если есть, добавляет сопротивление стенки. |

### Материал Трубы

| Поле | Простое объяснение |
|---|---|
| `pipe_material` | Код справочного материала трубы. |
| `pipe_lambda` | Ручная теплопроводность трубы. Если задана, важнее материала. |

Если задана `wall_thickness`, но нет ни `pipe_material`, ни `pipe_lambda`,
расчет не проходит.

### Изоляция

Изоляция может быть задана двумя способами:

```text
insulation_thickness + insulation_material
```

или:

```text
insulation_layers[]
```

Для инженерного чтения `insulation_layers[]` удобнее: там каждый слой задан
отдельно.

| Поле слоя | Простое объяснение |
|---|---|
| `thickness` | Толщина слоя, м. |
| `material` | Код материала изоляции. |
| `conductivity` | Ручная lambda, нужна для `material = other`. |
| `temperature_range` | Диапазон применимости материала, нужен для `other`. |

### Температуры

| Поле | Простое объяснение |
|---|---|
| `process_temperature` | Температура продукта. |
| `ambient_temperature` | Температура окружающей среды. |
| `insulation_temperature_basis` | Режим, по которому выбирается расчетная температура для lambda изоляции. |

Расчет требует:

```text
process_temperature > ambient_temperature
```

### Размещение И Среда

| Поле | Простое объяснение |
|---|---|
| `location` | `indoor` или `outdoor`. Влияет на alpha и location factor. |
| `placement` | `indoor`, `outdoor`, `underground`. Используется при нормализации и проверках. |
| `burial_depth` | Если больше нуля, формула считает трубу подземной. |
| `ground_conductivity` | Lambda грунта для подземной трубы. |
| `ground_type` | Тип грунта. Требуется object validation, но в саму формулу не передается. |

Важная деталь:

```text
подземная ветка формулы = burial_depth > 0
```

`placement = underground` само по себе не является switch внутри чистой формулы.

### Наружная Теплоотдача

| Поле | Простое объяснение |
|---|---|
| `wind_speed` | Скорость ветра, м/с. Используется для расчета alpha. |
| `alpha_vnesh` | Ручной alpha. Если задан, wind_speed уже не нужен для alpha. |
| `wind_factor` | Коэффициент из admin table, умножает alpha для трубы. |

Для помещения:

```text
alpha = 9.0
```

Для улицы:

```text
alpha = 11.6 + 7 * sqrt(wind_speed)
```

### Коэффициенты

| Поле | Простое объяснение |
|---|---|
| `safety_factor` | Коэффициент запаса. Умножает итоговый `total_heat_loss`. |
| `location_factor` | Берется из coefficients по `location`. |

По умолчанию:

```text
safety_factor = 1.1
location_indoor = 0.9
location_outdoor = 1.0
```

## Как Читать Результат

Пример результата содержит поля:

```text
heat_loss_per_meter
total_heat_loss
effective_length
thermal_resistance
wall_resistance
insulation_resistance
external_resistance
alpha_vnesh
wind_speed
ground_conductivity
safety_factor
location_factor
local_elements_count
local_element_equiv_length
surface_temperature
```

### Главные Поля

| Поле | Как читать |
|---|---|
| `heat_loss_per_meter` | Базовые потери на метр трубы, Вт/м. Без коэффициента запаса. |
| `total_heat_loss` | Итоговые потери участка, Вт. Уже с длиной, локальными элементами, `safety_factor`, `location_factor`. |
| `effective_length` | Длина, которую реально использовали в итоговом умножении. |
| `thermal_resistance` | Сумма всех сопротивлений. Чем больше, тем меньше `heat_loss_per_meter`. |

### Диагностические Поля

| Поле | Как читать |
|---|---|
| `wall_resistance` | Вклад стенки трубы. |
| `insulation_resistance` | Вклад изоляции. Обычно ключевой вклад. |
| `external_resistance` | Вклад воздуха или грунта. |
| `alpha_vnesh` | Если `null`, значит была подземная ветка. |
| `ground_conductivity` | Если не `null`, значит расчет шел через грунт. |
| `surface_temperature` | Сейчас не считается, всегда `null`. |

## Быстрые Проверки Результата

### Проверка 1: Почему `total_heat_loss` больше, чем `q * L`

Потому что программа считает:

```text
total = q * effective_length * safety_factor * location_factor
```

А `effective_length` может быть больше `pipe_length` из-за локальных элементов.

### Проверка 2: Почему у подземной трубы нет `alpha_vnesh`

Потому что подземная труба использует сопротивление грунта, а не теплоотдачу в
воздух:

```text
external_resistance = R_ground
alpha_vnesh = null
```

### Проверка 3: Почему температура изоляции важна

Для справочных материалов lambda изоляции берется не как постоянное число, а по
расчетной температуре `insulation_tm`. Поэтому один и тот же материал при
разных режимах `insulation_temperature_basis` может дать разные потери.

### Проверка 4: Почему объект и preview могут отличаться

Сохраненный объект проходит через defaults и climate policy. Preview-расчет
идет напрямую через schema/service и может не иметь таких же defaults, если они
не переданы.

## Инженерный Чек-Лист Перед Разбором Числа

1. Проверить, какие `process_temperature` и `ambient_temperature` фактически
   попали в результат после climate policy.
2. Проверить, есть ли `burial_depth > 0`.
3. Проверить, сколько слоев изоляции реально в `insulation_layers`.
4. Проверить `effective_length`, а не только исходный `pipe_length`.
5. Проверить `safety_factor` и `location_factor`.
6. Проверить, ручной ли `alpha_vnesh` или он рассчитан от ветра.
7. Проверить, что `heat_loss_per_meter` не содержит `safety_factor`.

