#!/usr/bin/env bash
# Загружает Docker-образы под ВАШУ архитектуру (определяется автоматически).
# Запуск: ./load.sh
#
# Поддержка: Linux, macOS, WSL2 (Windows). На Windows — запускайте из bash
# (Git Bash или WSL): bash load.sh

set -euo pipefail

cd "$(dirname "$0")"
IMAGE_TAG="${IMAGE_TAG:-1.3.0-demo}"

case "$(uname -m)" in
    x86_64|amd64)  ARCH=amd64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) echo "Неподдерживаемая архитектура: $(uname -m)"; exit 1 ;;
esac

echo "Определена архитектура: ${ARCH}"
echo

for service in backend frontend; do
    file="images/heatcalc-${service}-${IMAGE_TAG}-${ARCH}.tar.gz"
    if [ ! -f "${file}" ]; then
        echo "✗ Файл ${file} не найден"
        exit 1
    fi
    echo "→ Загружаю ${file}..."
    docker load -i "${file}"
done

echo
echo "✓ Образы загружены. Запуск:  docker compose up -d --wait --wait-timeout 180"
