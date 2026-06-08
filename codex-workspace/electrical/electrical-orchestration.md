# Электрорасчёт: оркестрация теплопотери → подбор кабеля

Источник этого файла: backend-код реализации (`calculation_service.py` +
`formulas/electrical/*`). Документ описывает, как результат теплорасчёта
превращается в вход электрической формулы и какой алгоритм вызывается.
Дата сверки с кодом: 2026-06-08.

## Кодовая Цепочка

```text
CalculationService.calc_electrical()  /  batch_calc_electrical()
-> _build_electrical_data(obj, cable_type, cable_mark, ...)   # payload из теплопотери
-> ElectricalRequest(cable_type, data)
-> _calculate_electrical_result(request)                      # dispatch по cable_type
   -> calc_self_regulating()        # self_regulating  (ТЛТ)
   -> calc_self_regulating_tt()     # self_regulating_tt (ТТН/ТТВ/ТТХ)
   -> calc_resistive_single_core()  # single_core (ТТ Р1)
   -> calc_resistive_three_core()   # three_core  (ТТ Р3)
-> результат + cable_snapshot -> ElectricalCalculation (upsert по object_id+variant_number)
```

Ключевые файлы:

- `backend/app/services/calculation_service.py` — маппинг и dispatch
- `backend/app/formulas/electrical/self_regulating.py` — ТЛТ + ТТН/ТТВ/ТТХ
- `backend/app/formulas/electrical/resistive.py` — ТТ Р1 + ТТ Р3
- `backend/app/formulas/electrical/cable_geometry.py` — длина укладки на резервуаре
- `backend/app/formulas/electrical/commercial.py` — commercial ranking
- `backend/app/formulas/electrical/common.py` — монтажный запас 1.1
- `backend/app/formulas/electrical/mineral.py` — заглушка (NotImplementedError)
- `backend/app/schemas/calculation.py` — схемы параметров/результатов

## Диспетчеризация По Типу Кабеля

`_calculate_electrical_result()` выбирает формулу строго по `cable_type`:

| `cable_type` | Формула | Линейка |
|---|---|---|
| `self_regulating` | `calc_self_regulating` | ТЛТ |
| `self_regulating_tt` | `calc_self_regulating_tt` | ТТН/ТТВ/ТТХ |
| `single_core` | `calc_resistive_single_core` | ТТ Р1 |
| `three_core` | `calc_resistive_three_core` | ТТ Р3 |
| `mineral`, `skin` | — | `CalculationError`: формула не реализована |

Для ТЛТ и ТТН/ТТВ/ТТХ после расчёта `request.data["supply_voltage"]`
перезаписывается фактическим паспортным `voltage` выбранной строки.

## Базовая Длина Обогрева

`_base_cable_length()`:

```text
если объект — резервуар и задана геометрия укладки:
    base_length = compute_tank_cable_length(...)   # периметр-укладка
иначе (труба):
    base_length = results.effective_length          # уже включает локальные элементы
                  or params.pipe_length or params.height or 1.0
```

Важно: для трубы электрический расчёт идёт по `effective_length`, потому что
теплорасчёт уже включил локальные элементы в эту длину. Дублирования нет.

`compute_tank_cable_length()` (cable_geometry.py):

```text
perimeter (cylindrical)   = π × diameter
perimeter (rectangular)   = 2 × (length + width)
N = (perimeter / 2) × (heating_height / laying_step)   [м]
laying_step ∈ [0.1, 0.4] м;  heating_height > 0
```

## Контракт «не удвоить коэффициент запаса»

Это центральное правило передачи теплопотери в электрический подбор.
`_required_power_per_meter()` / `required_heat_loss` строятся по-разному в
зависимости от того, применяет ли электрическая формула `K` сама.

### Труба, ТЛТ и ТТН/ТТВ/ТТХ

Формула сама домножает на `safety_factor`. Значит на вход идёт мощность
**без** `K`:

```text
required_power_per_meter = heat_loss_per_meter × location_factor
```

`heat_loss_per_meter` из теплорасчёта не содержит `K` (см.
`heat-loss/pipe-algorithm.md`), `location_factor` остаётся.

### Резервуар, ТЛТ и ТТН/ТТВ/ТТХ

`total_heat_loss` резервуара уже содержит `K`. Чтобы формула не применила `K`
второй раз, сервис делит обратно и переводит в Вт/м кабеля по длине укладки:

```text
Q_без_K = total_heat_loss / safety_factor       # _tank_heat_loss_without_double_safety
required_power_per_meter = Q_без_K / base_length # base_length = длина укладки на баке
```

Деление включает и часть `Q_доп`, иначе она была бы умножена на `K` второй раз.

### Резистивные ТТ Р1 / ТТ Р3

Резистивная формула не применяет `safety_factor` повторно — целевая величина
это полные ватты:

```text
required_heat_loss = total_heat_loss            # Q уже с K (труба и резервуар)
```

Кабель подбирается так, чтобы `total_power ≥ required_heat_loss`.

Контракт «один K» залочен тестами `test_no_double_safety.py` /
`TestNoDoubleSafetyFactor`.

## Коэффициент Навива (winding_coefficient)

`_winding_coefficient()`:

```text
если задан winding_pitch (мм):
    pitch == 0            -> k = 1.0
    труба:
        pitch_m должен быть > наружного диаметра, иначе ValueError
        k = sqrt(1 + (π × D / pitch_m)²)
        k проверяется по диаметральному лимиту (cap)
иначе:
    k = override/param winding_coefficient
        или для трубы с диаметром: min(default, cap)
        или default
```

Дефолт `default` зависит от типа кабеля: ТЛТ → `1.0`, ТТН/ТТВ/ТТХ → `1.1`,
резистивные → `1.0`.

ТНП-лимит максимального `k` по наружному диаметру трубы
(`_max_winding_coefficient_for_diameter`):

| Диаметр D, мм | Максимальный k |
|---:|---:|
| `D < 57` | 1.0 |
| `D = 57` | 1.1 |
| `57 < D ≤ 75` | 1.2 |
| `75 < D ≤ 89` | 1.3 |
| `89 < D ≤ 108` | 1.4 |
| `D > 108` | 1.5 |

Превышение лимита → `ValueError`. Для не-трубных объектов лимит не проверяется.

## Монтажный Запас Длины

`common.cable_order_length()`:

```text
order_cable_length = installed_cable_length × 1.1   # CABLE_LENGTH_FACTOR = 1.1
```

Все формулы возвращают `cable_length` (= `installed_cable_length`) и
`order_cable_length` отдельно. В спецификацию идёт длина заказа.

## Commercial Ranking

Для auto-подбора (ТЛТ, резистивные auto) среди технически подходящих
кандидатов применяется `selection_policy`. Подробности — в
`commercial-ranking.md`. При `technical_minimum` (default) берётся минимальный
по инженерной сортировке кандидат, commercial-данные только прикладываются как
snapshot. Ручной выбор марки помечается `manual_selection`, ranking не
применяется.

## Что Важно Для Дальнейшего Анализа

- Dispatch строго по `cable_type`; `mineral`/`skin` дают понятную ошибку.
- `safety_factor` применяется ровно один раз — место зависит от типа кабеля.
- Для трубы база — `effective_length`, для резервуара — длина укладки по
  периметру.
- `voltage`/`current` берутся по паспорту строки каталога; `supply_voltage` —
  fallback.
- См. также: `self-regulating-tlt-algorithm.md`,
  `self-regulating-tt-algorithm.md`, `resistive-algorithm.md`,
  `commercial-ranking.md`, `electrical-fields.md`.
