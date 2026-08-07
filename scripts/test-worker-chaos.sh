#!/bin/sh
set -eu

PROJECT="tlt-worker-chaos-${WORKER_CHAOS_RUN_ID:-local}"
BACKEND_PORT="${WORKER_CHAOS_BACKEND_PORT:-18001}"
BASE_URL="http://127.0.0.1:${BACKEND_PORT}"
COMPOSE="docker compose -p ${PROJECT} -f docker-compose.yml -f docker-compose.worker-chaos.yml"
NETWORK="${PROJECT}_default"

cleanup() {
  # PROJECT is fixed to this isolated chaos namespace; never touches the dev stack.
  $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

wait_status() {
  expected="$1"
  limit="${2:-60}"
  elapsed=0
  while [ "$elapsed" -lt "$limit" ]; do
    status="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/health/ready" || true)"
    if [ "$status" = "$expected" ]; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  echo "Expected readiness HTTP ${expected}, last=${status}" >&2
  $COMPOSE ps >&2 || true
  return 1
}

active_consumers() {
  curl -fsS "${BASE_URL}/health/ready" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["worker"]["active_consumers"])'
}

echo "[worker-chaos] build and start dependencies without worker"
$COMPOSE up --build -d db redis backend
wait_status 503 90

echo "[worker-chaos] late worker start"
$COMPOSE up -d worker
wait_status 200 60

echo "[worker-chaos] real Redis/PostgreSQL integration contracts"
$COMPOSE exec -T db sh -c \
  'createdb -U heatcalc heatcalc_test 2>/dev/null || true'
$COMPOSE exec -T \
  -e WORKER_LIVE_REDIS_URL=redis://redis:6379/14 \
  backend python -m pytest --no-cov -q \
  app/tests/integration/worker/test_worker_redis_live.py \
  app/tests/integration/worker/test_worker_sigkill_live.py \
  app/tests/integration/db/test_worker_fencing_live.py

echo "[worker-chaos] two workers"
$COMPOSE up -d --scale worker=2 worker
elapsed=0
while [ "$elapsed" -lt 30 ]; do
  count="$(active_consumers || echo 0)"
  [ "$count" -ge 2 ] && break
  sleep 1
  elapsed=$((elapsed + 1))
done
[ "${count:-0}" -ge 2 ]

echo "[worker-chaos] SIGKILL one worker keeps service ready"
victim="$($COMPOSE ps -q worker | sed -n '1p')"
[ -n "$victim" ]
docker kill --signal KILL "$victim" >/dev/null
wait_status 200 15
$COMPOSE up -d --scale worker=2 worker

echo "[worker-chaos] worker network partition withdraws readiness"
for container in $($COMPOSE ps -q worker); do
  docker network disconnect "$NETWORK" "$container"
done
wait_status 503 15
for container in $($COMPOSE ps -q worker); do
  docker network connect "$NETWORK" "$container"
done
wait_status 200 30

echo "[worker-chaos] Redis outage and recovery"
$COMPOSE stop redis
wait_status 503 15
$COMPOSE start redis
wait_status 200 30

echo "[worker-chaos] PostgreSQL outage and recovery"
$COMPOSE stop db
wait_status 503 15
$COMPOSE start db
wait_status 200 45

echo "Worker chaos contracts: PASS"
