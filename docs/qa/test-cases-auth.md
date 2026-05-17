# TC-AUTH: Авторизация и доступ

## TC-AUTH-01: Создание гостевой сессии

**Предусловие:** Сервис запущен  
**Автоматизировано:** ✅ `test_auth.py::TestGuestAuth::test_create_guest_session`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `POST /api/v1/auth/guest` | HTTP 201 |
| 2 | Проверить тело ответа | `{"session_id": "<непустая строка>"}` |
| 3 | Повторно вызвать эндпоинт | Возвращается **новый** `session_id` |

---

## TC-AUTH-02: Логин сотрудника с верными данными

**Предусловие:** Пользователь `petrov@heatcalc.io` существует  
**Автоматизировано:** ✅ `test_auth.py::TestEmployeeAuth::test_login_valid_credentials`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `POST /api/v1/auth/login` с `{"email":"petrov@heatcalc.io","password":"Employee1!"}` | HTTP 200 |
| 2 | Проверить `access_token` | Непустая строка JWT |
| 3 | Проверить `refresh_token` | Непустая строка |
| 4 | Проверить `token_type` | `"bearer"` |

---

## TC-AUTH-03: Логин с неверным паролем

**Автоматизировано:** ✅ `test_auth.py::TestEmployeeAuth::test_login_invalid_credentials`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `POST /api/v1/auth/login` с неверным паролем | HTTP 401 |
| 2 | Тело ответа | `{"detail": "...", "error_code": "..."}` |

---

## TC-AUTH-04: Получение текущего пользователя `/auth/me`

**Предусловие:** Получен `access_token`  
**Автоматизировано:** ✅ `test_auth.py::TestEmployeeAuth::test_me_returns_user`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `GET /api/v1/auth/me` с заголовком `Authorization: Bearer <token>` | HTTP 200 |
| 2 | Проверить поля | `email`, `role`, `is_active`, `id`, `created_at` |
| 3 | Запрос без токена | HTTP 401 |

---

## TC-AUTH-04A: Лимит попыток входа сотрудника

**Автоматизировано:** ✅ `test_auth.py::TestEmployeeAuth::test_login_rate_limited_by_ip`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Выполнить 10 неуспешных `POST /api/v1/auth/login` с одного IP | HTTP 401 |
| 2 | Выполнить 11-ю попытку с того же IP | HTTP 429, `Retry-After: 3600` |

---

## TC-AUTH-05: Обновление access token через refresh

**Предусловие:** Получена пара токенов  
**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | `POST /api/v1/auth/refresh` с `{"refresh_token": "<refresh>"}` | HTTP 200 |
| 2 | Проверить новый `access_token` | Отличается от старого |
| 3 | Использовать новый токен в `/auth/me` | HTTP 200 |

---

## TC-AUTH-06: Доступ сотрудника к ресурсам администратора

**Автоматизировано:** ✅ `test_auth.py::TestEmployeeAuth::test_access_admin_as_employee_forbidden`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Получить токен сотрудника | `access_token` с `role=employee` |
| 2 | `GET /api/v1/admin/users` с токеном | HTTP 403 |
| 3 | `PUT /api/v1/admin/coefficients/wind_factor` | HTTP 403 |

---

## TC-AUTH-07: Администратор имеет полный доступ

**Автоматизировано:** ✅ `test_auth.py::TestAdminAuth::test_admin_can_list_users`

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Логин как admin | `access_token` с `role=admin` |
| 2 | `GET /api/v1/admin/users` | HTTP 200, список пользователей |
| 3 | `GET /api/v1/projects` | HTTP 200, все проекты системы |

---

## TC-AUTH-08: Истечение access token

**Предусловие:** Изменить `ACCESS_TOKEN_EXPIRE_MINUTES=0` или подождать  
**Автоматизировано:** ❌ (мануальный)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|---------------------|
| 1 | Получить токен | JWT с коротким TTL |
| 2 | Подождать истечения | — |
| 3 | `GET /api/v1/auth/me` с истёкшим токеном | HTTP 401 |
| 4 | Обновить через refresh | HTTP 200, новый токен |
