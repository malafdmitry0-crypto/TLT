# Покрытие автоматическими тестами

## Итог

| Уровень | Файлов | Тестов | Статус |
|---------|--------|--------|--------|
| Unit: Формулы | 4 | 48 | ✅ |
| Unit: Схемы | 2 | 13 | ✅ |
| Unit: Сервисы | 1 | 2 | ✅ |
| Integration: API | 8 | 28 | ✅ |
| Integration: DB | 2 | 2 | ✅ |
| **Итого (backend)** | **17** | **113** | **✅ 113/113** |
| Frontend (Vitest) | 6 | — | см. ниже |

## Исправленные дефекты

| # | Описание | Файл | Правка |
|---|----------|------|--------|
| 1 | `event_loop` fixture deprecated в pytest-asyncio 0.24 | `conftest.py` | Удалена кастомная `event_loop`, добавлен `asyncio_default_fixture_loop_scope = "session"` |
| 2 | Тесты используют function-scope event loop, фикстуры session-scope | все `integration/` файлы | `pytestmark = pytest.mark.asyncio(loop_scope="session")` |
| 3 | Email `@test.local` отвергается pydantic v2 EmailStr | `conftest.py` + test файлы | Заменено на `@test.com` |
| 4 | `specification.items` в Jinja2-шаблоне вызывает `dict.items()` метод | `report.html` | Заменено на `specification['items']` |

## Backend: детальное покрытие

### Unit: Формулы (`app/tests/unit/formulas/`)

#### `test_pipe_heat_loss.py` — 48 тестов
| Класс | Описание |
|-------|----------|
| `TestBasicProperties` | Знак, монотонность, пропорциональность |
| `TestMultiLayerInsulation` | 1–3 слоя, ошибка при 4 |
| `TestPipeWall` | Все материалы трубы, λ(T), ошибка толщины |
| `TestBuriedPipe` | Глубина заложения, теплопроводность грунта |
| `TestLocalElements` | Фланцы, эффективная длина |
| `TestSafetyFactor` | Пропорциональность K |
| `TestAlphaVnesh` | Формулы для ветра (линейная/степенная) |
| `TestSchemaValidation` | Граничные значения диаметра, температуры, длины |

#### `test_tank_heat_loss.py` — 7 тестов
- Цилиндр, прямоугольник, сфера
- Формула площади поверхности
- Уменьшение потерь при увеличении изоляции

#### `test_self_regulating.py` — 6 тестов
- Подбор кабеля по марке и автоматически
- Применение коэффициента запаса
- Ошибки: мощность превышена, кабель недостаточен

#### `test_spec_builder.py` — 4 теста
- Пустой ввод, группировка по марке, аксессуары, сортировка

### Unit: Схемы (`app/tests/unit/schemas/`)

| Файл | Тестирует |
|------|-----------|
| `test_calculation_schemas.py` | Валидация `PipeHeatLossParams`, `TankHeatLossParams`, `SelfRegulatingParams` |
| `test_project_schemas.py` | Валидация схем проекта |

### Unit: Сервисы (`app/tests/unit/services/`)

| Тест | Описание |
|------|----------|
| `test_calc_heat_loss_pipe_returns_dict` | Mock-DB, правильный результат |
| `test_calc_heat_loss_unknown_type_raises` | `CalculationError` при неизвестном типе |

### Integration: API (`app/tests/integration/api/`)

| Файл | Тестирует | Тестов |
|------|-----------|--------|
| `test_auth.py` | Guest, Login, Me, Forbidden, Admin | 6 |
| `test_projects.py` | CRUD, изоляция гостей, права | 6 |
| `test_objects.py` | Lifecycle, автопересчёт, невалидные параметры | 3 |
| `test_calculations.py` | Расчёт трубы, 422 при невалидных данных | 2 |
| `test_references.py` | Public vs. protected endpoints | 4 |
| `test_reports.py` | Preview HTML, запрет гостю, XLSX | 3 |
| `test_specifications.py` | Generate empty, get after generate | 2 |
| `test_admin.py` | Создать, дублирующийся email, коэффициенты | 4 |

### Integration: DB (`app/tests/integration/db/`)

| Файл | Тестирует |
|------|-----------|
| `test_models.py` | User CRUD, CHECK-constraint на project |
| `test_migrations.py` | Применение начальной миграции |

## Frontend: Vitest покрытие

| Файл | Тестирует |
|------|-----------|
| `authStore.test.ts` | Zustand auth store |
| `projectStore.test.ts` | Zustand project store |
| `RoleGuard.test.tsx` | Компонент ролевого доступа |
| `CellEditor.test.tsx` | Компонент редактирования ячейки |
| `SpecTable.test.tsx` | Таблица спецификации |
| `ValidationHighlight.test.tsx` | Подсветка невалидных ячеек |
| `ReportPreview.test.tsx` | Предпросмотр отчёта |
| `validators.test.ts` | Утилиты валидации |
| `formatters.test.ts` | Форматирование чисел/единиц |
| `excel.test.ts` | Утилиты работы с Excel |
| `LoginPage.test.tsx` | Интеграция: страница логина |
| `HomePage.test.tsx` | Интеграция: главная страница |

## Что НЕ покрыто автотестами (мануальный)

| Область | Причина / покрытие |
|---------|---------|
| Refresh token flow | Требует контроля TTL |
| Истечение access token | Временнóй тест |
| Экспорт PDF/DOCX (содержимое) | Бинарный формат, нет DOM |
| Batch-пересчёт теплопотерь | Покрыт unit-тестами, нужен integration |
| Изменение пароля через admin | Не реализован |
| Деактивация пользователя | Не реализован |
| UI: drag-and-drop (клиентское поведение) | Backend-часть покрыта (`PUT /objects/reorder`), UI — Playwright |
| Импорт Excel/CSV — бэкенд | ✅ Покрыт: `test_import_excel.py` (12 кейсов: xlsx + csv, ошибки, шаблоны) |
| Импорт Excel/CSV — UI (drag-and-drop файла) | Playwright |
| Экспорт объектов в Excel | Backend готов, UI в бэклоге (US-09.2) |
| Кэширование справочников | Нагрузочный |
| Персистентные ошибки elec-расчёта | Покрыт через upsert-логику в `calculation_service` |

## Запуск тестов

```bash
# Все backend тесты
make test-backend

# Только unit
make test-backend-unit

# Только integration
make test-backend-integration

# С покрытием
make test-backend-cov

# Frontend
make test-frontend
```

## Ручной запуск (без Docker)

```bash
# Запустить test-DB
docker run -d --name heatcalc_test_db \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=heatcalc_test \
  -p 5433:5432 postgres:16-alpine

# Запустить тесты в backend-контейнере
docker run --rm --network host \
  -v $(pwd)/backend:/app -w /app \
  -e TEST_DATABASE_URL="postgresql+asyncpg://test:test@localhost:5433/heatcalc_test" \
  tlt-backend pytest app/tests -v
```
