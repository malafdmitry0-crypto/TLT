# Алгоритм подбора саморегулирующегося кабеля ТТН/ТТВ/ТТХ

Источник: backend-код `calc_self_regulating_tt()` в
`formulas/electrical/self_regulating.py`. Тип расчёта: `self_regulating_tt`.
Дата сверки с кодом: 2026-06-08.

## Назначение

Отдельная линейка саморегулирующихся кабелей, где **серия** выбирается по
температурам, а фактическая мощность кабеля считается линейно от температуры
поддержания `T3`. Каталог — `cables_tt.json` (поля строки: `model`, `series`,
`nominal_power`, `q1`, `q2`, `max_product_temp`, `max_vapor_temp`, `voltage`).

## Температуры И Серии

```text
T1 = process_temperature   # температура продукта  -> выбор серии
T2 = vapor_temperature     # температура пропарки   -> выбор серии (опционально)
T3 = maintain_temperature  # температура поддержания -> q_б(T3)
если T3 не задана: T3 = T1  (совместимость старых запросов)
```

Линейная мощность строки кабеля:

```text
q_б(T3) = q1 × T3 + q2     [Вт/м]
```

Пределы серий (`_SERIES_LIMITS`, паспортные максимумы включительно):

| Серия | max T продукта (T1) | max T пропарки (T2) |
|---|---:|---:|
| ТТН | 65 °C | 85 °C |
| ТТВ | 120 °C | 210 °C |
| ТТХ | 150 °C | 250 °C |

`_select_tt_series()` берёт минимальную серию, у которой `T1 ≤ max_product` и
(`T2` не задан или `T2 ≤ max_vapor`). Серия **не повышается** ради уменьшения
числа ниток. Превышение ТТХ → `ValueError` (нужен другой тип кабеля).

## Требуемая Мощность И Установленная Мощность

```text
q_required = required_power_per_meter × safety_factor          # один Kзап
installed_linear_power(q_б, N) = q_б × winding_coefficient × N
```

## Ручной Выбор (cable_mark задан)

```text
суффикс из марки: ...-СТ -> СТ, ...-СР -> СР
base_model = часть до "-"
cable = get_tt_cable_by_model(base_model)
series = cable.series
проверка: process_temperature ≤ max_product_temp серии
проверка: vapor_temperature ≤ max_vapor_temp серии (если задана)
```

## Автоподбор (cable_mark = None)

```text
series = _select_tt_series(T1, T2)
s_cables = строки серии, отсортированные по nominal_power
power_rows = [(q_б = q1×T3+q2, cable) for cable in s_cables if q_б > 0]
```

Затем:

```text
если number_of_threads задано:
    кандидаты = строки, где installed_linear_power(q_б, N) ≥ q_required
    выбор = min по (nominal_power, installed_linear_power)
иначе (авто-нитки):
    если есть строка с installed(q_б, 1) ≥ q_required:
        cable = первая такая, N = 1
    иначе:
        cable = максимальный nominal_power серии
        N = ceil(q_required / installed(q_б_max, 1))
```

Для ТТН/ТТВ/ТТХ в auto **нет** искусственного ограничения `N ≤ 3` — это
full-version правило VSDX.

## Суффикс Марки

```text
суффикс = "СР" если aggressive_product иначе "СТ"
cable_mark = f"{model}-{суффикс}"
```

Источник суффикса (по первоисточнику): `-СТ` = неагрессивная среда,
`-СР` = агрессивная.

## Расчёт Результата

```text
q_б = q1 × T3 + q2                  # должна быть > 0, иначе ValueError
num_circuits = заданное N / выбранное N / ceil(q_required / installed(q_б,1))

base_length:
    если задана геометрия резервуара (tank_shape + heating_height + laying_step):
        base_length = compute_tank_cable_length(...)
    иначе:
        base_length = pipe_length

cable_length        = base_length × winding_coefficient × num_circuits
order_cable_length  = cable_length × 1.1
total_power         = q_б × cable_length
installed_power_per_meter = q_б × winding_coefficient × num_circuits
applied_voltage     = voltage строки  или  supply_voltage (fallback)
current             = total_power / applied_voltage
```

## Ключевые Поля Результата

```text
selected_cable, cable_mark, series
cable_length / installed_cable_length / order_cable_length
num_circuits
power_per_meter            # = q_б(T3)
installed_power_per_meter  # q_б × k × N
total_power, current, voltage
winding_pitch, winding_coefficient
```

## Что Важно

- Серия определяется только температурами `T1/T2`; мощность серию не эскалирует.
- `q_б` зависит от `T3` (поддержание), а не от `T1`.
- Температурные пределы включительные.
- Ток/напряжение по паспорту строки; `supply_voltage` — fallback.
