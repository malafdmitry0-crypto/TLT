# Контекстные диаграммы

## 1. Диаграмма C4: Уровень 1 — Системный контекст

### Описание

Диаграмма показывает систему HeatCalc в контексте её пользователей и внешних зависимостей. На этом уровне мы не рассматриваем внутреннее устройство системы — только кто с ней взаимодействует и что она делает.

**Ключевые наблюдения:**
- Система не интегрирована с внешними ERP/PLM-системами в текущем контуре
- Все три роли пользователей взаимодействуют через единый браузерный клиент
- Нет интеграции с корпоративными каталогами кабелей (данные загружаются вручную администратором)

```mermaid
C4Context
    title Системный контекст HeatCalc

    Person(guest, "Гость", "Внешний проектировщик<br/>или подрядчик.<br/>Работает без регистрации")
    Person(employee, "Сотрудник", "Инженер-теплотехник<br/>нефтяной компании.<br/>Полный доступ к экспорту")
    Person(admin, "Администратор", "Главный инженер.<br/>Управляет методологией<br/>и пользователями")

    System(heatcalc, "HeatCalc", "Система автоматизации расчётов<br/>тепловой защиты трубопроводов<br/>и оборудования.<br/>Расчёт теплопотерь, подбор кабеля,<br/>спецификация, отчёты")

    System_Ext(browser, "Браузер", "Chrome, Firefox, Safari,<br/>Edge — любой современный<br/>браузер")
    System_Ext(storage, "Файловая система", "PDF, DOCX, XLSX файлы<br/>скачиваются локально")

    Rel(guest, browser, "Открывает", "HTTPS")
    Rel(employee, browser, "Открывает", "HTTPS")
    Rel(admin, browser, "Открывает", "HTTPS")
    Rel(browser, heatcalc, "Взаимодействует", "REST API / HTTPS")
    Rel(heatcalc, storage, "Генерирует файлы", "Streaming download")
```

---

## 2. Диаграмма C4: Уровень 2 — Контейнеры

### Описание

Этот уровень раскрывает, из каких крупных блоков (контейнеров) состоит система. Каждый контейнер — это отдельно развёртываемый компонент со своими технологиями.

**Ключевые архитектурные решения:**
- **SPA + REST API** — фронтенд и бэкенд разделены; это позволяет независимо масштабировать и развёртывать компоненты
- **JWT-аутентификация** — stateless; бэкенд не хранит серверные сессии
- **Гостевые сессии** — хранятся в БД, идентифицируются через HTTP-заголовок `X-Session-Id`
- **Справочники** — JSON остаётся версионируемым источником; теплоизоляция дополнительно сидируется в PostgreSQL (`insulation_materials`) и отдаётся через `/references/insulation` из БД

```mermaid
C4Container
    title Контейнеры HeatCalc

    Person(user, "Пользователь", "Гость / Сотрудник / Администратор")

    Container_Boundary(frontend, "Frontend (SPA)") {
        Container(spa, "React SPA", "React 18, Vite,<br/>Ant Design 5, Zustand,<br/>React Query, React Router",
                  "Единое веб-приложение.<br/>Маршрутизация по ролям.<br/>Хранение токенов в localStorage.")
    }

    Container_Boundary(backend, "Backend (API)") {
        Container(api, "FastAPI Application", "Python 3.11, FastAPI,<br/>Uvicorn, SQLAlchemy 2.x,<br/>Pydantic v2",
                  "REST API. Авторизация JWT.<br/>Бизнес-логика расчётов.<br/>Генерация отчётов.")
        Container(formulas, "Расчётный движок", "Python: чистые функции",
                  "Формулы теплопотерь<br/>(труба, резервуар).<br/>Электрорасчёт.<br/>Билдер спецификации.")
        Container(refs, "Справочники", "JSON + DB projection",
                  "climate.json, insulation.json,<br/>cables_tlt.json, accessories.json.<br/>insulation.json сидируется<br/>в insulation_materials.")
    }

    ContainerDb(db, "PostgreSQL 16", "Реляционная СУБД",
                "Пользователи, проекты, объекты,<br/>расчёты, спецификации,<br/>коэффициенты, insulation_materials,<br/>расширенные каталоги.")

    Rel(user, spa, "Использует", "HTTPS / браузер")
    Rel(spa, api, "REST API вызовы", "JSON / HTTPS")
    Rel(api, formulas, "Вызывает напрямую", "Python функции")
    Rel(api, refs, "Читает справочники", "LRU-кэш")
    Rel(api, db, "Читает / пишет", "asyncpg / SQL")
```

---

## 3. Диаграмма C4: Уровень 3 — Компоненты Backend

### Описание

Детализация внутреннего устройства FastAPI-приложения по слоям. Это помогает понять, где находится та или иная логика, и как слои взаимодействуют.

**Принципы слоирования:**
- **API Layer** — тонкие endpoint-функции. Только HTTP-привязка (валидация входа, формирование ответа)
- **Service Layer** — вся бизнес-логика. Оркестрирует вызовы к BД и формулам
- **Formula Layer** — чистые функции без зависимостей на БД; легко тестируемы изолированно
- **Data Layer** — ORM-модели SQLAlchemy

```mermaid
C4Component
    title Компоненты Backend

    Container_Boundary(api_layer, "API Layer (app/api/v1/)") {
        Component(auth_api, "auth.py", "FastAPI Router", "POST /auth/guest<br/>POST /auth/login<br/>POST /auth/refresh<br/>GET /auth/me")
        Component(projects_api, "projects.py", "FastAPI Router", "CRUD проектов")
        Component(objects_api, "objects.py", "FastAPI Router", "CRUD объектов<br/>+ reorder, import/export")
        Component(calc_api, "calculations.py", "FastAPI Router", "POST /calc/heat-loss<br/>POST /calc/electrical<br/>GET /calc/cable-options")
        Component(spec_api, "specifications.py", "FastAPI Router", "GET/POST спецификации")
        Component(report_api, "reports.py", "FastAPI Router", "GET preview<br/>GET export/{format}")
        Component(admin_api, "admin.py", "FastAPI Router", "CRUD users, coefficients,<br/>cables, accessories")
        Component(ref_api, "references.py", "FastAPI Router", "GET climate, insulation,<br/>cables, accessories")
    }

    Container_Boundary(service_layer, "Service Layer (app/services/)") {
        Component(auth_svc, "AuthService", "Python", "JWT generation/validation<br/>Guest session management<br/>Password hashing (bcrypt)")
        Component(project_svc, "ProjectService", "Python", "CRUD + access control<br/>Owner verification")
        Component(calc_svc, "CalculationService", "Python", "Orchestrates formula calls<br/>Loads coefficients from DB<br/>Triggers recalculation")
        Component(spec_svc, "SpecificationService", "Python", "Collects calc results<br/>Calls spec builder")
        Component(report_svc, "ReportService", "Python", "Loads project context<br/>Renders Jinja2 template<br/>Calls format generators")
        Component(admin_svc, "AdminService", "Python", "User management<br/>Coefficient CRUD<br/>Cable/accessory CRUD")
    }

    Container_Boundary(formula_layer, "Formula Layer (app/formulas/)") {
        Component(pipe_formula, "heat_loss/pipe.py", "Pure Python", "calc_pipe_heat_loss()<br/>Многослойная цилиндрическая стенка<br/>R_wall + ΣR_ins + R_ext/R_ground")
        Component(tank_formula, "heat_loss/tank.py", "Pure Python", "calc_tank_heat_loss()<br/>Плоская стенка λ/δ·ΔT·A")
        Component(elec_formula, "electrical/self_regulating.py", "Pure Python", "calc_self_regulating()<br/>Подбор кабеля по мощности")
        Component(spec_builder, "specification/builder.py", "Pure Python", "build_basic_specification()<br/>Группировка по маркам,<br/>добавление аксессуаров")
    }

    Rel(auth_api, auth_svc, "Вызывает")
    Rel(projects_api, project_svc, "Вызывает")
    Rel(calc_api, calc_svc, "Вызывает")
    Rel(spec_api, spec_svc, "Вызывает")
    Rel(report_api, report_svc, "Вызывает")
    Rel(admin_api, admin_svc, "Вызывает")
    Rel(calc_svc, pipe_formula, "Вызывает")
    Rel(calc_svc, tank_formula, "Вызывает")
    Rel(calc_svc, elec_formula, "Вызывает")
    Rel(spec_svc, spec_builder, "Вызывает")
```

---

## 4. Use Case Диаграмма

### Описание

Use Case диаграмма показывает все варианты использования системы в разрезе ролей. Прямоугольником обозначена граница системы. Стрелки «include» показывают обязательные предусловия.

```mermaid
flowchart LR
    subgraph Guest["👤 Гость"]
        G1([Создать гостевую сессию])
    end

    subgraph Employee["🧑‍💼 Сотрудник\n(наследует Гостя)"]
        E1([Войти по логину])
        E2([Просмотреть профиль])
        E3([Обновить токен])
    end

    subgraph Admin["👨‍💼 Администратор\n(наследует Сотрудника)"]
        A1([Управлять пользователями])
        A2([Управлять коэффициентами])
        A3([Управлять каталогом кабелей])
        A4([Управлять аксессуарами])
    end

    subgraph System["🖥️ HeatCalc"]
        subgraph Auth["Авторизация"]
            UC1(Создать гостевую сессию)
            UC2(Войти по email/паролю)
            UC3(Обновить access token)
        end
        subgraph Projects["Проекты"]
            UC4(Создать проект)
            UC5(Просмотреть список проектов)
            UC6(Редактировать проект)
            UC7(Удалить проект)
        end
        subgraph Calc["Расчёты"]
            UC8(Добавить объект с расчётом)
            UC9(Обновить параметры)
            UC10(Пакетный пересчёт)
            UC11(Рассчитать электрообогрев)
        end
        subgraph Reports["Отчётность"]
            UC12(Сгенерировать спецификацию)
            UC13(Предпросмотр отчёта)
            UC14(Экспортировать PDF/DOCX/XLSX)
        end
        subgraph Refs["Справочники"]
            UC15(Просмотреть климат/изоляцию)
            UC16(Просмотреть расширенные каталоги)
        end
        subgraph AdminUC["Администрирование"]
            UC17(CRUD пользователей)
            UC18(CRUD коэффициентов)
            UC19(CRUD кабелей)
            UC20(CRUD аксессуаров)
        end
    end

    G1 --- UC1
    E1 --- UC2
    E3 --- UC3
    A1 --- UC17
    A2 --- UC18
    A3 --- UC19
    A4 --- UC20

    UC4 -.->|include| UC1
    UC4 -.->|include| UC2
    UC8 -.->|include| UC4
    UC11 -.->|include| UC8
    UC12 -.->|include| UC11
    UC14 -.->|include| UC2
```

---

## 5. Компонентная диаграмма Frontend

### Описание

Frontend построен как SPA (Single Page Application) на React. Состояние разделено на три независимых Zustand-стора. Маршрутизация защищена компонентом `ProtectedRoute`, проверяющим роль пользователя.

```mermaid
flowchart TB
    subgraph Browser["Браузер"]
        subgraph App["App.tsx"]
            direction TB
            Router["React Router"]
            
            subgraph PublicRoutes["Публичные маршруты"]
                HomePage["/  — HomePage\n(выбор роли)"]
                LoginPage["/login — LoginPage"]
            end
            
            subgraph ProtectedArea["ProtectedRoute (проверка роли)"]
                subgraph Workspace["/workspace — MainLayout"]
                    WorkspacePage["/ — WorkspacePage"]
                    HeatCalcPage["/heat-calc — HeatCalcPage"]
                    ElecCalcPage["/elec-calc — ElecCalcPage"]
                    SpecPage["/specification — SpecificationPage"]
                    ReportPage["/report — ReportPage"]
                end
                subgraph AdminArea["/admin — AdminLayout (только admin)"]
                    UsersPage["/users — UsersPage"]
                    CoeffPage["/coefficients — CoefficientsPage"]
                    DBPage["/database — DatabasePage"]
                end
                ProjectsPage["/projects — ProjectsPage"]
            end
        end
        
        subgraph Stores["Zustand Stores"]
            AuthStore["authStore\nrole, user, tokens\nsessionId"]
            ProjectStore["projectStore\ncurrentProject\nobjects"]
            UIStore["uiStore\nloading, errors"]
        end
        
        subgraph APILayer["API Layer (axios)"]
            AuthAPI["auth.ts"]
            ProjectsAPI["projects.ts"]
            CalcAPI["calculations.ts"]
            SpecAPI["specifications.ts"]
            ReportsAPI["reports.ts"]
            AdminAPI["admin.ts"]
            RefsAPI["references.ts"]
        end
        
        subgraph CommonComponents["Переиспользуемые компоненты"]
            RoleGuard["RoleGuard\n(скрыть по роли)"]
            ValidationHighlight["ValidationHighlight\n(подсветка ошибок)"]
            ObjectWizard["ObjectWizard\n(мастер добавления)"]
            HeatCalcColumnSettings["ColumnSettingsModal\n(настройки таблицы SC-03)"]
            SpecTable["SpecTable\n(спецификация)"]
            ReportPreview["ReportPreview\n(HTML-отчёт)"]
        end
    end

    Router --> PublicRoutes
    Router --> ProtectedArea
    HeatCalcPage --> ObjectWizard
    HeatCalcPage --> HeatCalcColumnSettings
    SpecPage --> SpecTable
    ReportPage --> ReportPreview
    
    HeatCalcPage --> ProjectStore
    AuthStore --> ProtectedArea
    APILayer --> AuthStore
```
