# Доменные диаграммы

## 1. ER-диаграмма (Entity-Relationship)

### Описание

Диаграмма показывает все сущности базы данных, их атрибуты и связи. Система содержит **9 основных таблиц**, разделённых на четыре группы:

- **Идентификация:** `users`, `guest_sessions`
- **Проектная иерархия:** `projects` → `project_objects` → `electrical_calculations` → `specifications`
- **Справочники:** `correction_coefficients`, `cables_extended`, `accessories_extended`

**Ключевые архитектурные решения:**
- Пользователь и гость — разные таблицы. `User.role ∈ {employee, admin}`. Гость = запись в `guest_sessions`; проект привязывается либо к `projects.user_id`, либо к `projects.session_id` (CHECK: одно из двух не NULL).
- Результаты теплотехнического расчёта хранятся **внутри** `project_objects.results` (JSONB). Отдельной таблицы `calculations` нет — это сознательный трейдофф: для текущей модели достаточно последнего снимка результата.
- Электротехнический расчёт — отдельная таблица `electrical_calculations`, поскольку поддерживаются несколько вариантов на объект (`variant_number`). Upsert по `(object_id, variant_number)`.
- При ошибке электрорасчёта запись всё равно создаётся: `cable_mark = NULL`, `results = {"error": "..."}` — чтобы причина была видна после reload.
- `specifications` сохраняет полный JSON со списком позиций, что позволяет регенерировать отчёты без повторного обхода объектов.

```mermaid
erDiagram
    users {
        uuid id PK
        varchar email UK
        varchar hashed_password
        varchar full_name
        enum role "employee|admin"
        boolean is_active
        timestamp created_at
    }

    guest_sessions {
        uuid id PK
        varchar session_id UK
        timestamp created_at
        timestamp last_activity
    }

    projects {
        uuid id PK
        varchar name
        text description
        uuid user_id FK "NULL для гостевых"
        varchar session_id FK "NULL для авторизованных"
        enum status "draft|completed"
        timestamp created_at
        timestamp updated_at
    }

    project_objects {
        uuid id PK
        uuid project_id FK
        enum object_type "pipe|tank|pump|platform|other"
        int sort_order
        jsonb params "геометрия + изоляция + температуры"
        jsonb results "снимок heat-loss; NULL если не рассчитан"
        boolean is_valid
        jsonb validation_errors
        timestamp created_at
        timestamp updated_at
    }

    electrical_calculations {
        uuid id PK
        uuid project_id FK
        uuid object_id FK
        int variant_number "1..N"
        varchar cable_type "self_regulating|..."
        varchar cable_mark "NULL при ошибке"
        jsonb params
        jsonb results "selected_cable, cable_length, total_power, error"
        timestamp created_at
        timestamp updated_at
    }

    specifications {
        uuid id PK
        uuid project_id FK
        jsonb items
        float total_cable_length
        float total_cost
        timestamp generated_at
    }

    correction_coefficients {
        uuid id PK
        varchar key UK
        float value
        varchar description
        timestamp updated_at
        uuid updated_by FK
    }

    cables_extended {
        uuid id PK
        varchar brand
        varchar model
        enum cable_type "self_regulating|resistive"
        float power_per_meter
        float max_temperature
        float price_per_meter
        float stock_quantity_m
        int lead_time_days
        int supplier_priority
        boolean is_preferred
        float order_multiple_m
        boolean is_active
        timestamp created_at
    }

    accessories_extended {
        uuid id PK
        varchar article UK
        varchar name
        varchar category
        float price
        boolean is_active
        timestamp created_at
    }

    users ||--o{ projects : "user_id"
    guest_sessions ||--o{ projects : "session_id"
    users ||--o{ correction_coefficients : "updated_by"
    projects ||--o{ project_objects : "project_id"
    projects ||--o{ electrical_calculations : "project_id"
    projects ||--o| specifications : "project_id"
    project_objects ||--o{ electrical_calculations : "object_id (variant_number)"
```

---

## 2. UML-диаграмма классов (Domain Model)

### Описание

Диаграмма показывает объектную модель домена — классы, их атрибуты, методы и связи. Это концептуальная модель; реализация через SQLAlchemy ORM + Pydantic-схемы следует тем же паттернам.

**Принципы модели:**
- `PipeParams` и `TankParams` — value objects, не имеют собственной идентичности вне объекта. В БД хранятся в `ProjectObject.params` (JSONB).
- Результат теплотехнического расчёта хранится как JSONB в `ProjectObject.results` (не отдельная таблица). Диаграмма классов ниже показывает концептуальную модель; `CalculationResult` — это структура внутри JSONB, не SQL-таблица.
- `ElectricalCalculation` — полноценная SQL-таблица: поддерживает несколько вариантов на объект (`variant_number`) и персистит ошибки расчёта.
- `SpecificationItem` — строка спецификации, агрегирует данные кабеля + аксессуаров по позиции.

```mermaid
classDiagram
    class User {
        +UUID id
        +str email
        +str hashed_password
        +str full_name
        +Role role
        +bool is_active
        +datetime created_at
        +verify_password(plain: str) bool
        +has_permission(action: str) bool
    }

    class Project {
        +UUID id
        +str name
        +str description
        +UUID user_id "NULL для гостя"
        +str session_id "NULL для authorized"
        +ProjectStatus status
        +datetime created_at
        +datetime updated_at
    }

    class ProjectObject {
        +UUID id
        +UUID project_id
        +str name
        +ObjectType object_type
        +int sort_order
        +PipeParams pipe_params
        +TankParams tank_params
        +bool is_valid
        +get_params() PipeParams|TankParams
    }

    class PipeParams {
        +float outer_diameter_mm
        +float wall_thickness_mm
        +float pipe_length_m
        +float process_temperature
        +float min_ambient_temperature
        +str insulation_type
        +float insulation_thickness_mm
        +bool is_underground
        +float ground_depth_m
        +float ground_conductivity
        +list~InsulationLayer~ layers
    }

    class TankParams {
        +float volume_m3
        +TankShape shape
        +float process_temperature
        +float min_ambient_temperature
        +str insulation_type
        +float insulation_thickness_mm
        +float surface_area_m2
    }

    class InsulationLayer {
        +str material
        +float thickness_mm
        +float lambda_value
    }

    class CalculationResult {
        +UUID id
        +UUID object_id
        +float heat_loss_per_meter
        +float total_heat_loss
        +float required_power
        +str selected_cable
        +float cable_power
        +int cable_length
        +float safety_margin
        +dict raw_result
        +datetime calculated_at
    }

    class Specification {
        +UUID id
        +UUID project_id
        +int variant_number
        +list~SpecificationItem~ items
        +datetime created_at
        +datetime updated_at
    }

    class SpecificationItem {
        +str cable_brand
        +str cable_model
        +int quantity_m
        +float unit_price
        +float total_price
        +list~AccessoryLine~ accessories
    }

    class AccessoryLine {
        +str article
        +str name
        +int quantity
        +float unit_price
        +float total_price
    }

    class CorrectionCoefficient {
        +UUID id
        +CoefficientKey key
        +float value
        +str description
        +datetime updated_at
        +UUID updated_by
    }

    class CableExtended {
        +UUID id
        +str brand
        +str model
        +CableType cable_type
        +float power_per_meter
        +float max_temperature
        +float price_per_meter
        +float stock_quantity_m
        +int lead_time_days
        +int supplier_priority
        +bool is_preferred
        +float order_multiple_m
        +bool is_active
        +matches_power(required: float) bool
    }

    class AccessoryExtended {
        +UUID id
        +str article
        +str name
        +str category
        +float price
        +bool is_active
    }

    class Role {
        <<enumeration>>
        EMPLOYEE
        ADMIN
    }

    class GuestSession {
        +UUID id
        +str session_id
        +datetime created_at
        +datetime last_activity
    }

    class ObjectType {
        <<enumeration>>
        PIPE
        TANK
    }

    class TankShape {
        <<enumeration>>
        CYLINDER
        RECTANGLE
        SPHERE
    }

    class CableType {
        <<enumeration>>
        SELF_REGULATING
        RESISTIVE
    }

    class CoefficientKey {
        <<enumeration>>
        wind_factor
        safety_factor
        location_indoor
        location_outdoor
        ground_conductivity
    }

    User "1" --> "0..*" Project : owns (authorized)
    GuestSession "1" --> "0..*" Project : owns (guest)
    Project "1" --> "1..*" ProjectObject : contains
    Project "1" --> "0..1" Specification : has
    ProjectObject "1" --> "0..1" CalculationResult : snapshot (JSONB)
    ProjectObject "1" --> "0..*" ElectricalCalculation : per variant
    ProjectObject --> PipeParams : has (if pipe)
    ProjectObject --> TankParams : has (if tank)
    PipeParams "1" --> "0..*" InsulationLayer : layers
    Specification "1" --> "0..*" SpecificationItem : items
    SpecificationItem "1" --> "0..*" AccessoryLine : accessories
    User --> Role
    ProjectObject --> ObjectType
    TankParams --> TankShape
    CableExtended --> CableType
    CorrectionCoefficient --> CoefficientKey
```

---

## 3. Диаграмма состояний: Жизненный цикл проекта

### Описание

Проект в системе проходит через несколько состояний от создания до формирования финального отчёта. Переходы инициируются действиями пользователя или автоматическими пересчётами.

**Ключевые правила:**
- Проект всегда доступен для просмотра в любом состоянии
- Экспорт отчёта требует состояния `REPORT_READY` (хотя бы один расчёт + спецификация)
- Состояние `HAS_INVALID_OBJECTS` — предупредительное, не блокирует отчёт по валидным объектам

```mermaid
stateDiagram-v2
    [*] --> EMPTY : Проект создан

    EMPTY --> HAS_OBJECTS : Добавлен первый объект

    HAS_OBJECTS --> CALCULATING : Расчёт запущен\n(авто при добавлении)
    HAS_OBJECTS --> HAS_INVALID_OBJECTS : Объект не прошёл\nвалидацию

    CALCULATING --> CALCULATED : Все объекты рассчитаны
    CALCULATING --> HAS_INVALID_OBJECTS : Ошибка в параметрах\nобъекта

    HAS_INVALID_OBJECTS --> CALCULATING : Параметры исправлены,\nпересчёт запущен
    HAS_INVALID_OBJECTS --> CALCULATED : Валидные объекты\nрассчитаны (частично)

    CALCULATED --> SPEC_GENERATED : Спецификация\nсгенерирована

    SPEC_GENERATED --> REPORT_READY : Отчёт сформирован\n(HTML-предпросмотр)

    REPORT_READY --> EXPORTED : Экспорт PDF/DOCX/XLSX\n(только employee/admin)

    CALCULATED --> HAS_OBJECTS : Добавлен новый объект\n(требует пересчёта)
    SPEC_GENERATED --> HAS_OBJECTS : Добавлен новый объект\n(спецификация устарела)

    EXPORTED --> [*] : Проект завершён
    REPORT_READY --> [*] : Ссылка передана\n(гостевой сценарий)

    note right of HAS_INVALID_OBJECTS
        is_valid = false
        для одного или
        нескольких объектов
    end note

    note right of REPORT_READY
        Гость видит HTML.
        Сотрудник может
        скачать файл.
    end note
```

---

## 4. Диаграмма состояний: Жизненный цикл расчёта объекта

### Описание

Каждый `ProjectObject` имеет собственный жизненный цикл расчёта. Состояния хранятся через флаг `is_valid` и наличие/отсутствие связанной записи `calculations`.

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Объект создан\n(параметры не заданы)

    DRAFT --> PENDING : Параметры заполнены\n(API: POST /objects)

    PENDING --> CALCULATING : Автозапуск расчёта\n(service layer)

    CALCULATING --> VALID : heat_loss > 0\ncable найден\nis_valid = true

    CALCULATING --> INVALID : Ошибка расчёта\n(diameter too small,\nno cable matches)\nis_valid = false

    INVALID --> PENDING : Пользователь исправил\nпараметры (PATCH /objects/{id})

    VALID --> STALE : Параметры изменены\n(PATCH /objects/{id})

    STALE --> CALCULATING : Пересчёт запущен\n(автоматически или\nPOST /objects/recalculate)

    VALID --> [*] : Объект удалён\n(DELETE /objects/{id})
    INVALID --> [*] : Объект удалён
    STALE --> [*] : Объект удалён

    note right of VALID
        calculations.id != null
        is_valid = true
        heat_loss_per_meter > 0
    end note

    note right of INVALID
        calculations.id может быть null
        is_valid = false
        В raw_result: error message
    end note

    note right of STALE
        Флаг is_stale (логический)
        calculated_at < updated_at
    end note
```

---

## 5. Диаграмма состояний: Жизненный цикл сессии пользователя

### Описание

Пользователь взаимодействует с системой через одну из трёх ролевых сессий. Переходы между состояниями управляются JWT-токенами и HTTP-заголовками.

```mermaid
stateDiagram-v2
    [*] --> ANONYMOUS : Открыл браузер

    ANONYMOUS --> GUEST_SESSION : POST /auth/guest\nПолучен session_id

    ANONYMOUS --> EMPLOYEE_SESSION : POST /auth/login\n(email/password)\nПолучен access_token + refresh_token

    ANONYMOUS --> ADMIN_SESSION : POST /auth/login\n(admin role)\nПолучен access_token + refresh_token

    GUEST_SESSION --> ANONYMOUS : Закрыл браузер\n(session_id не сохранён)

    GUEST_SESSION --> GUEST_SESSION : API запросы\nс X-Session-Id header

    EMPLOYEE_SESSION --> TOKEN_EXPIRED : access_token истёк\n(через 30 минут)

    ADMIN_SESSION --> TOKEN_EXPIRED : access_token истёк\n(через 30 минут)

    TOKEN_EXPIRED --> EMPLOYEE_SESSION : POST /auth/refresh\nс refresh_token (7 дней)

    TOKEN_EXPIRED --> ADMIN_SESSION : POST /auth/refresh\n(admin role)

    TOKEN_EXPIRED --> ANONYMOUS : refresh_token истёк\nили инвалидирован

    EMPLOYEE_SESSION --> ANONYMOUS : Явный logout\n(токен удалён из localStorage)

    ADMIN_SESSION --> ANONYMOUS : Явный logout

    note right of GUEST_SESSION
        Идентификация через
        X-Session-Id header.
        Нет JWT. Нет refresh.
        Данные живут в БД.
    end note

    note right of TOKEN_EXPIRED
        access_token в localStorage
        уже не работает.
        Interceptor делает
        /auth/refresh автоматически.
    end note
```
