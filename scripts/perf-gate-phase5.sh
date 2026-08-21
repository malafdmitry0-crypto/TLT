#!/usr/bin/env bash
# C1 — Phase 5 performance gate scaffold.
# Runs pure BOM probe @N=50 (and optional N) inside backend container.
# Does NOT raise product object limit. Full HTTP 500×5 remains future gate.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIZES="${PERF_SIZES:-10,50}"
REPEATS="${PERF_REPEATS:-3}"
CONTAINER="${PERF_BACKEND_CONTAINER:-heatcalc_backend}"

echo "▶ Phase 5 perf gate (builder probe only)"
echo "  sizes=$SIZES repeats=$REPEATS container=$CONTAINER"
echo "  product limit stays 50 until full 500 wall-clock gate is green (PDL-ER-27)"
echo

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "❌ container $CONTAINER not running" >&2
  exit 1
fi

docker exec -i "$CONTAINER" python - <<PY
import statistics, time, sys
from app.formulas.specification.full_builder import build_full_specification_detailed

sizes = [int(x) for x in "${SIZES}".split(",") if x.strip()]
repeats = int("${REPEATS}")

def build(n: int):
    elec = [{
        "cable_mark": "25ТТН2-СТ",
        "selected_cable": "25ТТН2",
        "temperature_group": "low",
        "num_circuits": 1,
        "installed_cable_length": 20.0,
        "object_id": f"o{i}",
    } for i in range(n)]
    objs = {f"o{i}": {"outer_diameter": 0.108, "pipe_length": 20.0, "object_type": "pipe"} for i in range(n)}
    return build_full_specification_detailed(elec, objs)

failed = False
for n in sizes:
    times = []
    last = None
    for _ in range(repeats):
        t0 = time.perf_counter()
        last = build(n)
        times.append(time.perf_counter() - t0)
    mean = statistics.mean(times)
    print(f"N={n:4d}  mean={mean:.4f}s  min={min(times):.4f}s  max={max(times):.4f}s  items={len(last.items)}  partial={last.partial}")
    # Soft ceiling for pure builder @50: 2s (generous vs measured ~ms)
    if n <= 50 and mean > 2.0:
        print(f"FAIL soft ceiling: N={n} mean {mean:.4f}s > 2.0s", file=sys.stderr)
        failed = True

print()
print("FULL_HTTP_500_GATE: not_run (requires import+batch+table+spec+report @500×5)")
print("RUNTIME_LIMIT: keep 50 until FULL_HTTP_500_GATE green")
sys.exit(1 if failed else 0)
PY

echo "✅ perf-gate-phase5 builder probe green"
