# Реализованные юзер-кейсы (есть в продукте)

Сценарии, которые работают в текущей версии. ID согласованы с
`docs/srs/02-use-cases.md`. Привязка к коду дана для трассировки.
Дата сверки: 2026-06-08.

## 1. Доступ и сессии

| ID | Сценарий | Роль | Где в коде |
|---|---|---|---|
| UC-G-01 | Вход без регистрации + авто-проект | Гость | `api/v1/auth.py` (`POST /auth/guest`), `auth_service.create_guest_session` |
| UC-G-21 | Авто-завершение сессии по неактивности (TTL) | Гость | `_periodic_guest_cleanup` (lifespan) |
| UC-E-01 | Авторизация Сотрудника (JWT) | Сотрудник | `POST /auth/login`, `core/security.py` |

## 2. Управление проектами

| ID | Сценарий | Роль | Где в коде |
|---|---|---|---|
| UC-G-02 | Создание проекта (замена текущего у гостя) | Гость | `project_service.create_project` (лимит 1) |
| UC-G-04 | Удаление текущего проекта | Гость | `DELETE /projects/{id}` |
| UC-G-19 | Экспорт проекта в CSV | Оба | `GET /projects/{id}/export-csv`, `project_io_service.py` |
| UC-G-20 | Импорт CSV с заменой (Гость) | Гость | `POST /projects/import-csv` |
| UC-E-02 | Проводник проектов: поиск/фильтр | Сотрудник | `GET /projects` + фильтры |
| UC-E-03 | Создание проекта в проводнике | Сотрудник | `POST /projects` |
| UC-E-04 | Редактирование свойств проекта | Сотрудник | `PUT /projects/{id}` |
| UC-E-05 | Удаление проекта из проводника | Сотрудник | `DELETE /projects/{id}` |
| UC-E-06 | Импорт CSV как нового проекта | Сотрудник | `POST /projects/import-csv-bulk` |
| UC-E-07 | Создание проекта на основании другого | Сотрудник | `POST /projects/{id}/duplicate` |
| UC-E-08 | Приватность гостевых проектов в проводнике | Сотрудник | фильтрация владельца в `project_service` |

## 3. Теплотехнический расчёт

| ID | Сценарий | Роль | Где в коде |
|---|---|---|---|
| UC-G-06 | Заполнение общих первичных данных проекта | Оба | `ObjectWizard.tsx`, `schemas/calculation.py` |
| UC-G-07 | Добавление трубопровода + авторасчёт | Оба | `calc_pipe_heat_loss`, `POST /objects` |
| UC-G-08 | Добавление резервуара + авторасчёт | Оба | `calc_tank_heat_loss` |
| UC-G-09 | Редактирование объекта + пересчёт | Оба | `PUT /objects/{id}` |
| UC-G-10 | Удаление объекта | Оба | `DELETE /objects/{id}` |
| UC-G-11 | Изменение порядка строк (backend) | Оба | `PUT /objects/reorder` (UI DnD — см. UC-TODO-06) |
| UC-G-12 | Импорт объектов из Excel / CSV | Оба | `excel_import_service.py`, `POST /objects/import-excel` |
| UC-G-13 | Ручной ввод λ для материала «Другое» | Оба | `InsulationLayer` (`material="other"`) |
| UC-G-23 | Excel-подобная работа с таблицей (inline-edit, TSV-копир.) | Оба | `HeatCalcPage.tsx` |
| UC-G-24 | Активные подсказки в формах | Оба | `ObjectWizard.tsx` |

Привязка алгоритмов: [`../heat-loss/`](../heat-loss/README.md).

## 4. Электротехнический расчёт

| ID | Сценарий | Роль | Где в коде |
|---|---|---|---|
| UC-G-14 | Автоматический электрорасчёт (batch) | Оба | `POST /calc/electrical/batch`, `batch_calc_electrical` |
| UC-G-15 | Выбор марки кабеля в строке (ручной) | Оба | `calc_self_regulating` (manual), `CableSelector.tsx` |
| UC-G-16 | Настройка навива и нескольких ниток | Оба | `_winding_coefficient`, `number_of_threads` |
| UC-G-25 | Выбор типа кабеля для объекта | Оба | dispatch `_calculate_electrical_result` |
| UC-G-26 | Создание варианта расчёта CO1…CO4 | Оба | `variant_number` |
| UC-G-28 | Выбор активного варианта расчёта | Оба | `variant_number` switch (UI) |
| UC-E-10 | Переключение базы расчёта (builtin/extended/all) | Сотрудник | `cable_source`, `references/cables/extended` |

Поддержанные типы: ТЛТ, ТТН/ТТВ/ТТХ, ТТ Р1, ТТ Р3. Привязка алгоритмов:
[`../electrical/`](../electrical/README.md).

## 5. Спецификация

| ID | Сценарий | Роль | Где в коде |
|---|---|---|---|
| UC-G-17 | Формирование и просмотр базовой спецификации | Оба | `build_basic_specification`, `SpecificationPage.tsx` |
| UC-E-11 | Редактирование расширенной спецификации | Сотрудник | `specification_service.py` (внешняя БД, ручные позиции) |

Привязка алгоритма: [`../specification/`](../specification/README.md).
Ограничение базовой спецификации см. UC-TODO-01.

## 6. Отчёты

| ID | Сценарий | Роль | Где в коде |
|---|---|---|---|
| UC-G-18 | Предпросмотр и печать отчёта | Оба | `GET /reports/{id}/preview`, `ReportPreview` |
| UC-E-09 | Экспорт отчёта PDF / DOCX / XLSX | Сотрудник | `GET /reports/{id}/export/{fmt}`, `reports/*_generator.py` |
| UC-E-12 | Мастер выбора состава отчёта | Сотрудник | `ReportPage.tsx` (мастер состава) |
| UC-E-13 | Сводный отчёт по нескольким вариантам CO | Сотрудник | `report_service.py` |

## 7. Администрирование

| ID | Сценарий | Роль | Где в коде |
|---|---|---|---|
| UC-A-01 | Управление учётными записями сотрудников | Админ | `admin_service.py`, `/admin/users` |
| UC-A-02 | Настройка корректирующих коэффициентов | Админ | `/admin/coefficients`, `get_correction_coefficients` |
| UC-A-03 | Редактирование внешней БД кабелей | Админ | `/admin/cables` |
| UC-A-04 | Редактирование внешней БД аксессуаров | Админ | `/admin/accessories` |

## 8. Прочее (есть, но с оговорками)

| ID | Сценарий | Роль | Примечание |
|---|---|---|---|
| UC-G-22 | Копирование строки (объект на основании) | Оба | реализовано |
| UC-E-09…13 | Полный экспорт/отчёты сотрудника | Сотрудник | реализовано; визуальный корпоративный шаблон — открытый вопрос |
