# TC-REP: Отчёты

## TC-REP-01: HTML-предпросмотр отчёта

**Автоматизировано:** ✅ `test_reports.py::TestReports::test_preview_returns_html`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать проект с 1 объектом `pipe` | `project_id` |
| 2 | `GET /api/v1/reports/{project_id}/preview?variant_number=1` | HTTP 200 |
| 3 | `body.html` содержит | `<html` тег |
| 4 | `body.data.objects` | массив длиной 1 |
| 5 | `body.data.project.name` | имя проекта |

---

## TC-REP-02: Гость не может экспортировать отчёт

**Автоматизировано:** ✅ `test_reports.py::TestReports::test_guest_cannot_export`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /api/v1/reports/{project_id}/export/xlsx?variant_number=1` с `X-Session-Id` гостя | HTTP 403 |
| 2 | `GET /api/v1/reports/{project_id}/export/pdf?variant_number=1` с `X-Session-Id` гостя | HTTP 403 |
| 3 | `GET /api/v1/reports/{project_id}/export/docx?variant_number=1` с `X-Session-Id` гостя | HTTP 403 |

---

## TC-REP-03: Экспорт XLSX сотрудником

**Автоматизировано:** ✅ `test_reports.py::TestReports::test_employee_export_xlsx`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /api/v1/reports/{project_id}/export/xlsx?variant_number=1` с токеном сотрудника | HTTP 200 |
| 2 | `Content-Type` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| 3 | `Content-Disposition` | `attachment; filename=report.xlsx` |
| 4 | Тело ответа | Бинарный XLSX-файл (не пустой) |
| 5 | Открыть файл в Excel | Корректная структура, данные проекта |

---

## TC-REP-04: Экспорт PDF сотрудником

**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /api/v1/reports/{project_id}/export/pdf?variant_number=1` с токеном | HTTP 200 |
| 2 | `Content-Type` | `application/pdf` |
| 3 | Открыть файл | Корректный PDF с данными проекта |

---

## TC-REP-05: Экспорт DOCX сотрудником

**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /api/v1/reports/{project_id}/export/docx?variant_number=1` с токеном | HTTP 200 |
| 2 | `Content-Type` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| 3 | Открыть файл в Word | Корректная структура |

---

## TC-REP-06: Отчёт по проекту со спецификацией

**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать проект, добавить объект, выполнить электрорасчёт | — |
| 2 | Сгенерировать спецификацию | — |
| 3 | `GET /api/v1/reports/{project_id}/preview?variant_number=1` | HTML содержит таблицу спецификации |
| 4 | Экспортировать в XLSX | Лист «Спецификация» заполнен |

---

## TC-REP-07: Отчёт для несуществующего проекта

**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /api/v1/reports/00000000-0000-0000-0000-000000000000/preview?variant_number=1` | HTTP 404 |
| 2 | Проверить тело ответа | `{"detail": "Проект не найден", ...}` |

---

## TC-REP-08: Отчёт формируется по явно выбранным UUID ЭР

**Автоматизировано:** ✅ backend
`test_reports.py::TestReports::test_preview_requires_explicit_variant_number`,
`test_preview_multi_er_independent_chapters` и unit
`test_report_service_unit.py::TestLoadContext::test_requested_variant_picked`;
frontend `ReportPage.test.tsx`.

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Подготовить проект с расчётами/спецификациями в двух именованных ЭР | Сохранены два разных UUID scope |
| 2 | Открыть страницу «Отчёт» и выбрать второй ЭР по имени | UI хранит и отправляет UUID выбранного ЭР |
| 3 | `GET /api/v1/reports/{project_id}/preview` без UUID и без `variant_number` | HTTP 422 |
| 4 | Передать два `electrical_variant_ids` | HTML/response содержат две независимые главы с именами ЭР; суммы не объединены |
| 5 | Проверить deprecated `variant_number=2` | Ответ относится ровно к ЭР с compatibility slot 2 |
| 6 | Экспортировать один ЭР через direct/job endpoint с UUID | В файл попадают `ElectricalCalculation` и `Specification` только выбранного ЭР |

---

## TC-REP-09: Неизвестный формат экспорта

**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /api/v1/reports/{id}/export/pptx?variant_number=1` с токеном сотрудника | HTTP 400 или 422 |
| 2 | Сообщение | «Неизвестный формат» |
