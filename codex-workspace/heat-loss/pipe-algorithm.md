# Реализованный алгоритм теплопотерь трубопровода

Источник этого файла: только backend-код реализации. Документ не сверяет
алгоритм с ТЗ, SRS или бизнес-документами.

## Кодовая Цепочка

Основной расчетный путь:

```text
CalculationService.calc_heat_loss()
-> CalculationService._calc_heat_loss_with_coefficients()
-> PipeHeatLossParams(...)
-> calc_pipe_heat_loss(...)
-> PipeHeatLossResult.model_dump()
```

Для сохраненного объекта используется расширенный путь:

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
- `backend/app/formulas/heat_loss/pipe.py`
- `backend/app/formulas/heat_loss/insulation.py`
- `backend/app/formulas/heat_loss/common.py`

## Предварительная Обработка

Для объектного пересчета `prepare_project_object_params()` добавляет defaults,
нормализует размещение, слои изоляции и локальные элементы.

Дефолты для трубы:

```text
wall_thickness = 0.004
pipe_material = carbon_steel
valve_count = 2
flange_count = 2
support_count = 2
local_element_equiv_length = 1.5
```

Если `num_local_elements` не задан, он становится суммой:

```text
num_local_elements = valve_count + flange_count + support_count
```

По дефолту это дает `6` локальных элементов, а эффективная длина позже
увеличивается на `6 * 1.5 = 9 м`.

## Климатическая Политика

Перед формулой service может изменить `ambient_temperature` и `safety_factor`.

Для трубы:

```text
if outer_diameter * 1000 >= 100:
    safety_factor = 1.1
    climate_temperature_basis = t_0_92
    climate_policy_rule = pipe_diameter_ge_100
else:
    safety_factor = 1.12
    climate_temperature_basis = t_abs_min
    climate_policy_rule = pipe_diameter_lt_100
```

Если `ambient_temperature_source == "manual"`, пользовательская температура
окружающей среды не заменяется климатической.

## Модель Расчета

Формула реализована как многослойная цилиндрическая стенка.

Входные базовые величины:

```text
delta_t = process_temperature - ambient_temperature
t_mean = (process_temperature + ambient_temperature) / 2
r_outer_pipe = outer_diameter / 2
```

Перед расчетом проверяется:

```text
outer_diameter > 0
pipe_length > 0
process_temperature > ambient_temperature
```

## Стенка Трубы

Если задана `wall_thickness`, считается сопротивление стенки.

```text
r_inner = r_outer_pipe - wall_thickness
lambda_pipe = pipe_lambda if pipe_lambda is not None
              else get_pipe_material_lambda(pipe_material, t_mean)

R_wall = ln(r_outer_pipe / r_inner) / (2 * pi * lambda_pipe)
```

Если `r_inner <= 0`, расчет падает с `ValueError`.

Если `wall_thickness` не задана, `R_wall = 0`. В объектном flow толщина стенки
по умолчанию добавляется как `0.004`.

## Изоляция

Изоляция приводится к списку слоев:

- если есть `insulation_layers`, используется он;
- иначе создается один слой из `insulation_thickness` и `insulation_material`.

Для каждого слоя:

```text
r_out = r_current + layer.thickness
lambda_layer = layer.conductivity              # только material == other
            or get_insulation_conductivity(layer.material, insulation_tm)

R_layer = ln(r_out / r_current) / (2 * pi * lambda_layer)
```

Сумма:

```text
R_insulation = sum(R_layer)
r_outer_total = радиус после последнего слоя
```

## Температура Для Lambda Изоляции

`insulation_tm` считается через `resolve_insulation_tm()`:

```text
outdoor_winter:
    insulation_tm = process_temperature / 2

indoor, outdoor_summer, channel, tunnel, technical_subfloor, attic, basement:
    insulation_tm = (process_temperature + 40) / 2
```

Если режим не задан в непосредственном вызове трубной формулы:

- при `location == indoor` используется `indoor`;
- иначе функция требует явный режим и бросает `ValueError`.

В объектном preprocessing для `placement == outdoor` дефолтно ставится
`outdoor_winter`; для `placement == indoor` нормализация также выставляет
`location = indoor`, поэтому формула получает внутреннее размещение через
`location`.

## Внешнее Сопротивление

Ветка выбирается не по `placement`, а по факту:

```text
is_buried = burial_depth is not None and burial_depth > 0
```

### Подземная Труба

```text
lambda_ground = ground_conductivity or coefficients["ground_conductivity"] or 1.5
x = burial_depth / r_outer_total

if x < 1:
    raise ValueError

R_external = acosh(x) / (2 * pi * lambda_ground)
```

В коде `acosh(x)` считается вручную:

```text
acosh(x) = log(x + sqrt(x*x - 1))
```

### Надземная Или Внутренняя Труба

Если `alpha_vnesh` задан, он используется напрямую. Иначе:

```text
if location == indoor:
    alpha = 9.0
else:
    alpha = 11.6 + 7 * sqrt(max(wind_speed or 0, 0))
    alpha = clamp(alpha, 11.6, 52.0)
```

Если `coefficients["wind_factor"] != 1.0`, то:

```text
alpha = min(alpha * wind_factor, 52.0)
```

Сопротивление:

```text
R_external = 1 / (2 * pi * r_outer_total * alpha)
```

## Итоговая Формула

```text
R_total = R_wall + R_insulation + R_external
heat_loss_per_meter = delta_t / R_total
```

После расчета `heat_loss_per_meter` код проверяет температурный диапазон
горячей стороны каждого слоя изоляции:

```text
current_temperature = process_temperature - heat_loss_per_meter * R_wall
next_temperature = current_temperature - heat_loss_per_meter * R_layer
```

Если горячая сторона слоя выходит за диапазон материала, расчет падает.

## Эффективная Длина

```text
n_i = num_local_elements or 0
l_ekv = local_element_equiv_length or 0
effective_length = pipe_length + n_i * l_ekv
```

## Полные Теплопотери

```text
safety_factor = params.safety_factor
             or coefficients["safety_factor"]
             or 1.1

location_factor = coefficients["location_" + location]
               or default

total_heat_loss = heat_loss_per_meter
                * effective_length
                * safety_factor
                * location_factor
```

Дефолтные `location_factor`:

```text
location_indoor = 0.9
location_outdoor = 1.0
```

## Округление Результата

```text
heat_loss_per_meter -> round(..., 3)
total_heat_loss     -> round(..., 3)
effective_length    -> round(..., 3)
thermal_resistance  -> round(..., 6)
wall_resistance     -> round(..., 6)
insulation_resistance -> round(..., 6)
external_resistance -> round(..., 6)
alpha_vnesh         -> round(..., 3) or null
ground_conductivity -> round(..., 3) or null
safety_factor       -> round(..., 3)
location_factor     -> round(..., 3)
local_element_equiv_length -> round(..., 3)
surface_temperature -> null
```

## Ошибки И Side Effects

Для объектного пересчета при успехе:

```text
obj.results = result
obj.is_valid = True
obj.validation_errors = None
```

При ошибке:

```text
obj.results = None
obj.is_valid = False
obj.validation_errors = {
  error_code,
  category,
  message,
  field,
  hint
}
```

Если теплопотери объекта изменились, существующие электрорасчеты могут быть
помечены как stale:

```text
stale = True
error_code = STALE_HEAT_LOSS
category = stale
```

## Что Важно Для Дальнейшего Анализа

- `heat_loss_per_meter` не содержит `safety_factor`.
- `total_heat_loss` содержит `safety_factor` и `location_factor`.
- Подземная ветка трубы включается через `burial_depth > 0`.
- `placement` влияет на preprocessing и допустимость `insulation_temperature_basis`,
  но не является прямым switch внутри `calc_pipe_heat_loss()`.
- В объектном flow дефолты локальных элементов могут существенно увеличить
  `effective_length`.
- `surface_temperature` сейчас всегда возвращается как `null`.
