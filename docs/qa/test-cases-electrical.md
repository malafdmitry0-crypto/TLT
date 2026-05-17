# TC-ELEC: Электротехнический расчёт

## TC-ELEC-01: Расчёт саморегулирующегося кабеля с явным указанием марки

**Автоматизировано:** ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_valid_selection`  
**Автоматизировано:** ✅ (integration) `test_calculations.py::TestElectricalCalculation::test_electrical_calc_returns_all_fields`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать объект `pipe` с рассчитанными теплопотерями | `object_id` |
| 2 | `POST /api/v1/calc/electrical` с `cable_type=self_regulating`, `cable_mark=ТЛТ-25` | HTTP 200 |
| 3 | Проверить `selected_cable` | `"ТЛТ-25"` |
| 4 | Проверить `cable_length` | `pipe_length` — расчётная/уложенная длина без заказного запаса |
| 5 | Проверить `order_cable_length` | `cable_length × 1.1` (запас 10% по BR-CABLE-02) |
| 6 | Проверить `total_power` | `25 × cable_length` Вт |
| 7 | Проверить `current` | `total_power / 220` А |
| 8 | Проверить `voltage` | `220` В |

**Тело запроса:**
```json
{
  "object_id": "<uuid>",
  "cable_type": "self_regulating",
  "variant_number": 1,
  "data": {
    "required_power_per_meter": 20,
    "cable_mark": "ТЛТ-25",
    "supply_voltage": 220,
    "ambient_temperature": -30,
    "pipe_length": 50,
    "safety_factor": 1.1
  }
}
```

> **Примечание:** `cable_length = 50 м`, `order_cable_length = 50 × 1.1 = 55 м`.

---

## TC-ELEC-02: Автоматический подбор кабеля

**Автоматизировано:** ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_auto_selection_when_mark_missing`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Запрос с `cable_mark=ТЛТ-999` (несуществующая) и `required_power_per_meter=20` | HTTP 200 |
| 2 | Система автоматически выбирает следующий достаточный кабель | `selected_cable=ТЛТ-25` (20×1.1=22 < 25 Вт/м) |

---

## TC-ELEC-03: Коэффициент запаса при подборе кабеля

**Автоматизировано:** ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_safety_factor_applied`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Запрос: `required_power_per_meter=22`, `safety_factor=1.5`, `cable_mark=ТЛТ-999` | HTTP 200 |
| 2 | Требуется: `22×1.5=33 Вт/м` | Подбирается `ТЛТ-40` |

---

## TC-ELEC-03A: Автоподбор ТЛТ увеличивает число ниток

**Автоматизировано:** ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_auto_selection_can_increase_threads`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Запрос `self_regulating` без `cable_mark` и без `number_of_threads`, где одной нитки ТЛТ-100 недостаточно | HTTP 200 |
| 2 | Алгоритм перебирает `N=1..3` | Подобран кабель с `num_circuits > 1` |
| 3 | Проверить source metadata | `requested_number_of_threads=null`, `applied_number_of_threads=num_circuits`, `number_of_threads_source=auto` |

---

## TC-ELEC-03B: Ручные нитки не изменяются алгоритмом

**Автоматизировано:** ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_manual_threads_are_respected`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Запрос `self_regulating` с явным `number_of_threads=2` | Алгоритм проверяет только 2 нитки |
| 2 | Проверить результат | `requested_number_of_threads=2`, `applied_number_of_threads=2`, `number_of_threads_source=manual` |
| 3 | Повторный batch-пересчёт без ручных ниток | Auto/default результат не должен стать новым ручным `params.number_of_threads` |

---

## TC-ELEC-04: Требуемая мощность превышает максимум каталога

**Автоматизировано:** ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_insufficient_cable_raises`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Запрос с `required_power_per_meter=1000` | HTTP 400 или 422 |
| 2 | Проверить сообщение ошибки | «Не найден кабель» |

---

## TC-ELEC-05: Явный кабель не обеспечивает требуемую мощность

**Автоматизировано:** ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_cable_below_required_power_raises`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `cable_mark=ТЛТ-10` (10 Вт/м), `required_power_per_meter=20`, `ambient_temperature=-60` | HTTP 400 или 422 |
| 2 | Проверить сообщение | «не обеспечивает» |

---

## TC-ELEC-06: Получение списка доступных кабелей для объекта

**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /api/v1/calc/cable-options/{object_id}` | HTTP 200 |
| 2 | Проверить массив | Содержит модели из `cables_tlt.json` |
| 3 | Для каждого кабеля | `model`, `power_per_meter`, `max_temperature` |

---

## TC-ELEC-07: Расчёт типа кабеля без поставленной формулы

**Автоматизировано:** ✅ (integration) `test_calculations.py::TestElectricalCalculation::test_unsupported_cable_type_returns_400`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `POST /api/v1/calc/electrical` с `cable_type=mineral` | HTTP 400 |
| 2 | Сообщение | «нет расчётной формулы/каталога»; расчётно поддержаны ТЛТ, ТТН/ТТВ/ТТХ, ТТ Р1 и ТТ Р3 |

---

## TC-ELEC-08: Несколько вариантов расчёта для одного объекта

**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Расчёт с `variant_number=1`, `cable_mark=ТЛТ-10` | Создана запись с `variant_number=1` |
| 2 | Расчёт с `variant_number=2`, `cable_mark=ТЛТ-25` | Создана отдельная запись |
| 3 | Оба варианта привязаны к одному `object_id` | Можно сравнить |

---

## TC-ELEC-09: Список электрорасчётов проекта

**Автоматизировано:** ✅ (integration) `test_calculations.py::TestElectricalCalculation::test_list_electrical_calcs_for_project`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /api/v1/calc/electrical?project_id=<uuid>` | HTTP 200 |
| 2 | Проверить структуру каждого элемента | `id`, `object_id`, `cable_type`, `cable_mark`, `variant_number`, `results` |
| 3 | Поле `results` содержит | `selected_cable`, `cable_length`, `total_power`, `current`, `voltage` |
| 4 | Пустой проект (без расчётов) | `[]` |

---

## TC-ELEC-10: Несуществующий object_id

**Автоматизировано:** ✅ (integration) `test_calculations.py::TestElectricalCalculation::test_nonexistent_object_returns_400`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `POST /api/v1/calc/electrical` с несуществующим `object_id` | HTTP 400 |
| 2 | Сообщение содержит | «не найден» |

---

## TC-ELEC-11: Запас длины кабеля (BR-CABLE-02)

**Автоматизировано:** ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_order_cable_length_has_10_percent_factor`
**Автоматизировано:** ✅ (integration) `test_calculations.py::TestElectricalCalculation::test_order_cable_length_includes_10_percent_factor`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Расчёт с `pipe_length=100` | `cable_length = 100`, `order_cable_length = 110` |
| 2 | Расчёт с `pipe_length=50`  | `cable_length = 50`, `order_cable_length = 55` |

---

## Справочник кабелей ТЛТ (встроенный)

| Марка | Мощность, Вт/м | T_max, °C | T_min, °C |
|-------|----------------|-----------|-----------|
| ТЛТ-10 | 10 | 65 | -40 |
| ТЛТ-15 | 15 | 65 | -40 |
| ТЛТ-20 | 20 | 65 | -40 |
| ТЛТ-25 | 25 | 85 | -50 |
| ТЛТ-30 | 30 | 85 | -50 |
| ТЛТ-40 | 40 | 110 | -50 |
| ТЛТ-50 | 50 | 110 | -50 |
| ТЛТ-60 | 60 | 120 | -55 |
| ТЛТ-75 | 75 | 120 | -55 |
| ТЛТ-100 | 100 | 150 | -60 |

---

## TC-ELEC-12: Персистентные ошибки электрорасчёта

**Автоматизировано:** Бэкенд покрыт в `test_calculations.py` (upsert); UI — мануальный

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать объект с параметрами, приводящими к требуемой мощности > 100 Вт/м | `is_valid=true` (теплопотери посчитаны) |
| 2 | `POST /calc/electrical/batch` | HTTP 200, `errors` содержит запись для объекта |
| 3 | В БД `electrical_calculations` | Строка существует: `cable_mark=null`, `results={"error": "..."}` |
| 4 | UI: открыть `/workspace/elec-calc` | Карточка объекта показывает красный Alert с текстом ошибки |
| 5 | Перезагрузить страницу (F5) | Ошибка видна и после reload (не теряется) |
| 6 | Исправить параметры объекта (уменьшить мощность) | `is_valid=true` |
| 7 | Повторный `POST /calc/electrical/batch` | Новая строка НЕ создаётся (upsert); `results` заменяется на успешный результат, `cable_mark` ≠ null |
| 8 | Sidebar: после 100% успешных расчётов | Появляется ✓-чекмарк на «Электротехнический расчёт» |
| 9 | При наличии хотя бы одной ошибки | ✓-чекмарк на Sidebar/WorkspacePage НЕ выставляется |

---

## TC-ELEC-13: Full-version auto-подбор резистивного кабеля ТТ Р1/ТТ Р3

**Автоматизировано:** ✅ (unit) `test_resistive.py::test_auto_vsdx_selects_u_n_m_by_passport_resistance`
**Автоматизировано:** ✅ (service) `test_calculation_service_unit.py::test_resistive_electrical_data_uses_db_policy_coefficients_with_fallbacks`
**Автоматизировано:** ✅ (qa-agent) `AlgorithmOracle.test.ts::evaluates full-version resistive VSDX auto selection`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Запустить batch/формульный расчёт с `cable_type=single_core` или `three_core` без `selection_mode=manual` | Используется `selection_mode=auto` |
| 2 | Проверить результат | Есть `scheme_threads=N`, `scheme_count=M`, `voltage=U`, `p2_w_m`, `p3_w_m`, `l1_m` или `l2_m` |
| 3 | Проверить ограничение мощности | `p2_w_m <= p3_w_m` |
| 4 | Проверить покрытие теплопотерь | `linear_power_w_m >= required_linear_power_w_m` |
| 5 | Проверить ток | `current <= max_current_limit_a` |
| 6 | Передать коэффициенты `resistive_max_current_a`, `resistive_max_linear_power_w_m`, `resistive_max_parallel_schemes` | Расчёт использует БД/override значения; при отсутствии работает fallback |

---

## TC-ELEC-14: Коммерческое ранжирование ТЛТ-автоподбора

**Автоматизировано:**

- ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_lowest_cost_uses_total_order_cost`
- ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_lowest_cost_falls_back_without_prices`
- ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_fastest_delivery_and_in_stock_do_not_treat_null_as_zero`
- ✅ (unit) `test_self_regulating.py::TestSelfRegulating::test_preferred_supplier_and_balanced_fallback`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Запустить ТЛТ-автоподбор с `selection_policy=lowest_cost` | Выбор идёт по `total_cost = required_order_length × price_per_meter`, а не только по цене за метр |
| 2 | Указать `order_multiple_m` и `min_order_quantity_m` | Заказная длина учитывает кратность и минимальную партию |
| 3 | Запустить `fastest_delivery` при `lead_time_days=null` у части кабелей | `null` не считается нулём и не выигрывает у известного срока |
| 4 | Запустить `in_stock` при `stock_quantity_m=null` | `null` не считается нулём; используется `stock_status` или fallback |
| 5 | Запустить `preferred_supplier` | Учитываются `is_preferred` и `supplier_priority` |
| 6 | Запустить `balanced` без утверждённых весов | Возвращается controlled fallback: `applied_selection_policy=technical_minimum` и warning |
| 7 | Проверить результат | Есть `selection_policy`, `applied_selection_policy`, `selection_reason`, `candidate_count`, `commercial`, `warnings` |
