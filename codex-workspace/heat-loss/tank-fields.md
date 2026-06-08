# Резервуар: перечень полей теплопотерь

Источник этого файла: backend-схемы, object normalization и фактическая формула
`calc_tank_heat_loss()`. Документ описывает текущий контракт приложения.

## Входные Поля Формулы

Поля прямого расчета задаются в `TankHeatLossParams`.

| Поле | Тип / диапазон backend | Единицы | Использование |
|---|---|---:|---|
| `shape` | `cylindrical`, `rectangular`, `spherical`; default `cylindrical` | - | Выбирает формулу площади поверхности. |
| `diameter` | `0.1..30.0` | м | Обязателен для `cylindrical` и `spherical`. |
| `height` | `0.1..50.0` | м | Обязателен для `cylindrical` и `rectangular`; нужен для подземного разбиения. |
| `length` | `0.1..100.0` | м | Обязателен для `rectangular`. |
| `width` | `0.1..100.0` | м | Обязателен для `rectangular`. |
| `volume` | `> 0`, optional | м3 | В формуле теплопотерь сейчас не используется. |
| `insulation_thickness` | `> 0` | м | Обязательное поле. Используется для однослойной изоляции и как top-level толщина первого слоя в object flow. |
| `insulation_material` | non-empty string | - | Материал однослойной изоляции или первого слоя. |
| `insulation_layers` | optional list, максимум `3` | - | Многослойная изоляция; каждый слой дает `thickness / lambda`. |
| `ambient_temperature` | `-70..70` | °C | Температура среды; может быть заменена климатической политикой, если не ручная. |
| `process_temperature` | `-90..600` и `> ambient_temperature` | °C | Температура продукта/объекта. |
| `insulation_temperature_basis` | `indoor`, `outdoor_summer`, `outdoor_winter`, `channel`, `tunnel`, `technical_subfloor`, `attic`, `basement` | - | Выбирает `tm` для справочной теплопроводности изоляции. |
| `location` | `indoor` или `outdoor`; default `outdoor` | - | Выбирает `alpha` и `location_factor`. |
| `wall_thickness` | `0.001..0.5`, optional | м | Толщина стенки резервуара. Работает только вместе с `wall_lambda`. |
| `wall_lambda` | `> 0..400`, optional | Вт/(м*К) | Теплопроводность стенки. Работает только вместе с `wall_thickness`. |
| `burial_depth` | `0..200`, optional | м | В коде означает высоту подземной части `h`, а не глубину заложения как у трубы. |
| `ground_conductivity` | `0.5..3.0`, optional | Вт/(м*К) | Теплопроводность грунта для подземной части. |
| `wind_speed` | `0..20`, optional | м/с | Участвует в расчетном `alpha` на улице, если `alpha_vnesh` не задан. |
| `alpha_vnesh` | `7..52`, optional | Вт/(м2*К) | Ручной коэффициент наружной теплоотдачи. Имеет приоритет над `wind_speed`. |
| `safety_factor` | `1.05..1.7`, optional | - | Коэффициент запаса `K`; если не задан, берется из coefficients или default `1.1`. |
| `q_additional` | `>= 0`; default `0` | Вт | Дополнительные теплопотери; прибавляются к итоговому `Q` после множителей. |
| `placement` | `indoor`, `outdoor`, `underground`, optional | - | Object/UI-семантика размещения. Прямая формула использует подземную ветку по `burial_depth > 0`. |

## Поля Слоя Изоляции

Каждый элемент `insulation_layers` имеет поля `InsulationLayer`.

| Поле | Тип / диапазон | Единицы | Использование |
|---|---|---:|---|
| `thickness` | `> 0..0.5` | м | Толщина слоя. |
| `material` | string | - | Код справочного материала или `other`. |
| `conductivity` | optional | Вт/(м*К) | Обязательна только для `material == "other"`. |
| `temperature_range` | optional pair | °C | Обязателен только для `material == "other"`; проверяется по горячей стороне слоя. |

Если `insulation_layers` не задан, формула создает один слой из
`insulation_thickness` и `insulation_material`.

## Object-Level Defaults И Нормализация

Эти поля не являются частью физической формулы, но влияют на сохраненные
объекты перед расчетом.

| Поле / правило | Значение | Комментарий |
|---|---|---|
| `shape` default | `cylindrical` | Только для object flow. |
| `q_additional` default | `0` | Только для object flow. |
| `safety_factor` default | `1.1` | Если не задан вручную. |
| `placement` default | `underground`, если есть `burial_depth`; иначе `indoor` по `location`, иначе `outdoor` | Формульная ветка все равно зависит от `burial_depth > 0`. |
| `location` from placement | `indoor` для `placement=indoor`, иначе `outdoor` | Нужно для `alpha` и `location_factor`. |
| `insulation_temperature_basis` default | `indoor` для помещения, `outdoor_winter` для улицы | Для `underground` явный режим обычно должен быть задан. |
| `insulation_layers` normalization | первый слой синхронизируется с top-level `insulation_thickness` / `insulation_material` | Поэтому top-level поля остаются важны даже в многослойном режиме. |

Для `placement == underground` object validator требует:

```text
burial_depth
ground_type
ground_conductivity
```

`ground_type` нужен на уровне объекта/UI, но сама формула теплопотерь использует
только `ground_conductivity`.

## Геометрические Обязательные Поля

| `shape` | Обязательные поля | Подземная ветка |
|---|---|---|
| `cylindrical` | `diameter`, `height` | Поддержана. |
| `rectangular` | `length`, `width`, `height` | Поддержана. |
| `spherical` | `diameter` | Надземная поддержана; подземная не поддержана. |

## Расчетные Величины

| Величина | Формула / источник |
|---|---|
| `delta_t` | `process_temperature - ambient_temperature` |
| `R_wall` | `wall_thickness / wall_lambda` |
| `R_insulation` | `sum(layer.thickness / lambda_layer)` |
| `alpha` | ручной `alpha_vnesh`, либо `9.0` в помещении, либо `11.6 + 7sqrt(wind_speed)` на улице |
| `R_external` | `1 / alpha` |
| `R_ground` | `burial_depth / ground_conductivity` |
| `S` | площадь по форме |
| `S_air`, `S_ground` | площади надземной и подземной частей |
| `q` | `delta_t / (R_wall + R_insulation + R_external)` |
| `q_ground` | `delta_t / (R_wall + R_insulation + R_ground)` |
| `Q` | `q*S*K*K_разм + Q_доп` или split-формула для подземной ветки |

## Выходные Поля

Поля результата задаются в `TankHeatLossResult`.

| Поле | Единицы | Когда заполняется | Значение |
|---|---:|---|---|
| `heat_loss_per_m2` | Вт/м2 | всегда | Удельные теплопотери без `safety_factor`, без `location_factor`, без `q_additional`. |
| `total_heat_loss` | Вт | всегда | Итоговое `Q` с `safety_factor`, `location_factor` и `q_additional`. |
| `surface_area` | м2 | всегда | Полная площадь поверхности; для подземной ветки `S_air + S_ground`. |
| `wall_resistance` | м2*К/Вт | всегда | `0`, если стенка не задана полностью. |
| `insulation_resistance` | м2*К/Вт | всегда | Сумма сопротивлений изоляции. |
| `external_resistance` | м2*К/Вт | всегда | `1 / alpha`. |
| `ground_resistance` | м2*К/Вт | только `burial_depth > 0` | `burial_depth / ground_conductivity`. |
| `alpha_vnesh` | Вт/(м2*К) | всегда | Фактически использованный `alpha`. |
| `wind_speed` | м/с | если передан | Возвращается как входное значение. |
| `ground_conductivity` | Вт/(м*К) | только `burial_depth > 0` | Фактически использованная теплопроводность грунта. |
| `safety_factor` | - | всегда | Фактически использованный `K`. |
| `location_factor` | - | всегда | Фактически использованный множитель размещения. |
| `air_surface_area` | м2 | только `burial_depth > 0` | Надземная площадь. |
| `ground_surface_area` | м2 | только `burial_depth > 0` | Подземная площадь. |
| `heat_loss_air_per_m2` | Вт/м2 | только `burial_depth > 0` | Удельные потери надземной части. |
| `heat_loss_ground_per_m2` | Вт/м2 | только `burial_depth > 0` | Удельные потери подземной части. |
| `q_additional` | Вт | всегда | Дополнительные теплопотери, отраженные в `total_heat_loss`. |

## Поля, Которые Не Используются В Формуле Теплопотерь

| Поле | Где встречается | Комментарий |
|---|---|---|
| `volume` | `TankHeatLossParams` | Не входит в расчет `S`, `q` или `Q`. |
| `ground_type` | object-level validation/import | Требуется для подземного объекта, но формула использует только `ground_conductivity`. |
| `placement` | schema/object/UI | Ветка формулы выбирается по `burial_depth > 0`; `placement` влияет на валидацию и нормализацию. |
| Электрические поля укладки | electrical flow | Высота обогрева, шаг укладки и периметр нужны для подбора кабеля, не для теплопотерь. |

## Типовые Ошибки Ввода

- Для `cylindrical` не заданы `diameter` или `height`.
- Для `rectangular` не заданы `length`, `width` или `height`.
- Для `spherical` не задан `diameter`.
- `process_temperature <= ambient_temperature`.
- `burial_depth > height`.
- `shape == spherical` и одновременно `burial_depth > 0`.
- Указана только `wall_thickness` или только `wall_lambda` в object flow.
- `insulation_layers` больше трех.
- Для `material == other` не заданы `conductivity` или `temperature_range`.
- Горячая сторона слоя выходит за температурный диапазон материала.

