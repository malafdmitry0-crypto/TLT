# Алгоритм подбора резистивных кабелей ТТ Р1 и ТТ Р3

Источник: backend-код `resistive.py` (`calc_resistive_single_core`,
`calc_resistive_three_core`). Типы расчёта: `single_core` (ТТ Р1, одножильный),
`three_core` (ТТ Р3, трёхжильный). Дата сверки с кодом: 2026-06-08.

## Константы

```text
RHO   = 0.0175      # удельное сопротивление меди при 20°C, Ом·мм²/м
ALPHA = 0.0042      # температурный коэффициент, 1/К
MAX_RESISTIVE_CURRENT_A = 65.0
ρ_T(T) = RHO × (1 + ALPHA × (T − 20))
```

Каталог — `resistive_cables.json` с секциями `single_core`, `three_core` и
`common`. Строка нормализуется к ключу `conductor_cross_section`
(из `conductor_section_mm2` или из строки `model` как legacy-fallback). Для
машинного расчёта используется паспортное `resistance_ohm_km`; при его
отсутствии — legacy `RHO×1000/section`.

## Базовая Длина

```text
если задана геометрия резервуара (tank_shape + heating_height + laying_step):
    object_length = compute_tank_cable_length(...)
иначе:
    object_length = pipe_length + add_length
```

## Два Режима: selection_mode

- `manual` — расчёт по явно заданной схеме `connection_type` и числу ниток.
- `auto` — full-version VSDX-подбор `U / N / M` по критериям `p2 ≤ p3` и току.

## Схемы Подключения

`_connection_factors()` возвращает `(U_расч, множитель_R, множитель_P, делитель_I)`.

Одножильный (ТТ Р1):

| connection_type | U_расч | R-factor | P-mult | I-divisor |
|---|---|---:|---:|---|
| `line_1ph` (линия 220В) | U | 1 | 1 | U |
| `loop_1ph` (петля 220В) | U | 2 | 1 | U |
| `star_3ph` (звезда 380В) | U/√3 | 3 | 1 | U·√3 |

Трёхжильный (ТТ Р3):

| connection_type | U_расч | R-factor | P-mult | I-divisor |
|---|---|---:|---:|---|
| `line_1ph` | U | 1 | 3 | U |
| `loop_2x3` | U | 2 | 3 | U |
| `loop_1x3` | U | 3 | 1 | U |
| `star_3x3` | U/√3 | 3 | 3 | U·√3 |
| `star_1x3` | U/√3 | 3 | 1 | U·√3 |

## Паспортная Модель Мощности (`_passport_power`)

```text
R       = resistance_ohm_km / 1000 × cable_length × R_factor   [Ом]
P_общ   = U_расч² / R × P_mult
I       = P_общ / I_divisor
```

Known issue: паспортная модель использует холодное `R20` и не домножает на
`[1 + ALPHA×(T_ж−20)]`. Отклонение зафиксировано в
`docs/analysis/resistive-temperature-tz-deviation.md`.

## Ручной Режим (selection_mode = manual)

```text
cable_length = object_length × winding_coefficient × number_of_threads
order_cable_length = cable_length × 1.1
sk_required = _legacy_required_cross_section(...)   # diagnostic поле

если каталог имеет паспортное resistance_ohm_km:
    cable, metrics = _pick_passport_resistance_cable(...)
        # из строк, где P_общ ≥ required_heat_loss и (при паспортном R) I ≤ max_current
        # выбор min по (margin=P−Q, current)
иначе (legacy):
    cable = _pick_cable(catalog, sk_required)   # мин. сечение ≥ требуемого
    metrics = _passport_power(cable, ...)
```

Diagnostic-сечение (`_legacy_required_cross_section`), `N = (L+L_доп)×w`:

Одножильный ТТ Р1:

```text
Линия 220В:  Sк = (Q/U²) × ρ_T × N
Петля 220В:  Sк = (Q/U²) × ρ_T × 2N
Звезда 380В: Sк = (Q/(U/√3)²) × ρ_T × 3N
```

Трёхжильный ТТ Р3:

```text
Линия:       Sк = (Q/U²) × ρ_T × N / 3
Петля 2×3ж:  Sк = (Q/U²) × ρ_T × 2N / 3
Петля 1×3ж:  Sк = (Q/U²) × ρ_T × 3N
Звезда 3×3ж: Sк = (Q/(U/√3)²) × ρ_T × 3N / 3
Звезда 1×3ж: Sк = (Q/(U/√3)²) × ρ_T × 3N
```

## Авто-режим (selection_mode = auto, full-version VSDX)

```text
section_length          = object_length × winding_coefficient
required_linear_power   = required_heat_loss / object_length
max_linear_power_w_m    = override  или  default из resistive_cables.json/common
                          (ТТ Р1 = 40, ТТ Р3 = 50 Вт/м)
sorted_catalog          = по убыванию resistance_ohm_km
```

Параметры подбора (fallback, если БД коэффициентов пуста):

```text
max_current_a          = 65 A
start_voltage          = start_voltage или supply_voltage
high_voltage           = 380 В
min_adjusted_voltage   = 40 В
voltage_step           = 5 В
max_parallel_schemes M = 20
```

Перебор по числу параллельных схем `M = 1..max_parallel_schemes`, для каждого M
три стадии в порядке `stage_rank`:

```text
stage 0: петля (N=2) при start_voltage, можно снижать U по voltage_step
         до min_adjusted_voltage, если первый кабель перегрет
stage 1: петля (N=2) при high_voltage, без снижения U
stage 2: звезда (N=3) при high_voltage
```

Критерий допустимости схемы (`_within_p3`):

```text
p2 ≤ p3 + eps  И  current ≤ max_current_a + eps
p3 = min(max_current_a² × resistance_ohm_km/1000,  max_linear_power_w_m)
кандидат принимается, если ещё и linear_power_w_m ≥ required_linear_power
```

Метрики схемы (`_auto_scheme_metrics`) считаются по паспортному
сопротивлению `r = resistance_ohm_km/1000`:

Трёхжильный (через `_connection_factors`):

```text
loop_2x3:  P = U² / (r × section_length × 2) × 3,  N=2
star_3x3:  P = (U/√3)² / (r × section_length × 3) × 3,  N=3
p2 = P / (section_length × N)
total_power = P × M
```

Одножильный:

```text
N=2 (петля): I = U / (r × section_length × 2)
N=3 (звезда): I = (U/√3) / (r × section_length)
per_thread_power = I² × r × section_length
p2 = per_thread_power / section_length
total_power = per_thread_power × N × M
```

```text
linear_power_w_m = total_power / object_length
cable_length     = section_length × N × M
```

Выбор кандидата:

```text
если selection_policy == technical_minimum:
    вернуть первую технически подходящую схему (по порядку стадий)
иначе:
    собрать всех технически подходящих и применить commercial ranking
```

Если ни одна схема не подошла при `M ≤ max` → `ValueError`.

## Ключевые Поля Результата (общие для Р1/Р3)

```text
selected_cable, conductor_cross_section
cable_length / installed_cable_length / order_cable_length
required_cross_section       # diagnostic Sк
resistance_ohm_km, circuit_resistance_ohm
max_current_limit_a
power_margin_w               # total_power − required_heat_loss
total_power, current, voltage
connection_type
winding_pitch, winding_coefficient
num_circuits                 # threads × schemes (auto) или number_of_threads (manual)
selection_mode               # auto | manual
# только для auto:
scheme_count (M), scheme_threads (N)
linear_power_w_m, required_linear_power_w_m, p2_w_m, p3_w_m
section_length_m, l1_m, l2_m
selection_policy / applied_selection_policy / selection_reason
candidate_count, commercial, warnings
```

## Что Важно

- В auto подбор идёт по паспортному сопротивлению и ограничениям `p2/p3`/65 A,
  а не по легаси-сечению (`required_cross_section` остаётся diagnostic-полем).
- `required_heat_loss` для резистивных = `total_heat_loss` (Kзап уже внутри,
  второй раз не применяется).
- ТТ Р3 в auto считается как трёхжильный нагревательный кабель, а не как
  `per_thread × N`.
- Default cap линейной мощности: ТТ Р1 = 40, ТТ Р3 = 50 Вт/м (из справочника).
