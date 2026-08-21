"""Конфигурация приложения через переменные окружения."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки HeatCalc backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_db"
    # pool_size=0 and max_overflow=-1 mean "unlimited" in SQLAlchemy, so both
    # unsafe forms are rejected at configuration load time.
    DB_POOL_SIZE: int = Field(default=5, ge=1)
    DB_MAX_OVERFLOW: int = Field(default=2, ge=0)
    DB_POOL_TIMEOUT_SECONDS: float = Field(default=10.0, gt=0)
    DB_APPLICATION_NAME: str = Field(default="heatcalc-api", min_length=1)
    DB_POOL_RECYCLE_SECONDS: int = 3600
    DB_STATEMENT_TIMEOUT_MS: int = 30_000
    DB_CALCULATION_LOCK_TIMEOUT_MS: int = 2_000
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: int = 90_000

    # JWT / Security
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ACCESS_COOKIE_NAME: str = "access_token"
    REFRESH_COOKIE_NAME: str = "refresh_token"
    CSRF_COOKIE_NAME: str = "csrf_token"
    GUEST_COOKIE_NAME: str = "guest_session_id"
    # None → авто: secure-cookie включается в production и выключается в
    # dev/demo (локальный HTTP). Явный bool в env переопределяет автоматику.
    AUTH_COOKIE_SECURE: bool | None = None
    AUTH_COOKIE_SAMESITE: str = "lax"
    TRUSTED_PROXY_IPS: str = ""

    # First admin
    FIRST_ADMIN_EMAIL: str = "admin@heatcalc.local"
    FIRST_ADMIN_PASSWORD: str = "admin"

    # App
    PROJECT_NAME: str = "HeatCalc"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    LOG_ACCESS: bool = False
    AUDIT_ENABLED: bool = True
    AUDIT_FAIL_CLOSED: bool = False
    # Temporary frontend compatibility inputs. This remains fail-closed unless
    # explicitly enabled for local development or tests.
    ELECTRICAL_FRONTEND_MOCK_MODE: Literal["off", "test", "dev"] = "off"

    # CORS — comma-separated список разрешённых origin'ов фронта.
    # Формат в env: CORS_ORIGINS=https://example.ru,https://www.example.ru
    # Дефолт — под локальную разработку (Vite dev + nginx-прокси).
    # Используйте property `cors_origins_list` для получения списка.
    CORS_ORIGINS: str = (
        "http://localhost:3000,"
        "http://localhost:3001,"
        "http://localhost:3003,"
        "http://localhost:5173,"
        "http://127.0.0.1:3000,"
        "http://127.0.0.1:3001,"
        "http://127.0.0.1:3003"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # Пользовательские (гостевые) сессии: защита от ботов и накопления мусора.
    # Историческое имя GUEST_MAX_OBJECTS_PER_PROJECT используется как глобальный
    # лимит объектов в проекте для всех ролей, чтобы bounded NFR сохранялся в API.
    # Поток: зашёл → один авто-проект → поработал → ушёл → через TTL+интервал всё чистится.
    GUEST_MAX_PROJECTS: int = 1  # у пользователя ровно один проект
    # Кейс §3.5: приложение должно поддерживать не менее 500 объектов в проекте.
    GUEST_MAX_OBJECTS_PER_PROJECT: int = 500  # максимум объектов в одном проекте
    # PDL-ER-26: временное хранение гостевого проекта — 3 суток sliding TTL.
    GUEST_SESSION_TTL_MINUTES: int = 4320  # 3 дня; неактивная сессия чистится после N мин
    GUEST_CLEANUP_INTERVAL_MINUTES: int = 60  # периодичность фонового cleanup
    GUEST_MAX_SESSIONS_PER_IP: int = 10  # максимум новых сессий с одного IP за 1 час
    GUEST_ACTIVITY_TOUCH_INTERVAL_SECONDS: int = 60  # throttle UPDATE last_activity
    LOGIN_MAX_ATTEMPTS_PER_IP: int = 10  # максимум попыток логина с одного IP за 1 час
    AUTH_PASSWORD_HASH_MAX_CONCURRENCY: int = 4  # bcrypt/hash не должны раздувать общий threadpool
    IMPORT_MAX_REQUESTS_PER_PRINCIPAL_PER_IP: int = 20
    REPORT_MAX_REQUESTS_PER_PRINCIPAL_PER_IP: int = 30
    BATCH_MAX_REQUESTS_PER_PRINCIPAL_PER_IP: int = 30
    JOB_ENQUEUE_MAX_REQUESTS_PER_PRINCIPAL_PER_IP: int = 20

    # Защита от DoS через большие загрузки (Excel/CSV/проект)
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024  # 10 МБ — потолок одного multipart-запроса
    MAX_IMPORT_ROWS: int = 10_000
    MAX_IMPORT_SHEETS: int = 10
    MAX_XLSX_FILES: int = 200
    MAX_XLSX_UNCOMPRESSED_BYTES: int = 50 * 1024 * 1024

    # Generated report artifacts. Backend and worker must share this path.
    REPORT_ARTIFACT_DIR: str = "/var/lib/heatcalc/reports"
    REPORT_ARTIFACT_TTL_HOURS: int = 24

    # Redis для distributed rate limiter. Если пусто — fallback на in-memory.
    REDIS_URL: str | None = None
    REDIS_MAX_CONNECTIONS: int = 50

    # Worker queue для тяжёлых расчётов. Postgres хранит состояние задач,
    # Redis используется только как транспорт доставки worker'ам.
    WORKER_QUEUE_STREAM: str = "heatcalc:tasks:cpu"
    WORKER_DEAD_LETTER_STREAM: str = "heatcalc:tasks:cpu:dead"
    WORKER_QUEUE_GROUP: str = "heatcalc-workers"
    WORKER_QUEUE_CONSUMER: str = "worker-1"
    WORKER_QUEUE_MAXLEN: int = 10_000
    WORKER_DEAD_LETTER_MAXLEN: int = 1_000
    WORKER_DEAD_LETTER_DEDUPE_TTL_SECONDS: int = 604_800
    WORKER_POLL_TIMEOUT_MS: int = 5_000
    WORKER_RECOVERY_INTERVAL_SECONDS: int = 30
    WORKER_RECOVERY_LEADER_KEY: str = "heatcalc:workers:recovery-leader"
    WORKER_TASK_STALE_SECONDS: int = 120
    WORKER_MAX_ATTEMPTS: int = 3
    WORKER_PROGRESS_MIN_INTERVAL_MS: int = 500
    WORKER_PROGRESS_MIN_PERCENT_DELTA: float = 1.0
    WORKER_READINESS_KEY_PREFIX: str = "heatcalc:workers:ready"
    WORKER_HEARTBEAT_INTERVAL_SECONDS: int = 5
    WORKER_HEARTBEAT_TTL_SECONDS: int = 20
    WORKER_EVENT_LOOP_STALE_SECONDS: int = 150
    WORKER_RETRY_BACKOFF_MAX_SECONDS: int = 30
    MAX_ACTIVE_TASKS_PER_PROJECT: int = 3
    MAX_ACTIVE_TASKS_PER_PRINCIPAL: int = 5
    MAX_ACTIVE_TASKS_GLOBAL: int = 200
    WORKFLOW_QUEUE_TIMEOUT_SECONDS: int = 300
    WORKFLOW_EXECUTION_TIMEOUT_SECONDS: int = 600
    WORKFLOW_INTERACTION_TIMEOUT_SECONDS: int = 300
    WORKFLOW_HEAT_TIMEOUT_SECONDS: int = 60
    WORKFLOW_ELECTRICAL_TIMEOUT_SECONDS: int = 60
    WORKFLOW_SPECIFICATION_TIMEOUT_SECONDS: int = 30

    @property
    def trusted_proxy_ips_list(self) -> list[str]:
        return [ip.strip() for ip in self.TRUSTED_PROXY_IPS.split(",") if ip.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.strip().lower() in {"prod", "production"}

    @property
    def auth_cookie_secure(self) -> bool:
        """Фактический флаг Secure для auth-cookie.

        Если AUTH_COOKIE_SECURE не задан явно — secure включается в production
        (где фронт под HTTPS) и выключается в dev/demo (локальный HTTP).
        """
        if self.AUTH_COOKIE_SECURE is not None:
            return self.AUTH_COOKIE_SECURE
        return self.is_production

    def validate_runtime_security(self) -> None:
        if not self.is_production:
            return
        errors: list[str] = []
        if self.SECRET_KEY == "change-me-in-production":
            errors.append("SECRET_KEY must be changed in production")
        if len(self.SECRET_KEY) < 32:
            errors.append("SECRET_KEY must be at least 32 characters in production")
        if self.FIRST_ADMIN_PASSWORD == "admin":
            errors.append("FIRST_ADMIN_PASSWORD must be changed in production")
        if len(self.FIRST_ADMIN_PASSWORD) < 12:
            errors.append("FIRST_ADMIN_PASSWORD must be at least 12 characters in production")
        if not self.auth_cookie_secure:
            errors.append("AUTH_COOKIE_SECURE must be True in production (HTTPS cookies)")
        if self.ELECTRICAL_FRONTEND_MOCK_MODE != "off":
            errors.append("ELECTRICAL_FRONTEND_MOCK_MODE must be off in production")
        if errors:
            raise RuntimeError("; ".join(errors))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
