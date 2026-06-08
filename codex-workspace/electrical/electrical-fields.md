# Поля электротехнического расчёта

Источник: backend-схемы `schemas/calculation.py` и формулы
`formulas/electrical/*`. Дата сверки с кодом: 2026-06-08.

## Общие Поля Укладки И Коммерции

Эти поля присутствуют во всех типах кабеля (имена могут отличаться):

| Поле | Тип / default | Использование |
|---|---|---|
| `winding_coefficient` | `1.0..10.0`, default зависит от типа | Коэффициент навива/укладки; может считаться из `winding_pitch`. |
| `winding_pitch` | `≥ 0` мм, optional | Шаг навива; `0`/`null` — прямая укладка. |
| `selection_policy` | enum, default `technical_minimum` | Commercial ranking. |
| `balanced_weights` / `_approved` / `_version` | optional | Веса balanced-ранкинга. |
| `tank_shape` / `tank_diameter` / `tank_length` / `tank_width` | optional | Геометрия укладки на резервуаре. |
| `heating_height` | `> 0` м, optional | Высота зоны обогрева `h_укл`. |
| `laying_step` | `0.1..0.4` м, optional | Шаг укладки `w_step`. |

## ТЛТ — `SelfRegulatingParams`

| Поле | Тип / default | Использование |
|---|---|---|
| `required_power_per_meter` | `> 0` Вт/м | Требуемая мощность **без** Kзап. |
| `cable_mark` | str/null | null — автоподбор. |
| `supply_voltage` | `> 0`, default 220 | Fallback напряжения. |
| `ambient_temperature` | float | Проверка `min_temperature`. |
| `process_temperature` | float | Проверка `max_temperature` (обязателен). |
| `pipe_length` | `> 0` | База длины. |
| `safety_factor` | `1.0..2.0`, default 1.1 | Kзап (применяется один раз). |
| `number_of_threads` | `1..3` / null | null — автоподбор количества. |
| `cable_catalog` | list/null | null — встроенный ТЛТ. |

Результат `SelfRegulatingResult`: `selected_cable`, длины
(`cable_length`/`installed`/`order`), `power_per_meter`,
`installed_power_per_meter`, `total_power`, `current`, `voltage`, `num_circuits`,
`requested/applied_number_of_threads`, `number_of_threads_source`,
commercial-метаданные.

## ТТН/ТТВ/ТТХ — `SelfRegulatingTTParams`

| Поле | Тип / default | Использование |
|---|---|---|
| `required_power_per_meter` | `> 0` Вт/м | Требуемая мощность без Kзап. |
| `pipe_length` | `> 0` | База длины (если нет геометрии бака). |
| `process_temperature` | float | `T1` — выбор серии. |
| `maintain_temperature` | float/null | `T3` — для `q_б(T3)`; fallback `T1`. |
| `vapor_temperature` | float/null | `T2` — выбор серии. |
| `aggressive_product` | bool, default false | Суффикс `-СР`/`-СТ`. |
| `supply_voltage` | `> 0`, default 220 | Fallback напряжения. |
| `safety_factor` | `1.0..2.0`, default 1.1 | Kзап. |
| `winding_coefficient` | default **1.1** | Коэффициент укладки. |
| `number_of_threads` | `1..100` / null | null — full-version автоподбор (без лимита 3). |
| `cable_mark` | str/null | null — автоподбор. |

Результат `SelfRegulatingTTResult`: `selected_cable`, `cable_mark`, `series`,
длины, `num_circuits`, `power_per_meter` (=`q_б`), `installed_power_per_meter`,
`total_power`, `current`, `voltage`.

## ТТ Р1 / ТТ Р3 — `ResistiveSingleCoreParams` / `ResistiveThreeCoreParams`

| Поле | Тип / default | Использование |
|---|---|---|
| `required_heat_loss` | `> 0` Вт | Целевая мощность `Q` (Kзап уже внутри). |
| `pipe_length` | `> 0` | База длины. |
| `add_length` | `≥ 0`, default 0 | `L_доп`. |
| `process_temperature` | float | `T_ж` для `ρ_T` и diagnostic-сечения. |
| `supply_voltage` | `> 0`, default 220 | `U` питания. |
| `selection_mode` | `manual`/`auto`, default `manual` | Режим подбора. |
| `connection_type` | enum (Р1: line/loop/star_3ph; Р3: 5 схем) | Схема для manual. |
| `number_of_threads` | `1..100`, default 1 | Нитки для manual. |
| `max_current_a` | `> 0`, default 65 | Лимит тока. |
| `max_linear_power_w_m` | optional | Override `p3`; auto default из справочника (Р1=40, Р3=50). |
| `max_parallel_schemes` | `1..1000`, default 20 | `M` в auto. |
| `start_voltage` | optional | Старт U в auto; fallback `supply_voltage`. |
| `high_voltage` | default 380 | U для повышенной схемы/звезды. |
| `min_adjusted_voltage` | default 40 | Нижний предел снижения U. |
| `voltage_step` | default 5 | Шаг снижения U. |
| `cable_catalog` | list/null | null — встроенный. |

Результат `Resistive*Result`: `selected_cable`, `conductor_cross_section`,
длины, `required_cross_section` (diagnostic), `resistance_ohm_km`,
`circuit_resistance_ohm`, `max_current_limit_a`, `power_margin_w`,
`total_power`, `current`, `voltage`, `connection_type`, `num_circuits`,
`selection_mode`; для auto дополнительно `scheme_count`, `scheme_threads`,
`linear_power_w_m`, `required_linear_power_w_m`, `p2_w_m`, `p3_w_m`,
`section_length_m`, `l1_m`, `l2_m` и commercial-метаданные.

## Поля, Собираемые Сервисом (не приходят от пользователя напрямую)

`_build_electrical_data()` формирует payload из теплопотери и объекта:

```text
required_power_per_meter / required_heat_loss   # по контракту «один Kзап»
pipe_length                                     # effective_length (труба) / укладка (бак)
winding_coefficient                             # из шага навива или cap по диаметру
supply_voltage, safety_factor                   # override / params / default
cable_catalog                                   # источник базы расчёта
```

## Что Важно

- `required_power_per_meter` (ТЛТ/ТТ) — **без** Kзап; `required_heat_loss`
  (резистивные) — **с** Kзап. Разница вытекает из того, какая формула
  применяет `safety_factor`.
- `winding_coefficient` по умолчанию: ТЛТ=1.0, ТТН/ТТВ/ТТХ=1.1, резистивные=1.0.
- Все длины возвращаются как «расчётная» и «заказ» (× 1.1).
