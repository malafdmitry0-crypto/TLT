# Поля Реализованного Теплорасчета Трубопровода

Источник этого файла: backend-код. Поля разделены по тому, где они реально
используются: вход формулы, слой изоляции, object preprocessing, climate policy,
результат и ошибки.

## Поля Слоя Изоляции

Модель: `InsulationLayer`.

| Поле | Тип | Ограничения | Использование |
|---|---|---|---|
| `thickness` | `float` | `> 0`, `<= 0.5` | Толщина слоя, м. Участвует в цилиндрическом сопротивлении слоя. |
| `material` | `str` | `min_length=1` | Код материала из справочника. |
| `conductivity` | `float \| null` | `> 0`, `<= 400` | Ручная λ слоя, используется только при `material == "other"`. |
| `temperature_range` | `[float, float] \| null` | нижняя граница `<` верхней | Обязателен для `material == "other"`, используется для проверки горячей стороны слоя. |

Правило для `material == "other"`:

```text
conductivity обязателен
temperature_range обязателен
```

Для справочного материала температурный диапазон берется из справочника.

## Входные Поля Формулы Трубы

Модель: `PipeHeatLossParams`. `extra="forbid"`, то есть лишние поля в чистую
формулу не допускаются. В service перед формулой лишние поля отбрасываются через
`_heat_loss_formula_input()`.

### Геометрия И Материал Трубы

| Поле | Тип | Ограничения / default | Использование |
|---|---|---|---|
| `outer_diameter` | `float` | `0.0108..3.0` | Наружный диаметр, м. Обязателен. |
| `wall_thickness` | `float \| null` | `0.0001..0.04` | Толщина стенки, м. Если задана, добавляет `R_wall`. |
| `pipe_material` | `str \| null` | `null` | Справочный материал трубы для λ, если не задан `pipe_lambda`. |
| `pipe_lambda` | `float \| null` | `> 0`, `<= 400` | Ручная λ трубы, имеет приоритет над `pipe_material`. |

Правило:

```text
если wall_thickness задана, то нужен pipe_material или pipe_lambda
```

### Изоляция

| Поле | Тип | Ограничения / default | Использование |
|---|---|---|---|
| `insulation_thickness` | `float \| null` | `> 0`, `<= 0.5` | Однослойный режим. |
| `insulation_material` | `str \| null` | `null` | Однослойный режим. |
| `insulation_layers` | `InsulationLayer[] \| null` | `1..3 слоя` | Многослойный режим. Имеет приоритет в `_resolve_layers()`. |
| `insulation_temperature_basis` | enum \| null | см. ниже | Режим расчета `tm` для λ изоляции. |

Допустимые `insulation_temperature_basis`:

```text
indoor
outdoor_summer
outdoor_winter
channel
tunnel
technical_subfloor
attic
basement
```

Правило:

```text
нужно задать либо insulation_layers, либо insulation_thickness + insulation_material
```

### Температуры

| Поле | Тип | Ограничения | Использование |
|---|---|---|---|
| `ambient_temperature` | `float` | `-70..70` | Температура окружающей среды, °C. |
| `process_temperature` | `float` | `-90..600` | Температура продукта, °C. |

Правило:

```text
process_temperature > ambient_temperature
```

### Длина И Локальные Элементы

| Поле | Тип | Ограничения / default | Использование |
|---|---|---|---|
| `pipe_length` | `float` | `0.5..200000` | Базовая длина трубы, м. |
| `burial_depth` | `float \| null` | `0..200` | Если `> 0`, включает подземную ветку. |
| `num_local_elements` | `int \| null` | `0..100` | Количество локальных элементов. Если не задано, может считаться из счетчиков. |
| `valve_count` | `int \| null` | `0..100` | Счетчик задвижек/клапанов; в схеме может суммироваться в `num_local_elements`. |
| `flange_count` | `int \| null` | `0..100` | Счетчик фланцев. |
| `support_count` | `int \| null` | `0..100` | Счетчик опор. |
| `local_element_equiv_length` | `float \| null` | `0.1..6.9` | Эквивалентная длина одного локального элемента, м. |

Формула:

```text
effective_length = pipe_length + (num_local_elements or 0) * (local_element_equiv_length or 0)
```

### Внешние Условия И Коэффициенты

| Поле | Тип | Ограничения / default | Использование |
|---|---|---|---|
| `wind_speed` | `float \| null` | `0..20` | Используется для расчета `alpha_vnesh`, если `alpha_vnesh` не задан. |
| `alpha_vnesh` | `float \| null` | `7..52` | Ручной коэффициент внешней теплоотдачи. |
| `ground_conductivity` | `float \| null` | `0.5..3.0` | λ грунта, используется в подземной ветке. |
| `safety_factor` | `float \| null` | `1.05..1.7` | Итоговый коэффициент `K`. |
| `location` | `"indoor" \| "outdoor"` | default `"outdoor"` | Влияет на `alpha` и `location_factor`. |
| `placement` | `"indoor" \| "outdoor" \| "underground" \| null` | `null` | Проверка/нормализация размещения; сама формула переключается по `burial_depth > 0`. |

## Поля Object Preprocessing

Эти поля могут храниться в `ProjectObject.params`, но часть из них не попадает
в чистую Pydantic-схему формулы. Они влияют на defaults, UI semantics,
электрорасчет или climate policy.

### Общие Defaults Для Объектов

| Поле | Default | Комментарий |
|---|---:|---|
| `insulation_cover_material` | `none` | Персистится в object params. |
| `max_ambient_temperature` | `30` | Персистится, не используется в `calc_pipe_heat_loss()`. |
| `max_process_temperature` | `90` | Персистится, не используется в `calc_pipe_heat_loss()`. |
| `environment` | `normal` | Персистится. |
| `zone_classification` | `safe` | Персистится. |
| `temperature_group` | `T1` | Персистится. |
| `min_switch_temperature` | `-20` | Персистится. |
| `supply_voltage` | `220` | Персистится; используется downstream в электрическом контуре. |
| `steam_tracing` | `no` | Персистится. |

### Defaults Только Для Трубы

| Поле | Default | Комментарий |
|---|---:|---|
| `wall_thickness` | `0.004` | Добавляется, если ключ отсутствует. |
| `pipe_material` | `carbon_steel` | Добавляется, если нет `pipe_material` и нет `pipe_lambda`. |
| `valve_count` | `2` | Участвует в нормализации `num_local_elements`. |
| `flange_count` | `2` | Участвует в нормализации `num_local_elements`. |
| `support_count` | `2` | Участвует в нормализации `num_local_elements`. |
| `local_element_equiv_length` | `1.5` | Используется для effective length. |

### Нормализуемые И Derived Params

| Поле | Откуда берется | Комментарий |
|---|---|---|
| `safety_factor` | default `1.1`, climate policy или ручной ввод | Если ключ отсутствует, preprocessing ставит `1.1`. Climate policy может заменить. |
| `safety_factor_source` | `default`, `climate_policy`, `manual` | Маркер источника `safety_factor`. |
| `placement` | `burial_depth`, `location`, либо явный ввод | Если `burial_depth is not None`, ставится `underground`; если `location == indoor`, ставится `indoor`; иначе `outdoor`. |
| `location` | явный ввод или от `placement` | Если `placement == indoor`, ставится `indoor`, иначе `outdoor`. |
| `insulation_layer_count` | количество слоев или `1` | Добавляется при нормализации слоев. |
| `first_insulation_lambda` | UI/helper field | Если задан, переносится в `insulation_layers[0].conductivity`. |
| `climate_key` | `region|||city` или сборка из `climate_region` + `climate_city` | Используется climate lookup. |
| `climate_region` | из `climate_key` или явное поле | Используется climate lookup. |
| `climate_city` | из `climate_key` или явное поле | Используется climate lookup. |
| `ambient_temperature_source` | UI/climate policy | Если `"manual"`, climate policy не затирает `ambient_temperature`. |
| `climate_temperature_basis` | climate policy | `t_0_92` или `t_abs_min` для трубы. |
| `climate_policy_rule` | climate policy | `pipe_diameter_ge_100` или `pipe_diameter_lt_100`. |

### Подземные Обязательные Поля На Object Level

Если `placement == "underground"`, object-level validation требует:

| Поле | Комментарий |
|---|---|
| `burial_depth` | Глубина/высота подземной части. |
| `ground_type` | Тип грунта. Не входит в формулу, но обязателен для object validation. |
| `ground_conductivity` | λ грунта. Входит в формулу. |

## Поля Результата Трубы

Модель: `PipeHeatLossResult`. Эти поля сохраняются в `ProjectObject.results`.

| Поле | Тип | Округление | Значение |
|---|---|---:|---|
| `heat_loss_per_meter` | `float` | 3 | Линейные теплопотери `q_linear`, Вт/м, без `safety_factor`. |
| `total_heat_loss` | `float` | 3 | Полные теплопотери, Вт, с `safety_factor` и `location_factor`. |
| `effective_length` | `float` | 3 | `pipe_length + num_local_elements * local_element_equiv_length`. |
| `thermal_resistance` | `float` | 6 | `R_wall + R_insulation + R_external`. |
| `wall_resistance` | `float \| null` | 6 | Сопротивление стенки трубы. |
| `insulation_resistance` | `float \| null` | 6 | Суммарное сопротивление изоляции. |
| `external_resistance` | `float \| null` | 6 | Воздушное или грунтовое внешнее сопротивление. |
| `alpha_vnesh` | `float \| null` | 3 | Коэффициент внешней теплоотдачи. Для подземной ветки `null`. |
| `wind_speed` | `float \| null` | без округления | Входная скорость ветра. |
| `ground_conductivity` | `float \| null` | 3 | λ грунта. Только для подземной ветки. |
| `safety_factor` | `float \| null` | 3 | Примененный `K`. |
| `location_factor` | `float \| null` | 3 | Примененный коэффициент размещения. |
| `local_elements_count` | `int \| null` | нет | Количество локальных элементов. |
| `local_element_equiv_length` | `float \| null` | 3 | Эквивалентная длина одного локального элемента. |
| `surface_temperature` | `float \| null` | нет | Сейчас всегда `null`. |

## Поля Ошибки При Object Recalculate

При ошибке `ProjectObject.results = null`, а `ProjectObject.validation_errors`
получает structured payload:

| Поле | Значение |
|---|---|
| `error_code` | Например `invalid_object_params`, `missing_required_fields`, `schema_validation_error`, `heat_loss_formula_error`. |
| `category` | `validation`, `unsupported` или `formula`. |
| `message` | Текст исключения. |
| `field` | Конкретное поле, если удалось определить. |
| `hint` | Подсказка для пользователя. |
| `missing_fields` | Опционально, если ошибка про обязательные поля. |

## Поля, Которые Не Попадают В Чистую Формулу

Service перед формулой делает projection:

```text
{key: value for key, value in data.items() if key in PipeHeatLossParams.model_fields}
```

Поэтому следующие object-level поля могут храниться в объекте, но не попадают
в `calc_pipe_heat_loss()` напрямую:

```text
insulation_cover_material
max_ambient_temperature
max_process_temperature
environment
zone_classification
temperature_group
min_switch_temperature
supply_voltage
steam_tracing
safety_factor_source
climate_key
climate_region
climate_city
ambient_temperature_source
climate_temperature_basis
climate_policy_rule
ground_type
insulation_layer_count
first_insulation_lambda
needs_material_reselection
```

Некоторые из них используются до projection, например climate fields,
`first_insulation_lambda`, `placement`, `ground_type` validation и defaults.

