# syntax=docker/dockerfile:1.7-labs
# =====================================================================
# Multi-arch (linux/amd64, linux/arm64) multi-stage build.
#   builder — компиляция нативных зависимостей (WeasyPrint требует gcc)
#   runtime — минимальный образ только с runtime-библиотеками + код
#
# Под multi-arch buildx сам подставляет TARGETPLATFORM/TARGETARCH,
# QEMU прозрачно эмулирует целевую архитектуру в builder-стейдже.
# BuildKit cache mount для pip — переживает пересборки между арками.
# =====================================================================

# ---------- Stage 1: builder ----------
FROM --platform=$TARGETPLATFORM python:3.11-slim AS builder

ARG TARGETOS
ARG TARGETARCH
ARG TARGETPLATFORM

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Апгрейд pip/wheel — закрывает CVE базового образа python:3.11-slim
RUN pip install --no-cache-dir --upgrade pip wheel

WORKDIR /build
COPY requirements.txt .
COPY packages/heat-loss-core /build/packages/heat-loss-core
COPY packages/electrical-core /build/packages/electrical-core
COPY packages/specification-core /build/packages/specification-core
# Собираем wheel-кэш — не оставляем gcc и build-essential в финальном образе.
# BuildKit cache mount: pip-кэш переживает пересборки и параллелится между арками.
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked,id=pip-${TARGETARCH} \
    pip wheel --wheel-dir /build/wheels -r requirements.txt \
    && pip wheel --no-deps --no-build-isolation --wheel-dir /build/wheels \
        /build/packages/heat-loss-core \
    && pip wheel --no-deps --no-build-isolation --wheel-dir /build/wheels \
        /build/packages/electrical-core \
    && pip wheel --no-deps --no-build-isolation --wheel-dir /build/wheels \
        /build/packages/specification-core

# Примечание: test-стейдж не делаем прямо здесь, так как `.dockerignore`
# исключает `app/tests` из контекста. Unit- и integration-тесты гоняются
# через dev-образ (Dockerfile.dev), который использует bind-mount исходников.
# Конкретная команда для CI — см. `backend/README-deps.md` и playbook.

# ---------- Stage 2: runtime ----------
FROM --platform=$TARGETPLATFORM python:3.11-slim AS runtime

ARG TARGETOS
ARG TARGETARCH
ARG TARGETPLATFORM

# OCI image labels — стандарт для metadata при docker inspect / registry UI.
LABEL org.opencontainers.image.title="HeatCalc Backend (TLT)" \
      org.opencontainers.image.description="FastAPI сервер расчёта тепловых потерь и подбора кабеля ТЛТ" \
      org.opencontainers.image.vendor="ТЛТ" \
      org.opencontainers.image.licenses="Proprietary" \
      org.opencontainers.image.source="https://github.com/" \
      org.opencontainers.image.documentation="https://github.com/" \
      org.opencontainers.image.architecture="${TARGETARCH}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

# Runtime-зависимости WeasyPrint (генерация PDF) + утилиты для entrypoint
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libcairo2 \
        shared-mime-info \
        fonts-dejavu \
        netcat-openbsd \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Создаём непривилегированного пользователя
RUN groupadd --system app && useradd --system --gid app --home /app app

WORKDIR /app

# Апгрейд pip/wheel — закрывает CVE базового образа
RUN pip install --no-cache-dir --upgrade pip wheel

# Устанавливаем зависимости из заранее собранных wheel-ов (без gcc)
COPY --from=builder /build/wheels /tmp/wheels
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked,id=pip-runtime-${TARGETARCH} \
    pip install --no-index --find-links=/tmp/wheels -r requirements.txt \
    && pip install --no-index --find-links=/tmp/wheels heatcalc-heat-loss-core==0.2.0 \
    && pip install --no-index --find-links=/tmp/wheels heatcalc-electrical-core==0.1.0 \
    && pip install --no-index --find-links=/tmp/wheels heatcalc-specification-core==0.1.0 \
    && rm -rf /tmp/wheels

# Копируем код приложения (тесты исключены через .dockerignore)
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && chown -R app:app /app

USER app

EXPOSE 8000

# Container liveness only. Dependency/worker readiness is exposed separately.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8000/health/live >/dev/null || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-2} --limit-concurrency ${UVICORN_LIMIT_CONCURRENCY:-100} --backlog ${UVICORN_BACKLOG:-128} --timeout-keep-alive ${UVICORN_KEEPALIVE:-5} --loop uvloop --http httptools"]
