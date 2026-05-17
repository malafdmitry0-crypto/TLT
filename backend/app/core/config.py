"""Конфигурация приложения через переменные окружения."""

from functools import lru_cache

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
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_RECYCLE_SECONDS: int = 3600
    DB_STATEMENT_TIMEOUT_MS: int = 30_000

    # JWT / Security
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ACCESS_COOKIE_NAME: str = "access_token"
    REFRESH_COOKIE_NAME: str = "refresh_token"
    CSRF_COOKIE_NAME: str = "csrf_token"
    AUTH_COOKIE_SECURE: bool = False
    AUTH_COOKIE_SAMESITE: str = "lax"
    TRUSTED_PROXY_IPS: str = ""

    # First admin
    FIRST_ADMIN_EMAIL: str = "admin@heatcalc.local"
    FIRST_ADMIN_PASSWORD: str = "admin"

    # App
    PROJECT_NAME: str = "HeatCalc"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

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
    # Поток: зашёл → один авто-проект → поработал → ушёл → через TTL+интервал всё чистится.
    GUEST_MAX_PROJECTS: int = 1  # у пользователя ровно один проект
    GUEST_MAX_OBJECTS_PER_PROJECT: int = 101  # максимум объектов в одном проекте
    GUEST_SESSION_TTL_MINUTES: int = 20  # неактивная сессия чистится после N мин
    GUEST_CLEANUP_INTERVAL_MINUTES: int = 10  # периодичность фонового cleanup
    GUEST_MAX_SESSIONS_PER_IP: int = 10  # максимум новых сессий с одного IP за 1 час
    GUEST_ACTIVITY_TOUCH_INTERVAL_SECONDS: int = 60  # throttle UPDATE last_activity
    LOGIN_MAX_ATTEMPTS_PER_IP: int = 10  # максимум попыток логина с одного IP за 1 час
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
    WORKER_POLL_TIMEOUT_MS: int = 5_000
    WORKER_RECOVERY_INTERVAL_SECONDS: int = 30
    WORKER_TASK_STALE_SECONDS: int = 120
    WORKER_MAX_ATTEMPTS: int = 3
    WORKER_PROGRESS_MIN_INTERVAL_MS: int = 500
    WORKER_PROGRESS_MIN_PERCENT_DELTA: float = 1.0
    MAX_ACTIVE_TASKS_PER_PROJECT: int = 3
    MAX_ACTIVE_TASKS_PER_PRINCIPAL: int = 5
    MAX_ACTIVE_TASKS_GLOBAL: int = 200

    @property
    def trusted_proxy_ips_list(self) -> list[str]:
        return [ip.strip() for ip in self.TRUSTED_PROXY_IPS.split(",") if ip.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.strip().lower() in {"prod", "production"}

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
        if errors:
            raise RuntimeError("; ".join(errors))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
