# Правила Разработки

## Перед изменением

1. Проверить `git status --short`.
2. Не трогать чужие незакоммиченные изменения.
3. Найти существующий паттерн через `rg`, потом менять код.
4. Для требований сверять `docs/srs*`, `TO_DO.md`, `CLAUDE.MD`.
5. Для API/БД смотреть тесты и миграции, а не только документацию.

## Backend

| Задача | Куда идти |
|---|---|
| Новый endpoint | `backend/app/api/v1/`, `backend/app/schemas/`, сервис |
| Бизнес-логика | `backend/app/services/` |
| Формула | `backend/app/formulas/`, тесты `backend/app/tests/unit/formulas/` |
| Данные справочников | `backend/app/reference_data/`, loader, seeds |
| Модель/поле БД | `backend/app/models/`, Alembic migration, `docs/db_schema.md` |
| Отчёт | `backend/app/reports/`, `report_service.py`, report tests |

Backend-правила:

- API-роутер должен быть тонким: auth/permissions, schema IO, вызов сервиса.
- Расчётные функции держать чистыми, с unit-тестами на границы.
- Ошибки бизнес-логики возвращать предсказуемо и тестировать интеграционно.
- Не менять формат JSONB (`params`, `results`, `items`) без миграционного плана.

## Frontend

| Задача | Куда идти |
|---|---|
| Страница рабочего потока | `frontend/src/pages/` |
| Таблица объектов SC-03 | `frontend/src/pages/HeatCalcPage.tsx`, `frontend/src/components/heatcalc/`, `frontend/src/pages/heatcalc/`, `frontend/src/utils/heatCalcTable*` |
| Мастер добавления | `frontend/src/components/wizard/`, `objectWizardUtils.ts` |
| API-клиент | `frontend/src/api/` |
| Роли/доступ | `RoleGuard`, `ProtectedRoute`, `constants/roles.ts` |
| Глобальное состояние | `frontend/src/store/` |
| Отчёт | `frontend/src/components/reports/`, `ReportPage.tsx` |

Frontend-правила:

- Расчёты не дублировать на клиенте.
- Пути брать из `ROUTES`.
- Серверные данные вести через TanStack Query; локальное состояние только для UI.
- Все тексты интерфейса на русском.
- Для форм помнить конвертацию: пользователь вводит мм, API получает метры.
- После мутаций инвалидировать ровно те query, которые меняют видимый экран.

## Документация при изменениях

| Изменение | Документ |
|---|---|
| Новый/изменённый endpoint | `docs/api.md` |
| Модель, таблица, индекс, JSON shape | `docs/db_schema.md` |
| Функциональное требование | `docs/srs.md` или профильный файл `docs/srs/` |
| UX-сценарий | `docs/analysis/user-stories.md` или `docs/qa/` |
| Повторяемая процедура | `docs/playbooks/` |
| Формула/коэффициент | `formules.md`, `coefficients.MD`, тесты формул |

## Типичные опасные места

- `variant_number` должен проходить сквозно: расчёт, спецификация, отчёт, UI.
- Импорт/экспорт CSV содержит JSON-поля строками; нельзя ломать совместимость.
- Гостевые лимиты и rate limit могут мешать e2e.
- Отчёт HTML санитизируется на фронте, генерация файлов идёт на backend.
- `docs/` и `demo-doc/` частично дублируются; актуальной считать `docs/`.
