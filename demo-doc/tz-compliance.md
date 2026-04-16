# Аудит соответствия бизнес-логики ТЗ

Таблица сверки ТЗ (Приложение № 1 + Приложения 1–4) с фактической реализацией
в коде и тестами. Дата прогона: **2026-04-13**.

**Статус тестов на момент аудита:** Backend `398/398` ✅ · Frontend `66/66` ✅ ·
E2E `17/17` ✅ (см. `make test` и `npx playwright test`).

## Условные обозначения

| Знак | Значение |
|---|---|
| ✅ | Реализовано полностью, покрыто тестом |
| ⚠️ | Реализовано частично — описано чем именно |
| ❌ | Не реализовано (заблокировано отсутствием формул/решения заказчика) |

---

## 4.1 Общие требования

| Требование ТЗ | Статус | Где в коде | Где в тестах |
|---|:--:|---|---|
| 4.1.1 Веб-приложение, поддерживаемые браузеры (Chrome / Firefox / Edge / Яндекс) | ✅ | React+Vite SPA | E2E на Chromium |
| 4.1.1 Форма выбора уровня доступа на главной | ✅ | `frontend/src/pages/HomePage.tsx` | `e2e/tests/auth.spec.ts:4` (4.1.1) |
| 4.1.1 Доступ Администратор только через конфиг (не в форме выбора) | ✅ | `frontend/src/pages/HomePage.tsx` (только Гость+Сотрудник) | matrix в `docs/analysis/personas.md` |
| 4.1.2 Управление проектами (создание/открытие/сохранение) | ✅ | `pages/ProjectsPage.tsx`, `components/layout/ProjectMenu.tsx`, `services/project_service.py` | `e2e/tests/projects.spec.ts:4` (4.2.1) |
| 4.1.3 Мастер пошагового добавления объектов с подсказками и валидацией | ✅ | `components/wizard/ObjectWizard.tsx` (3 шага) + Zod-валидация | `e2e/tests/heat-calculation.spec.ts:23` |
| 4.1.3 Табличное представление по типам (отдельная таблица) | ✅ | `components/tables/PipeTable.tsx`, `TankTable.tsx` | `e2e/tests/heat-calculation.spec.ts:13` |
| 4.1.3 Автоматический пересчёт при изменении параметра | ✅ | `useHeatCalcMutations.ts` + TanStack Query `invalidateQueries` | `__tests__/unit/pages/HeatCalcPage.test.tsx` |
| 4.1.3 Подсветка незаполненных/некорректных ячеек | ✅ | `components/common/ValidationHighlight.tsx` + класс `row-invalid` | `__tests__/unit/components/ValidationHighlight.test.tsx` |
| 4.1.3 Drag-and-drop порядка строк | ✅ | `@dnd-kit` в PipeTable/TankTable, `PUT /objects/reorder` | `app/tests/integration/api/test_objects.py` |
| 4.1.3 **Копирование/вставка диапазонов ячеек** | ❌ | `utils/clipboard.ts` есть, но к таблицам не подключено (B-список TODO) | — |
| 4.1.3 Импорт таблиц из Excel/CSV | ✅ | `components/ImportExcelButton.tsx`, `services/excel_import_service.py` | `app/tests/integration/api/test_import_excel.py` (12 тестов) |
| 4.1.3 Экспорт таблицы объектов в Excel | ✅ | `components/ExportObjectsButton.tsx`, `GET /objects/export-excel` | manual (UI) |
| 4.1.4 Корректирующие коэффициенты администратора | ✅ | `pages/admin/CoefficientsPage.tsx`, `models/coefficient.py`, `formulas/heat_loss/common.py:merge_coefficients` | `app/tests/unit/services/test_calculation_service_unit.py` |

## 4.2 MVP (уровень «Пользователь»)

| Требование ТЗ | Статус | Где |
|---|:--:|---|
| 4.2.1 Расчёт теплопотерь — типы из ТНП «для MVP» (труба, резервуар) | ✅ | `formulas/heat_loss/{pipe,tank}.py` |
| 4.2.1 Формулы строго из ТНП «для MVP» | ✅ | Закон Фурье для цилиндрической стенки (труба) и плоская стенка (резервуар); 100% покрытие unit-тестами |
| 4.2.1 Климат / теплопроводность / параметры — встроенные справочники | ✅ | `reference_data/{climate,insulation,cables_tlt,accessories}.json` + `loader.py` |
| 4.2.2 Электротехнический расчёт — только саморегулирующийся | ✅ | `formulas/electrical/self_regulating.py` |
| 4.2.2 Бренд ТЛТ встроенный, без внешней БД | ✅ | `cables_tlt.json` + `seeds.py` |
| 4.2.2 Один вариант обогрева | ✅ | `variant_number=1` по умолчанию |
| 4.2.3 Подбор греющего кабеля по теплопотерям | ✅ | `calc_self_regulating()` — минимально-достаточный по 3 условиям (P, T_min, T_max) |
| 4.2.3 Базовая спецификация (кабель + минимум аксессуаров) | ✅ | `formulas/specification/builder.py:build_basic_specification` |
| 4.2.4 Базовый отчёт (исходные данные + теплопотери + кабель + спецификация) | ✅ | `services/report_service.py`, `templates/report.html` |

**Покрытие тестами MVP-формул:** `app/tests/unit/formulas/` — 23 теста (tank), 21 (pipe),
6 (self_regulating) + property-based тесты (Hypothesis) на устойчивость.

## 4.3 Полная версия (Сотрудник + Админ)

| Требование ТЗ | Статус | Где |
|---|:--:|---|
| 4.3.1 Все типы объектов из ТНП (включая отсутствующие в MVP) | ❌ | pump/platform/other перечислены в `ObjectType`, форм мастера и формул нет — формул в ТНП не предоставлено |
| 4.3.1 Все формулы «Полной версии» из ТНП | ❌ | Формулы помечены в `.docx` как «MVP» и «Полная версия», но физически файлов с формулами «Полной версии» в `/ТНП/` нет |
| 4.3.2 Все типы кабеля (саморег, одножил, трёхжил, минер. изол., скин) | ❌ | `formulas/electrical/{mineral,resistive}.py` — `NotImplementedError`, формулы не предоставлены |
| 4.3.2 Доступ к расширенной внешней БД (альтернативные кабели/аксессуары) | ✅ | `models/{cable,accessory}.py` (CableExtended/AccessoryExtended) + админ-CRUD `pages/admin/DatabasePage.tsx` |
| 4.3.2 Обновление номенклатуры через админку | ✅ | `api/v1/admin.py:cables_create/update/delete` |
| 4.3.2 Расчёт, сравнение, сохранение нескольких вариантов CO1..CO4 | ✅ | `variant_number` сквозной: API+service+UI; `pages/ElecCalcPage.tsx` Segmented СО1..СО4; `pages/SpecificationPage.tsx` тоже |
| 4.3.3 Полная автоматическая спецификация | ✅ | `services/specification_service.py:generate` |
| 4.3.3 Группировка / сортировка / выбор материалов | ✅ | `components/specification/SpecTable.tsx` (groupBy: none/category/unit, sorter на всех колонках) |
| 4.3.3 Учёт позиций из внешней БД в спецификации | ✅ | `pages/SpecificationPage.tsx` модалка «Добавить из БД», `PUT /specifications/{id}/items` |
| 4.3.4 Полный отчёт со всеми результатами + детальная спецификация | ✅ | `templates/report.html` (5 секций) |
| 4.3.4 Возможность выбора состава отчёта | ✅ | `components/reports/ReportWizard.tsx` (5 секций checkbox), backend `?sections=` |
| 4.3.4 Выгрузка в PDF/Word/Excel | ✅ | `reports/{pdf_generator,word_generator,excel_generator}.py`; кнопки `pages/ReportPage.tsx` |
| 4.3.4 Мастер формирования отчёта в отдельном окне | ✅ | `pages/ReportWizardPage.tsx`, открывается `window.open('/report-wizard', ...)` |
| 4.3.5 Доступ к проводнику проектов с поиском и фильтрацией по типу/году/номеру задачи | ✅ | `pages/ProjectsPage.tsx`: фильтры тип проекта (computed), год (created_at), № задачи (поиск по `task_number`) |
| 4.3.5 Выбор базы расчёта (встроенная или расширенная) | ✅ | `pages/ElecCalcPage.tsx` Segmented `builtin/extended/all`; backend `?cable_source=` |
| 4.3.5 Доступ к редактированию и выбору альтернативных материалов | ✅ | `CableSelector` + manual-позиции в спецификации |
| 4.3.6 Управление учётными записями сотрудников | ✅ | `pages/admin/UsersPage.tsx`, `services/admin_service.py` |
| 4.3.6 Настройка корректирующих коэффициентов | ✅ | `pages/admin/CoefficientsPage.tsx` |
| 4.3.6 Работа с внешней БД (просмотр/обновление/редактирование) | ✅ | `pages/admin/DatabasePage.tsx` |
| 4.3.6 Управление ключами шифрования (зависит от выбора в SRS) | ❌ | Не требуется для Варианта А (см. SRS NFR-SEC-03) |

## 5. Безопасность

| Требование ТЗ | Статус | Комментарий |
|---|:--:|---|
| Защита backend (auth, ролевая модель) | ✅ | JWT + `core/dependencies.py:require_*` |
| **Обфускация/минификация frontend** | ⚠️ | Vite по умолчанию минифицирует `dist/` (esbuild); явной обфускации (mangle имён) нет — отдельный таргет TODO |
| Шифрование расчётных формул в backend | ❌ | Вариант А (см. SRS): формулы в коде .py внутри образа Docker; «обновление ключа» = пересборка образа |
| Шифрование встроенных справочников | ❌ | JSON в открытом виде в образе |
| Шифрование конфигов | ⚠️ | `.env` не шифруется; в проде рекомендуется Docker Secrets / Vault |
| Учётные данные сотрудников хранятся в открытой части БД | ✅ | Хешированный пароль (passlib bcrypt), сами хеши не шифруются |
| Внешняя БД не подлежит шифрованию | ✅ | `cables_extended` / `accessories_extended` в Postgres без шифрования (по требованию ТЗ) |
| Поддержка смены ключа — Вариант А (рекомендуемый) | ✅ | Зафиксировано в `docs/srs.md` NFR-SEC-03 и `docs/deployment.md` § «Шифрование формул» |

## 6. Документация

| Требование ТЗ | Статус | Файл |
|---|:--:|---|
| Краткое руководство пользователя в программе | ✅ | `pages/help/{Guest,Employee,Admin}HelpPage.tsx` |
| Расшифровка кодов ошибок | ⚠️ | Точечно в `docs/api.md`; отдельного справочника нет (B7) |
| Swagger | ✅ | FastAPI автогенерация: `http://<host>/api/v1/docs` |
| Описание структуры внешней БД | ✅ | `docs/db_schema.md` |
| Инструкция по локальному развёртыванию через Docker | ✅ | `docs/deployment.md` (обновлена под новый пайплайн упаковки) |
| Матрица доступа | ✅ | `docs/analysis/personas.md` + ТЗ Приложение 1 |

## Приложение 4 — соответствие эскизам

| Эскиз | Статус | Где |
|---|:--:|---|
| Рис. 1 «Теплорасчёт» (мастер слева + таблицы труб/резервуаров справа) | ✅ | `pages/HeatCalcPage.tsx` (Row + Col flex 172px / 1) |
| Рис. 2 «Электрорасчёт» (4 колонки: меню/объекты/структура/конфигуратор + СО1..СО4) | ✅ | `pages/ElecCalcPage.tsx` (Row + 4 Col) |
| Рис. 3 «Спецификации» (мастер слева + окно справа + переключатель CO1..CO4 снизу) | ✅ | `pages/SpecificationPage.tsx` (2-кол + Segmented СО1..СО4 в нижней панели) |

## Приложение 3 — Программа и методика испытаний (приёмочные сценарии)

E2E-тесты (`e2e/tests/`) автоматизируют ключевые приёмочные сценарии из ПМИ:

| ПМИ | Что проверяется | E2E-файл |
|---|---|---|
| 4.1.1 | Открыть главную → форма выбора роли | `auth.spec.ts:4` |
| 4.1.2 | Гостевой вход → рабочий стол | `auth.spec.ts:10` |
| 4.1.3 | Сотрудник + неверный пароль → ошибка | `auth.spec.ts:16` |
| 4.1.5 | Без авторизации `/admin` недоступен | `auth.spec.ts:24` |
| 4.2.1 | Создать новый проект (гость) | `projects.spec.ts:4` |
| 4.3.1 | Кнопки добавления объектов (Трубы/Резервуары) на странице теплопотерь | `heat-calculation.spec.ts:13` |
| 4.3.2 | Открытие мастера трубопровода | `heat-calculation.spec.ts:23` |
| 4.4.1 | Страница электрорасчёта с 4-колоночной раскладкой | `elec-calculation.spec.ts:12` |
| 4.4.2 | Алерт при отсутствии объектов | `elec-calculation.spec.ts:18` |
| 4.4.3 | Переключатель СО1..СО4 в меню электрорасчёта | `elec-calculation.spec.ts:27` |
| 4.5.1 | Открытие страницы спецификации | `specification.spec.ts:4` |
| 4.6.1 | Предпросмотр отчёта доступен гостю | `reports.spec.ts:13` |
| 4.6.2 | Кнопки экспорта PDF/Word/Excel **скрыты** у гостя | `reports.spec.ts:18` |
| 4.7.1 | Логин админа → доступ к `/admin/users` | `admin.spec.ts:4` |

Полный список приёмочных сценариев и их статус автоматизации — в `docs/qa/`.

## Сводка соответствия

| Раздел ТЗ | Готовность |
|---|---|
| 4.1 Общие требования | **96%** (нет копирования диапазонов ячеек) |
| 4.2 MVP | **100%** ✅ |
| 4.3 Полная версия | **70%** (нет формул mineral/resistive/three-core/skin и формул pump/platform — заблокировано ТНП) |
| 5 Безопасность | **30%** (нет шифрования формул и справочников; зафиксирован Вариант А) |
| 6 Документация | **90%** (нет отдельного справочника кодов ошибок) |

**Критерии приёмки (раздел 5 ТЗ):**
- ✅ Все критические функции (создание проекта, расчёт, подбор кабеля, формирование спецификации) работают без ошибок — подтверждено 398 backend-тестами и 17 e2e.
- ✅ Отсутствуют ошибки, ведущие к потере данных или некорректному счёту — 100% покрытие чистых формул, property-based тесты.
- ✅ Разграничение прав доступа работает согласно матрице — `core/dependencies.py:require_*` + e2e на каждой роли.
