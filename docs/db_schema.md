# Схема базы данных HeatCalc

## Таблицы

### users
| Колонка          | Тип          | Ограничения                    | Описание                          |
|------------------|--------------|--------------------------------|-----------------------------------|
| id               | UUID         | PK                             | Первичный ключ                    |
| email            | VARCHAR(255) | UNIQUE, NOT NULL, INDEX        | Email / логин                     |
| hashed_password  | VARCHAR(255) | NOT NULL                       | Хэш пароля (bcrypt)               |
| full_name        | VARCHAR(255) | nullable                       | Полное имя                        |
| role             | ENUM         | NOT NULL                       | `employee` / `admin`              |
| is_active        | BOOLEAN      | NOT NULL, default true         | Активен ли аккаунт                |
| created_at       | TIMESTAMPTZ  | server default now()           |                                   |
| updated_at       | TIMESTAMPTZ  | auto-update                    |                                   |

---

### guest_sessions
| Колонка       | Тип          | Ограничения             | Описание                              |
|---------------|--------------|-------------------------|---------------------------------------|
| id            | UUID         | PK                      |                                       |
| session_id    | VARCHAR(64)  | UNIQUE, NOT NULL, INDEX | Токен сессии гостя (cookie/header)    |
| created_at    | TIMESTAMPTZ  | server default now()    |                                       |
| last_activity | TIMESTAMPTZ  | server default, auto-update | Последняя активность (для TTL)    |

---

### projects
| Колонка     | Тип          | Ограничения                                              | Описание                     |
|-------------|--------------|----------------------------------------------------------|------------------------------|
| id          | UUID         | PK                                                       |                              |
| name        | VARCHAR(255) | NOT NULL                                                 | Название проекта             |
| description | TEXT         | nullable                                                 | Описание                     |
| user_id     | UUID         | FK → users.id ON DELETE SET NULL, nullable               | Владелец (сотрудник/админ)   |
| session_id  | VARCHAR(64)  | FK → guest_sessions.session_id ON DELETE CASCADE, nullable | Владелец (гость)           |
| status      | ENUM         | NOT NULL, default `draft`                                | `draft` / `completed`        |
| created_at  | TIMESTAMPTZ  | server default now()                                     |                              |
| updated_at  | TIMESTAMPTZ  | auto-update                                              |                              |

**CHECK:** `user_id IS NOT NULL OR session_id IS NOT NULL` — проект всегда принадлежит либо зарегистрированному пользователю, либо гостевой сессии.

---

### project_objects
| Колонка           | Тип         | Ограничения                              | Описание                                      |
|-------------------|-------------|------------------------------------------|-----------------------------------------------|
| id                | UUID        | PK                                       |                                               |
| project_id        | UUID        | FK → projects.id ON DELETE CASCADE, INDEX | Проект                                       |
| object_type       | ENUM        | NOT NULL                                 | `pipe` / `tank` / `pump` / `platform` / `other` |
| sort_order        | INTEGER     | NOT NULL, default 0                      | Порядок отображения                           |
| version           | INTEGER     | NOT NULL, default 1                      | Версия для optimistic locking при обновлении  |
| params            | JSONB       | NOT NULL                                 | Входные параметры (геометрия, изоляция, темп.) |
| results           | JSONB       | nullable                                 | Результат расчёта теплопотерь                 |
| is_valid          | BOOLEAN     | NOT NULL, default false                  | Прошёл ли расчёт успешно                     |
| validation_errors | JSONB       | nullable                                 | Ошибки валидации / расчёта                   |
| created_at        | TIMESTAMPTZ | server default now()                     |                                               |
| updated_at        | TIMESTAMPTZ | auto-update                              |                                               |

**params (pipe):** `outer_diameter`, `insulation_thickness`, `insulation_material`, `ambient_temperature`, `process_temperature`, `pipe_length`

**results (pipe):** `heat_loss_per_meter` (Вт/м), `total_heat_loss` (Вт), `effective_length` (м), `thermal_resistance` (м·К/Вт)

**results (tank):** `heat_loss_per_m2` (Вт/м²), `total_heat_loss` (Вт), `surface_area` (м²), `q_additional` (Вт, дополнительные теплопотери крышки/днища/опор)

**Индексы поиска:** для таблицы объектов используются `ix_project_objects_project_sort`
по `(project_id, sort_order, id)` и trigram GIN-индексы
`ix_project_objects_params_text_trgm` по `lower(params::text)`,
`ix_project_objects_name_trgm` по `lower(params->>'name')`. Для trigram
индексов требуется расширение PostgreSQL `pg_trgm`.

---

### electrical_calculations
| Колонка        | Тип          | Ограничения                                     | Описание                              |
|----------------|--------------|-------------------------------------------------|---------------------------------------|
| id             | UUID         | PK                                              |                                       |
| project_id     | UUID         | FK → projects.id ON DELETE CASCADE, INDEX       | Проект                                |
| object_id      | UUID         | FK → project_objects.id ON DELETE CASCADE, INDEX | Объект проекта                       |
| variant_number | INTEGER      | NOT NULL, default 1, CHECK 1..4                 | Номер варианта расчёта для объекта    |
| cable_type     | VARCHAR(64)  | NOT NULL                                        | `self_regulating` / `mineral` / …    |
| cable_mark     | VARCHAR(128) | nullable                                        | Марка кабеля (null = автоподбор)      |
| params         | JSONB        | NOT NULL                                        | Входные параметры электрорасчёта      |
| results        | JSONB        | nullable                                        | Результат (кабель, длина, ток, мощность) |
| created_at     | TIMESTAMPTZ  | server default now()                            |                                       |
| updated_at     | TIMESTAMPTZ  | auto-update                                     |                                       |

**params:** `required_power_per_meter` (Вт/м), `cable_mark` (nullable), `supply_voltage` (В), `ambient_temperature` (°C), `pipe_length` (м), `safety_factor`

**results:** `selected_cable` (марка), `installed_cable_length` (уложенная длина, м), `order_cable_length` (длина для заказа с монтажным запасом, м), `total_power` (Вт), `current` (А), `voltage` (В). `cable_length` может присутствовать только как вычисляемый alias на время разработки.

---

### electrical_candidates
| Колонка          | Тип          | Ограничения                                     | Описание |
|------------------|--------------|-------------------------------------------------|----------|
| id               | UUID         | PK                                              | Кандидат подбора |
| project_id       | UUID         | FK → projects.id ON DELETE CASCADE             | Проект |
| object_id        | UUID         | FK → project_objects.id ON DELETE CASCADE       | Объект проекта |
| variant_number   | INTEGER      | NOT NULL, CHECK 1..4                            | СО-вариант |
| cable_type       | VARCHAR(64)  | NOT NULL                                        | Тип кабеля |
| cable_source     | VARCHAR(32)  | NOT NULL, default `builtin`                     | База справочника |
| cable_mark       | VARCHAR(128) | nullable                                        | Марка кандидата |
| dedupe_key       | VARCHAR(128) | NOT NULL                                        | Стабильный ключ инженерного варианта применения (`v1:<sha256>`) |
| mode             | VARCHAR(16)  | CHECK `auto` / `manual`                         | Как создан кандидат |
| status           | VARCHAR(32)  | CHECK `applicable` / `error` / `not_applicable` / `excluded` / `stale` | Статус кандидата |
| priority         | INTEGER      | NOT NULL, default 0                             | Инженерный приоритет |
| is_recommended   | BOOLEAN      | NOT NULL, default false                         | Пометка «приоритетный» |
| is_pinned        | BOOLEAN      | NOT NULL, default false                         | Закреплён инженером |
| is_applied       | BOOLEAN      | NOT NULL, default false                         | Применён в основной электрорасчёт |
| reason_code      | VARCHAR(128) | nullable                                        | Машинная причина диагностики |
| reason_message   | TEXT         | nullable                                        | Человекочитаемая причина |
| engineer_comment | TEXT         | nullable                                        | Комментарий инженера |
| params           | JSONB        | NOT NULL                                        | Payload расчёта кандидата |
| results          | JSONB        | nullable                                        | Результат проверки/расчёта |
| cable_snapshot   | JSONB        | nullable                                        | Снимок строки каталога |
| warnings         | JSONB        | NOT NULL, default []                            | Предупреждения |
| risk_flags       | JSONB        | NOT NULL, default []                            | Риск-флаги для UI |
| candidate_meta   | JSONB        | NOT NULL, default {}                            | Служебные метаданные |
| created_at       | TIMESTAMPTZ  | server default now()                            | |
| updated_at       | TIMESTAMPTZ  | auto-update                                     | |

**Индексы:** `ix_electrical_candidates_project_object_variant` по
`(project_id, object_id, variant_number)`. UNIQUE
`ux_electrical_candidates_object_variant_dedupe` по
`(object_id, variant_number, dedupe_key)` — одна строка на уникальный инженерный
вариант применения кабеля. Частичный UNIQUE
`ux_electrical_candidates_applied_object_variant` гарантирует, что для одного
`(object_id, variant_number)` применён только один кандидат.

`dedupe_key` относится только к таблице вариантов `electrical_candidates`.
Основная таблица `electrical_calculations` остаётся upsert-таблицей одного
расчёта на `(object_id, variant_number)`. В `candidate_meta.fingerprint_payload`
хранится диагностический payload ключа: `object_type`, `cable_type`,
technical/catalog identity и type-specific поля из матрицы уникальности.

### electrical_candidate_folders
| Колонка               | Тип          | Ограничения                                | Описание |
|-----------------------|--------------|--------------------------------------------|----------|
| id                    | UUID         | PK                                         | Пользовательская папка вариантов |
| project_id            | UUID         | FK → projects.id ON DELETE CASCADE         | Проект |
| object_id             | UUID         | FK → project_objects.id ON DELETE CASCADE  | Объект проекта |
| variant_number        | INTEGER      | NOT NULL, CHECK 1..4                       | CO-вариант |
| name                  | VARCHAR(64)  | NOT NULL                                   | Название папки |
| color                 | VARCHAR(32)  | nullable                                   | Цветовая метка UI |
| sort_order            | INTEGER      | NOT NULL, default 0                        | Порядок показа |
| created_by_user_id    | UUID         | FK → users.id ON DELETE SET NULL, nullable | Создатель-сотрудник |
| created_by_session_id | VARCHAR(64)  | FK → guest_sessions.session_id, nullable   | Создатель-гость |
| created_at            | TIMESTAMPTZ  | server default now()                       | |
| updated_at            | TIMESTAMPTZ  | auto-update                                | |

UNIQUE `uq_electrical_candidate_folders_scope_name` по
`(project_id, object_id, variant_number, name)` не даёт создать две папки с
одинаковым названием в одной модалке. Папки — это фильтры видимости, не
хранилище расчётов: `Все` и `Избранное` системные и не требуют строк в этой
таблице.

### electrical_candidate_folder_items
| Колонка      | Тип         | Ограничения                                           | Описание |
|--------------|-------------|-------------------------------------------------------|----------|
| folder_id    | UUID        | PK, FK → electrical_candidate_folders.id ON DELETE CASCADE | Папка |
| candidate_id | UUID        | PK, FK → electrical_candidates.id ON DELETE CASCADE   | Кандидат |
| created_at   | TIMESTAMPTZ | server default now()                                  | |
| updated_at   | TIMESTAMPTZ | auto-update                                           | |

Составной PK `(folder_id, candidate_id)` делает добавление кандидата в папку
идемпотентным. Один кандидат может быть в нескольких пользовательских папках.
Удаление папки удаляет только связи; удаление кандидата каскадно чистит связи.

---

### cables_extended
| Колонка              | Тип          | Ограничения      | Описание                            |
|----------------------|--------------|------------------|-------------------------------------|
| id                   | UUID         | PK               |                                     |
| cable_type           | ENUM         | NOT NULL         | `self_regulating` / `single_core` / `three_core` / `mineral` / `skin` |
| brand                | VARCHAR(128) | NOT NULL         | Производитель                       |
| model                | VARCHAR(128) | NOT NULL         | Модель / марка                      |
| power_per_meter      | FLOAT        | nullable         | Удельная мощность, Вт/м             |
| max_temperature      | FLOAT        | nullable         | Макс. рабочая температура, °C       |
| min_temperature      | FLOAT        | nullable         | Мин. рабочая температура, °C        |
| resistance_per_meter | FLOAT        | nullable         | Сопротивление, Ом/м                 |
| supplier_name        | VARCHAR(128) | nullable         | Поставщик для объяснения коммерческого выбора |
| article              | VARCHAR(128) | nullable         | Артикул поставщика                  |
| currency             | VARCHAR(8)   | nullable         | Валюта цены                         |
| price_per_meter      | FLOAT        | nullable         | Цена за метр для коммерческого ранжирования |
| stock_quantity_m     | FLOAT        | nullable         | Доступный остаток, м                |
| stock_status         | VARCHAR(32)  | nullable         | `in_stock` / `limited` / `on_order` / `unknown` |
| lead_time_days       | INTEGER      | nullable         | Срок поставки, дней                 |
| supplier_priority    | INTEGER      | nullable         | Приоритет поставщика/производителя; меньше — выше |
| is_preferred         | BOOLEAN      | NOT NULL, default false | Предпочтительная позиция        |
| order_multiple_m     | FLOAT        | nullable         | Кратность заказа, м                 |
| min_order_quantity_m | FLOAT        | nullable         | Минимальная партия заказа, м        |
| is_discontinued      | BOOLEAN      | NOT NULL, default false | Снята ли позиция с поставки     |
| replacement_group    | VARCHAR(128) | nullable         | Группа аналогов/замен               |
| price_updated_at     | TIMESTAMPTZ  | nullable         | Дата актуализации цены              |
| stock_updated_at     | TIMESTAMPTZ  | nullable         | Дата актуализации остатка           |
| commercial_data_source | VARCHAR(32) | nullable       | Источник commercial data: seed/admin/import/api |
| params               | JSONB        | nullable         | Доп. характеристики                 |
| is_active            | BOOLEAN      | NOT NULL, default true | Активна ли запись               |
| created_at           | TIMESTAMPTZ  | server default   |                                     |
| updated_at           | TIMESTAMPTZ  | auto-update      |                                     |

---

### insulation_materials
| Колонка                       | Тип          | Ограничения              | Описание |
|-------------------------------|--------------|--------------------------|----------|
| id                            | UUID         | PK                       | |
| material                      | VARCHAR(128) | UNIQUE, NOT NULL, INDEX  | Код материала изоляции |
| name                          | VARCHAR(512) | NOT NULL                 | Человекочитаемое название |
| conductivity                  | FLOAT        | nullable                 | Справочная λ при базовой температуре |
| density_kg_m3                 | JSONB        | nullable                 | Плотность, число или диапазон |
| temperature_range             | JSONB        | nullable                 | Рабочий диапазон температур, °C |
| conductivity_20_plus          | JSONB        | nullable                 | Формула/константа λ(tm) для `tm >= 20 °C` |
| conductivity_19_minus         | JSONB        | nullable                 | Значения λ(tm) для холодной зоны |
| selectable                    | BOOLEAN      | NOT NULL, default true   | Можно выбирать в расчётном UI |
| deprecated                    | BOOLEAN      | NOT NULL, default false  | Устаревшая/generic запись |
| requires_material_reselection | BOOLEAN      | NOT NULL, default false  | Требует уточнения конкретного материала/плотности |
| material_family               | VARCHAR(128) | nullable                 | Семейство generic записи |
| reselection_message           | TEXT         | nullable                 | Сообщение для импорта/валидации |
| source                        | VARCHAR(512) | nullable                 | Источник справочных данных |
| data_source                   | VARCHAR(32)  | NOT NULL                 | `builtin_json` / `admin` / `import` / `api` |
| params                        | JSONB        | NOT NULL, default `{}`   | Дополнительные поля |
| is_active                     | BOOLEAN      | NOT NULL, default true   | Активна ли запись |
| created_at                    | TIMESTAMPTZ  | server default           | |
| updated_at                    | TIMESTAMPTZ  | auto-update              | |

`backend/app/reference_data/insulation.json` остаётся версионируемым source
для встроенного каталога. `python -m app.seeds` синхронизирует его в
`insulation_materials` как `data_source=builtin_json`; `/references/insulation`
читает runtime projection из БД и использует JSON только как fallback при
пустой таблице.

---

### correction_coefficients
| Колонка     | Тип          | Ограничения                            | Описание                     |
|-------------|--------------|----------------------------------------|------------------------------|
| id          | UUID         | PK                                     |                              |
| key         | VARCHAR(64)  | UNIQUE, NOT NULL, INDEX                | Код коэффициента             |
| value       | FLOAT        | NOT NULL                               | Значение                     |
| description | TEXT         | nullable                               | Описание назначения          |
| updated_by  | UUID         | FK → users.id ON DELETE SET NULL       | Кто последний изменил        |
| created_at  | TIMESTAMPTZ  | server default                         |                              |
| updated_at  | TIMESTAMPTZ  | auto-update                            |                              |

Commercial balanced ranking использует ключи в `correction_coefficients`:
`commercial_balanced_weight_cost`, `commercial_balanced_weight_delivery`,
`commercial_balanced_weight_stock`, `commercial_balanced_weight_supplier` и
approval-gate `commercial_balanced_weights_approved` (`0` — fallback,
`1` — применять веса).

---

### accessories_extended
| Колонка    | Тип          | Ограничения           | Описание                     |
|------------|--------------|-----------------------|------------------------------|
| id         | UUID         | PK                    |                              |
| category   | VARCHAR(64)  | NOT NULL, INDEX       | Категория аксессуара         |
| name       | VARCHAR(255) | NOT NULL              | Наименование                 |
| article    | VARCHAR(64)  | nullable              | Артикул                      |
| params     | JSONB        | nullable              | Доп. параметры; допускает commercial metadata для будущей стоимости аксессуаров |
| is_active  | BOOLEAN      | NOT NULL, default true|                              |
| created_at | TIMESTAMPTZ  | server default        |                              |
| updated_at | TIMESTAMPTZ  | auto-update           |                              |

---

### specifications
| Колонка        | Тип         | Ограничения                              | Описание                     |
|----------------|-------------|------------------------------------------|------------------------------|
| id             | UUID        | PK                                       |                              |
| project_id     | UUID        | FK → projects.id ON DELETE CASCADE, INDEX | Проект                      |
| variant_number | INTEGER     | NOT NULL, default 1                      | Номер варианта               |
| items          | JSONB       | NOT NULL, default []                     | Позиции спецификации         |
| created_at     | TIMESTAMPTZ | server default                           |                              |
| updated_at     | TIMESTAMPTZ | auto-update                              |                              |

---

### audit_events
| Колонка          | Тип          | Ограничения | Описание |
|------------------|--------------|-------------|----------|
| id               | UUID         | PK          | Идентификатор события аудита |
| created_at       | TIMESTAMPTZ  | server default now(), INDEX | Время события |
| event_type       | VARCHAR(128) | NOT NULL, INDEX | Тип события (`object.created`, `calculation.electrical.batch_completed`, …) |
| event_version    | INTEGER      | NOT NULL    | Версия контракта события |
| category         | VARCHAR(32)  | CHECK       | `auth` / `project` / `object` / `calculation` / `task` / `report` / `specification` / `frontend` / `system` / `security` |
| severity         | VARCHAR(16)  | CHECK       | `debug` / `info` / `warning` / `error` / `critical` |
| result           | VARCHAR(16)  | CHECK       | `success` / `failure` / `queued` / `skipped` / `cancelled` |
| source           | VARCHAR(16)  | CHECK       | `backend` / `frontend` / `worker` / `database` / `redis` |
| actor_type       | VARCHAR(32)  | nullable    | Роль/тип актора |
| actor_id         | VARCHAR(128) | nullable    | Строковый идентификатор актора |
| user_id          | UUID         | nullable, INDEX | Авторизованный пользователь |
| session_id       | VARCHAR(128) | nullable, INDEX | Гостевая сессия |
| project_id       | UUID         | nullable, INDEX | Проект, если применимо |
| object_id        | UUID         | nullable, INDEX | Объект, если применимо |
| task_id          | UUID         | nullable    | Фоновая задача, если применимо |
| request_id       | VARCHAR(128) | nullable, INDEX | Корреляция с HTTP/логами |
| requirement_refs | JSONB        | NOT NULL, default [] | Ссылки на ТЗ/SRS/QA-контракты |
| metadata         | JSONB        | NOT NULL, default {} | Санитизированный контекст события |
| before_state     | JSONB        | nullable    | Снимок до изменения |
| after_state      | JSONB        | nullable    | Снимок после изменения |
| error_code       | VARCHAR(128) | nullable    | Машиночитаемая причина ошибки |
| message          | TEXT         | nullable    | Короткое человекочитаемое описание |

Audit-таблица намеренно не имеет FK на доменные таблицы: событие должно
сохранить исходные `project_id`/`object_id`/`session_id` даже после удаления
проекта или гостевой сессии.

---

## Связи

```
users ──< projects (user_id, nullable)
guest_sessions ──< projects (session_id, nullable)
projects ──< project_objects (project_id)
projects ──< electrical_calculations (project_id)
projects ──< specifications (project_id)
project_objects ──< electrical_calculations (object_id)
users ──< correction_coefficients (updated_by, nullable)
audit_events хранит ссылки на id без FK, чтобы события не удалялись каскадом
```

## Справочные данные (файлы, не таблицы)

Загружаются из JSON-файлов при старте:
- `reference_data/climate.json` — климатические параметры населённых пунктов
- `reference_data/insulation.json` — материалы изоляции с λ (Вт/(м·К))
- `reference_data/pipe_materials.json` — материалы трубы и формулы λ(T)
- `reference_data/soil_conductivity.json` — теплопроводность грунтов
- `reference_data/cables_tlt.json` — каталог кабелей ТЛТ (марка, мощность, мин. температура)
- `reference_data/resistive_cables.json` — резистивные кабели ТТ Р1/ТТ Р3
- `reference_data/accessories.json` — базовые аксессуары
