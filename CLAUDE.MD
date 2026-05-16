# CLAUDE.MD — Корневой файл проекта
# Программный комплекс теплотехнического и электротехнического расчёта систем электрообогрева
# Версия: актуальный контур 2026-05-02 · Роли: Пользователь (гость), Сотрудник, Администратор

---

## 1. Общее описание проекта

Веб-приложение для автоматизированного расчёта тепловых потерь с поверхности
обогреваемых объектов, подбора греющего кабеля и формирования
спецификаций/отчётов систем электрообогрева.

### Текущие границы реализации

- Гостевой вход без регистрации (роль «Пользователь»).
- Типы объектов с расчётными формулами: **трубопроводы** и **ёмкости/резервуары**.
- Теплопотери: многослойная труба, стенка трубы, 1-3 слоя изоляции, климат,
  ветер, грунт, подземная труба, подземный резервуар.
- Кабели с расчётной формулой: саморегулирующиеся **ТЛТ**,
  **ТТН/ТТВ/ТТХ**, резистивные **ТТ Р1** (`single_core`) и
  **ТТ Р3** (`three_core`).
- MI и скин-системы остаются типами без расчётной формулы.
- Варианты системы обогрева: CO1..CO4 через `variant_number`.
- Спецификация: базовая + расширенный режим сотрудника с внешней БД.
- Отчёт: предпросмотр на экране + печать через браузер для всех ролей.
- Экспорт отчёта (PDF / Excel / Word): только Сотрудник.

---

## 2. Технологический стек

| Слой            | Технология                                     |
|-----------------|------------------------------------------------|
| Frontend        | React 18 + Vite + TypeScript                   |
| UI-компоненты   | Ant Design 5                                   |
| Состояние       | Zustand (persist в localStorage)               |
| Серверный стейт | TanStack Query v5                              |
| HTTP-клиент     | Axios                                          |
| Backend         | Python 3.11+, FastAPI                          |
| База данных     | PostgreSQL 16                                  |
| ORM             | SQLAlchemy 2.x (async) + Alembic               |
| Контейнеризация | Docker + docker-compose                        |
| Тестирование    | pytest, Vitest + React Testing Library, Playwright |

---

## 3. Навигационная карта

```
[1. Экран выбора режима доступа]  (HomePage.tsx)
        │
        ├── «Войти без регистрации» ──► POST /api/v1/auth/guest → session_id
        │                                └─► [2. Рабочий стол]
        │
        └── «Войти как сотрудник» ──► LoginPage.tsx → POST /api/v1/auth/login → JWT
                                       └─► [2. Рабочий стол]

[2. Рабочий стол]  (WorkspacePage.tsx + боковая панель Sidebar.tsx)
        │
        ├── Шаг 1. «Расчёт тепловых потерь»  (HeatCalcPage.tsx)
        │      ├── WorkflowSteps (current=0)  — прогресс 1→2→3→4
        │      ├── Верхняя часть: встроенная плоская форма SC-03
        │      │     └── ObjectWizard.tsx — 4 секции: геометрия, теплоизоляция,
        │      │         температура/среда, электропараметры
        │      ├── Динамические зависимости формы:
        │      │     климат, размещение, грунт, α внеш, режим λ трубы, 1/2/3 слоя
        │      ├── Панель действий: добавить, создать на основании, применить,
        │      │   удалить, сохранить, импорт/экспорт XLSX/CSV
        │      └── Нижняя часть: таблица исходных данных / результатов
        │
        ├── Шаг 2. «Электротехнический расчёт»  (ElecCalcPage.tsx)
        │      ├── Переключатель CO1..CO4
        │      ├── Выбор базы расчёта: builtin / extended / all (для сотрудника)
        │      ├── Тип кабеля: ТЛТ, ТТН/ТТВ/ТТХ, ТТ Р1 и ТТ Р3 доступны для расчёта;
        │      │   MI и скин-системы видны как неподдержанные до появления формул
        │      ├── Batch-расчёт и ручной выбор марки кабеля для объекта
        │      └── Таблица/сводка: длина, мощность, ток, ошибки расчёта
        │
        ├── Шаг 3. «Спецификация»  (SpecificationPage.tsx)
        │      └── Таблица: кабель + аксессуары, только чтение
        │
        └── Шаг 4. «Отчёт»  (ReportPage.tsx)
               ├── HTML-превью через ReportPreview (DOMPurify)
               ├── Мастер состава отчёта
               └── Экспорт PDF/DOCX/XLSX — только сотрудник
```

### Ключевой принцип расчётного контура

- При сохранении объекта теплопотери рассчитываются **автоматически**.
- Кнопка «Выполнить электрорасчёт» на HeatCalcPage запускает `POST /calc/electrical/batch` —
  автоподбор кабеля для **всех** объектов выбранного CO.
- ElecCalcPage позволяет переключать CO, выбирать базу расчёта и вручную
  назначать марку кабеля для объекта.

---

## 4. Структура монорепозитория

```
/
├── CLAUDE.MD               ← этот файл
├── formules.md             ← все формулы расчёта (с примером)
├── coefficients.MD         ← корректирующие коэффициенты
├── changes.md              ← актуальное ТЗ (источник истины)
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
│
├── frontend/src/
│   ├── pages/
│   │   ├── HomePage.tsx               ← Экран 1: выбор режима
│   │   ├── LoginPage.tsx              ← Авторизация сотрудника
│   │   ├── HeatCalcPage.tsx           ← Режим 1: теплопотери + встроенная SC-03 форма
│   │   ├── ElecCalcPage.tsx           ← Режим 2: электрорасчёт, CO1..CO4, выбор кабеля
│   │   ├── SpecificationPage.tsx      ← Режим 3: спецификация
│   │   └── ReportPage.tsx             ← Предпросмотр отчёта
│   ├── components/
│   │   ├── common/                    ← Переиспользуемые: EmptyProjectState, TabBadge, RoleGuard
│   │   ├── layout/                    ← MainLayout, Sidebar, ProjectMenu
│   │   ├── wizard/
│   │   │   ├── ObjectWizard.tsx       ← встроенная плоская форма SC-03
│   │   │   └── steps/                 ← legacy step-компоненты и вспомогательные части формы
│   │   ├── tables/
│   │   │   ├── PipeTable.tsx          ← Колонки труб + DnD + Edit/Delete
│   │   │   ├── TankTable.tsx          ← Колонки резервуаров (осознанное дублирование с PipeTable)
│   │   │   ├── CalcTable.tsx          ← antd Table preset
│   │   │   ├── DraggableRow.tsx       ← tr-обёртка с useSortable
│   │   │   └── ResultCell.tsx        ← Значение / текст ошибки
│   │   └── electrical/                ← Компоненты ElecCalcPage
│   │       ├── ObjectCalcCard.tsx     ← Карточка объекта со статусом расчёта
│   │       ├── CableSelector.tsx      ← Дропдаун ручного выбора марки
│   │       └── ElectricalSummary.tsx  ← Суммарные итоги (Statistic-карточки)
│   ├── hooks/
│   │   ├── useHeatCalcMutations.ts    ← add/edit/reorder/batchCalc + сообщения
│   │   ├── useElectricalStats.ts      ← Агрегация страницы электрорасчёта (чистая функция)
│   │   ├── useAuth.ts                 ← login guest/employee + сброс currentProject
│   │   └── useProject.ts
│   ├── store/
│   │   ├── authStore.ts               ← role, user, tokens
│   │   └── projectStore.ts            ← Zustand + persist (key: tlt-current-project)
│   ├── utils/
│   │   ├── objectWizardUtils.ts       ← Конвертация мм↔м, generatePipeName/TankName, DN-таблица
│   │   └── calcStatus.ts              ← isElectricalCalcSuccess / electricalCalcError
│   ├── routes/
│   │   ├── routes.ts                  ← ROUTES — единый источник путей
│   │   └── index.tsx                  ← Route-дерево (использует ROUTES)
│   └── api/
│       └── calculations.ts            ← batchCalcElectrical(projectId)
│
└── backend/app/
    ├── api/v1/
    │   ├── auth.py                    ← POST /auth/guest (rate limit 10/IP/час)
    │   ├── projects.py                ← CRUD проектов (лимит 10 на гостевую сессию)
    │   ├── objects.py                 ← CRUD объектов (лимит 50 на проект)
    │   └── calculations.py            ← heat/electrical endpoints, batch, manual cable, CO
    ├── services/
    │   ├── auth_service.py            ← create_guest_session, cleanup_expired_guest_sessions
    │   ├── project_service.py         ← CRUD + лимиты (ProjectLimitError)
    │   └── calculation_service.py     ← recalculate_object, batch_calc_electrical
    ├── formulas/
    │   ├── heat_loss/pipe.py          ← Многослойная цилиндрическая стенка; α = 11,6 + 7·√v (SNiP 41-03-2003)
    │   ├── heat_loss/tank.py          ← Плоская стенка; q_additional (доп. теплопотери)
    │   └── electrical/
    │       ├── self_regulating.py     ← Автоподбор ТЛТ + ТТН/ТТВ/ТТХ (calc_self_regulating_tt)
    │       └── resistive.py          ← Одножильный ТТ Р1 и трёхжильный ТТ Р3 (полная реализация)
    ├── reference_data/
    │   ├── insulation.json            ← материалы изоляции
    │   ├── pipe_materials.json        ← материалы трубы и λ(T)
    │   ├── soil_conductivity.json     ← грунты и λ грунта
    │   ├── cables_tlt.json            ← 10 марок кабелей ТЛТ
    │   ├── cables_tt.json             ← 14 марок ТТН/ТТВ/ТТХ (q1, q2, ограничения)
    │   ├── resistive_cables.json      ← single_core / three_core как каталог
    │   ├── climate.json               ← 539 климатических городов
    │   └── accessories.json           ← Аксессуары для спецификации
    └── core/
        ├── config.py                  ← Settings + лимиты гостевых сессий
        └── rate_limit.py              ← IPRateLimiter (in-memory, sliding window)
```

---

## 5. ObjectWizard / SC-03 — встроенная форма и конвертация единиц

**Важно:** форма работает в **мм**, API принимает **метры**.

| Поле формы | Единица формы | Поле API | Единица API |
|---|---|---|---|
| outer_diameter_mm | мм | outer_diameter | м |
| insulation_thickness_mm | мм | insulation_thickness | м |
| diameter_mm / height_mm / length_mm / width_mm | мм | diameter / height / length / width | м |
| pipe_length | м | pipe_length | м |

Конвертация в `frontend/src/utils/objectWizardUtils.ts`:
- `pipeFormToApiParams(values)` — мм → м перед отправкой на сервер
- `pipeApiParamsToForm(params)` — м → мм для заполнения формы в режиме редактирования
- `insulation_layers` формируется из 1/2/3 слоёв; для материала `other`
  ручная λ обязательна.
- Служебные поля источников климата (`*_source`) хранятся hidden/noStyle и не
  должны отображаться пустыми инпутами.

### Авто-именование объектов

Формат: `generatePipeName(v)` / `generateTankName(v)`

```
Труба Ø108 мм (DN100), δ=50 мм, МВ, L=50 м, -20→+80°C
Бак цил. Ø2000 мм×H3000 мм, δ=80 мм, МВ, -20→+80°C
Бак прям. 5000×3000×4000 мм, δ=80 мм, МВ, -20→+80°C
```

Имя хранится в `params.name` объекта. Бэкенд игнорирует его при расчёте
(`model_config = ConfigDict(extra='ignore')` в Pydantic-схемах).

---

## 5a. Импорт объектов из Excel / CSV (ТЗ 4.1.3)

Кнопка «Импорт (Excel/CSV)» на `HeatCalcPage` в левой панели. Рядом — линки
«Шаблон .xlsx» и «Шаблон .csv» для скачивания образцов.

**Формат Excel:** два листа — `Трубопроводы` (или `Трубы`) и `Резервуары`
(или `Ёмкости`). Заголовки: `Наименование · Диаметр, мм · Длина, м · Толщина
изоляции, мм · Материал изоляции · T° среды · T° продукта` (для труб);
для резервуаров — плюс `Форма` и относящиеся к форме габариты (`Диаметр, мм`,
`Длина, мм`, `Ширина, мм`, `Высота, мм`).

**Формат CSV:** один файл, первая колонка — `Тип` со значением `труба` или
`резервуар`. Автодетект разделителя (`;`, `,`, таб) и кодировки (UTF-8 /
UTF-8-BOM / CP1251).

**Материалы:** алиасы (`Минеральная вата` ↔ `mineral_wool`, `ППУ` ↔
`polyurethane` и т.д.). **Формы резервуара:** `Цилиндр`, `Параллелепипед`, `Шар`.

Ответ эндпоинта: `{created: N, errors: [{sheet, row, message}]}` — пропущенные
строки показываются в модалке с конкретной причиной. Импорт не прерывается на
единичных ошибках.

Тестовые файлы на 100 записей: `docs/samples/sample_import.xlsx` и `.csv`.
Пересборка — `scripts/gen_import_samples.py`.

---

## 5b. Drag-and-drop сортировки (ТЗ 4.1.3)

`PipeTable` / `TankTable` обёрнуты в `DndContext` + `SortableContext` (библиотека
`@dnd-kit/*`). Строки — `DraggableRow` через `components.body.row` antd-Table.
`PointerSensor` с `activationConstraint: distance=6` — клики по кнопкам
Edit/Delete работают, drag начинается только после 6px движения.

На `dragEnd` вызывается `PUT /objects/reorder` с полным списком ID в новом
порядке. Сортировка внутри каждого типа (труба среди труб, бак среди баков);
`sort_order` — глобальный.

---

## 6. Роли и матрица доступа

| Роль | Вход | Хранение данных |
|---|---|---|
| Пользователь (гость) | Без регистрации | `guest_sessions` → `projects` по session_id |
| Сотрудник | Email + пароль | JWT (30 мин access, 7 дней refresh) |
| Администратор | Email + пароль (env) | JWT |

| Функция | Пользователь | Сотрудник | Админ |
|---|:---:|:---:|:---:|
| Расчёт теплопотерь (трубы, ёмкости) | ✅ | ✅ | ❌ |
| Электрорасчёт (auto-select кабель ТЛТ) | ✅ | ✅ | ❌ |
| Создание / удаление своего проекта | ✅ | ✅ | ❌ |
| Дублирование проекта (на основе любого видимого) | ❌ | ✅ | ❌ |
| Просмотр чужих проектов | ❌ | ✅ | ❌ |
| Отчёт (предпросмотр + печать браузером) | ✅ | ✅ | ❌ |
| Экспорт отчёта PDF / Word / Excel | ❌ | ✅ | ❌ |
| Экспорт таблиц в Excel | ❌ | ✅ | ❌ |
| Управление пользователями | ❌ | ❌ | ✅ |
| Настройка корректирующих коэффициентов | ❌ | ❌ | ✅ |

---

## 7. Защита от ботов и накопления данных

### Проблема
Гостевые сессии создаются без авторизации. Без ограничений бот может:
- Создавать тысячи сессий и проектов
- Производить расчёты, нагружая БД и CPU

### Реализованные меры

| Мера | Реализация | Лимит |
|---|---|---|
| Rate limit `/auth/guest` | In-memory sliding window (IPRateLimiter) | 10 сессий/IP/час |
| Лимит проектов на сессию | ProjectService.create_project | **1 проект** (авто-создаётся при логине) |
| Лимит объектов на проект | ProjectService.add_object | 50 объектов |
| Очистка старых сессий | фоновая задача + startup cleanup | **TTL 20 мин, интервал 10 мин** |

### Флоу пользователя (без регистрации)

1. `POST /auth/guest` → backend создаёт `GuestSession` + сразу один `Project` («Мой проект»)
   и возвращает `{session_id, project}`.
2. Фронт сохраняет `session_id` в localStorage и сразу делает `project` текущим в
   `projectStore` — UI «создать/выбрать проект» для пользователя скрыт.
3. Любой запрос с `X-Session-Id` продлевает `last_activity` (touch в
   `get_current_user_or_guest`).
4. Ушёл → через ≤ `GUEST_SESSION_TTL_MINUTES` + `GUEST_CLEANUP_INTERVAL_MINUTES`
   фоновая задача удаляет `GuestSession` → каскадом (`ON DELETE CASCADE`) —
   проект, объекты, расчёты, спецификации.

### Хранилище данных пользователей

- **БД:** PostgreSQL, та же база `heatcalc_db`
- **Таблица сессий:** `guest_sessions` (session_id, last_activity)
- **Каскад:** при удалении сессии → удаляются все её проекты и объекты (`ON DELETE CASCADE`)
- **Очистка:** `_periodic_guest_cleanup()` — `asyncio`-таск в `lifespan`, раз в
  `GUEST_CLEANUP_INTERVAL_MINUTES` удаляет сессии с
  `last_activity < now() - GUEST_SESSION_TTL_MINUTES`. Таск отменяется при
  shutdown. Дополнительно — cleanup при старте.

### Конфигурация лимитов (`.env`)

```
GUEST_MAX_PROJECTS=1                  # у пользователя ровно один проект
GUEST_MAX_OBJECTS_PER_PROJECT=50
GUEST_SESSION_TTL_MINUTES=20          # неактивная сессия чистится после N мин
GUEST_CLEANUP_INTERVAL_MINUTES=10     # периодичность фонового cleanup
GUEST_MAX_SESSIONS_PER_IP=10
```

### Ограничения текущей реализации

- IPRateLimiter хранится **в памяти** → сбрасывается при перезапуске сервиса.
- При горизонтальном масштабировании (несколько инстансов) нужен Redis-based лимитер (`slowapi` + Redis).

---

## 8. API — ключевые endpoints

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/v1/auth/guest` | Создать пользовательскую сессию + авто-проект (rate-limited) |
| POST | `/api/v1/auth/login` | Логин сотрудника/админа |
| GET | `/api/v1/projects` | Список проектов принципала |
| POST | `/api/v1/projects` | Создать проект (лимит для гостя) |
| POST | `/api/v1/projects/{id}/duplicate` | Дублировать проект (сотрудник/админ) — копирует объекты, пересчитывает теплопотери и подбор кабеля |
| GET | `/api/v1/projects/{id}/export-csv` | Скачать проект одним CSV (все роли) |
| POST | `/api/v1/projects/import-csv` | Загрузить один проект из CSV (все роли; у пользователя замещает авто-проект) |
| GET | `/api/v1/projects/export-csv-bulk?ids=...` | Пакетный экспорт N проектов в один CSV (сотрудник) |
| POST | `/api/v1/projects/import-csv-bulk` | Пакетный импорт проектов из CSV (сотрудник); конфликт по `task_number` → суффикс `(импорт)` |
| GET | `/api/v1/projects/{id}/objects` | Список объектов |
| POST | `/api/v1/projects/{id}/objects` | Добавить объект + автоматический расчёт |
| PUT | `/api/v1/projects/{id}/objects/{oid}` | Обновить объект + пересчёт |
| DELETE | `/api/v1/projects/{id}/objects/{oid}` | Удалить объект |
| PUT | `/api/v1/projects/{id}/objects/reorder` | Изменить порядок объектов (drag-and-drop) |
| POST | `/api/v1/projects/{id}/objects/import-excel` | Импорт объектов из Excel (.xlsx) или CSV |
| GET | `/api/v1/projects/{id}/objects/import-template?format=xlsx\|csv` | Скачать шаблон для импорта |
| GET | `/api/v1/projects/{id}/objects/export-excel` | Экспорт объектов в Excel (сотрудник) |
| POST | `/api/v1/calc/electrical/batch` | Пакетный электрорасчёт всех объектов проекта |
| GET | `/api/v1/reports/{id}/preview` | HTML-превью отчёта (все роли) |
| GET | `/api/v1/reports/{id}/export/{pdf\|docx\|xlsx}` | Экспорт отчёта (сотрудник) |
| GET | `/api/v1/references/climate` | Справочник климата (539 населённых пунктов) |
| GET | `/api/v1/references/insulation` | Справочник материалов изоляции |
| GET | `/api/v1/references/cables` | Справочник кабелей ТЛТ |
| GET | `/health` | Healthcheck |

### Поведение некоторых эндпоинтов

- **`/objects/import-excel`** — детектирует формат по расширению (`.xlsx` → openpyxl-парсер по листам «Трубопроводы» / «Резервуары»; `.csv` → общий файл с колонкой «Тип» со значениями `труба`/`резервуар`). Возвращает `{created: N, errors: [{sheet, row, message}]}` — построчный отчёт об ошибках, импорт не прерывается при единичных сбоях строк.
- **`/calc/electrical/batch`** — при успехе создаёт/обновляет `ElectricalCalculation` (upsert по `object_id+variant_number`). При ошибке расчёта также сохраняет запись с `results={"error": "..."}, cable_mark=null` — причина видна на UI после reload (не теряется).
- **`/projects/{id}/duplicate`** — доступен только зарегистрированному пользователю (employee/admin). Создаёт новый проект `{name} (копия)`, владелец = текущий пользователь, копирует `params` объектов, затем вызывает `batch_recalculate` и `batch_calc_electrical` — результаты пересчитываются «с нуля». Гостю возвращает 403.
- **Экспорт/импорт CSV** (`services/project_io_service.py`): секционный формат `[SECTION];<name>` с секциями `metadata` / `projects` (для пакета) / `objects` / `electrical` / `specifications`. JSON-поля (`params`, `results`, `items`) сохраняются как строки внутри CSV-ячеек. UTF-8 BOM в файле — для совместимости с Excel-ru. Одиночные endpoints доступны всем; у пользователя `import-csv` удаляет текущий авто-проект и создаёт новый. Пакетные — только сотруднику; конфликт `task_number` → суффикс `(импорт)`.

---

## 9. Встроенные справочники

Хранятся в `backend/app/reference_data/` как JSON, загружаются в память при старте.

| Файл | Содержимое |
|---|---|
| insulation.json | 6 материалов изоляции с λ и диапазоном температур |
| cables_tlt.json | 10 марок кабелей ТЛТ: мощность, T_max, T_min, напряжение |
| climate.json | **539 населённых пунктов РФ** (t_0.98 / t_0.92 / t_abs_min / wind) по данным ТНП |
| accessories.json | Базовый набор аксессуаров для спецификации |

Полные формулы с примерами и пояснением символов: `formules.md`  
Корректирующие коэффициенты: `coefficients.MD`

---

## 10. Расчётные формулы

Краткий справочник (формулы + коэффициенты): @docs/context/formulas-summary.md

Полные формулы с примерами и объяснением переменных: `formules.md`.
Корректирующие коэффициенты: `coefficients.MD`.

---

## 11. Docker

```bash
# Разработка (hot-reload, bind-mount кода)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Продакшен
docker-compose up --build -d
```

Сервисы: `db` (PostgreSQL 16 · порт 5432), `backend` (FastAPI · порт 8000), `frontend` (Vite dev / nginx · порт 3003).

---

## 12. Тестирование

| Уровень | Инструмент | Расположение | Команда |
|---|---|---|---|
| Backend unit | pytest | backend/app/tests/unit/ | `docker-compose exec backend pytest -q --ignore=app/tests/integration` |
| Backend integration | pytest + asyncpg | backend/app/tests/integration/ | Требует БД `heatcalc_test` |
| Frontend unit/integration | Vitest + RTL | frontend/src/__tests__/ | `docker-compose exec frontend npx vitest run` |
| E2E | Playwright | e2e/tests/ | `npx playwright test` |

Текущее состояние:
<!-- AUTO:test-counts -->
**964 backend** (716 unit + 248 integration) ✅ · **310 frontend vitest** ✅ · **58 e2e Playwright** ✅
<!-- /AUTO -->

Цифры обновляются командой `scripts/sync-docs.py`.

### Сканеры уязвимостей

| Инструмент | Назначение | Команда |
|---|---|---|
| `bandit` | SAST Python: `eval`/`exec`, hardcoded passwords, небезопасные API | `docker exec heatcalc_backend bandit -c pyproject.toml -r app -ll` |
| `pip-audit` | CVE в Python-зависимостях (PyPI Advisory DB) | `docker exec heatcalc_backend pip-audit` |
| `eslint-plugin-security` | SAST JS/TS: ReDoS, небезопасные регэкспы, child_process | `docker exec heatcalc_frontend npm run security:lint` |
| `npm audit` | CVE в npm-зависимостях | `docker exec heatcalc_frontend npm run security:audit` |

Запуск всего сразу: `bash scripts/security-scan.sh [backend|frontend|deps|all]`.

Bandit-конфиг в `backend/pyproject.toml` (`[tool.bandit]`) исключает `app/tests`
и skip'ает `B101` (assert в защитных утверждениях). ESLint-конфиг в
`.eslintrc.cjs` включает `plugin:security/recommended-legacy`, запуск с
`ESLINT_USE_FLAT_CONFIG=false` (legacy-режим ESLint v9).

---

## 13. Переменные окружения

Полный перечень — `.env.example` в корне репозитория. Ключевые блоки:

```
# База данных
POSTGRES_USER=heatcalc
POSTGRES_PASSWORD=heatcalc_pass
POSTGRES_DB=heatcalc_db
DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_db
TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test

# Порты
BACKEND_PORT=8000
FRONTEND_PORT=3003       # prod-overlay переопределяет на 80; demo — 8080

# JWT
SECRET_KEY=change-me-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Первый администратор
FIRST_ADMIN_EMAIL=admin@heatcalc.io
FIRST_ADMIN_PASSWORD=admin

# Лимиты гостевых сессий
GUEST_MAX_SESSIONS_PER_IP=10         # rate limit по IP (in-memory/Redis)
GUEST_MAX_PROJECTS=1
GUEST_MAX_OBJECTS_PER_PROJECT=50
GUEST_SESSION_TTL_MINUTES=20

# Авто-сиды в entrypoint (1 — прогнать `python -m app.seeds`)
RUN_SEEDS=0
```

---

## 13. Playbooks — процедурная документация

Пошаговые инструкции для типовых задач вынесены в `docs/playbooks/`:

| Playbook | Когда |
|---|---|
| `demo-release.md` | Собрать демо-поставку для заказчика |
| `deploy-reg-ru.md` | Деплой в prod на VPS reg.ru (домен + HTTPS) |
| `add-formula.md` | Добавить новую расчётную формулу |
| `add-role-or-permission.md` | Расширить RBAC-матрицу |
| `debug-pdf-export.md` | Отладить экспорт отчётов |

CLAUDE.MD остаётся «архитектурной правдой». Процедуры — в playbooks.

---

## 13a. Подводные камни (pitfalls)

Реальные грабли этого проекта — симптом · причина · решение:
@docs/context/pitfalls.md

Прочитай **перед** отладкой похожих проблем. При нахождении новой — пополни.

---

## 14. Текущий статус и ограничения

Правило текущего целевого уровня:
@docs/context/full-version-rule.md

Актуальный срез готовности и недостающей информации:
@docs/analysis/current-status-and-missing-info.md
