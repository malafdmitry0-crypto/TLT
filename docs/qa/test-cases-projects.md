# TC-PROJ: Проекты

## TC-PROJ-01: Создание проекта гостем

**Предусловие:** Получен `session_id`  
**Автоматизировано:** ✅ `test_projects.py::TestProjectsCRUD::test_create_project_as_guest`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `POST /api/v1/projects` с `{"name":"Новый проект"}` и заголовком `X-Session-Id` | HTTP 201 |
| 2 | Проверить поля | `id`, `name`, `status=draft`, `session_id=<наш session_id>`, `user_id=null` |
| 3 | Создать проект без имени | HTTP 422 (name обязательное) |

---

## TC-PROJ-02: Изоляция проектов между гостями

**Автоматизировано:** ✅ `test_projects.py::TestProjectsCRUD::test_list_projects_guest_isolation`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать session_A, создать проект "Мой" | 201 |
| 2 | Создать session_B, создать проект "Чужой" | 201 |
| 3 | `GET /api/v1/projects` с session_A | Только проект "Мой" |
| 4 | `GET /api/v1/projects` с session_B | Только проект "Чужой" |

---

## TC-PROJ-03: Сотрудник не видит гостевые проекты подрядчиков

**Автоматизировано:** ✅ `test_projects.py::TestProjectsCRUD::test_employee_sees_staff_projects_but_not_guest_projects`, `test_projects.py::TestProjectsCRUD::test_employee_can_open_coworker_project_by_id`, `test_projects.py::TestProjectsCRUD::test_employee_cannot_open_guest_project_by_id`, `test_projects.py::TestProjectsCRUD::test_employee_cannot_export_guest_project_by_id`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать проект от гостя | Проект существует |
| 2 | Создать проект от другого сотрудника | Проект существует |
| 3 | `GET /api/v1/projects` с токеном сотрудника | Список включает проект другого сотрудника и не включает гостевой проект |
| 4 | `GET /api/v1/projects/{coworker_project_id}` с токеном сотрудника | HTTP 200 |
| 5 | `GET /api/v1/projects/{guest_project_id}` с токеном сотрудника | HTTP 403 |
| 6 | `GET /api/v1/projects/{guest_project_id}/export-csv` с токеном сотрудника | HTTP 403 |

---

## TC-PROJ-04: Обновление проекта

**Автоматизировано:** ✅ `test_projects.py::TestProjectsCRUD::test_update_project`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать проект | `id`, `status=draft` |
| 2 | `PUT /api/v1/projects/{id}` с `{"name":"Новое имя","status":"completed"}` | HTTP 200 |
| 3 | Проверить ответ | `name=Новое имя`, `status=completed` |
| 4 | `GET /api/v1/projects/{id}` | Изменения сохранены |

---

## TC-PROJ-05: Удаление проекта

**Автоматизировано:** ✅ `test_projects.py::TestProjectsCRUD::test_delete_project`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать проект | `id` |
| 2 | `DELETE /api/v1/projects/{id}` | HTTP 204 |
| 3 | `GET /api/v1/projects/{id}` | HTTP 404 |
| 4 | Объекты проекта | Удалены каскадно |

---

## TC-PROJ-06: Неавторизованный доступ

**Автоматизировано:** ✅ `test_projects.py::TestProjectsCRUD::test_unauthenticated_rejected`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /api/v1/projects` без заголовков | HTTP 401 |
| 2 | `POST /api/v1/projects` без заголовков | HTTP 401 |

---

## TC-PROJ-07: Попытка редактировать чужой проект

**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Создать проект с session_A | `id_A` |
| 2 | `PUT /api/v1/projects/{id_A}` с session_B | HTTP 403 |
| 3 | `DELETE /api/v1/projects/{id_A}` с session_B | HTTP 403 |
