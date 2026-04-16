# Playbook: Расширить RBAC-матрицу

Текущая модель ролей:
- **Guest** — запись в `guest_sessions`, НЕ в `users`. Идентификация через заголовок `X-Session-Id`.
- **Employee** — `User.role = 'employee'`.
- **Admin** — `User.role = 'admin'`.

## Изменение 1: Новое разрешение на существующий endpoint

Например, «дать гостю доступ к экспорту XLSX».

### Шаги

1. `backend/app/core/dependencies.py` — проверить, какой `Depends(require_role(...))` стоит на endpoint.
2. Заменить на `Depends(get_current_user_or_guest)` (без проверки роли) либо расширить список.
3. Добавить тест в `backend/app/tests/integration/api/test_<module>.py`:
   - Guest может — status 200.
   - Существующие роли продолжают работать.
4. Обновить матрицу в:
   - `CLAUDE.MD` §6
   - `docs/analysis/personas.md` (таблица в конце)
   - `docs/analysis/business-rules.md` если есть BR про эту операцию

## Изменение 2: Новая роль

Например, «модератор» между `employee` и `admin`.

### Шаги

1. `backend/app/models/user.py` — добавить в enum `UserRole`.
2. **Миграция Alembic**:
   ```
   docker exec heatcalc_backend alembic revision --autogenerate -m "add moderator role"
   ```
   Затем правка миграции вручную (enum в PostgreSQL менять через `ALTER TYPE`).
3. `backend/app/core/dependencies.py` — `require_moderator()` helper.
4. `backend/app/schemas/user.py` — добавить в Literal/enum.
5. **Frontend**:
   - `frontend/src/types/auth.ts` — `Role = 'employee' | 'admin' | 'moderator'`
   - `frontend/src/components/common/RoleGuard.tsx` — проверка
   - `frontend/src/routes/ProtectedRoute.tsx` — роутинг
6. **Сиды**: `backend/app/seeds.py` — создать демо-модератора.
7. **Тесты**: расширить `test_admin.py` / `test_auth.py` с новыми сценариями.
8. **Документация**: CLAUDE.MD §6, personas.md — новая колонка в матрице.

## Чеклист

- [ ] Миграция обратима (`downgrade()` написан)
- [ ] Матрица в 2-3 документах синхронизирована
- [ ] Тесты на "чужая роль получает 403" присутствуют
- [ ] Сиды создают хотя бы одного представителя новой роли
