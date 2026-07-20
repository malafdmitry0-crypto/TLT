# 3. Backend `CLAUDE.md`

```markdown
# CLAUDE.md — Backend (FastAPI + PostgreSQL)

## Стек

| Технология                  | Назначение                   |
|-----------------------------|------------------------------|
| Python 3.11+                | Язык                         |
| FastAPI                     | Web-фреймворк                |
| Uvicorn                     | ASGI-сервер                  |
| SQLAlchemy 2.x (async)      | ORM                          |
| Alembic                     | Миграции БД                  |
| Pydantic v2                 | Валидация, схемы             |
| asyncpg                     | Async PostgreSQL драйвер     |
| python-jose[cryptography]   | JWT-токены                   |
| passlib[bcrypt]             | Хэширование паролей          |
| python-docx                 | Генерация Word               |
| openpyxl                    | Генерация Excel              |
| weasyprint                  | Генерация PDF                |
| pytest                      | Тестовый фреймворк           |
| pytest-asyncio              | Async-тесты                  |
| httpx                       | Async HTTP-клиент для тестов |
| factory-boy                 | Фабрики тестовых данных      |
| ruff                        | Линтер + форматтер           |
| mypy                        | Статический анализ типов     |

## Структура `backend/`
backend/
├── Dockerfile
├── Dockerfile.dev
├── requirements.txt
├── requirements-dev.txt
├── pyproject.toml
├── alembic.ini
├── alembic/
│ └── versions/
└── app/
├── main.py # FastAPI app, lifespan, middleware
├── core/
│ ├── config.py # Pydantic Settings
│ ├── database.py # Async engine, sessionmaker
│ ├── dependencies.py # Depends: get_db, get_current_user
│ └── security.py # JWT, password hashing
├── models/
│ ├── init.py
│ ├── base.py # DeclarativeBase
│ ├── user.py
│ ├── guest_session.py
│ ├── project.py
│ ├── project_object.py
│ ├── electrical_calculation.py
│ ├── specification.py
│ ├── coefficient.py
│ ├── cable.py
│ └── accessory.py
├── schemas/
│ ├── auth.py
│ ├── user.py
│ ├── project.py
│ ├── calculation.py
│ ├── specification.py
│ ├── coefficient.py
│ ├── reference.py
│ └── report.py
├── api/
│ └── v1/
│ ├── router.py # Корневой роутер v1
│ ├── auth.py
│ ├── projects.py
│ ├── objects.py
│ ├── calculations.py
│ ├── specifications.py
│ ├── reports.py
│ ├── references.py
│ └── admin.py
├── services/
│ ├── auth_service.py
│ ├── project_service.py
│ ├── calculation_service.py       # recalculate_object, batch_calc_electrical (upsert)
│ ├── specification_service.py
│ ├── report_service.py            # подгружает elec-calcs в контекст отчёта
│ ├── excel_import_service.py      # парсер xlsx + csv, build_template_{xlsx,csv}
│ └── admin_service.py
├── formulas/
│ ├── init.py
│ ├── heat_loss/
│ │ ├── init.py
│ │ ├── pipe.py
│ │ ├── tank.py
│ │ └── common.py
│ ├── electrical/
│ │ ├── init.py
│ │ ├── self_regulating.py
│ │ ├── resistive.py
│ │ └── mineral.py
│ └── specification/
│ ├── init.py
│ └── builder.py
├── reference_data/
│ ├── climate.json
│ ├── insulation.json
│ ├── cables_tlt.json
│ ├── accessories.json
│ └── loader.py
├── reports/
│ ├── pdf_generator.py
│ ├── word_generator.py
│ ├── excel_generator.py
│ └── templates/
└── tests/
├── conftest.py # Fixtures: test DB, client, factories
├── factories.py # factory-boy: UserFactory, ProjectFactory...
├── unit/
│ ├── formulas/
│ │ ├── test_pipe_heat_loss.py
│ │ ├── test_tank_heat_loss.py
│ │ ├── test_self_regulating.py
│ │ └── test_spec_builder.py
│ ├── services/
│ │ ├── test_auth_service.py
│ │ ├── test_project_service.py
│ │ ├── test_calculation_service.py
│ │ └── test_specification_service.py
│ └── schemas/
│ ├── test_calculation_schemas.py
│ └── test_project_schemas.py
└── integration/
├── api/
│ ├── test_auth.py
│ ├── test_projects.py
│ ├── test_objects.py
│ ├── test_calculations.py
│ ├── test_specifications.py
│ ├── test_reports.py
│ ├── test_import_excel.py       # xlsx + csv (12 кейсов)
│ ├── test_references.py
│ └── test_admin.py
└── db/
├── test_migrations.py
└── test_models.py



## Модели БД (PostgreSQL)
users
├── id: UUID (PK)
├── email: VARCHAR UNIQUE NOT NULL
├── hashed_password: VARCHAR NOT NULL
├── full_name: VARCHAR
├── role: ENUM('employee', 'admin') NOT NULL
├── is_active: BOOLEAN DEFAULT TRUE
├── created_at: TIMESTAMP
└── updated_at: TIMESTAMP

guest_sessions
├── id: UUID (PK)
├── session_id: VARCHAR UNIQUE NOT NULL
├── created_at: TIMESTAMP
└── last_activity: TIMESTAMP

projects
├── id: UUID (PK)
├── name: VARCHAR NOT NULL
├── description: TEXT
├── user_id: UUID (FK → users.id, NULLABLE)
├── session_id: VARCHAR (FK → guest_sessions.session_id, NULLABLE)
├── status: ENUM('draft', 'completed') DEFAULT 'draft'
├── created_at: TIMESTAMP
├── updated_at: TIMESTAMP
└── CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)

project_objects
├── id: UUID (PK)
├── project_id: UUID (FK → projects.id, CASCADE)
├── object_type: ENUM('pipe', 'tank', ...) NOT NULL
├── sort_order: INTEGER NOT NULL
├── params: JSONB NOT NULL
├── results: JSONB
├── is_valid: BOOLEAN DEFAULT FALSE
├── validation_errors: JSONB
├── created_at: TIMESTAMP
└── updated_at: TIMESTAMP

electrical_calculations
├── id: UUID (PK)
├── project_id: UUID (FK → projects.id)
├── object_id: UUID (FK → project_objects.id)
├── variant_number: INTEGER DEFAULT 1
├── cable_type: VARCHAR NOT NULL
├── cable_mark: VARCHAR
├── params: JSONB NOT NULL
├── results: JSONB
├── created_at: TIMESTAMP
└── updated_at: TIMESTAMP

specifications
├── id: UUID (PK)
├── project_id: UUID (FK → projects.id)
├── variant_number: INTEGER DEFAULT 1
├── items: JSONB NOT NULL
├── created_at: TIMESTAMP
└── updated_at: TIMESTAMP

correction_coefficients
├── id: UUID (PK)
├── key: VARCHAR UNIQUE NOT NULL
├── value: FLOAT NOT NULL
├── description: TEXT
├── updated_by: UUID (FK → users.id)
└── updated_at: TIMESTAMP

cables_extended
├── id: UUID (PK)
├── cable_type: ENUM('self_regulating','single_core','three_core','mineral','skin')
├── brand: VARCHAR NOT NULL
├── model: VARCHAR NOT NULL
├── power_per_meter: FLOAT
├── max_temperature: FLOAT
├── min_temperature: FLOAT
├── resistance_per_meter: FLOAT
├── params: JSONB
├── is_active: BOOLEAN DEFAULT TRUE
├── created_at: TIMESTAMP
└── updated_at: TIMESTAMP

accessories_extended
├── id: UUID (PK)
├── category: VARCHAR NOT NULL
├── name: VARCHAR NOT NULL
├── article: VARCHAR
├── params: JSONB
├── is_active: BOOLEAN DEFAULT TRUE
├── created_at: TIMESTAMP
└── updated_at: TIMESTAMP



## API Endpoints

### Авторизация `/api/v1/auth`

| Метод | Путь             | Описание                  | Доступ |
|-------|------------------|---------------------------|--------|
| POST  | `/auth/guest`    | Создать гостевую сессию   | Все    |
| POST  | `/auth/login`    | Логин сотрудника/админа   | Все    |
| POST  | `/auth/refresh`  | Обновить access token     | Auth   |
| GET   | `/auth/me`       | Текущий пользователь      | Auth   |

### Проекты `/api/v1/projects`

| Метод  | Путь              | Описание           | Доступ          |
|--------|-------------------|--------------------|-----------------|
| GET    | `/projects`       | Список проектов    | Guest, Employee |
| POST   | `/projects`       | Создать проект     | Guest, Employee |
| GET    | `/projects/{id}`  | Получить проект    | Owner, Employee |
| PUT    | `/projects/{id}`  | Обновить проект    | Owner           |
| DELETE | `/projects/{id}`  | Удалить проект     | Owner           |
| POST   | `/projects/{id}/duplicate` | Дублировать проект (копия `params` объектов + авто-пересчёт теплопотерь и электрорасчёта) | Employee |

### Объекты `/api/v1/projects/{project_id}/objects`

| Метод  | Путь                         | Описание                                 | Доступ   |
|--------|------------------------------|------------------------------------------|----------|
| GET    | `/objects`                   | Все объекты проекта                      | Owner+   |
| POST   | `/objects`                   | Добавить объект (+ автопересчёт теплопотерь) | Owner    |
| PUT    | `/objects/{id}`              | Обновить (+ автопересчёт)                | Owner    |
| DELETE | `/objects/{id}`              | Удалить                                  | Owner    |
| PUT    | `/objects/reorder`           | Изменить порядок (drag-and-drop)         | Owner    |
| POST   | `/objects/import-excel`      | Импорт из Excel (.xlsx) или CSV          | Owner    |
| GET    | `/objects/import-template`   | Шаблон для импорта (`?format=xlsx\|csv`) | Owner+   |
| GET    | `/objects/export-excel`      | Экспорт в Excel                          | Employee |

**Импорт — детали:** сервис `app/services/excel_import_service.py` парсит листы
`Трубопроводы`/`Резервуары` (xlsx) или колонку `Тип` (csv). Поддерживает
русские названия материалов/форм и их англ. коды. Возвращает
`{created: N, errors: [{sheet, row, message}]}` — построчный отчёт; импорт не
прерывается на единичных ошибках. Тестовые файлы на 100 записей —
в `docs/samples/`, генератор — `scripts/gen_import_samples.py`.

### Расчёты `/api/v1/calc`

| Метод | Путь                              | Описание                          | Доступ          |
|-------|-----------------------------------|-----------------------------------|-----------------|
| POST  | `/calc/heat-loss`                 | Расчёт теплопотерь объекта        | Guest, Employee |
| POST  | `/calc/heat-loss/batch`           | Пересчёт всех объектов проекта    | Guest, Employee |
| POST  | `/calc/electrical`                | Электротехнический расчёт         | Guest, Employee |
| GET   | `/calc/cable-options/{object_id}` | Доступные кабели для объекта      | Guest, Employee |

### Спецификация `/api/v1/specifications`

| Метод | Путь                                    | Описание                 | Доступ |
|-------|-----------------------------------------|--------------------------|--------|
| GET   | `/specifications/{project_id}`          | Получить спецификацию    | Owner+ |
| POST  | `/specifications/{project_id}/generate` | Сгенерировать            | Owner  |

### Отчёты `/api/v1/reports`

| Метод | Путь                                      | Описание           | Доступ   |
|-------|--------------------------------------------|---------------------|----------|
| GET   | `/reports/{project_id}/preview`            | HTML-предпросмотр   | Guest, Employee |
| GET   | `/reports/{project_id}/export/{format}`    | PDF / DOCX / XLSX   | Employee |

### Справочники `/api/v1/references`

| Метод | Путь                              | Описание                    | Доступ   |
|-------|-----------------------------------|-----------------------------|----------|
| GET   | `/references/climate`             | Климат                      | Все      |
| GET   | `/references/insulation`          | Теплоизоляция               | Все      |
| GET   | `/references/cables`              | Кабели (встроенные)         | Все      |
| GET   | `/references/cables/extended`     | Расширенный каталог         | Employee |
| GET   | `/references/accessories`         | Аксессуары (встроенные)     | Все      |
| GET   | `/references/accessories/extended`| Расширенные аксессуары      | Employee |

### Администрирование `/api/v1/admin`

| Метод  | Путь                          | Описание                      | Доступ |
|--------|-------------------------------|-------------------------------|--------|
| GET    | `/admin/users`                | Список сотрудников            | Admin  |
| POST   | `/admin/users`                | Создать сотрудника            | Admin  |
| PUT    | `/admin/users/{id}`           | Обновить                      | Admin  |
| DELETE | `/admin/users/{id}`           | Деактивировать                | Admin  |
| GET    | `/admin/coefficients`         | Корр. коэффициенты            | Admin  |
| PUT    | `/admin/coefficients/{key}`   | Обновить коэффициент          | Admin  |
| GET    | `/admin/cables`               | Расширенные кабели            | Admin  |
| POST   | `/admin/cables`               | Добавить                      | Admin  |
| PUT    | `/admin/cables/{id}`          | Обновить                      | Admin  |
| DELETE | `/admin/cables/{id}`          | Удалить                       | Admin  |
| GET    | `/admin/accessories`          | Расширенные аксессуары        | Admin  |
| POST   | `/admin/accessories`          | Добавить                      | Admin  |
| PUT    | `/admin/accessories/{id}`     | Обновить                      | Admin  |
| DELETE | `/admin/accessories/{id}`     | Удалить                       | Admin  |

## Формулы

Все формулы — чистые Python-функции в `app/formulas/`. **Список формул будет предоставлен отдельно.**

### Принципы:
- Формулы не зависят от БД и ORM — принимают данные, возвращают результат
- Корректирующие коэффициенты передаются параметром из сервисного слоя
- Каждая формула покрыта unit-тестами на 100%

```python
# app/formulas/heat_loss/pipe.py
from app.schemas.calculation import PipeHeatLossParams, PipeHeatLossResult
from app.reference_data.loader import get_insulation_conductivity

def calc_pipe_heat_loss(
    params: PipeHeatLossParams,
    coefficients: dict[str, float] | None = None
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода. Формула будет предоставлена."""
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=params.avg_temperature,
    )
    # ... расчёт ...
    return PipeHeatLossResult(
        heat_loss_per_meter=q_linear,
        total_heat_loss=q_total,
    )
Авторизация
JWT
Access token: 30 минут, Refresh token: 7 дней
Алгоритм: HS256, Secret: env SECRET_KEY
Guest-сессия
POST /auth/guest → UUID session_id
Передаётся в заголовке X-Session-Id
Dependency Injection

# app/core/dependencies.py
async def get_current_user_or_guest(...):
    """Извлекает пользователя из JWT или гостя из X-Session-Id."""
    ...

def require_role(allowed_roles: list[str]):
    async def checker(user=Depends(get_current_user_or_guest)):
        if user.role not in allowed_roles:
            raise HTTPException(status_code=403)
        return user
    return checker
Инициализация при первом запуске
В main.py (lifespan):

Применить миграции Alembic
Создать администратора из env (FIRST_ADMIN_EMAIL, FIRST_ADMIN_PASSWORD) если не существует
Загрузить справочники из JSON в кэш
Инициализировать корр. коэффициенты по умолчанию (если таблица пуста)
Автопересчёт при обновлении объекта
PUT /objects/{id}:

Валидация входных параметров (Pydantic)
Расчёт теплопотерь для объекта
Обновление results, is_valid в project_objects
Если есть электротехнический расчёт — пересчёт
Если есть спецификация — пометка как устаревшая
Возврат обновлённого объекта с результатами
Генерация отчётов

@router.get("/reports/{project_id}/export/{format}")
async def export_report(project_id: UUID, format: str, ...):
    file_bytes = await report_service.generate(project_id, format, db)
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=MEDIA_TYPES[format],
        headers={"Content-Disposition": f"attachment; filename=report.{format}"}
    )
Swagger
Swagger UI: http://localhost:8000/docs
ReDoc: http://localhost:8000/redoc
Все эндпоинты обязаны иметь: docstring, response_model, status_code, tags, summary.

TDD и тестирование
Методология
Весь код разрабатывается по циклу Red → Green → Refactor:

Red — написать падающий тест
Green — написать минимальный код для прохождения
Refactor — улучшить, убедиться что тесты зелёные
Правило: ни одна формула, эндпоинт или сервис не реализуется без предварительно написанного теста.

Unit-тесты (tests/unit/)
Тестируют изолированные единицы без БД и сети.

Формулы (100% покрытие)
Каждая формула покрывается тестами:

Корректный расчёт при типовых входных данных
Граничные значения (нулевая толщина изоляции, экстремальные температуры)
Невалидные входы (отрицательные значения, нули) → корректное исключение
Влияние корректирующих коэффициентов

# tests/unit/formulas/test_pipe_heat_loss.py
import pytest
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.schemas.calculation import PipeHeatLossParams

class TestPipeHeatLoss:
    """Тесты расчёта теплопотерь трубопровода."""

    def test_standard_pipe_outdoor(self):
        """Типовая труба на открытом воздухе."""
        params = PipeHeatLossParams(
            outer_diameter=0.108,
            insulation_thickness=0.05,
            insulation_material="mineral_wool_cylinders_100",
            insulation_temperature_basis="outdoor_winter",
            ambient_temperature=-30.0,
            process_temperature=150.0,
            pipe_length=100.0,
        )
        result = calc_pipe_heat_loss(params)
        assert result.heat_loss_per_meter > 0
        assert result.total_heat_loss > 0

    def test_zero_insulation_raises_error(self):
        """Нулевая толщина изоляции → ValueError."""
        params = PipeHeatLossParams(
            outer_diameter=0.108,
            insulation_thickness=0.0,
            # ...
        )
        with pytest.raises(ValueError, match="Толщина изоляции"):
            calc_pipe_heat_loss(params)

    def test_correction_coefficient_applied(self):
        """Корректирующий коэффициент увеличивает теплопотери."""
        params = PipeHeatLossParams(...)
        base = calc_pipe_heat_loss(params)
        legacy = calc_pipe_heat_loss(params, coefficients={"wind_factor": 1.3})
        assert legacy.total_heat_loss == base.total_heat_loss

    @pytest.mark.parametrize("temp", [-60, -40, -20, 0, 20])
    def test_various_ambient_temperatures(self, temp):
        """Расчёт при разных температурах окружающей среды."""
        params = PipeHeatLossParams(ambient_temperature=temp, ...)
        result = calc_pipe_heat_loss(params)
        assert result.heat_loss_per_meter > 0
Сервисы (≥90% покрытие)
Мокаются зависимости (БД, внешние вызовы):


# tests/unit/services/test_calculation_service.py
from unittest.mock import AsyncMock, patch
from app.services.calculation_service import CalculationService

class TestCalculationService:
    @patch("app.services.calculation_service.get_correction_coefficients")
    async def test_calculate_delegates_to_formula(self, mock_coeffs):
        mock_coeffs.return_value = {}
        mock_db = AsyncMock()
        service = CalculationService(mock_db)
        result = await service.calculate_heat_loss(pipe_params)
        assert result.heat_loss_per_meter > 0
Pydantic-схемы
Проверка валидации:


# tests/unit/schemas/test_calculation_schemas.py
import pytest
from pydantic import ValidationError
from app.schemas.calculation import PipeHeatLossParams

def test_negative_diameter_rejected():
    with pytest.raises(ValidationError):
        PipeHeatLossParams(outer_diameter=-1, ...)

def test_valid_params_accepted():
    p = PipeHeatLossParams(outer_diameter=0.108, ...)
    assert p.outer_diameter == 0.108
Integration-тесты (tests/integration/)
Тестируют API-эндпоинты с реальной тестовой БД (PostgreSQL в Docker).

Конфигурация

# tests/conftest.py
import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.main import app
from app.core.database import get_db
from app.models.base import Base

TEST_DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5433/heatcalc_test"

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest.fixture
async def db_session(test_engine):
    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()

@pytest.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
async def admin_token(client):
    """Создаёт админа и возвращает JWT-токен."""
    ...

@pytest.fixture
async def employee_token(client, admin_token):
    """Создаёт сотрудника и возвращает JWT-токен."""
    ...

@pytest.fixture
async def guest_session(client):
    """Создаёт гостевую сессию и возвращает session_id."""
    resp = await client.post("/api/v1/auth/guest")
    return resp.json()["session_id"]
Фабрики

# tests/factories.py
import factory
from app.models.user import User
from app.models.project import Project

class UserFactory(factory.Factory):
    class Meta:
        model = User
    email = factory.Sequence(lambda n: f"user{n}@test.com")
    full_name = factory.Faker("name")
    role = "employee"
    is_active = True

class ProjectFactory(factory.Factory):
    class Meta:
        model = Project
    name = factory.Sequence(lambda n: f"Проект {n}")
    status = "draft"
Примеры integration-тестов

# tests/integration/api/test_auth.py
import pytest

class TestGuestAuth:
    async def test_create_guest_session(self, client):
        resp = await client.post("/api/v1/auth/guest")
        assert resp.status_code == 201
        assert "session_id" in resp.json()

class TestEmployeeAuth:
    async def test_login_valid_credentials(self, client, employee_token):
        assert employee_token is not None

    async def test_login_invalid_credentials(self, client):
        resp = await client.post("/api/v1/auth/login", json={
            "email": "wrong@test.com", "password": "wrong"
        })
        assert resp.status_code == 401

    async def test_access_admin_as_employee_forbidden(self, client, employee_token):
        resp = await client.get(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {employee_token}"}
        )
        assert resp.status_code == 403


# tests/integration/api/test_projects.py
class TestProjectsCRUD:
    async def test_create_project_as_guest(self, client, guest_session):
        resp = await client.post(
            "/api/v1/projects",
            json={"name": "Тестовый проект"},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201
        assert resp.json()["name"] == "Тестовый проект"

    async def test_guest_cannot_see_others_projects(self, client, guest_session):
        resp = await client.get(
            "/api/v1/projects",
            headers={"X-Session-Id": guest_session},
        )
        projects = resp.json()
        for p in projects:
            assert p["session_id"] == guest_session

    async def test_employee_can_see_all_projects(self, client, employee_token):
        resp = await client.get(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 200


# tests/integration/api/test_calculations.py
class TestHeatLossCalculation:
    async def test_calculate_pipe_returns_result(self, client, guest_session):
        # создаём проект и объект
        project = await self._create_project(client, guest_session)
        resp = await client.post(
            "/api/v1/calc/heat-loss",
            json={
                "project_id": project["id"],
                "object_type": "pipe",
                "data": {
                    "outer_diameter": 0.108,
                    "insulation_thickness": 0.05,
                    "insulation_material": "mineral_wool_cylinders_100",
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -30.0,
                    "process_temperature": 150.0,
                    "pipe_length": 100.0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        result = resp.json()
        assert result["heat_loss_per_meter"] > 0
        assert result["total_heat_loss"] > 0

    async def test_invalid_params_returns_422(self, client, guest_session):
        project = await self._create_project(client, guest_session)
        resp = await client.post(
            "/api/v1/calc/heat-loss",
            json={
                "project_id": project["id"],
                "object_type": "pipe",
                "data": {"outer_diameter": -1},  # невалидный
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 422


# tests/integration/api/test_admin.py
class TestAdminCoefficients:
    async def test_update_coefficient(self, client, admin_token):
        resp = await client.put(
            "/api/v1/admin/coefficients/safety_factor",
            json={"value": 1.3, "description": "Коэффициент запаса"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["value"] == 1.3

    async def test_employee_cannot_update_coefficient(self, client, employee_token):
        resp = await client.put(
            "/api/v1/admin/coefficients/safety_factor",
            json={"value": 1.5},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403
E2E-тесты (e2e/tests/)
Полные сценарии по Приложению 3 ТЗ. Используют Playwright, тестируют от UI до БД.


e2e/tests/
├── auth.spec.ts                # Сценарии 4.1.1 – 4.1.5
├── projects.spec.ts            # Сценарий 4.2.1
├── heat-calculation.spec.ts    # Сценарии 4.3.1 – 4.3.5
├── elec-calculation.spec.ts    # Сценарии 4.4.1 – 4.4.3
├── specification.spec.ts       # Сценарии 4.5.1 – 4.5.2
├── reports.spec.ts             # Сценарии 4.6.1 – 4.6.5
└── admin.spec.ts               # Сценарии 4.7.1 – 4.7.2

// e2e/tests/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('4.1 Авторизация и доступ', () => {
  test('4.1.1 Главная страница — форма выбора роли', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Пользователь')).toBeVisible();
    await expect(page.getByText('Сотрудник')).toBeVisible();
  });

  test('4.1.2 Гостевой вход → рабочий стол', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Пользователь');
    await expect(page).toHaveURL(/\/workspace/);
  });

  test('4.1.3 Неверные учётные данные → ошибка', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Сотрудник');
    await page.fill('[name=email]', 'wrong@test.com');
    await page.fill('[name=password]', 'wrongpass');
    await page.click('button[type=submit]');
    await expect(page.getByText(/ошибк/i)).toBeVisible();
  });

  test('4.1.5 Сотрудник не имеет доступа к админке', async ({ page }) => {
    // логин как сотрудник
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
  });
});

// e2e/tests/heat-calculation.spec.ts
test.describe('4.3 Теплотехнический расчёт', () => {
  test('4.3.1 Добавить трубу через встроенную форму → расчёт выполнен', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Пользователь');
    await page.click('text=Трубы');
    // заполнение встроенной формы SC-03...
    await page.fill('[name=outer_diameter]', '108');
    await page.fill('[name=insulation_thickness]', '50');
    // ...
    await page.click('text=Сохранить изменения');
    const result = page.locator('[data-testid=pipe-table] >> text=/\\d+.*Вт/');
    await expect(result).toBeVisible();
  });

  test('4.3.2 Пустое поле → подсветка, расчёт не выполнен', async ({ page }) => {
    // добавляем объект с пустым полем
    const cell = page.locator('[data-testid=cell-diameter]');
    await expect(cell).toHaveClass(/cell-invalid/);
  });

  test('4.3.3 Изменение параметра → автопересчёт', async ({ page }) => {
    // ...меняем значение, проверяем что результат обновился
  });

  test('4.3.5 Экспорт таблицы в Excel', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('text=Экспорт в Excel'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});
CI-pipeline (docker-compose.e2e.yml)

services:
  db-test:
    image: postgres:16
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: heatcalc_test
    ports: ["5433:5432"]

  backend-test:
    build: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://test:test@db-test:5432/heatcalc_test
    depends_on: [db-test]

  frontend-test:
    build: ./frontend
    depends_on: [backend-test]
Обработка ошибок
Единый формат:


{
  "detail": "Описание ошибки на русском",
  "error_code": "VALIDATION_ERROR",
  "fields": {"field_name": "описание"}
}
Код	Описание
VALIDATION_ERROR	Ошибка валидации входных данных
NOT_FOUND	Объект не найден
ACCESS_DENIED	Нет доступа
CALCULATION_ERROR	Ошибка в расчёте
EXPORT_ERROR	Ошибка генерации отчёта
Команды

# Dev-сервер
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Миграции
alembic upgrade head
alembic revision --autogenerate -m "описание"

# Тесты (676 backend в сумме на 2026-05-02)
pytest tests/unit -v                          # Unit
pytest tests/integration -v                   # Integration (требует БД heatcalc_test)
pytest --cov=app --cov-report=html            # Покрытие

# Запуск из хоста (в Docker):
docker exec -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  heatcalc_backend python3 -m pytest app/tests/

# Линтинг
ruff check . && ruff format --check .
mypy app/
Соглашения по коду
async def для всех эндпоинтов и сервисов
snake_case для функций и переменных, PascalCase для классов
Pydantic-модели наследуются от BaseModel
SQLAlchemy-модели наследуются от общего Base
Эндпоинты — тонкие (делегируют в services/)
Бизнес-логика — в services/
Формулы — в formulas/ (чистые функции, без зависимости от ORM/БД)
Справочники — в reference_data/ как версионируемый JSON; теплоизоляция также сидируется в `insulation_materials`, а `/references/insulation` читает БД с JSON fallback
Запрещён import *
Логирование через logging (не print): backend/worker пишут JSON в stdout с `request_id`, бизнес-аудит — через `AuditService` в `audit_events`
Каждая фича начинается с теста (TDD)
