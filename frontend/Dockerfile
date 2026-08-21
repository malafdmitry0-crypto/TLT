# syntax=docker/dockerfile:1.7-labs
# =====================================================================
# Multi-arch (linux/amd64, linux/arm64) multi-stage build.
#   build   — Vite-сборка frontend (TypeScript + React)
#   runtime — nginx раздаёт статику и проксирует /api на backend
#
# Vite-bundle архитектурно-независимый (это JS+HTML+CSS), но npm-пакеты
# с native-биндингами (esbuild, swc, sharp) разные под arm64/amd64 —
# поэтому сборка идёт под TARGETPLATFORM, как и runtime nginx.
# =====================================================================

# ---------- Stage 1: build ----------
FROM --platform=$TARGETPLATFORM node:20-alpine AS build

ARG TARGETOS
ARG TARGETARCH
ARG TARGETPLATFORM

WORKDIR /app

# Сначала только манифесты — для эффективного Docker layer cache.
# package-lock.json даёт детерминированную сборку через `npm ci`.
# BuildKit cache mount: ~/.npm переживает пересборки и параллелится между арками.
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked,id=npm-${TARGETARCH} \
    if [ -f package-lock.json ]; then \
        npm ci --no-audit --no-fund; \
    else \
        npm install --no-audit --no-fund; \
    fi

# Build-time переменная: URL backend API. По умолчанию относительный путь
# /api/v1, который nginx-runtime проксирует в backend (см. nginx.conf).
# Можно переопределить: docker build --build-arg VITE_API_BASE_URL=https://...
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM --platform=$TARGETPLATFORM nginx:alpine AS runtime

ARG TARGETARCH

LABEL org.opencontainers.image.title="HeatCalc Frontend (TLT)" \
      org.opencontainers.image.description="React+Vite UI расчёта теплопотерь и спецификации ТЛТ" \
      org.opencontainers.image.vendor="ТЛТ" \
      org.opencontainers.image.licenses="Proprietary" \
      org.opencontainers.image.source="https://github.com/" \
      org.opencontainers.image.architecture="${TARGETARCH}"

# Удаляем дефолтный nginx-конфиг, чтобы не было конфликта server_name
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --quiet --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
