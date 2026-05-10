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
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_RECYCLE_SECONDS: int = 3600
    DB_STATEMENT_TIMEOUT_MS: int = 30_000

    # JWT / Security
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

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
        "http://localhost:3003,"
        "http://localhost:5173,"
        "http://127.0.0.1:3000,"
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

    # Защита от DoS через большие загрузки (Excel/CSV/проект)
    MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024  # 5 МБ — потолок одного multipart-запроса

    # Redis для distributed rate limiter. Если пусто — fallback на in-memory.
    REDIS_URL: str | None = None

    # Worker queue для тяжёлых расчётов. Postgres хранит состояние задач,
    # Redis используется только как транспорт доставки worker'ам.
    WORKER_QUEUE_STREAM: str = "heatcalc:tasks:cpu"
    WORKER_QUEUE_GROUP: str = "heatcalc-workers"
    WORKER_QUEUE_CONSUMER: str = "worker-1"
    WORKER_QUEUE_MAXLEN: int = 10_000
    WORKER_POLL_TIMEOUT_MS: int = 5_000
    WORKER_RECOVERY_INTERVAL_SECONDS: int = 30
    WORKER_TASK_STALE_SECONDS: int = 120
    WORKER_MAX_ATTEMPTS: int = 3
    WORKER_PROGRESS_MIN_INTERVAL_MS: int = 500
    WORKER_PROGRESS_MIN_PERCENT_DELTA: float = 1.0


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
