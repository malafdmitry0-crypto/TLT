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
    "insulation_material": "mineral_wool_boards_120",
    "insulation_temperature_basis": "outdoor_winter",
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
| 2 | `PUT /api/v1/projects/{pid}/objects/{oid}` с текущей `version` — уменьшить толщину изоляции | HTTP 200, `version` увеличена на 1 |
| 3 | `results.heat_loss_per_meter` | `> q_old` (тоньше изоляция — больше потери) |

---

## TC-OBJ-02A: Optimistic lock при параллельном обновлении объекта

**Автоматизировано:** ✅ `test_objects.py::TestObjectsLifecycle::test_update_object_stale_version_returns_conflict`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать объект и запомнить его `version` | `version = N` |
| 2 | Выполнить `PUT /api/v1/projects/{pid}/objects/{oid}` с `version=N` | HTTP 200, в ответе `version=N+1` |
| 3 | Повторить `PUT` с устаревшей `version=N` | HTTP 409 |
| 4 | Проверить `detail` | `Объект был изменён в другой вкладке, перезагрузите.` |

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
| 1 | Добавить трубу с `insulation_layers: [{thickness:0.03, material:mineral_wool_boards_120}, {thickness:0.03, material:polyurethane_products_50}]` и `insulation_temperature_basis=outdoor_winter` | `is_valid=true` |
| 2 | Сравнить с однослойной изоляцией 0.03м | Двухслойная имеет меньше потерь |
| 3 | Добавить 4 слоя | HTTP 422 (лимит 3 слоя) |
| 4 | В UI выбрать 3 слоя, оставить 2-й/3-й слой незаполненными, затем вернуть `1 слой` и сохранить | Поля и ошибки 2-го/3-го слоя очищены; в `params.insulation_layers` сохранён один слой |
| 5 | В UI выбрать справочный материал слоя, вручную изменить `λ` или диапазон T и сохранить | Материал слоя становится `other`; в `params.insulation_layers` сохранены `conductivity` и `temperature_range`, строка без ошибок обязательных полей |

---

## TC-OBJ-07A: Режим tm изоляции соответствует размещению объекта

**Автоматизировано:** ✅ `test_calculations.py::TestHeatLossCalculation::test_non_indoor_pipe_with_indoor_tm_returns_422`, `test_objects.py::TestObjectsLifecycle::test_non_indoor_pipe_with_indoor_tm_is_invalid`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Для наружной трубы указать `insulation_temperature_basis=attic` или `indoor` | Прямой `/calc/heat-loss` возвращает HTTP 422 с ошибкой по режиму `tm`; объект проекта сохраняется только как невалидная строка (`is_valid=false`, `results=null`) |
| 2 | Для подземной трубы указать `insulation_temperature_basis=channel` | Объект проходит подготовку параметров и может быть рассчитан |
| 3 | Для подземной трубы указать `insulation_temperature_basis=attic` | Строка невалидна, ошибка относится к `insulation_temperature_basis` |
| 4 | Для объекта в помещении указать `insulation_temperature_basis=indoor`, `attic` или `basement` | Объект проходит подготовку параметров и может быть рассчитан |

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
| `outer_diameter` | `< 0.0108` | HTTP 422 |
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
| 4 | Повторный импорт того же файла в режиме по умолчанию (`merge`) | `created: 0`, дубли отражены в `skipped_duplicates`, итоговое число объектов не меняется |
| 4a | Повторный импорт с `mode=append` | Строки добавлены как новые объекты |
| 4b | Импорт с `mode=replace` в непустой проект | Старые объекты заменены содержимым файла |
| 5 | Файл без листов «Трубопроводы»/«Резервуары» | HTTP 422, detail содержит «Трубопроводы» |
| 6 | Файл не-xlsx (`.txt`) | HTTP 422 «Ожидается файл .xlsx или .csv» |
| 7 | Строка без материала изоляции | Строка пропущена, её ошибка в `errors[]` с номером строки |
| 8 | Файл содержит больше строк, чем лимит объектов проекта | Уже созданные объекты остаются, пропущенное число строк отражено в `skipped_limit` и UI результата |

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
| 6 | Повторный CSV-импорт без указания режима | Дубли не создаются, `skipped_duplicates` > 0 |
| 7 | CSV превышает лимит объектов проекта | HTTP 200, `created` содержит сохранённые строки, `skipped_limit` содержит строки, не импортированные из-за лимита |

---

## TC-OBJ-14: Шаблон для импорта

**Автоматизировано:** ✅ (`app/tests/integration/api/test_import_excel.py`)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /objects/import-template?format=xlsx` | HTTP 200, файл `.xlsx`, содержит листы «Трубопроводы» + «Резервуары» |
| 2 | `GET /objects/import-template?format=csv` | HTTP 200, `text/csv`, первая колонка «Тип» |
| 3 | `GET /objects/import-template?format=unknown` | HTTP 422 |

---

## TC-OBJ-15: Изменение порядка объектов через backend reorder

**Автоматизировано:** Backend ✅ (`test_objects.py`)<br>
**UI-статус:** row drag-and-drop в активном `HeatCalcPage.tsx` сейчас не подключён;
проверять как frontend backlog, не как готовый пользовательский сценарий.

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать 3 объекта с `sort_order` 0,1,2 | — |
| 2 | `PUT /objects/reorder` с `{order: [id2, id0, id1]}` | HTTP 200, возвращён список с новым порядком |
| 3 | `PUT /objects/reorder` с неполным списком ID | HTTP 400, порядок в проекте не меняется |

---

## TC-OBJ-16: Excel-режим на больших таблицах

**Автоматизировано:** Frontend unit ✅ `HeatCalcExcelGrid.test.tsx` для DOM-count<br>
**Perf/manual default Glide engine:** `npm --prefix frontend run perf:heat-excel-virtual -- --url=http://localhost:3003 --rows=1000,3000`<br>
**Perf/manual table fallback:** `npm --prefix frontend run perf:heat-excel-virtual -- --url=http://localhost:3003 --rows=1000,3000 --engine=table`<br>
**Normal mode Glide default:** обычный режим по умолчанию использует Glide. Fallback на старую AntD Table включается через `?normalTableEngine=table` или `localStorage.heatcalc.normalTableEngine = "table"`. В Glide normal header click переключает сортировку, правая зона заголовка / правый клик по заголовку открывает тот же фильтр, что и AntD Table; индикаторы сортировки и фильтра видны прямо в canvas-заголовке. Номера строк отображаются в левом row-header как в Excel; отдельная колонка `№` в normal Glide не показывается. Normal Glide не показывает page buttons: при скролле вниз он догружает следующую страницу через backend `page_info.next_cursor` и добавляет строки в текущий список.

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Открыть HeatCalc на проекте с 1000 строк и включить Excel-режим | Таблица открывается как virtual grid без Excel-пагинации |
| 2 | Проверить DOM-count строк | В DOM только viewport + overscan, не все 1000 строк |
| 3 | Проскроллить к последней строке | Скролл до дальней строки выполняется без зависания, DOM-count остаётся ограниченным |
| 4 | Выбрать ячейку и перейти по колонкам внутри той же строки | Меняется только Excel-selection; форма параметров не пересинхронизируется на каждую ячейку |
| 5 | Перейти на другую строку, нажать Enter/F2 или double click | Форма параметров синхронизируется с этой строкой, editor открывается для активной ячейки |
| 6 | Выбрать и отредактировать ячейку после скролла | Editor открывается, draft строки обновляется |
| 7 | Открыть context menu после скролла | Меню Excel-режима открывается для дальней строки |
| 8 | Вставить блок 100×10 | Вставка завершается одним batch-сценарием без массового DOM |
| 9 | Проскроллить ниже последних данных колесом или scrollbar | В конце виден хвост пустых строк ввода; при дальнейшей прокрутке сетка продолжает расти как в Excel |
| 10 | Заполнить одну из последних пустых строк | Строка становится local draft row, ниже автоматически остаётся запас пустых строк для дальнейшего ввода |
| 11 | Сохранить | Сохраняются только заполненные local rows; untouched пустые строки не отправляются в backend |
| 12 | Повторить для 3000 строк | Поведение остаётся работоспособным; DOM-count не растёт до числа строк проекта |
