# Диаграммы процессов

## 1. Диаграмма последовательности: Гостевой вход и первый расчёт

### Описание

Показывает полный поток для самого частого сценария гостя: от открытия браузера до получения результата расчёта. Акцент — на отсутствии JWT и идентификации через `X-Session-Id`.

**Ключевые моменты:**
- Сессия создаётся в БД (таблица хранит session_id и метаданные)
- Каждый запрос гостя несёт заголовок `X-Session-Id` вместо `Authorization: Bearer`
- Расчёт теплопотерь запускается автоматически при создании объекта (внутри service layer)
- Гость получает результат в теле ответа на тот же запрос создания объекта

```mermaid
sequenceDiagram
    actor Guest as Гость (браузер)
    participant SPA as React SPA
    participant API as FastAPI
    participant Auth as AuthService
    participant Proj as ProjectService
    participant Calc as CalculationService
    participant Form as Formula Layer
    participant DB as PostgreSQL

    Guest->>SPA: Открывает /\nНажимает "Войти как гость"
    SPA->>API: POST /api/v1/auth/guest
    API->>Auth: create_guest_session()
    Auth->>DB: INSERT guest_session\n(session_id = uuid4())
    DB-->>Auth: session created
    Auth-->>API: { session_id: "abc-123" }
    API-->>SPA: 201 { session_id }
    SPA->>SPA: Сохранить session_id\nв authStore (localStorage)

    Guest->>SPA: Нажимает "Новый проект"\nЗаполняет название, локацию, t_amb
    SPA->>API: POST /api/v1/projects\nX-Session-Id: abc-123\n{ name, location, ambient_temperature }
    API->>Auth: validate_guest_session("abc-123")
    Auth->>DB: SELECT guest_session WHERE session_id
    DB-->>Auth: session found
    Auth-->>API: session valid
    API->>Proj: create_project(data, session_id="abc-123")
    Proj->>DB: INSERT project\n(owner_id=NULL, session_id="abc-123")
    DB-->>Proj: project_id = "proj-456"
    Proj-->>API: project object
    API-->>SPA: 201 { id: "proj-456", ... }
    SPA->>SPA: Сохранить project_id в projectStore

    Guest->>SPA: Добавляет трубу:\nDN100, L=100м, t_proc=80°C\nизоляция: минвата 50мм
    SPA->>API: POST /api/v1/objects\nX-Session-Id: abc-123\n{ project_id, object_type: "pipe",\n  pipe_params: {...} }
    API->>Auth: validate_guest_session()
    Auth-->>API: valid
    API->>Calc: create_object_with_calc(params)
    Calc->>DB: SELECT correction_coefficients
    DB-->>Calc: { safety_factor: 1.1, ... }
    Calc->>Form: calc_pipe_heat_loss(\n  diameter=100, length=100,\n  t_proc=80, t_amb=-30,\n  insulation=[{mat:"minvata", thick:50}],\n  coefficients={...})
    Form-->>Calc: { heat_loss_per_meter: 32.4,\n  total_heat_loss: 3240 }
    Calc->>Form: calc_self_regulating(\n  required_power=3240,\n  pipe_length=100)
    Form-->>Calc: { cable: "TLT-25",\n  power: 25 W/m,\n  length: 110 }
    Calc->>DB: INSERT project_object\nINSERT calculation
    DB-->>Calc: saved
    Calc-->>API: { object, calculation }
    API-->>SPA: 201 { object_id, heat_loss_per_meter: 32.4,\n  selected_cable: "TLT-25", ... }
    SPA->>SPA: Обновить таблицу объектов\nПоказать результат
    SPA-->>Guest: Отображает строку таблицы:\n"Труба 1 | 32.4 Вт/м | TLT-25 | 110 м"
```

---

## 2. Диаграмма последовательности: Расчёт теплопотерь трубы (детальный)

### Описание

Детализирует алгоритм вычисления теплопотерь для надземной трубы с многослойной изоляцией. Показывает, как Formula Layer применяет коэффициенты из БД.

**Физическая модель:**
- Многослойная цилиндрическая стенка (закон Фурье в цилиндрических координатах)
- Термическое сопротивление: `R = ln(r_outer/r_inner) / (2π·λ·L)`
- Суммарное сопротивление: `R_total = R_wall + ΣR_insulation + R_ext`
- Теплопоток: `Q = ΔT / R_total`

```mermaid
sequenceDiagram
    participant API as CalculationService
    participant Form as pipe.py (formulas)
    participant Coef as CorrectionCoefficients

    API->>Coef: load_coefficients()
    Coef-->>API: { safety_factor: 1.1 }

    API->>Form: calc_pipe_heat_loss(\n  d_outer=114mm, wall=4mm,\n  length=100m, t_proc=80°C,\n  t_amb=-30°C,\n  layers=[{mat:"minvata",\n    thick=50mm, lambda=0.04}],\n  underground=false,\n  coefficients={...})

    Note over Form: 1. Геометрия трубы
    Form->>Form: d_inner = d_outer - 2·wall = 106 mm
    Form->>Form: r_pipe_inner = 0.053 m
    Form->>Form: r_pipe_outer = 0.057 m

    Note over Form: 2. Термосопротивление стенки трубы
    Form->>Form: R_wall = ln(0.057/0.053)\n/ (2π · λ_steel · 1)\n= 0.000184 (м·°C/Вт)

    Note over Form: 3. Термосопротивление слоёв изоляции
    Form->>Form: r_ins_outer = 0.057 + 0.050 = 0.107 m
    Form->>Form: R_ins = ln(0.107/0.057)\n/ (2π · 0.04 · 1)\n= 2.35 (м·°C/Вт)

    Note over Form: 4. Внешнее конвективное сопротивление
    Form->>Form: alpha_ext = 11.6 + 7√v
    Form->>Form: R_ext = 1 / (2π · r_ins_outer · alpha_ext)\n= 0.149 (м·°C/Вт)

    Note over Form: 5. Суммарное сопротивление
    Form->>Form: R_total = 0.000184 + 2.35 + 0.149\n= 2.499 (м·°C/Вт)

    Note over Form: 6. Базовый тепловой поток на 1 м
    Form->>Form: ΔT = t_proc - t_amb = 80 - (-30) = 110 °C
    Form->>Form: q_base = ΔT / R_total = 110 / 2.499\n= 44.0 Вт/м

    Note over Form: 7. Удельные теплопотери без K
    Form->>Form: q_linear = q_base

    Note over Form: 8. Коэффициенты итогового Q
    Form->>Form: Q_total = q_linear × L_eff\n× safety_factor

    Form-->>API: { heat_loss_per_meter: q_linear,\n  total_heat_loss: Q_total,\n  r_wall: 0.000184,\n  r_insulation: [2.35],\n  r_ext: 0.149,\n  safety_factor:1.1 }
```

---

## 3. Диаграмма последовательности: Генерация отчёта

### Описание

Показывает полный поток генерации отчёта от запроса до получения файла. Ключевой момент: для генерации файла (PDF/DOCX/XLSX) нужна роль `employee` или `admin`, тогда как HTML-предпросмотр доступен всем.

```mermaid
sequenceDiagram
    actor User as Сотрудник (браузер)
    participant SPA as React SPA
    participant API as FastAPI
    participant Auth as JWT Middleware
    participant RepSvc as ReportService
    participant SpecSvc as SpecificationService
    participant DB as PostgreSQL
    participant Jinja as Jinja2 Template
    participant Gen as Format Generator\n(pdf/docx/xlsx)

    User->>SPA: Нажимает "Предпросмотр"
    SPA->>API: GET /api/v1/reports/{project_id}/preview\nAuthorization: Bearer {token}
    API->>Auth: validate_jwt(token)
    Auth-->>API: user_id, role="employee"

    API->>RepSvc: get_preview(project_id, user_id)
    RepSvc->>DB: SELECT project + objects + calculations
    DB-->>RepSvc: project context

    RepSvc->>SpecSvc: get_or_generate_spec(project_id)
    SpecSvc->>DB: SELECT specifications WHERE project_id
    alt Спецификация есть
        DB-->>SpecSvc: spec found
    else Спецификации нет
        SpecSvc->>DB: SELECT calculations JOIN objects
        DB-->>SpecSvc: calculations data
        SpecSvc->>SpecSvc: build_basic_specification()
        SpecSvc->>DB: INSERT specification
        DB-->>SpecSvc: spec saved
    end
    SpecSvc-->>RepSvc: specification

    RepSvc->>Jinja: render("report.html", {\n  project, objects,\n  calculations, specification })
    Jinja-->>RepSvc: HTML string

    RepSvc-->>API: html_content
    API-->>SPA: 200 { html: "..." }
    SPA->>SPA: Отображает ReportPreview компонент
    SPA-->>User: HTML-предпросмотр в браузере

    User->>SPA: Нажимает "Скачать PDF"
    SPA->>API: GET /api/v1/reports/{project_id}/export/pdf\nAuthorization: Bearer {token}
    API->>Auth: validate_jwt(token)
    Auth-->>API: role="employee" ✅

    API->>RepSvc: export(project_id, format="pdf")
    RepSvc->>DB: SELECT project + objects + calculations + spec
    DB-->>RepSvc: full context

    RepSvc->>Jinja: render("report.html", context)
    Jinja-->>RepSvc: HTML string

    RepSvc->>Gen: html_to_pdf(html_string)
    Note over Gen: WeasyPrint / xhtml2pdf
    Gen-->>RepSvc: PDF bytes

    RepSvc-->>API: StreamingResponse(pdf_bytes,\n  media_type="application/pdf")
    API-->>SPA: 200 streaming PDF
    SPA->>SPA: Инициирует download\n"report_{name}.pdf"
    SPA-->>User: Файл сохранён локально
```

---

## 4. Диаграмма последовательности: Изменение коэффициента администратором

### Описание

Показывает, как изменение коэффициента администратором влияет на последующие расчёты. Подчёркивает важность: существующие расчёты **не пересчитываются** автоматически — только новые используют новый коэффициент.

```mermaid
sequenceDiagram
    actor Admin as Администратор
    participant SPA as React SPA
    participant API as FastAPI
    participant Auth as JWT Middleware
    participant AdminSvc as AdminService
    participant CalcSvc as CalculationService
    participant DB as PostgreSQL
    participant Cache as LRU Cache

    Admin->>SPA: Admin → Коэффициенты\nМеняет safety_factor: 1.1 → 1.2
    SPA->>API: PATCH /api/v1/admin/coefficients/safety_factor\nAuthorization: Bearer {admin_token}\n{ value: 1.2 }
    API->>Auth: validate_jwt(token)
    Auth-->>API: role="admin" ✅

    API->>AdminSvc: update_coefficient("safety_factor", 1.2, admin_id)
    AdminSvc->>DB: UPDATE correction_coefficients\nSET value=1.2, updated_at=now(),\n    updated_by={admin_id}\nWHERE key="safety_factor"
    DB-->>AdminSvc: updated
    AdminSvc->>Cache: invalidate("correction_coefficients")
    Note over Cache: Следующий запрос\nперечитает из БД

    AdminSvc-->>API: { key: "safety_factor", value: 1.2 }
    API-->>SPA: 200 { updated coefficient }
    SPA-->>Admin: "Коэффициент обновлён ✓"

    Note over Admin,DB: Далее — новый расчёт другого пользователя

    actor Emp as Сотрудник
    Emp->>API: POST /api/v1/objects\n{ pipe_params: {...} }
    API->>CalcSvc: create_object_with_calc(params)
    CalcSvc->>DB: SELECT correction_coefficients
    Note over DB: safety_factor = 1.2 (новое значение)
    DB-->>CalcSvc: { safety_factor: 1.2, ... }
    CalcSvc->>CalcSvc: Применяет safety_factor=1.2\nк расчёту
    CalcSvc-->>API: { heat_loss_per_meter: 55.8 }\n(было бы 50.8 при 1.1)

    Note over Admin,DB: Существующие расчёты НЕ изменяются\nЗапустить пересчёт можно через\nPOST /objects/recalculate (явно)
```

---

## 5. Диаграмма активности: Полный сценарий гостя

### Описание

Диаграмма активности (Activity Diagram в нотации BPMN-style) показывает пошаговый путь внешнего проектировщика от входа до получения результата. Swim lanes разделяют ответственность между пользователем, браузером и системой.

```mermaid
flowchart TD
    Start([Открыл HeatCalc]) --> ChooseRole{Выбор роли}
    ChooseRole -->|Гость| GuestLogin[POST /auth/guest\nПолучить session_id]
    ChooseRole -->|Есть логин| EmployeeLogin[POST /auth/login\nПолучить JWT]

    GuestLogin --> CreateProject
    EmployeeLogin --> CreateProject

    CreateProject[Создать проект\nНазвание, локация, t_amb] --> AddObject{Добавить объект}

    AddObject -->|Труба| FillPipeParams[Заполнить параметры трубы\nDN, длина, t_проц, изоляция]
    AddObject -->|Резервуар| FillTankParams[Заполнить параметры резервуара\nОбъём, форма, t_проц, изоляция]

    FillPipeParams --> AutoCalc[Автоматический расчёт\nпри сохранении]
    FillTankParams --> AutoCalc

    AutoCalc --> ValidCheck{Расчёт успешен?}

    ValidCheck -->|Нет| ShowError[Показать ошибку валидации\nПодсветить поле]
    ShowError --> FixParams[Исправить параметры]
    FixParams --> AutoCalc

    ValidCheck -->|Да| ShowResult[Показать результат в таблице\nВт/м, кабель, длина]

    ShowResult --> MoreObjects{Добавить ещё объекты?}
    MoreObjects -->|Да| AddObject
    MoreObjects -->|Нет| GenerateSpec[Генерировать спецификацию\nPOST /specifications]

    GenerateSpec --> PreviewReport[Предпросмотр отчёта\nGET /reports/preview]

    PreviewReport --> RoleCheck{Роль пользователя?}

    RoleCheck -->|Гость| ShowHTMLOnly[Показать HTML в браузере\nПоделиться ссылкой с заказчиком]
    RoleCheck -->|Сотрудник / Админ| ExportChoice{Формат экспорта}

    ExportChoice -->|PDF| DownloadPDF[Скачать PDF\nДля согласования]
    ExportChoice -->|DOCX| DownloadDOCX[Скачать DOCX\nДля редактирования]
    ExportChoice -->|XLSX| DownloadXLSX[Скачать XLSX\nДля снабжения]

    ShowHTMLOnly --> End([Задача выполнена])
    DownloadPDF --> End
    DownloadDOCX --> End
    DownloadXLSX --> End
```

---

## 6. Диаграмма активности: Сценарий проверки расчётов сотрудником

### Описание

Сотрудник проверяет расчёты подрядчика только после явной передачи проекта в рабочий контур. Гостевые проекты подрядчиков без передачи не раскрываются в проводнике.

```mermaid
flowchart TD
    Start([Уведомление: подрядчик\nсдал расчёты]) --> Login[Войти по логину/паролю\nПолучить JWT]

    Login --> OpenProjects[Открыть список проектов сотрудников\nGET /projects]

    OpenProjects --> FindProject[Найти переданный рабочий проект\nпо названию / дате]

    FindProject --> ReviewObjects[Просмотреть список объектов\nGET /objects?project_id=...]

    ReviewObjects --> CheckValid{Есть объекты\nс is_valid=false?}

    CheckValid -->|Да| MarkForReview[Отметить проблемные объекты\nКопировать список замечаний]
    MarkForReview --> ContactContractor[Передать замечания подрядчику\n(вне системы: email/звонок)]
    ContactContractor --> WaitFix[Ждать исправлений]
    WaitFix --> ReviewObjects

    CheckValid -->|Нет, все валидны| CheckResults[Проверить результаты расчётов\nСравнить с нормативами]

    CheckResults --> ResultsOK{Результаты\nкорректны?}

    ResultsOK -->|Нет, подозрительные значения| CheckCoefficients[Проверить коэффициенты\nAdmin → Коэффициенты]
    CheckCoefficients --> RecalculateManual[Запустить пересчёт\nPOST /objects/recalculate]
    RecalculateManual --> CheckResults

    ResultsOK -->|Да| GenerateSpec[Сгенерировать/обновить\nспецификацию]

    GenerateSpec --> PreviewHTML[Предпросмотр HTML-отчёта]

    PreviewHTML --> FinalCheck{Отчёт соответствует\nтребованиям?}

    FinalCheck -->|Нет| EditProjectMeta[Скорректировать метаданные\nпроекта (название, описание)]
    EditProjectMeta --> PreviewHTML

    FinalCheck -->|Да| ExportPDF[Экспорт PDF\nGET /reports/export/pdf]

    ExportPDF --> SendToChief[Отправить PDF\nглавному инженеру на подпись\n(вне системы)]

    SendToChief --> ExportXLSX[Экспорт XLSX\nДля отдела снабжения]

    ExportXLSX --> End([Проект передан в работу])
```

---

## 7. Диаграмма последовательности: Пакетный пересчёт

### Описание

Когда пользователь изменяет параметры нескольких объектов подряд или когда администратор обновил коэффициенты, может потребоваться пересчёт всех объектов проекта за одну операцию.

```mermaid
sequenceDiagram
    actor User as Пользователь
    participant SPA as React SPA
    participant API as FastAPI
    participant CalcSvc as CalculationService
    participant Form as Formula Layer
    participant DB as PostgreSQL

    User->>SPA: Нажимает "Пересчитать всё"\n(после изменений параметров)
    SPA->>API: POST /api/v1/objects/recalculate\n{ project_id: "proj-456" }
    API->>CalcSvc: batch_recalculate(project_id)

    CalcSvc->>DB: SELECT correction_coefficients
    DB-->>CalcSvc: current coefficients

    CalcSvc->>DB: SELECT project_objects\nWHERE project_id="proj-456"\nORDER BY sort_order
    DB-->>CalcSvc: [obj1(pipe), obj2(pipe),\n  obj3(tank), obj4(pipe)]

    loop Для каждого объекта
        CalcSvc->>Form: calc_heat_loss(obj.params, coefficients)
        Form-->>CalcSvc: heat_loss_result

        alt Расчёт успешен
            CalcSvc->>Form: calc_self_regulating(heat_loss, length)
            Form-->>CalcSvc: cable_selection
            CalcSvc->>DB: UPSERT calculation\nSET is_valid=true
        else Расчёт провален
            CalcSvc->>DB: UPDATE project_objects\nSET is_valid=false
        end
    end

    CalcSvc->>DB: DELETE specifications\nWHERE project_id (устарела)
    Note over DB: Спецификация инвалидирована,\nбудет создана заново при запросе

    CalcSvc-->>API: { recalculated: 4,\n  valid: 3, invalid: 1,\n  invalidated_objects: [{id, name}] }
    API-->>SPA: 200 { summary }
    SPA->>SPA: Обновить таблицу объектов\nПодсветить невалидные
    SPA-->>User: "Пересчитано: 3 ✓, 1 ✗\n(Объект 'Насос P-101': ошибка диаметра)"
```
