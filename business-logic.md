# Бизнес-логика TLT — полный анализ

> Актуально на 2026-05-08 · Проект: система теплотехнического и электротехнического
> расчёта систем электрообогрева. Три роли: Пользователь (гость), Сотрудник, Администратор.

---

## 1. Авторизация и сессии

### 1.1. Два способа входа

| Режим | Как входит | Идентификация | Срок жизни |
|---|---|---|---|
| Пользователь (гость) | POST `/auth/guest` — без регистрации | `X-Session-Id` (token_urlsafe 32) | 20 мин неактивности |
| Сотрудник / Админ | POST `/auth/login` — email + пароль | JWT (access 30 мин + refresh 7 дней) | Скользящий через refresh |

### 1.2. Гостевая сессия — жизненный цикл

```
POST /auth/guest
  │
  ├─ IP rate-limit: 10 сессий/IP/час (in-memory sliding window, 1h)
  │  При превышении → 429 + Retry-After: 3600
  │
  ├─ GuestSession создана (session_id, last_activity)
  │
  ├─ Авто-создание проекта «Мой проект» (guest имеет ровно 1 проект)
  │
  └─ Ответ: {session_id, project}
```

**Продление**: любой запрос с `X-Session-Id` обновляет `last_activity` (в `get_current_user_or_guest`).

**Очистка**: фоновая asyncio-задача в lifespan, каждые 10 мин удаляет сессии с `last_activity < now - 20 мин`. Плюс cleanup при старте. Каскад `ON DELETE CASCADE` — удаляются проекты, объекты, расчёты.

### 1.3. Сотрудник / Админ — жизненный цикл

```
POST /auth/login {email, password, role}
  │
  ├─ Проверка: email, пароль (bcrypt), is_active, роль
  │
  ├─ Ответ: {access_token, refresh_token}
  │
  └─ POST /auth/refresh — обновить access по refresh (не истекает, пока refresh жив)
```

**JWT-зависимости**: `get_current_user_or_guest` — приоритет JWT над `X-Session-Id`. Если есть Bearer-токен — возвращает Employee/Admin. Иначе — гость по `X-Session-Id`. Без обоих — 401.

### 1.4. Разрешение принципала

```python
CurrentPrincipal(role, user_id, session_id, email)
```

Фабрики зависимостей:
- `require_any()` → guest, employee, admin
- `require_employee()` → employee, admin
- `require_admin()` → admin

`role` в JWT проверяется через `expected_role` в login — админ не может войти как сотрудник, и наоборот.

---

## 2. Проекты и объекты

### 2.1. Модель владения

| Роль | Владение | Видимость чужих проектов | Лимит проектов |
|---|---|---|---|
| Гость | `Project.session_id` | Нет (403) | 1 (авто-создаётся) |
| Сотрудник | `Project.user_id` | Видит все, редактирует только свои | Нет |
| Админ | Не работает с проектами | — | — |

### 2.2. CRUD проектов

**Создание** (`POST /projects`):
- Гость: проверка лимита (`GUEST_MAX_PROJECTS = 1`) → 429 если превышен
- Сотрудник: без ограничений

**Обновление** (`PUT /projects/{id}`):
- `_check_owner`: гость только свой, сотрудник только свой (чужие проекты — только чтение)

**Удаление** (`DELETE /projects/{id}`):
- Каскадное: проект → объекты → расчёты (SQLAlchemy cascade)

**Дублирование** (`POST /projects/{id}/duplicate`):
- Только сотрудник (403 гостю)
- Копирует `name (копия)`, `params` объектов (без результатов)
- Вызывает `batch_recalculate` + `batch_calc_electrical` — всё пересчитывается «с нуля»

**Получение** (`GET /projects/{id}`):
- `_check_access`: гость — только свой проект, сотрудник — любой

### 2.3. CRUD объектов

**Добавление** (`POST /projects/{id}/objects`):
- Проверка лимита: `GUEST_MAX_OBJECTS_PER_PROJECT = 101`
- Объект создаётся → `CalculationService.recalculate_object` — немедленный авто-расчёт теплопотерь
- Если расчёт неудачен: `obj.is_valid = False`, `obj.validation_errors = {"error": "..."}` — объект сохранён, ошибка видна

**Обновление** (`PUT /projects/{id}/objects/{oid}`):
- Обновление `params` → `recalculate_object` — пересчёт теплопотерь
- На каждое обновление — commit в БД

**Удаление** (`DELETE /projects/{id}/objects/{oid}`):
- Простое удаление, без пересчёта остальных

**Переупорядочение** (`PUT /projects/{id}/objects/reorder`):
- Принимает полный список `[uuid, ...]` в новом порядке
- Присваивает `sort_order = 0, 1, 2, ...`
- Фронт: drag-and-drop через `@dnd-kit/core` с `activationConstraint: distance=6`

---

## 3. Расчётный контур

### 3.1. Два этапа расчёта

```
Объект создан/обновлён
  │
  ├─ Этап 1: Теплопотери (автоматически, сразу)
  │   calc_heat_loss(object_type, params) → results (JSONB)
  │
  └─ Этап 2: Электрорасчёт (явно, по кнопке пользователя)
      batch_calc_electrical(project_id) → ElectricalCalculation (пообъектно)
```

### 3.2. Теплопотери — контракты

**Труба** (`formulas/heat_loss/pipe.py`):
- Модель: многослойная цилиндрическая стенка (закон Фурье)
- 1–3 слоя изоляции (`insulation_layers` или пара `thickness + material`)
- Стенка трубы: опционально — если задан `wall_thickness` + материал/λ
- `R_внеш`: `α = 11.6 + 7·√v` (СНиП 41-03-2003, клип [11.6, 52]); в помещении `α = 9.0`
- Подземно: `R_грунта = arccosh(H/r) / (2π·λ_гр)`, λ_гр по умолчанию 1.5
- Локальные элементы: `L_эфф = L + n_i · L_ekv`
- **Safety factor K применяется в конце**: `Q_total = q_linear × L_эфф × K`
- `q_linear` (heat_loss_per_meter) возвращается **без K**

**Резервуар** (`formulas/heat_loss/tank.py`):
- Модель: плоская стенка (кривизной пренебрегаем)
- Три формы: цилиндр, параллелепипед, шар — разные формулы площади
- Стенка: требует ОБА поля (`wall_thickness` + `wall_lambda`), иначе R = 0
- Подземный: двухзонная модель — `S_возд`/`S_гр` с раздельными q
- **Q_доп** (доп. теплопотери: днище, фланцы) добавляется ПОСЛЕ умножения на K
- `q_per_m2` (heat_loss_per_m2) возвращается **без K**

**Коэффициенты**: загружаются из `correction_coefficients` (БД, кэш 1 час). Приоритет: `params.safety_factor` > coefficients > DEFAULT (1.1).

### 3.3. Электрорасчёт — контракты

**Контракт safety_factor «ровно один раз»**:
- Теплоформула: `q_linear` без K
- Электроформула: `P_треб = q_linear × K` (свой safety_factor)
- Залочено тестом `test_no_double_safety.py`

**Типы кабелей и формулы**:

| Тип | Формула | Каталог | Особенности |
|---|---|---|---|
| `self_regulating` (ТЛТ) | Автоподбор по P ≥ q_треб | 10 марок (10–100 Вт/м) | Длина × 1.1 (BR-CABLE-02), косинус ≈ 1 |
| `self_regulating_tt` (ТТН/ТТВ/ТТХ) | `q_б(T) = q1·T + q2` | 14 марок | Автовыбор серии ТТН→ТТВ→ТТХ, автоподбор ниток (≤3), суффикс -СР/-СТ |
| `single_core` (ТТ Р1) | `Sк = (Q/U²)·ρ_T·N` | 31 марка | 3 схемы: линия, петля, звезда |
| `three_core` (ТТ Р3) | `Sк = (Q/U²)·ρ_T·N/3` | 18 марок | 5 схем |
| `mineral` (MI) | — | — | Не реализован (ошибка) |
| `skin` (скин-система) | — | — | Не реализован (ошибка) |

**Подбор кабеля**:
- `cable_mark = null` → автоподбор (минимально-достаточный)
- `cable_mark` задан → проверка (pass/fail с конкретной причиной)

**upsert в БД**: `ElectricalCalculation` — ключ `(object_id, variant_number)`. Повторный пересчёт затирает старую запись. Ошибки сохраняются с `results={"error": "..."}`, видны на UI.

**Параметры навива**:
- `winding_coefficient` — из `winding_pitch` или ручной. Для трубы: `√(1 + (π·d/pitch)²)`
- `winding_pitch` в мм, конвертируется
- `number_of_threads` — 1–3, автоподбор для ТТ
- При batch-пересчёте сохраняются предыдущие значения pitch/num_circuits из существующего расчёта

**Резервуары — длина кабеля**:
- `compute_tank_cable_length`: `(perimeter/2) × (heating_height/laying_step)`
- Для ТЛТ на баке: требуемая мощность = `heat_loss_per_m2` (Вт/м²), без Q_доп
- Для ТТ/резистивных на баке: мощность = `total_heat_loss без K / base_length`

### 3.4. API расчётного контура

| Endpoint | Кто | Что делает |
|---|---|---|
| `POST /calc/heat-loss` | Все | Разовый расчёт теплопотерь (без сохранения) |
| `POST /calc/heat-loss/batch` | Все | Пересчёт всех объектов проекта |
| `POST /calc/electrical` | Все | Расчёт одного объекта |
| `GET /calc/electrical?project_id=` | Все | Список расчётов по проекту |
| `POST /calc/electrical/select-cable` | Все¹ | Ручной выбор марки кабеля |
| `POST /calc/electrical/batch` | Все¹ | Пакетный автоподбор для всех объектов |
| `GET /calc/cable-options/{object_id}` | Все | Список доступных кабелей |

¹ Расширенный каталог (`cable_source != "builtin"`) — только сотрудник (403 для гостя).

---

## 4. Спецификация

### 4.1. Генерация

```
POST /spec/{project_id}/generate
  │
  ├─ Извлекает все ElectricalCalculation для variant_number
  ├─ Группирует кабели по маркам, суммирует длины
  ├─ Добавляет аксессуары из встроенного каталога
  │   Количество = total_objects_count (на КАЖДЫЙ объект проекта,
  │   даже без успешного электрорасчёта)
  ├─ Сохраняет ручные позиции (source='manual') из предыдущей версии
  └─ Сохраняет в Specification (JSONB)
```

### 4.2. Структура позиции

```python
SpecificationItem:
  category    # "Кабель" | "Аксессуар" | ...
  name        # "Греющий кабель ТЛТ-100"
  article     # артикул
  unit        # "м" | "шт." | "компл."
  quantity    # число
  source      # "auto" | "manual"
```

### 4.3. Редактирование

- `PUT /spec/{project_id}/items` — полное замещение позиций (только сотрудник)
- `GET /spec/{project_id}` — чтение (все роли)

---

## 5. Отчёт

### 5.1. Генерация

```
GET /reports/{project_id}/preview  → HTML (DOMPurify на фронте)
GET /reports/{project_id}/export/{pdf|docx|xlsx}  → файл (только сотрудник)
```

### 5.2. Состав отчёта

Секции (настраиваются через `sections` query-параметр):
- `summary` — сводка
- `pipes` — таблица труб
- `tanks` — таблица резервуаров
- `electrical` — результаты электрорасчёта
- `specification` — спецификация

По умолчанию — все 5 секций.

### 5.3. Данные отчёта

Контекст собирается из:
- `Project` (name, description, status)
- `ProjectObject[]` (params, results, is_valid)
- `ElectricalCalculation[]` (последний variant на каждый объект)
- `Specification.items`

### 5.4. Экспорт

- PDF: Jinja2 → HTML → WeasyPrint
- DOCX: python-docx
- XLSX: openpyxl

---

## 6. Импорт / Экспорт

### 6.1. Импорт объектов из Excel/CSV

**Формат Excel (.xlsx)**:
- Лист «Трубопроводы» / «Трубы» / «Pipes»
- Лист «Резервуары» / «Ёмкости» / «Tanks»
- Колонки: имя, геометрия (мм), изоляция (мм), материал, T° среды, T° продукта (+ форма для резервуаров)

**Формат CSV**:
- Один файл, первая колонка «Тип» = `труба` / `резервуар`
- Автодетект разделителя (`;`, `,`, таб)
- Кодировки: UTF-8, UTF-8 BOM, CP1251

**Обработка**:
- Построчный парсинг с алиасами материалов (рус./англ.)
- Каждая строка → `add_object` → `recalculate_object` → commit
- Ошибки отдельных строк не прерывают импорт
- Возврат: `{created: N, errors: [{sheet, row, message}]}`
- При превышении лимита объектов — стоп, возврат созданных + ошибка лимита

**Шаблоны**:
- `GET /objects/import-template?format=xlsx` — файл с примерами и листом «Справка»
- `GET /objects/import-template?format=csv` — CSV с BOM

**Экспорт в Excel**: `GET /objects/export-excel` — round-trip-совместимый формат (сотрудник).

### 6.2. Импорт / Экспорт проектов (CSV)

**Формат**: секционный CSV с маркерами `[SECTION];<имя>`.

Секции:
- `metadata` — schema_version, name, task_number, description, status
- `objects` — type, name, sort_order, params, results, is_valid, validation_errors (JSON-строки)
- `electrical` — object_key, variant_number, cable_type, cable_mark, params, results
- `specifications` — variant_number, items (JSON-строка)
- `projects` — только для пакетного формата: project_key, name, task_number...

**Одиночный импорт** (`POST /projects/import-csv`):
- Все роли
- Гость: удаляет текущий авто-проект, создаёт новый из CSV
- Сотрудник: создаёт новый проект

**Пакетный экспорт** (`GET /projects/export-csv-bulk?ids=`):
- Только сотрудник
- Несколько проектов в одном CSV с `project_key`-связыванием

**Пакетный импорт** (`POST /projects/import-csv-bulk`):
- Только сотрудник
- Конфликт `task_number` → суффикс `(импорт)`, `name` → `name (импорт)`
- Возврат: `{imported: N, errors: [...]}`

### 6.3. Экспорт одного проекта

`GET /projects/{id}/export-csv` — все роли.

---

## 7. Административная панель

Все endpoints: `/admin/*` — только `require_admin()`.

### 7.1. Управление пользователями

```
GET    /admin/users              — список
POST   /admin/users              — создать (email, пароль, роль, имя)
PUT    /admin/users/{id}         — обновить (включая смену пароля)
DELETE /admin/users/{id}         — деактивировать (is_active=False, не удаляется)
```

### 7.2. Корректирующие коэффициенты

```
GET  /admin/coefficients        — список
PUT  /admin/coefficients/{key}  — upsert (создать или обновить)
```

При изменении — инвалидация кэша `cache.invalidate("coefficients")`.

### 7.3. Расширенный каталог кабелей

```
GET    /admin/cables             — список
POST   /admin/cables             — добавить
PUT    /admin/cables/{id}        — обновить
DELETE /admin/cables/{id}        — удалить
```

Поля: `brand`, `model`, `power_per_meter`, `max_temperature`, `min_temperature`, `voltage`, `is_active`.

### 7.4. Расширенный каталог аксессуаров

```
GET    /admin/accessories        — список
POST   /admin/accessories        — добавить
PUT    /admin/accessories/{id}   — обновить
DELETE /admin/accessories/{id}   — удалить
```

### 7.5. Проверка формул

`POST /admin/formula-check` — «калькулятор» для администратора: выполняет формулу с переданными параметрами, возвращает результат. Типы: `pipe`, `tank`, `electrical`, `electrical_tt`, `resistive_single`, `resistive_three`, `tank_cable_geometry`.

---

## 8. Фронтенд — состояние и навигация

### 8.1. Хранилища Zustand

**authStore** (`frontend/src/store/authStore.ts`):
```
role: 'guest' | 'employee' | 'admin' | null
user: CurrentUser | null
sessionId: string | null
accessToken: string | null
refreshToken: string | null
```

- `setGuest(sessionId)` — пишет session_id в localStorage, чистит токены
- `setEmployee(user, tokens)` — пишет access/refresh токены, чистит session_id
- `logout()` — чистит всё, включая `tlt-current-project`
- `readInitialState()` — синхронная инициализация из localStorage (до первого рендера → нет race-condition с ProtectedRoute)

**projectStore** (`frontend/src/store/projectStore.ts`):
```
currentProject: Project | null
```
- `persist` в localStorage под ключом `tlt-current-project`

### 8.2. Навигация

```
ROUTES:
  /                           — HomePage: выбор «Войти без регистрации» / «Войти как сотрудник»
  /login                      — LoginPage: форма email/пароль
  /workspace                  — WorkspacePage + Sidebar: 4 шага
  /workspace/heat-calc        — HeatCalcPage: теплопотери + SC-03 форма + таблица
  /workspace/elec-calc        — ElecCalcPage: CO1..CO4, выбор кабеля, сводка
  /workspace/specification    — SpecificationPage: таблица спецификации
  /workspace/report           — ReportPage: предпросмотр + экспорт
  /projects                   — список проектов (сотрудник)
  /admin/*                    — админ-панель (только admin)
```

---

## 9. Безопасность и лимиты

### 9.1. Rate limiting

| Механизм | Где | Лимит |
|---|---|---|
| In-memory sliding window | `POST /auth/guest` | 10 запросов/IP/час |
| Redis sliding window (опционально) | `POST /auth/guest` | 10 запросов/IP/час (переживает рестарт) |

Автовыбор backend'а: Redis если `REDIS_URL` задан и доступен, иначе in-memory с warning в лог.

### 9.2. Лимиты данных

| Лимит | Значение | Где проверяется |
|---|---|---|
| Проектов на гостя | 1 | `ProjectService.create_project` |
| Объектов на проект | 101 | `ProjectService.add_object` |
| Гостевых сессий/IP | 10/час | `guest_session_limiter` |
| TTL гостевой сессии | 20 мин | Фоновый cleanup |
| Размер загрузки | 5 МБ | `MAX_UPLOAD_BYTES` |

### 9.3. Ограничения доступа

| Операция | Гость | Сотрудник |
|---|---|---|
| Создание/удаление своего проекта | ✅ | ✅ |
| Редактирование чужого проекта | ❌ (403) | ❌ (403) |
| Просмотр чужого проекта | ❌ (403) | ✅ |
| Дублирование проекта | ❌ (403) | ✅ |
| Экспорт отчёта (PDF/Word/Excel) | ❌ (403) | ✅ |
| Экспорт таблиц в Excel | ❌ (403) | ✅ |
| Расширенный каталог кабелей | ❌ (403) | ✅ |
| Пакетный импорт/экспорт проектов | ❌ (403) | ✅ |
| Админ-панель | ❌ (403) | ❌ (403) |

---

## 10. Обработка ошибок — философия

### 10.1. «Ошибка — часть данных»

- Неудавшийся теплорасчёт: объект сохранён, `is_valid=False`, `validation_errors={"error": "..."}`
- Неудавшийся электрорасчёт: запись `ElectricalCalculation` сохранена с `results={"error": "..."}`, `cable_mark=null`
- Импорт: ошибки строк не прерывают процесс, возвращаются в ответе

### 10.2. Явный Result-тип

`CalculationService.try_recalculate(obj) → Result[ProjectObject, str]` — позволяет вызывающему коду явно обрабатывать ошибки (в отличие от `recalculate_object`, который мутирует объект молча).

### 10.3. Специализированные исключения

- `AuthError` — неверный логин/пароль
- `ProjectNotFoundError` — 404
- `ProjectAccessError` — 403
- `ProjectLimitError` — 429
- `CalculationError` — 400
- `AdminError` — 400/404
- `ExcelImportError` / `ProjectImportError` — 422

Каждое мапится на HTTP-статус в API-слое.

---

## 11. Справочные данные

### 11.1. Встроенные (read-only, JSON на диске)

| Файл | Содержимое | Загрузка |
|---|---|---|
| `cables_tlt.json` | 10 марок ТЛТ | `lru_cache` при первом обращении |
| `cables_tt.json` | 14 марок ТТН/ТТВ/ТТХ | `lru_cache` |
| `resistive_cables.json` | 31 single-core + 18 three-core | `lru_cache` |
| `insulation.json` | 6 материалов изоляции (λ) | `lru_cache` |
| `pipe_materials.json` | 5 материалов труб (λ(T) = A + B·(T+40)) | `lru_cache` |
| `climate.json` | 539 городов РФ (t_0.98, t_0.92, t_abs_min, wind) | `lru_cache` |
| `soil_conductivity.json` | Грунты и λ | `lru_cache` |
| `accessories.json` | Базовые аксессуары | `lru_cache` |

### 11.2. Расширенные (CRUD через админ-панель, в БД)

- `cables_extended` — кабели, добавляемые администратором
- `accessories_extended` — аксессуары, добавляемые администратором
- `correction_coefficients` — коэффициенты (кэш 1 час, инвалидация при изменении)

### 11.3. Источники каталога кабелей для электрорасчёта

`builtin` — только `cables_tlt.json`
`extended` — только `cables_extended` (БД)
`all` — объединение builtin + extended

---

## 12. Варианты системы обогрева (CO1–CO4)

Каждый проект поддерживает до 4 вариантов (`variant_number: 1–4`). Электрорасчёт и спецификация — per-variant. На фронте — переключатель CO1..CO4 на `ElecCalcPage`.

---

## 13. Ключевые архитектурные решения

1. **Safety factor применяется ровно один раз** — теплоформула отдаёт «чистые» q, электроформула сама добавляет K. Залочено тестами.

2. **Ошибки не блокируют систему** — объекты и расчёты сохраняются даже при ошибках, пользователь видит причину.

3. **Гость = одна сессия, один проект** — минимизация мусора в БД, автоочистка через TTL.

4. **Конвертация единиц на фронте** — ObjectWizard работает в мм, API в метрах. `pipeFormToApiParams` / `pipeApiParamsToForm`.

5. **upsert вместо delete+insert** — для электрорасчётов (по `object_id + variant_number`) и спецификаций.

6. **Кэш коэффициентов с явной инвалидацией** — 1 час TTL + сброс при админском изменении.

7. **Секционный CSV для импорта/экспорта** — маркеры `[SECTION];<name>`, JSON в ячейках, BOM для Excel-ru.
