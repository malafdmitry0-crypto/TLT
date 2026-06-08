# Commercial ranking: выбор среди технически подходящих кабелей

Источник: backend-код `formulas/electrical/commercial.py`. Модуль общий для
ТЛТ и резистивного auto-подбора. Дата сверки с кодом: 2026-06-08.

## Назначение

После того как формула собрала множество **технически подходящих** кандидатов,
`select_commercial_candidate()` выбирает один по `selection_policy`. Технический
отбор (мощность, температуры, ток, схема) всегда первичен; commercial ranking
работает только внутри уже прошедших технику кандидатов.

## Политики (selection_policy)

```text
technical_minimum   # default: min по инженерному technical_key
lowest_cost         # min total_cost
fastest_delivery    # min lead_time_days
in_stock            # подтверждённое наличие
preferred_supplier  # is_preferred / supplier_priority
balanced            # взвешенный score (только при утверждённых весах)
```

`normal_policy()` приводит неизвестное значение к `technical_minimum`.

## Алгоритм Выбора

```text
technical_choice = min(candidates, key=technical_key)
если policy == technical_minimum:
    вернуть technical_choice
ranked_source = кандидаты без is_discontinued (или все, если все discontinued)
применить политику к ranked_source:
    нет данных под политику -> warning + fallback на technical_choice
```

Каждая не-техническая политика имеет tie-break цепочку, заканчивающуюся
`technical_key`, чтобы выбор был детерминированным:

| Политика | Сортировка (по возрастанию) |
|---|---|
| `lowest_cost` | total_cost → stock_rank → lead_time → technical_key |
| `fastest_delivery` | lead_time → stock_rank → total_cost → technical_key |
| `in_stock` | stock_rank → total_cost → lead_time → order_multiple → technical_key |
| `preferred_supplier` | is_preferred → supplier_priority → stock_rank → total_cost → lead_time → technical_key |

`balanced` строит min-max нормализованный взвешенный score по ключам
`cost / delivery / stock / supplier`; применяется **только** если
`balanced_weights_approved = true` и веса/данные достаточны, иначе fallback на
технический подбор с warning.

## Стоимость И Длина Заказа

```text
order_length          = installed_length × 1.1
order_multiple_m      = шаг кратности заказа (default 1)
required_order_length = ceil(order_length / order_multiple) × order_multiple
                        и не меньше min_order_quantity_m
total_cost = required_order_length × price_per_meter + accessory_total_cost
```

`accessory_total_cost` берётся как плоское значение или `per_circuit × circuit_count`.

## Stock Rank

```text
если есть stock_quantity_m: 0 если ≥ required_order_length, иначе 3
иначе по stock_status: in_stock=1, limited=2, прочее=3
```

## Commercial Snapshot

`commercial_snapshot()` возвращает `None`, если у строки нет ни одного
commercial-поля. Иначе — словарь с ценой, валютой, длиной заказа, стоимостью
кабеля/аксессуаров/итого, наличием, сроком, поставщиком, артикулом,
флагами `is_discontinued`/`is_preferred`, версией/утверждением balanced-весов и
`cost_scope` (`cable_only` или `cable_with_accessories`).

## Метаданные Результата

В результат формулы попадают:

```text
selection_policy           # запрошенная политика (нормализованная)
applied_selection_policy   # фактически применённая (может быть technical_minimum как fallback)
selection_reason           # человекочитаемое объяснение
candidate_count
commercial                 # snapshot выбранной строки (или null)
warnings                   # причины fallback / неполноты данных
```

## Что Важно

- Техника всегда первична; commercial никогда не выбирает технически
  непроходной кабель.
- Любая политика при нехватке данных деградирует до `technical_minimum` с
  warning — расчёт не падает.
- Ручной выбор марки помечается `manual_selection`, ranking не запускается.
- Выбор детерминирован: tie-break всегда заканчивается `technical_key`.
