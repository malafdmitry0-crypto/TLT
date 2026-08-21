#!/usr/bin/env python3
"""A2.1 — Phase 5 performance probe (synthetic BOM/builder scale).

Does NOT raise product object limits. Measures pure full_builder cost for
N objects and prints wall-clock numbers for evidence notes.

Usage (inside backend container):
  python scripts/perf-probe-phase5.py
  python scripts/perf-probe-phase5.py --sizes 10,50
"""

from __future__ import annotations

import argparse
import statistics
import sys
import time
from pathlib import Path

# Allow running from repo root or /app
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def _build(n: int):
    from app.formulas.specification.full_builder import build_full_specification_detailed

    elec = [
        {
            "cable_mark": "25ТТН2-СТ",
            "selected_cable": "25ТТН2",
            "temperature_group": "low",
            "num_circuits": 1,
            "installed_cable_length": 20.0,
            "object_id": f"o{i}",
        }
        for i in range(n)
    ]
    objs = {
        f"o{i}": {
            "outer_diameter": 0.108,
            "pipe_length": 20.0,
            "object_type": "pipe",
        }
        for i in range(n)
    }
    return build_full_specification_detailed(elec, objs)


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 5 BOM perf probe")
    parser.add_argument("--sizes", default="10,50", help="comma-separated object counts")
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()
    sizes = [int(x) for x in args.sizes.split(",") if x.strip()]

    print("Phase 5 perf probe (full_builder only; not full HTTP flow)")
    print("Product limit remains 50 until full 500 gate is green (PDL-ER-27).")
    print()

    for n in sizes:
        times: list[float] = []
        last = None
        for _ in range(args.repeats):
            t0 = time.perf_counter()
            last = _build(n)
            times.append(time.perf_counter() - t0)
        assert last is not None
        print(
            f"N={n:4d}  "
            f"mean={statistics.mean(times):.4f}s  "
            f"min={min(times):.4f}s  max={max(times):.4f}s  "
            f"items={len(last.items)}  partial={last.partial}  "
            f"contributing={len(last.contributing_object_ids)}"
        )
    print()
    print("NOTE: full flow gate (import+batch+table+spec+report @ 500×5) is separate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
