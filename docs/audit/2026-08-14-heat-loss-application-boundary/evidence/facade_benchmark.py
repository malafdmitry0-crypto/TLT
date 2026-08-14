"""Facade microbenchmark for the 2026-08-14 application-boundary queue.

Uses the same old/new facade adapters as facade_behavior_probe.py.
Timing only; do not treat this JSON as a numerical-result contract.
"""

from __future__ import annotations

import argparse
import gc
import json
import statistics
import time

from facade_behavior_probe import call_pipe, call_tank, pipe_cases, tank_cases


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    parser.add_argument("--rounds", type=int, default=9)
    parser.add_argument("--loops", type=int, default=20)
    args = parser.parse_args()

    pipes = pipe_cases()
    tanks = tank_cases()

    for name, params, coefficients in pipes:
        del name
        call_pipe(params, coefficients)
    for name, params in tanks:
        del name
        call_tank(params)

    samples: list[float] = []
    gc.disable()
    try:
        for _ in range(args.rounds):
            started = time.perf_counter()
            for _ in range(args.loops):
                for name, params, coefficients in pipes:
                    del name
                    call_pipe(params, coefficients)
                for name, params in tanks:
                    del name
                    call_tank(params)
            samples.append(time.perf_counter() - started)
    finally:
        gc.enable()

    operations = args.loops * (len(pipes) + len(tanks))
    result = {
        "rounds": args.rounds,
        "loops_per_round": args.loops,
        "operations_per_round": operations,
        "samples_seconds": samples,
        "median_seconds": statistics.median(samples),
        "minimum_seconds": min(samples),
        "median_microseconds_per_operation": statistics.median(samples) * 1_000_000 / operations,
    }
    text = json.dumps(result, sort_keys=True, indent=2) + "\n"
    with open(args.output, "w", encoding="utf-8") as handle:
        handle.write(text)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
