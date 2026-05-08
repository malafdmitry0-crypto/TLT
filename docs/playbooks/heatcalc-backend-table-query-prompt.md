# HeatCalc Backend Table Query Prompt

## Контекст

В таблице исходных данных HeatCalc уже есть экранные настройки колонок, фильтры,
поиск и сортировка. Сейчас это UI-слой: он помогает находить строки, но работает
поверх списка объектов, который frontend получает целиком через
`GET /api/v1/projects/{project_id}/objects`.

Для маленьких проектов этого достаточно. Для больших проектов таблица должна
уметь запрашивать только нужную страницу данных, а фильтры и сортировка должны
выполняться на backend. Это нужно для скорости, устойчивой работы на больших
наборах объектов и одинакового поведения для гостя и зарегистрированного
пользователя.

## Цель

Добавить backend query-слой для таблицы HeatCalc:

- фильтрацию по полям таблицы;
- сортировку по полям таблицы;
- поиск по текстовым полям;
- обычную постраничную пагинацию через `LIMIT/OFFSET`;
- метаданные для счётчиков и состояния таблицы.

Главное правило: этот слой нужен только для поиска и навигации по таблице.
Он не должен менять расчёты, порядок объектов, данные объекта, экспорт или
статусы проекта.

Фильтры и сортировки таблицы должны выполняться на backend. Frontend только
формирует query, показывает состояние controls и рендерит `items`, полученные от
`POST /objects/query`. После подключения backend-query запрещено фильтровать или
сортировать полный список объектов локально как основной сценарий таблицы.

## Не Менять

Не ломать текущий контракт:

- `GET /api/v1/projects/{project_id}/objects` продолжает возвращать полный
  список объектов проекта в проектном порядке;
- расчёт теплопотерь продолжает брать полный список объектов проекта;
- электротехнический расчёт продолжает брать полный список объектов проекта;
- экспорт XLSX/CSV/PDF/DOCX не зависит от экранных фильтров таблицы;
- `sort_order` не меняется из-за сортировки таблицы;
- `ProjectObject.params`, `results`, `is_valid`, `validation_errors` не
  меняются из-за фильтров, поиска, сортировки или пагинации;
- настройки видимых колонок таблицы не смешиваются с фильтрами и пагинацией.

Фильтры, поиск, сортировка и пагинация - это read-only query state.

## Рекомендуемый API

Добавить endpoints:

```http
POST /api/v1/projects/{project_id}/objects/query
GET  /api/v1/projects/{project_id}/objects/query-capabilities?object_type=pipe
```

Причина: фильтры по множеству колонок, range-условия, enum-условия и параметры
страницы удобнее и надёжнее передавать структурированным JSON, а не кодировать в
длинную query string. Старый `GET /objects` остаётся простым и совместимым.

`query-capabilities` нужен, чтобы frontend не хардкодил типы фильтров,
сортируемость, единицы измерения и доступные операции. Backend registry является
источником истины; frontend только строит UI по capabilities.

### Request

```json
{
  "object_type": "pipe",
  "page": 1,
  "page_size": 100,
  "search": {
    "text": "минеральная",
    "columns": ["name", "insulation_material"]
  },
  "filters": [
    {
      "key": "pipe_outer_diameter",
      "op": "range",
      "min": 50,
      "max": 300,
      "include_empty": false
    },
    {
      "key": "insulation_material",
      "op": "in",
      "values": ["Минеральная вата", "Пеностекло"],
      "include_empty": false
    }
  ],
  "sort": {
    "key": "process_temperature",
    "dir": "desc"
  }
}
```

Правила request:

- `object_type` обязателен: `pipe` или `tank`;
- `page` по умолчанию `1`, минимум `1`;
- `page_size` по умолчанию `100`, максимум `200`;
- backend вычисляет `offset = (page - 1) * page_size`;
- `search` опционален;
- `filters` опционален, пустой массив равен отсутствию фильтров;
- `sort` опционален, без него используется проектный порядок;
- все `key` должны проходить через whitelist registry;
- неизвестный `key`, `op`, `object_type`, `sort.dir` или несовместимый тип
  фильтра возвращает `422`.

### Response

```json
{
  "items": [],
  "page_info": {
    "page": 1,
    "page_size": 100,
    "offset": 0,
    "total_pages": 1,
    "has_next_page": false,
    "has_previous_page": false
  },
  "counts": {
    "total": 17,
    "by_type": {
      "pipe": 8,
      "tank": 9
    },
    "filtered": 5
  },
  "query": {
    "object_type": "pipe",
    "sort": {
      "key": "process_temperature",
      "dir": "desc"
    }
  }
}
```

Правила response:

- `items` использует тот же shape, что `ProjectObjectResponse`;
- `counts.total` - все объекты проекта;
- `counts.by_type` - все объекты проекта по типу, без учёта фильтров;
- `counts.filtered` - количество объектов выбранного типа после фильтров и
  поиска;
- счётчики нужны для UI badges и не должны вычисляться по длине текущей
  страницы;
- если точный `filtered` станет дорогим на больших объёмах, можно позже добавить
  `filtered_is_estimated`, но в текущем проекте лучше возвращать точное число.
- `page_info.total_pages` вычисляется по `counts.filtered` и `page_size`;
- если пользователь запросил страницу за пределами результата, вернуть пустой
  `items` и корректный `page_info`, без ошибки.

## Capabilities Endpoint

`GET /api/v1/projects/{project_id}/objects/query-capabilities?object_type=pipe`
возвращает контракт таблицы для выбранного типа объектов. Endpoint project-scoped,
потому что часть опций зависит от проекта, прав доступа и справочников.

### Response

```json
{
  "version": 1,
  "object_type": "pipe",
  "default_page_size": 100,
  "max_page_size": 200,
  "default_sort": {
    "key": "sort_order",
    "dir": "asc"
  },
  "search": {
    "enabled": true,
    "max_text_length": 120,
    "default_columns": ["name", "pipe_dn", "pipe_material", "insulation_material"]
  },
  "fields": [
    {
      "key": "pipe_outer_diameter",
      "label": "Наружный диаметр",
      "title": "Ø, мм",
      "data_type": "number",
      "unit": "mm",
      "filter": {
        "enabled": true,
        "ops": ["range"],
        "include_empty": true
      },
      "sort": {
        "enabled": true,
        "type": "number",
        "nulls": "last",
        "collation": null
      },
      "options": null
    },
    {
      "key": "insulation_material",
      "label": "Материал ИЗ",
      "title": "Материал ИЗ",
      "data_type": "enum",
      "unit": null,
      "filter": {
        "enabled": true,
        "ops": ["in"],
        "include_empty": true
      },
      "sort": {
        "enabled": true,
        "type": "label",
        "nulls": "last",
        "collation": "db_ru"
      },
      "options": {
        "mode": "inline",
        "items": [
          {
            "value": "mineral_wool",
            "label": "Минеральная вата"
          },
          {
            "value": "foam_glass",
            "label": "Пеностекло"
          }
        ],
        "include_empty": true
      }
    },
    {
      "key": "index",
      "label": "Номер строки",
      "title": "№",
      "data_type": "display",
      "unit": null,
      "filter": {
        "enabled": false,
        "ops": [],
        "reason": "display_only"
      },
      "sort": {
        "enabled": false,
        "reason": "page_position"
      },
      "options": null
    }
  ]
}
```

Правила capabilities:

- `fields` должен содержать все ключи колонок выбранного `object_type`, включая
  поля без фильтра и сортировки;
- unsupported-поля не пропускать: возвращать `filter.enabled=false`,
  `sort.enabled=false` и короткий `reason`;
- `key`, `label`, `title`, `data_type`, `unit`, `filter`, `sort`, `options`
  обязательны для каждого поля;
- `data_type` допустим только из whitelist: `display`, `text`, `number`,
  `enum`, `boolean`;
- `filter.ops` допустим только из whitelist: `contains`, `range`, `in`,
  `equals`;
- `sort.type` допустим только из whitelist: `text`, `number`, `label`,
  `enum_rank`;
- для `text` и `label` sort backend должен вернуть `sort.collation`, чтобы
  frontend понимал, что порядок задаёт сервер;
- `unit` указывается в display-unit, то есть в тех единицах, которые вводит
  пользователь;
- `default_columns` для поиска берутся из backend registry, а не из frontend;
- enum/multi-select options приходят прямо в `field.options.items`, без
  отдельного endpoint;
- `options.mode` допустим только из whitelist: `inline`, `dictionary`,
  `project_values`, `derived`;
- `dictionary` означает, что список сформирован backend из справочника;
- `project_values` означает, что список сформирован backend по значениям текущего
  проекта;
- `derived` означает, что значения рассчитаны backend accessor, например
  `pipe_dn`;
- `options.items` должны быть отсортированы по label или явному `sort_rank`;
- `options.items` не являются источником безопасности: `POST /objects/query`
  всё равно валидирует присланные values по registry;
- response можно кешировать на frontend по `(project_id, object_type, version)`.

Capabilities - это контракт UI, но не security boundary. `POST /objects/query`
всё равно обязан валидировать `key`, `op`, `sort` и единицы по backend registry.

## Обычная Пагинация

Использовать обычную постраничную пагинацию через SQL `LIMIT/OFFSET`.

Базовый порядок без пользовательской сортировки:

```text
sort_order ASC, id ASC
```

Порядок с пользовательской сортировкой:

```text
<sort expression> <dir>, sort_order ASC, id ASC
```

Требования:

- первая страница: `page=1`, `page_size=100`, `offset=0`;
- вторая страница при дефолтном размере: `page=2`, `offset=100`;
- `page_size=100` - базовый размер страницы для первого запуска;
- максимум `page_size=200`, чтобы не возвращать слишком тяжёлый ответ;
- `offset = (page - 1) * page_size`;
- `has_next_page = page * page_size < counts.filtered`;
- `has_previous_page = page > 1`;
- `total_pages = ceil(counts.filtered / page_size)`;
- сортировка стабильная;
- при одинаковом значении сортируемого поля порядок определяется через
  `sort_order`, затем `id`;
- `null`, пустые строки и прочерки всегда уходят в конец и для `asc`, и для
  `desc`;
- при смене фильтра, поиска, сортировки или типа объекта frontend должен
  возвращаться на `page=1`;
- backend не должен пересчитывать `page` автоматически, если запрошенная
  страница стала пустой из-за изменения данных; frontend сам решает, перейти ли
  на последнюю доступную страницу.

## Registry Полей

Нельзя строить фильтры и сортировки по произвольным строкам из клиента.
Нужен backend registry полей таблицы.

Каждое поле registry должно описывать:

```python
TableQueryField(
    key="pipe_outer_diameter",
    object_type="pipe",
    data_type="number",
    source="params.outer_diameter",
    storage_unit="m",
    display_unit="mm",
    filter_ops={"range", "empty"},
    sortable=True,
    sort_nulls="last",
)
```

В registry должны быть:

- `key` - стабильный ключ, совпадающий с frontend column key или явно
  сопоставленный с ним;
- `object_type` - `pipe`, `tank` или `both`;
- `data_type` - `text`, `number`, `enum`, `boolean`;
- источник значения: колонка БД, JSONB path или derived accessor;
- единица хранения и единица отображения;
- доступные операции фильтрации;
- SQL expression для сортировки, если поле сортируемое;
- SQL expression или backend accessor для фильтрации;
- правило для пустых значений;
- человекочитаемый label для ошибок и документации.

Все поля, которые могут быть показаны в таблице через настройки колонок, должны
быть представлены в registry. Если поле пока нельзя фильтровать или сортировать
на backend, это должно быть явно отражено в registry и в API response
capabilities. Нельзя молча игнорировать фильтр.

## Явный Backend Whitelist Полей

Backend должен поддерживать фильтры и сортировки только по полям из этого
списка. UI показывает controls только там, где в capabilities есть
`filterable=true` или `sortable=true`.

Общее правило выбора:

- фильтруем и сортируем доменные поля, по которым пользователь реально ищет
  объект: название, геометрия, материалы, температуры, среда, электропараметры;
- не фильтруем и не сортируем служебные display-only поля, если у них нет
  устойчивого доменного смысла;
- для derived-полей backend должен считать то же значение, что frontend, а не
  парсить отрисованный текст;
- если поле есть в настройках колонок, но не поддерживает фильтр/сортировку, это
  явно отражается в capabilities.

### Трубы

| Ключ | Фильтр | Сортировка | Источник / правило |
|---|---|---|---|
| `index` | нет | нет | Номер строки зависит от страницы и текущей сортировки; не является полем объекта |
| `type` | нет | нет | Тип задан через `object_type=pipe`, отдельный фильтр по колонке не нужен |
| `name` | `text contains` | да, text | `params.name`, fallback label не использовать для backend-фильтра |
| `pipe_outer_diameter` | `number range`, мм | да, number | `params.outer_diameter`, хранение в м, request в мм |
| `pipe_dn` | `enum in`, `include_empty` | да, numeric DN | derived из `params.outer_diameter` через тот же DN resolver, что frontend |
| `pipe_length` | `number range`, м | да, number | `params.pipe_length` |
| `pipe_wall_thickness` | `number range`, мм | да, number | `params.wall_thickness`, хранение в м, request в мм |
| `pipe_material` | `text contains` + `in` по distinct values | да, text | `params.pipe_material` |
| `pipe_lambda` | `number range`, Вт/мК | да, number | `params.pipe_lambda` |
| `pipe_lambda_mode` | `enum in` | нет | `params.pipe_lambda_mode`; сортировка по режиму малоценна |
| `placement` | `enum in` | да, enum label | `params.placement ?? params.location` |
| `insulation_layer_count` | `number range` | да, number | `params.insulation_layer_count`, fallback `len(params.insulation_layers)` |
| `insulation_thickness` | `number range`, мм | да, number | `params.insulation_thickness`, хранение в м, request в мм |
| `insulation_material` | `enum in`, `include_empty` | да, material label | `params.insulation_material`, label из справочника изоляции |
| `first_insulation_lambda` | `number range`, Вт/мК | да, number | `params.insulation_layers[0].conductivity` |
| `second_insulation_thickness` | `number range`, мм | да, number | `params.insulation_layers[1].thickness`, хранение в м, request в мм |
| `second_insulation_material` | `enum in`, `include_empty` | да, material label | `params.insulation_layers[1].material` |
| `second_insulation_lambda` | `number range`, Вт/мК | да, number | `params.insulation_layers[1].conductivity` |
| `third_insulation_thickness` | `number range`, мм | да, number | `params.insulation_layers[2].thickness`, хранение в м, request в мм |
| `third_insulation_material` | `enum in`, `include_empty` | да, material label | `params.insulation_layers[2].material` |
| `third_insulation_lambda` | `number range`, Вт/мК | да, number | `params.insulation_layers[2].conductivity` |
| `insulation_cover_material` | `text contains` + `in` по distinct values | да, text | `params.insulation_cover_material` |
| `process_temperature` | `number range`, °C | да, number | `params.process_temperature` |
| `ambient_temperature` | `number range`, °C | да, number | `params.ambient_temperature` |
| `ambient_temperature_source` | `enum in` | нет | `params.ambient_temperature_source`; это источник значения, не рабочий порядок |
| `max_ambient_temperature` | `number range`, °C | да, number | `params.max_ambient_temperature` |
| `max_process_temperature` | `number range`, °C | да, number | `params.max_process_temperature` |
| `wind_speed` | `number range`, м/с | да, number | `params.wind_speed` |
| `wind_speed_source` | `enum in` | нет | `params.wind_speed_source`; это источник значения |
| `alpha_vnesh` | `number range`, Вт/м²К | да, number | `params.alpha_vnesh` |
| `environment` | `enum in` | да, enum label | `params.environment` |
| `zone_classification` | `enum in` | да, enum label | `params.zone_classification` |
| `temperature_group` | `enum in` + `text contains` | да, text | `params.temperature_group` |
| `climate_city` | `text contains` | да, text | `params.climate_city` |
| `climate_region` | `text contains` | да, text | `params.climate_region` |
| `climate_key` | `text contains` | нет | `params.climate_key`; технический ключ климата |
| `climate_temperature_basis` | `number range` | да, number | `params.climate_temperature_basis` |
| `burial_depth` | `number range`, м | да, number | `params.burial_depth`; актуально для underground |
| `ground_type` | `text contains` + `in` по distinct values | да, text | `params.ground_type`; актуально для underground |
| `ground_conductivity` | `number range`, Вт/мК | да, number | `params.ground_conductivity`; актуально для underground |
| `min_switch_temperature` | `number range`, °C | да, number | `params.min_switch_temperature` |
| `supply_voltage` | `number range`, В | да, number | `params.supply_voltage` |
| `safety_factor` | `number range` | да, number | `params.safety_factor` |
| `steam_tracing` | `boolean equals` | нет | `params.steam_tracing`; сортировка по Да/Нет не нужна |
| `valve_count` | `number range`, шт | да, number | `params.valve_count` |
| `flange_count` | `number range`, шт | да, number | `params.flange_count` |
| `support_count` | `number range`, шт | да, number | `params.support_count` |
| `local_element_equiv_length` | `number range`, м | да, number | `params.local_element_equiv_length` |

### Резервуары

| Ключ | Фильтр | Сортировка | Источник / правило |
|---|---|---|---|
| `index` | нет | нет | Номер строки зависит от страницы и текущей сортировки |
| `type` | нет | нет | Тип задан через `object_type=tank`, отдельный фильтр по колонке не нужен |
| `name` | `text contains` | да, text | `params.name`, fallback label не использовать для backend-фильтра |
| `tank_shape` | `enum in` | да, enum label | `params.shape` |
| `tank_dimensions` | `text contains` | нет | derived display label из размеров; для точного поиска использовать отдельные поля размеров |
| `tank_diameter` | `number range`, мм | да, number | `params.diameter`, хранение в м, request в мм |
| `tank_height` | `number range`, мм | да, number | `params.height`, хранение в м, request в мм |
| `tank_length` | `number range`, мм | да, number | `params.length`, хранение в м, request в мм |
| `tank_width` | `number range`, мм | да, number | `params.width`, хранение в м, request в мм |
| `tank_wall_thickness` | `number range`, мм | да, number | `params.wall_thickness`, хранение в м, request в мм |
| `tank_wall_lambda` | `number range`, Вт/мК | да, number | `params.wall_lambda` |
| `placement` | `enum in` | да, enum label | `params.placement ?? params.location` |
| `insulation_layer_count` | `number range` | да, number | `params.insulation_layer_count`, fallback `len(params.insulation_layers)` |
| `insulation_thickness` | `number range`, мм | да, number | `params.insulation_thickness`, хранение в м, request в мм |
| `insulation_material` | `enum in`, `include_empty` | да, material label | `params.insulation_material`, label из справочника изоляции |
| `first_insulation_lambda` | `number range`, Вт/мК | да, number | `params.insulation_layers[0].conductivity` |
| `second_insulation_thickness` | `number range`, мм | да, number | `params.insulation_layers[1].thickness`, хранение в м, request в мм |
| `second_insulation_material` | `enum in`, `include_empty` | да, material label | `params.insulation_layers[1].material` |
| `second_insulation_lambda` | `number range`, Вт/мК | да, number | `params.insulation_layers[1].conductivity` |
| `third_insulation_thickness` | `number range`, мм | да, number | `params.insulation_layers[2].thickness`, хранение в м, request в мм |
| `third_insulation_material` | `enum in`, `include_empty` | да, material label | `params.insulation_layers[2].material` |
| `third_insulation_lambda` | `number range`, Вт/мК | да, number | `params.insulation_layers[2].conductivity` |
| `insulation_cover_material` | `text contains` + `in` по distinct values | да, text | `params.insulation_cover_material` |
| `process_temperature` | `number range`, °C | да, number | `params.process_temperature` |
| `ambient_temperature` | `number range`, °C | да, number | `params.ambient_temperature` |
| `ambient_temperature_source` | `enum in` | нет | `params.ambient_temperature_source`; это источник значения |
| `max_ambient_temperature` | `number range`, °C | да, number | `params.max_ambient_temperature` |
| `max_process_temperature` | `number range`, °C | да, number | `params.max_process_temperature` |
| `wind_speed` | `number range`, м/с | да, number | `params.wind_speed` |
| `wind_speed_source` | `enum in` | нет | `params.wind_speed_source`; это источник значения |
| `alpha_vnesh` | `number range`, Вт/м²К | да, number | `params.alpha_vnesh` |
| `environment` | `enum in` | да, enum label | `params.environment` |
| `zone_classification` | `enum in` | да, enum label | `params.zone_classification` |
| `temperature_group` | `enum in` + `text contains` | да, text | `params.temperature_group` |
| `climate_city` | `text contains` | да, text | `params.climate_city` |
| `climate_region` | `text contains` | да, text | `params.climate_region` |
| `climate_key` | `text contains` | нет | `params.climate_key`; технический ключ климата |
| `climate_temperature_basis` | `number range` | да, number | `params.climate_temperature_basis` |
| `burial_depth` | `number range`, м | да, number | `params.burial_depth`; актуально для underground |
| `ground_type` | `text contains` + `in` по distinct values | да, text | `params.ground_type`; актуально для underground |
| `ground_conductivity` | `number range`, Вт/мК | да, number | `params.ground_conductivity`; актуально для underground |
| `min_switch_temperature` | `number range`, °C | да, number | `params.min_switch_temperature` |
| `supply_voltage` | `number range`, В | да, number | `params.supply_voltage` |
| `safety_factor` | `number range` | да, number | `params.safety_factor` |
| `q_additional` | `number range`, Вт | да, number | `params.q_additional` |
| `steam_tracing` | `boolean equals` | нет | `params.steam_tracing`; сортировка по Да/Нет не нужна |

### Поля Глобального Поиска

`search.text` не должен искать по каждому числу подряд. Это делает результаты
шумными. Использовать осмысленный набор текстовых и enum-полей.

Для `pipe`:

- `name`;
- `pipe_dn`;
- `pipe_material`;
- `placement`;
- `insulation_material`;
- `second_insulation_material`;
- `third_insulation_material`;
- `insulation_cover_material`;
- `environment`;
- `zone_classification`;
- `temperature_group`;
- `climate_city`;
- `climate_region`;
- `ground_type`.

Для `tank`:

- `name`;
- `tank_shape`;
- `tank_dimensions`;
- `placement`;
- `insulation_material`;
- `second_insulation_material`;
- `third_insulation_material`;
- `insulation_cover_material`;
- `environment`;
- `zone_classification`;
- `temperature_group`;
- `climate_city`;
- `climate_region`;
- `ground_type`.

### Поля Без Backend-Сортировки

Эти поля могут быть показаны в таблице, но сортировка по ним не нужна или
создаёт вводящий в заблуждение порядок:

- `index` - номер меняется от страницы и сортировки;
- `type` - тип уже выбран через `object_type`;
- `tank_dimensions` - склеенная строка размеров; сортировать нужно отдельные
  поля `tank_diameter`, `tank_height`, `tank_length`, `tank_width`;
- `pipe_lambda_mode` - служебный режим выбора коэффициента;
- `ambient_temperature_source` - источник значения;
- `wind_speed_source` - источник значения;
- `climate_key` - технический ключ справочника климата;
- `steam_tracing` - boolean-флаг, полезен для фильтра, но не для сортировки.

## Единицы Измерения

Backend query API принимает значения в тех единицах, которые пользователь видит
в таблице.

Примеры:

- наружный диаметр трубы: request в `мм`, хранение в `м`;
- толщина стенки: request в `мм`, хранение в `м`;
- толщина изоляции: request в `мм`, хранение в `м`;
- длина трубопровода: request в `м`, хранение в `м`;
- температуры: request в `°C`, хранение в `°C`;
- количества задвижек, фланцев, опор: request в `шт`, хранение как число.

Правило: конвертация display units -> storage units выполняется в backend
registry. Frontend не должен знать, как именно поле хранится внутри JSONB.

## Фильтры

### Text

Операция: `contains`.

Требования:

- `trim`;
- case-insensitive;
- поддержка кириллицы и латиницы;
- поиск по отображаемому label, если raw value является кодом справочника;
- пустой текст не добавляет фильтр;
- SQL должен использовать безопасные параметры, без string interpolation.

### Number

Операция: `range`.

Требования:

- `min` и `max` опциональны, но хотя бы одно значение должно быть задано;
- `min <= max`, иначе `422`;
- сравнение числовое, не строковое;
- значения приводятся из display unit в storage unit;
- пустые значения не проходят range-фильтр, если `include_empty=false`;
- `include_empty=true` добавляет пустые значения к результату.

### Enum

Операция: `in`.

Требования:

- `values` непустой массив;
- значения валидируются по registry/capabilities;
- сравнение выполняется по нормализованному backend value, но frontend может
  показывать label;
- `include_empty=true` добавляет пустые значения к результату.

### Boolean

Операция: `equals`.

Требования:

- принимать только `true`, `false` или `null` для пустых;
- не приводить произвольные строки к boolean неявно.

## Поиск

`search.text` - быстрый общий поиск по нескольким текстовым полям текущего типа.

Требования:

- поиск не заменяет column filters, а добавляется к ним через `AND`;
- внутри поиска по нескольким колонкам использовать `OR`;
- если `search.columns` не указан, использовать безопасный дефолт registry для
  выбранного типа;
- поиск не должен обходить права доступа к проекту;
- поиск не должен влиять на расчёты или экспорт.

## Сортировка

Поддержать один активный sort на таблицу.

Требования:

- sort key только из registry;
- если поле не сортируемое, вернуть `422`;
- дефолт: `sort_order ASC, id ASC`;
- текст сортировать на backend; frontend не должен досортировывать страницу через
  `Intl.Collator`;
- для text/label сортировки явно задать DB collation или нормализованный
  `sort_key` в registry и отразить это в capabilities `sort.collation`;
- если текущая БД не даёт качественную русскую/numeric collation, использовать
  нормализованный `sort_key` для полей с label, а не оставлять порядок
  неописанным;
- числа сортировать как числа;
- enum сортировать по отображаемому label или по явному `sort_rank` из registry;
- derived-поля сортировать только при наличии явного SQL/accessor правила;
- не менять `sort_order` и не вызывать reorder endpoint.

## Безопасность И Доступ

Сохранить текущую модель доступа:

- guest видит только проекты своей `session_id`;
- employee видит разрешённые проекты по текущей матрице доступа;
- admin не должен получать обходной доступ, если текущие правила проекта его не
  допускают;
- owner-проверки для read-only query должны совпадать с `list_objects`;
- фильтры и параметры пагинации не должны позволять читать объекты другого
  проекта.

Технические правила:

- только whitelist registry, никаких произвольных JSON path от клиента;
- все SQL значения через bind parameters;
- максимум `page_size=200`;
- ограничить размер `search.text`, например 120 символов;
- ограничить количество фильтров, например 20;
- ошибки валидации возвращать как структурированные `422/400`, не как `500`.

## Индексы И Производительность

Минимально проверить индексы:

- `project_objects.project_id`;
- `(project_id, object_type, sort_order, id)`;
- expression indexes для самых частых JSONB полей, если `EXPLAIN` показывает
  проблему.

Кандидаты для expression indexes:

- `params->>'name'`;
- `params->>'outer_diameter'`;
- `params->>'pipe_length'`;
- `params->>'insulation_material'`;
- `params->>'process_temperature'`;
- `params->>'ambient_temperature'`;
- `params->>'diameter'`;
- `params->>'height'`;
- `params->>'shape'`.

Не добавлять индексы вслепую на каждое поле. Сначала покрыть дефолтные и самые
часто используемые колонки, затем расширять по измерениям.

## Frontend Migration

Frontend должен разделить два способа получения объектов:

- полный список объектов проекта для расчётов, экспорта, старых сценариев и
  совместимости;
- постраничный query для экранной таблицы.

Рекомендуемые API функции:

```ts
listObjects(projectId): Promise<ProjectObject[]>
queryObjects(projectId, query): Promise<ProjectObjectsQueryResponse>
getObjectQueryCapabilities(projectId, objectType): Promise<ObjectQueryCapabilities>
```

Правила UI:

- при открытии таблицы и при смене `object_type` frontend запрашивает
  `query-capabilities`;
- UI фильтров и сортировки строится по `capabilities.fields`, а не по локальным
  `NUMBER_FILTER_COLUMNS`, `ENUM_FILTER_COLUMNS` или вручную заданным sortable
  flags;
- если capabilities говорит `filter.enabled=false`, control фильтра по полю не
  показывать;
- если capabilities говорит `sort.enabled=false`, сортировку по полю не
  отправлять;
- enum/multi-select options брать из `capabilities.fields[].options.items`, не
  из строк текущей страницы;
- смена `object_type`, фильтра, поиска или сортировки сбрасывает `page` на `1`;
- изменение страницы не меняет фильтры;
- удаление/копирование/редактирование работает по `object.id`;
- если выбранный объект исчез из текущей страницы из-за фильтра, выделение
  сбрасывается или показывается явный индикатор;
- badges `Труб`, `Рез`, `Объектов` берутся из `counts`, а не из длины страницы;
- расчётные статусы не вычисляются по текущей странице.

## Тесты

### Backend Unit

Покрыть:

- валидацию `page` и `page_size`;
- вычисление `offset = (page - 1) * page_size`;
- вычисление `has_next_page`, `has_previous_page`, `total_pages`;
- validation registry key;
- сборку `query-capabilities` из registry;
- наличие всех table column keys в capabilities для `pipe` и `tank`;
- disabled reason для `index`, `type`, `tank_dimensions` и других unsupported
  sort/filter полей;
- inline `options` в capabilities для `inline`, `dictionary`,
  `project_values`, `derived`;
- range unit conversion;
- nulls last comparator;
- построение SQL/filter expression без произвольных client path.

### Backend Integration

Покрыть:

- дефолтная первая страница в `sort_order`;
- дефолтный `page_size=100`;
- `page=2` использует `offset=100` при дефолтном размере страницы;
- страницы не дублируют строки при стабильной сортировке;
- фильтр по тексту;
- фильтр по числовому range в display units;
- enum-фильтр;
- сортировка asc/desc;
- стабильный порядок при одинаковых значениях;
- capabilities endpoint не раскрывает поля другого типа;
- capabilities options для `project_values` возвращают значения только в рамках
  текущего проекта и выбранного `object_type`;
- `object_type=pipe` не возвращает резервуары и наоборот;
- guest не видит проект другой `session_id`;
- employee/admin правила не расширяются случайно;
- `page < 1` -> `422`;
- `page_size > 200` -> `422`;
- unknown filter key -> `422`;
- фильтры не меняют результаты расчёта и `sort_order`.

### Frontend / E2E

Покрыть после подключения UI к backend:

- таблица запрашивает первую страницу;
- таблица получает capabilities и строит controls по ним;
- frontend не показывает filter/sort controls для disabled-полей;
- enum options берутся из capabilities, а не из текущей страницы;
- фильтр вызывает backend query и сбрасывает `page` на `1`;
- сортировка вызывает backend query и сбрасывает `page` на `1`;
- переход на следующую страницу заменяет строки без дублей;
- расчёт выполняется по полному проекту, не по текущей странице;
- экспорт не зависит от активного фильтра таблицы.

## Критерии Готовности

Готово, когда:

- есть backend endpoint `POST /objects/query`;
- есть backend endpoint `GET /objects/query-capabilities`;
- старый `GET /objects` не сломан;
- фильтры, поиск и сортировка выполняются на backend;
- frontend строит filter/sort UI по capabilities, а не по hardcoded спискам;
- используется обычная pagination через `page`, `page_size` и `LIMIT/OFFSET`;
- дефолтный размер страницы равен 100 записям;
- frontend может получать counts независимо от текущей страницы;
- расчёты, экспорт и `sort_order` не зависят от query state;
- добавлены unit/integration tests;
- ошибки query валидируются предсказуемо;
- документация API обновлена.

## Запрещённые Упрощения

- не фильтровать уже полученный полный список на backend в Python как постоянное
  решение для больших проектов;
- не вводить отдельный opaque-токен страницы вместо явных `page` и
  `page_size`;
- не принимать произвольный JSON path от frontend;
- не дублировать backend whitelist фильтров и сортировок в frontend;
- не собирать enum options из текущей страницы таблицы;
- не считать capabilities достаточной защитой без backend-валидации в
  `POST /objects/query`;
- не сортировать числа как строки;
- не использовать длину текущей страницы как количество объектов проекта;
- не смешивать настройки колонок, фильтры и параметры страницы в одном storage
  key;
- не записывать дефолтный query state как пользовательскую настройку;
- не менять экспорт из-за экранных фильтров;
- не пересчитывать проект при изменении фильтра, поиска, сортировки или
  страницы.
