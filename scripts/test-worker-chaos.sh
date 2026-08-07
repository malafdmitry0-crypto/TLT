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
  $COMPOSE logs --tail=160 worker >&2 || true
  return 1
}

active_consumers() {
  curl -fsS "${BASE_URL}/health/ready" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["worker"]["active_consumers"])'
}

prepare_probe() {
  label="$1"
  guest="$(curl -fsS -X POST "${BASE_URL}/api/v1/auth/guest")"
  PROBE_SESSION="$(printf '%s' "$guest" | python3 -c \
    'import json,sys; print(json.load(sys.stdin)["session_id"])')"
  PROBE_PROJECT="$(printf '%s' "$guest" | python3 -c \
    'import json,sys; print(json.load(sys.stdin)["project"]["id"])')"
  curl -fsS \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Session-Id: ${PROBE_SESSION}" \
    --data '{
      "object_type": "pipe",
      "params": {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [{
          "thickness": 0.05,
          "material": "mineral_wool_boards_120"
        }],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20,
        "process_temperature": 80,
        "pipe_length": 25,
        "placement": "outdoor",
        "wind_speed": 0
      }
    }' \
    "${BASE_URL}/api/v1/projects/${PROBE_PROJECT}/objects" >/dev/null
}

assert_enqueue_blocked() {
  label="$1"
  status="$(curl -sS -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Session-Id: ${PROBE_SESSION}" \
    -H "Idempotency-Key: chaos-blocked-${label}-$$" \
    --data "{\"project_id\":\"${PROBE_PROJECT}\",\"include_errors\":true}" \
    "${BASE_URL}/api/v1/calc/heat-loss/batch/jobs" || true)"
  if [ "$status" != "503" ]; then
    echo "Expected enqueue HTTP 503 during ${label}, got ${status}" >&2
    return 1
  fi
}

assert_task_roundtrip() {
  label="$1"
  response="$(curl -fsS \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Session-Id: ${PROBE_SESSION}" \
    -H "Idempotency-Key: chaos-recovered-${label}-$$" \
    --data "{\"project_id\":\"${PROBE_PROJECT}\",\"include_errors\":true}" \
    "${BASE_URL}/api/v1/calc/heat-loss/batch/jobs")"
  task_id="$(printf '%s' "$response" | python3 -c \
    'import json,sys; print(json.load(sys.stdin)["id"])')"

  elapsed=0
  while [ "$elapsed" -lt 45 ]; do
    response="$(curl -fsS \
      -H "X-Session-Id: ${PROBE_SESSION}" \
      "${BASE_URL}/api/v1/calc/jobs/${task_id}")"
    task_status="$(printf '%s' "$response" | python3 -c \
      'import json,sys; print(json.load(sys.stdin)["status"])')"
    if [ "$task_status" = "succeeded" ]; then
      echo "[worker-chaos] ${label} task roundtrip: succeeded"
      return 0
    fi
    case "$task_status" in
      failed|cancelled|timed_out)
        echo "Recovered ${label} task ended as ${task_status}: ${response}" >&2
        return 1
        ;;
    esac
    sleep 1
    elapsed=$((elapsed + 1))
  done
  echo "Recovered ${label} task did not finish: ${response}" >&2
  return 1
}

echo "[worker-chaos] build and start dependencies without worker"
$COMPOSE up --build -d db redis backend
wait_status 503 90
prepare_probe "late-worker"
assert_enqueue_blocked "late-worker"

echo "[worker-chaos] late worker start"
$COMPOSE up -d worker
wait_status 200 60
assert_task_roundtrip "late-worker"

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
prepare_probe "two-workers"
assert_task_roundtrip "two-workers"

echo "[worker-chaos] SIGKILL one worker keeps service ready"
victim="$($COMPOSE ps -q worker | sed -n '1p')"
[ -n "$victim" ]
docker kill --signal KILL "$victim" >/dev/null
wait_status 200 15
prepare_probe "sigkill-survivor"
assert_task_roundtrip "sigkill-survivor"
$COMPOSE up -d --scale worker=2 worker

echo "[worker-chaos] all workers crash and recover"
prepare_probe "all-workers-crash"
for container in $($COMPOSE ps -q worker); do
  docker kill --signal KILL "$container" >/dev/null
done
wait_status 503 15
assert_enqueue_blocked "all-workers-crash"
$COMPOSE up -d --scale worker=2 worker
wait_status 200 30
assert_task_roundtrip "all-workers-crash"

echo "[worker-chaos] poison message is isolated in DLQ"
dlq_before="$($COMPOSE exec -T redis redis-cli -n 14 --raw \
  XLEN heatcalc:tasks:cpu:dead)"
$COMPOSE exec -T redis redis-cli -n 14 --raw \
  XADD heatcalc:tasks:cpu '*' type poison >/dev/null
elapsed=0
while [ "$elapsed" -lt 15 ]; do
  dlq_after="$($COMPOSE exec -T redis redis-cli -n 14 --raw \
    XLEN heatcalc:tasks:cpu:dead)"
  [ "$dlq_after" -gt "$dlq_before" ] && break
  sleep 1
  elapsed=$((elapsed + 1))
done
[ "${dlq_after:-0}" -gt "$dlq_before" ]
pending="$($COMPOSE exec -T redis redis-cli -n 14 --raw \
  XPENDING heatcalc:tasks:cpu heatcalc-workers | sed -n '1p')"
[ "$pending" = "0" ]
wait_status 200 15
prepare_probe "after-poison"
assert_task_roundtrip "after-poison"

echo "[worker-chaos] worker network partition withdraws readiness"
prepare_probe "network-partition"
for container in $($COMPOSE ps -q worker); do
  docker network disconnect "$NETWORK" "$container"
done
wait_status 503 15
assert_enqueue_blocked "network-partition"
for container in $($COMPOSE ps -q worker); do
  docker network connect "$NETWORK" "$container"
done
wait_status 200 30
assert_task_roundtrip "network-partition"

echo "[worker-chaos] Redis outage and recovery"
prepare_probe "redis-restart"
$COMPOSE stop redis
wait_status 503 15
assert_enqueue_blocked "redis-restart"
$COMPOSE start redis
wait_status 200 30
assert_task_roundtrip "redis-restart"

echo "[worker-chaos] PostgreSQL outage and recovery"
prepare_probe "postgres-restart"
$COMPOSE stop db
wait_status 503 15
assert_enqueue_blocked "postgres-restart"
$COMPOSE start db
wait_status 200 45
assert_task_roundtrip "postgres-restart"

echo "Worker chaos contracts: PASS"
