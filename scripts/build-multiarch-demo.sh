#!/usr/bin/env bash
# =====================================================================
# Сборка demo-образов под обе арки (linux/amd64 + linux/arm64) —
# по отдельному tar.gz на каждую арку (формат `docker save`).
#
# Почему НЕ multi-arch OCI archive: классический Docker engine (без
# containerd image store) не умеет грузить OCI manifest list через
# `docker load` — падает с `blobs/json: no such file or directory`.
# Поэтому шлём 2 файла на сервис (4 всего), пользователь выбирает свой
# через `load.sh` (автодетект uname -m).
#
# Технологии:
#   • docker buildx + QEMU emulation — кросс-арка
#   • BuildKit cache mounts (pip / npm) — переживают пересборки
#   • --output type=docker — классический формат `docker save`,
#     совместим с любой версией Docker (даже старой)
#
# Использование:
#   ./scripts/build-multiarch-demo.sh
#   VERSION=1.3.0-demo ./scripts/build-multiarch-demo.sh
#   ARCHS="amd64" ./scripts/build-multiarch-demo.sh    # только одна арка
# =====================================================================

set -euo pipefail

VERSION="${VERSION:-1.3.0-demo}"
ARCHS="${ARCHS:-amd64 arm64}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${REPO_ROOT}/demo/images"
mkdir -p "${OUT_DIR}"

echo "════════════════════════════════════════════════════════════════"
echo "Per-arch demo build (Docker save format, universally loadable)"
echo "  version:  ${VERSION}"
echo "  archs:    ${ARCHS}"
echo "  output:   ${OUT_DIR}/"
echo "════════════════════════════════════════════════════════════════"

# Гарантируем, что binfmt установлен (no-op если уже есть).
docker run --rm --privileged tonistiigi/binfmt --install all >/dev/null 2>&1 || true

build_one() {
    local service="$1"     # backend | frontend
    local arch="$2"        # amd64 | arm64
    local tag="heatcalc-${service}:${VERSION}"
    local out_tar="${OUT_DIR}/heatcalc-${service}-${VERSION}-${arch}.tar"
    local extra_args=()

    if [ "${service}" = "frontend" ]; then
        extra_args+=(--build-arg "VITE_API_BASE_URL=/api/v1")
    fi

    echo
    echo "→ ${service} / linux/${arch} → $(basename "${out_tar}")"
    docker buildx build \
        --platform "linux/${arch}" \
        --tag "${tag}" \
        --output "type=docker,dest=${out_tar}" \
        --provenance=false --sbom=false \
        ${extra_args[@]+"${extra_args[@]}"} \
        "${REPO_ROOT}/${service}"

    gzip -f "${out_tar}"
}

for arch in ${ARCHS}; do
    build_one backend "${arch}"
    build_one frontend "${arch}"
done

echo
echo "✓ Готово."
ls -lh "${OUT_DIR}/heatcalc-"*"-${VERSION}-"*.tar.gz
echo
echo "У заказчика:"
echo "  cd demo && ./load.sh && docker compose up -d --wait --wait-timeout 180"
