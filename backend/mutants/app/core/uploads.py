"""Helpers for bounded upload reads."""

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings


async def read_upload_with_limit(
    file: UploadFile,
    *,
    max_bytes: int = settings.MAX_UPLOAD_BYTES,
    chunk_size: int = 1024 * 1024,
) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Размер файла превышает лимит {max_bytes // 1024} КБ",
            )
        chunks.append(chunk)
    return b"".join(chunks)
