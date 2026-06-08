# Алгоритм подбора саморегулирующегося кабеля ТЛТ

Источник: backend-код `calc_self_regulating()` в
`formulas/electrical/self_regulating.py`. Тип расчёта: `self_regulating`.
Дата сверки с кодом: 2026-06-08.

## Назначение

Автоподбор или проверка марки кабеля линейки ТЛТ по требуемой удельной
мощности, температурам среды/продукта и параметрам укладки. Каталог по
умолчанию — `cables_tlt.json` (поля строки: `model`, `power_per_meter`,
`max_temperature`, `min_temperature`, `voltage`).

## Вход

```text
required_power_per_meter   # Вт/м, БЕЗ Kзап (формула применяет сама)
cable_mark                 # марка или None (автоподбор)
ambient_temperature        # T среды, °C
process_temperature        # T продукта, °C (нужна для проверки max_temperature)
pipe_length                # базовая длина обогрева, м
safety_factor              # Kзап, default 1.1
supply_voltage             # fallback напряжения, default 220
winding_coefficient        # k_навива
number_of_threads          # 1..3 или None (автоподбор количества)
cable_catalog              # источник кабелей или None -> встроенный ТЛТ
selection_policy           # commercial ranking
```

Предусловия: `required_power_per_meter > 0`, `pipe_length > 0`.

## Требуемая Мощность

```text
required_effective = required_power_per_meter × safety_factor   [Вт/м]
```

Это единственное место применения `Kзап` для ТЛТ.

## Автоподбор (cable_mark = None)

Кандидат должен пройти ВСЕ три условия:

```text
1) power_per_meter × k_навива × N ≥ required_effective
2) min_temperature ≤ ambient_temperature        # монтаж/работа на холоде
3) max_temperature ≥ process_temperature         # не перегреется
```

Сначала отбираются `temperature_candidates` по условиям 2–3. Если их нет —
бросается отдельная ошибка: либо «нет кабеля для T среды», либо «не выдержит
T продукта».

Перебор ниток:

```text
если number_of_threads = None:  N перебирается 1..3 (MAX_SELF_REG_AUTO_THREADS)
если number_of_threads задано:  проверяется только это N (без эскалации)
```

Из всех подходящих `(N, cable)` выбор делается через commercial ranking. При
`technical_minimum` минимизируется ключ:

```text
(N, power_per_meter, power_per_meter × N, model)
```

То есть приоритет: меньше ниток → меньше паспортная мощность → меньше
установленная мощность → имя.

`number_of_threads_source` = `auto`, если нитки не были заданы, иначе `manual`.

## Ручной Выбор (cable_mark задан)

```text
cable = lookup по марке (в каталоге или через loader для альт. имён)
applied_threads = number_of_threads или 1
number_of_threads_source = manual если задано, иначе default
```

Другая марка не подбирается; commercial ranking не применяется
(`applied_selection_policy = manual_selection`).

## Проверки После Выбора (для обеих веток)

```text
installed_power_per_meter = power_per_meter × k_навива × applied_threads
installed_power_per_meter ≥ required_effective    # иначе ValueError
ambient_temperature ≥ min_temperature             # иначе ValueError
process_temperature ≤ max_temperature             # иначе ValueError
```

## Расчёт Результата

```text
layout_factor       = k_навива × applied_threads
cable_length        = pipe_length × layout_factor
order_cable_length  = cable_length × 1.1
total_power         = power_per_meter × cable_length
applied_voltage     = voltage строки каталога  или  supply_voltage (fallback)
current             = total_power / applied_voltage
```

`process_temperature` для ТЛТ обязателен: без него нельзя проверить паспортный
`max_temperature`.

## Ключевые Поля Результата

```text
selected_cable                       # модель
cable_length / installed_cable_length / order_cable_length
power_per_meter                      # паспортная Вт/м
installed_power_per_meter            # power × k × N
total_power, current, voltage
winding_pitch, winding_coefficient
num_circuits                         # = applied_number_of_threads
requested_number_of_threads          # что пришло от пользователя или null
applied_number_of_threads
number_of_threads_source             # auto | manual | default | previous_result
selection_policy / applied_selection_policy / selection_reason
candidate_count, commercial, warnings
```

## Что Важно

- `Kзап` применяется ровно один раз (`required_effective`).
- Автоподбор не повышает количество ниток выше 3.
- При ручной марке нитки по умолчанию = 1, но это `default`, не `manual`.
- Напряжение и ток считаются по паспорту строки; `supply_voltage` — fallback.
