# Реализованный алгоритм теплопотерь резервуара

Источник этого файла: backend-код реализации. Документ описывает, как
приложение считает сейчас; соответствие первоисточникам разобрано отдельно в
`tank-source-traceability.md`.

## Кодовая Цепочка

Основной расчетный путь:

```text
CalculationService.calc_heat_loss()
-> CalculationService._calc_heat_loss_with_coefficients()
-> TankHeatLossParams(...)
-> calc_tank_heat_loss(...)
-> TankHeatLossResult.model_dump()
```

Для сохраненного объекта:

```text
CalculationService.try_recalculate()
-> prepare_project_object_params()
-> _apply_climate_policy()
-> _calc_heat_loss_with_coefficients(apply_climate_policy=False)
-> obj.results / obj.validation_errors
```

Ключевые файлы:

- `backend/app/services/calculation_service.py`
- `backend/app/services/project_object_params.py`
- `backend/app/schemas/calculation.py`
- `backend/app/formulas/heat_loss/tank.py`
- `backend/app/formulas/heat_loss/insulation.py`
- `backend/app/formulas/heat_loss/common.py`

## Предварительная Обработка

Для объектного пересчета `prepare_project_object_params()` добавляет общие
defaults, нормализует размещение, режим температуры изоляции и слои изоляции.

Дефолты резервуара:

```text
shape = cylindrical
q_additional = 0
safety_factor = 1.1
```

Если `placement` не задан:

```text
if burial_depth is not None:
    placement = underground
elif location == indoor:
    placement = indoor
else:
    placement = outdoor
```

Если `location` не задан, он выводится из `placement`:

```text
placement == indoor -> location = indoor
placement == outdoor или underground -> location = outdoor
```

Важно: сама формула включает подземную ветку не по `placement`, а по
`burial_depth > 0`.

## Климатическая Политика

Перед формулой service может заменить температуру окружающей среды и заполнить
`safety_factor`.

Для резервуара:

```text
safety_factor = 1.1
climate_temperature_basis = t_0_92
climate_policy_rule = non_pipe_cold_fiveday_0_92
```

Если `ambient_temperature_source == "manual"`, пользовательская температура
окружающей среды не заменяется климатической.

## Модель Расчета

Резервуар считается как плоская стенка:

```text
delta_t = process_temperature - ambient_temperature
R_common = R_wall + R_insulation
```

Сопротивления имеют размерность `м2*К/Вт`, тепловой поток считается в
`Вт/м2`, затем умножается на площадь резервуара.

Перед расчетом проверяется:

```text
insulation_thickness > 0
process_temperature > ambient_temperature
ambient_temperature in -70..70
process_temperature in -90..600
```

## Геометрия

Поддерживаются три формы.

Цилиндр:

```text
S = pi * d * H + 2 * pi * (d / 2)^2
```

Параллелепипед:

```text
S = 2 * (L * W + L * H + W * H)
```

Сфера:

```text
S = 4 * pi * (d / 2)^2
```

Для подземной ветки поддержаны только цилиндр и параллелепипед.

Цилиндр:

```text
S_air    = pi * d^2 / 4 + pi * d * (H - h)
S_ground = pi * d^2 / 4 + pi * d * h
```

Параллелепипед:

```text
S_air    = 2 * (L + W) * (H - h) + L * W
S_ground = 2 * (L + W) * h + L * W
```

Если `h > H`, расчет падает с ошибкой. Для сферического подземного резервуара
расчет также падает: ТНП задает подземный расчет только для круглого и
прямоугольного сечения.

## Стенка Резервуара

Стенка учитывается только если заданы оба поля:

```text
wall_thickness
wall_lambda
```

Тогда:

```text
R_wall = wall_thickness / wall_lambda
```

Если одно поле есть, а второго нет, объектный validator считает объект
незаполненным. При прямом вызове формулы неполная пара фактически не добавляет
сопротивление стенки.

## Изоляция

Изоляция приводится к списку слоев:

- если есть `insulation_layers`, используется он;
- иначе создается один слой из `insulation_thickness` и
  `insulation_material`.

Для каждого слоя:

```text
lambda_layer = layer.conductivity              # только material == other
            or get_insulation_conductivity(layer.material, insulation_tm)

R_layer = layer.thickness / lambda_layer
R_insulation = sum(R_layer)
```

Максимальное количество слоев: `3`.

Для справочных материалов проверяется температурный диапазон материала. Для
`material == other` обязательны ручные `conductivity` и `temperature_range`
слоя.

## Температура Для Lambda Изоляции

`insulation_tm` считается через `resolve_insulation_tm()`:

```text
outdoor_winter:
    insulation_tm = process_temperature / 2

indoor, outdoor_summer, channel, tunnel, technical_subfloor, attic, basement:
    insulation_tm = (process_temperature + 40) / 2
```

В объектном preprocessing:

- для `placement == indoor` ставится `indoor`;
- для `placement == outdoor` ставится `outdoor_winter`;
- для `placement == underground` объектная валидация требует явный режим из
  допустимых подземных/технических режимов.

## Наружное Сопротивление

Если `alpha_vnesh` задан, он используется напрямую.

Иначе:

```text
if location == indoor:
    alpha = 9.0
else:
    alpha = 11.6 + 7 * sqrt(max(wind_speed or 0, 0))
    alpha = clamp(alpha, 11.6, 52.0)
```

Для резервуара внешнее сопротивление плоской стенки:

```text
R_external = 1 / alpha
```

В отличие от трубы, резервуарная формула сейчас не применяет
`coefficients["wind_factor"]` к `alpha`.

## Надземный Расчет

Если `burial_depth` отсутствует или равен `0`:

```text
R_total = R_wall + R_insulation + R_external
q = delta_t / R_total
S = surface_area(shape)
Q = q * S * safety_factor * location_factor + q_additional
```

`q` возвращается как `heat_loss_per_m2` без `safety_factor` и без
`location_factor`.

## Подземный Расчет

Если `burial_depth > 0`:

```text
lambda_ground = ground_conductivity or coefficients["ground_conductivity"] or 1.5
R_ground = burial_depth / lambda_ground

q_air = delta_t / (R_wall + R_insulation + R_external)
q_ground = delta_t / (R_wall + R_insulation + R_ground)

Q = (q_air * S_air + q_ground * S_ground)
    * safety_factor
    * location_factor
    + q_additional

heat_loss_per_m2 = (q_air * S_air + q_ground * S_ground)
                   / (S_air + S_ground)
```

Для подземной ветки результат дополнительно содержит:

```text
air_surface_area
ground_surface_area
heat_loss_air_per_m2
heat_loss_ground_per_m2
ground_resistance
ground_conductivity
```

## Коэффициенты

`safety_factor`:

```text
params.safety_factor
or coefficients["safety_factor"]
or 1.1
```

`location_factor`:

```text
coefficients["location_indoor"]  # если location == indoor
coefficients["location_outdoor"] # если location == outdoor
or 1.0
```

По текущим default coefficients это обычно:

```text
indoor  -> 0.9
outdoor -> 1.0
```

`location_factor` умножает только итоговое `Q`, но не меняет
`heat_loss_per_m2`.

## Дополнительные Теплопотери

`q_additional` прибавляется в конце:

```text
Q = базовое_Q_с_K_и_location_factor + q_additional
```

То есть на `q_additional` не распространяются ни `safety_factor`, ни
`location_factor`.

## Округление Результатов

Результат округляется перед возвратом:

```text
heat_loss_per_m2, total_heat_loss, surface_area, q_additional -> 3 знака
wall_resistance, insulation_resistance, external_resistance,
ground_resistance -> 6 знаков
alpha_vnesh, ground_conductivity, safety_factor,
location_factor, split areas, split q -> 3 знака
```

## Связь С Электроподбором

`total_heat_loss` резервуара уже содержит `safety_factor`. Перед передачей в
электрический расчет service использует:

```text
Q_for_electrical = total_heat_loss / safety_factor
required_power_per_meter = Q_for_electrical / tank_base_cable_length
```

Это сделано, чтобы электрическая формула не применила коэффициент запаса второй
раз.

