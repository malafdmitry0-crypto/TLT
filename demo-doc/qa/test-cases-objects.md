# TC-OBJ: Объекты проекта и теплотехнический расчёт

## TC-OBJ-01: Добавление объекта (трубопровод) с автоматическим расчётом

**Предусловие:** Создан проект, получен `project_id`  
**Автоматизировано:** ✅ `test_objects.py::TestObjectsLifecycle::test_add_object_triggers_calculation`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `POST /api/v1/projects/{pid}/objects` с параметрами трубы | HTTP 201 |
| 2 | Проверить `is_valid` | `true` |
| 3 | Проверить `results.heat_loss_per_meter` | `> 0` |
| 4 | Проверить `results.total_heat_loss` | `> 0` |
| 5 | Проверить `validation_errors` | `null` |

**Тестовые параметры:**
```json
{
  "object_type": "pipe",
  "params": {
    "outer_diameter": 0.108,
    "insulation_thickness": 0.05,
    "insulation_material": "mineral_wool",
    "ambient_temperature": -30,
    "process_temperature": 150,
    "pipe_length": 100
  }
}
```

---

## TC-OBJ-02: Обновление параметров — автопересчёт

**Автоматизировано:** ✅ `test_objects.py::TestObjectsLifecycle::test_update_object_recalculates`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать объект, запомнить `heat_loss_per_meter` | `q_old` |
| 2 | `PUT /api/v1/projects/{pid}/objects/{oid}` — уменьшить толщину изоляции | HTTP 200 |
| 3 | `results.heat_loss_per_meter` | `> q_old` (тоньше изоляция — больше потери) |

---

## TC-OBJ-03: Объект с невалидным материалом изоляции

**Автоматизировано:** ✅ `test_objects.py::TestObjectsLifecycle::test_invalid_object_marked_invalid`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Добавить объект с `insulation_material: "unknown_material"` | HTTP 201 |
| 2 | Проверить `is_valid` | `false` |
| 3 | Проверить `validation_errors` | Непустой объект с описанием ошибки |

---

## TC-OBJ-04: Расчёт резервуара (cylinder)

**Автоматизировано:** ✅ (unit) `test_tank_heat_loss.py`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Добавить объект `tank` с `shape=cylindrical`, `diameter=2.0`, `height=3.0` | HTTP 201 |
| 2 | Проверить `results.surface_area` | ≈ `π·2·3 + 2·π·1²` ≈ 25.13 |
| 3 | Проверить `results.heat_loss_per_m2` | `> 0` |
| 4 | Проверить `results.total_heat_loss` | ≈ `heat_loss_per_m2 × surface_area` |

---

## TC-OBJ-05: Расчёт трубы с учётом стенки и материала

**Автоматизировано:** ✅ (unit) `test_pipe_heat_loss.py`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Добавить трубу с `wall_thickness=0.004`, `pipe_material=carbon_steel` | HTTP 201 |
| 2 | Сравнить `thermal_resistance` с трубой без стенки | С толщиной стенки — выше |
| 3 | Изменить материал на `stainless_304` | `thermal_resistance` изменится |

---

## TC-OBJ-06: Подземная прокладка трубопровода

**Автоматизировано:** ✅ (unit) `test_pipe_heat_loss.py::TestBuriedPipe`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Добавить трубу с `burial_depth=1.5`, `ground_conductivity=1.5` | HTTP 201, `is_valid=true` |
| 2 | Добавить трубу с `burial_depth=0.05` (меньше радиуса) | `is_valid=false` с ошибкой |

---

## TC-OBJ-07: Многослойная изоляция (до 3 слоёв)

**Автоматизировано:** ✅ (unit) `test_pipe_heat_loss.py::TestMultiLayerInsulation`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Добавить трубу с `insulation_layers: [{thickness:0.03, material:mineral_wool}, {thickness:0.03, material:foam_glass}]` | `is_valid=true` |
| 2 | Сравнить с однослойной изоляцией 0.03м | Двухслойная имеет меньше потерь |
| 3 | Добавить 4 слоя | HTTP 422 (лимит 3 слоя) |

---

## TC-OBJ-08: Локальные элементы (фланцы, арматура)

**Автоматизировано:** ✅ (unit) `test_pipe_heat_loss.py::TestLocalElements`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Добавить трубу с `num_local_elements=5`, `local_element_equiv_length=1.0` | `is_valid=true` |
| 2 | Проверить `effective_length` | `pipe_length + 5·1.0 = L + 5` |
| 3 | Сравнить `total_heat_loss` с трубой без элементов | Больше |

---

## TC-OBJ-09: Пакетный пересчёт всех объектов

**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать проект с 3 объектами (1 валидный, 1 невалидный) | — |
| 2 | `POST /api/v1/calc/heat-loss/batch` с `project_id` | HTTP 200 |
| 3 | Проверить `updated` | 1 (валидный объект пересчитан) |
| 4 | Проверить `failed` | 1 (невалидный) |
| 5 | Проверить `errors` | Массив с описанием ошибки |

---

## TC-OBJ-10: Граничные значения параметров (валидация схемы)

**Автоматизировано:** ✅ (unit) `test_calculation_schemas.py`, `test_pipe_heat_loss.py::TestSchemaValidation`

| Параметр | Граничное значение | Ожидаемый результат |
|----------|--------------------|---------------------|
| `outer_diameter` | `< 0.0108` (DN6) | HTTP 422 |
| `outer_diameter` | `> 3.0` | HTTP 422 |
| `ambient_temperature` | `< -70°C` | HTTP 422 |
| `process_temperature` | `> 600°C` | HTTP 422 |
| `process_temperature ≤ ambient_temperature` | любые допустимые значения | ошибка расчёта |
| `pipe_length` | `< 0.5м` | HTTP 422 |
| `insulation_thickness` | `0` | HTTP 422 |

---

## TC-OBJ-11: Удаление объекта

**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Добавить объект | `object_id` |
| 2 | `DELETE /api/v1/projects/{pid}/objects/{oid}` | HTTP 204 |
| 3 | `GET /api/v1/projects/{pid}/objects` | Объект отсутствует |
| 4 | Связанный ElectricalCalculation | Удалён каскадно |

---

## TC-OBJ-12: Импорт объектов из Excel (.xlsx)

**Автоматизировано:** ✅ (`app/tests/integration/api/test_import_excel.py::TestExcelImport`)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Подготовить xlsx с листами «Трубопроводы» (2 трубы) и «Резервуары» (3 бака разных форм) | — |
| 2 | `POST /api/v1/projects/{pid}/objects/import-excel` с файлом | HTTP 200, `{created: 5, errors: []}` |
| 3 | `GET /api/v1/projects/{pid}/objects` | 5 объектов, все с `is_valid=true` |
| 4 | Повторный импорт того же файла | Снова 5 объектов, итого 10 (не дубликаты по ID) |
| 5 | Файл без листов «Трубопроводы»/«Резервуары» | HTTP 422, detail содержит «Трубопроводы» |
| 6 | Файл не-xlsx (`.txt`) | HTTP 422 «Ожидается файл .xlsx или .csv» |
| 7 | Строка без материала изоляции | Строка пропущена, её ошибка в `errors[]` с номером строки |

---

## TC-OBJ-13: Импорт объектов из CSV

**Автоматизировано:** ✅ (`app/tests/integration/api/test_import_excel.py::TestCsvImport`)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Подготовить CSV (UTF-8 BOM, разделитель `;`) с колонкой «Тип» (труба/резервуар) | — |
| 2 | `POST .../import-excel` с CSV-файлом | HTTP 200, `created` = число валидных строк |
| 3 | CSV без колонки «Тип» | HTTP 422, detail «В CSV не найдена колонка «Тип»» |
| 4 | CSV с разделителем `,` | Парсер автодетектит разделитель |
| 5 | CSV в кодировке CP1251 | Парсер корректно читает |

---

## TC-OBJ-14: Шаблон для импорта

**Автоматизировано:** ✅ (`app/tests/integration/api/test_import_excel.py`)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /objects/import-template?format=xlsx` | HTTP 200, файл `.xlsx`, содержит листы «Трубопроводы» + «Резервуары» |
| 2 | `GET /objects/import-template?format=csv` | HTTP 200, `text/csv`, первая колонка «Тип» |
| 3 | `GET /objects/import-template?format=unknown` | HTTP 422 |

---

## TC-OBJ-15: Изменение порядка (drag-and-drop)

**Автоматизировано:** Backend ✅ (`test_objects.py`) · UI — мануальный / Playwright

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать 3 объекта с `sort_order` 0,1,2 | — |
| 2 | `PUT /objects/reorder` с `{order: [id2, id0, id1]}` | HTTP 200, возвращён список с новым порядком |
| 3 | UI: перетащить строку мышью | Порядок в таблице обновляется, запрос reorder отправлен |
| 4 | UI: клик по кнопке Edit/Delete в строке | Drag не срабатывает (`activationConstraint=6px`) |
