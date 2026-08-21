"""JWT-токены и хеширование паролей."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from anyio import CapacityLimiter, to_thread
from jwt import InvalidTokenError

from app.core.config import settings

password_hash_limiter = CapacityLimiter(settings.AUTH_PASSWORD_HASH_MAX_CONCURRENCY)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode("ascii")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password.startswith("$2b$"):
        return False
    try:
        return bcrypt.checkpw(plain_password.encode(), hashed_password.encode("ascii"))
    except (UnicodeEncodeError, ValueError):
        return False


async def hash_password_async(password: str) -> str:
    return await to_thread.run_sync(hash_password, password, limiter=password_hash_limiter)


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    return await to_thread.run_sync(
        verify_password,
        plain_password,
        hashed_password,
        limiter=password_hash_limiter,
    )


def create_access_token(
    subject: str,
    role: str,
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(
    subject: str,
    *,
    jti: str | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    payload: dict[str, Any] = {
        "sub": subject,
        "type": "refresh",
        "jti": jti or uuid.uuid4().hex,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except InvalidTokenError as exc:  # pragma: no cover
        raise ValueError("Invalid token") from exc
