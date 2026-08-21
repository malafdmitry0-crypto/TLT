"""Fail the mutation gate when the formula mutation score drops below baseline."""

from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path

MUTANTS_DIR = Path("mutants/app/formulas")
DEFAULT_MIN_SCORE = 65.0
DEFAULT_MAX_TIMEOUTS = 12


def _status_counts() -> Counter[int]:
    counts: Counter[int] = Counter()
    for meta_path in MUTANTS_DIR.rglob("*.meta"):
        data = json.loads(meta_path.read_text(encoding="utf-8"))
        counts.update(data.get("exit_code_by_key", {}).values())
    return counts


def main() -> int:
    counts = _status_counts()
    killed = counts[1]
    survived = counts[0]
    timed_out = counts[-24]
    total = killed + survived + timed_out
    if total == 0:
        print("Mutation score: no formula mutants found")
        return 2

    score = killed / total * 100.0
    min_score = float(os.getenv("MUTMUT_MIN_SCORE", DEFAULT_MIN_SCORE))
    max_timeouts = int(os.getenv("MUTMUT_MAX_TIMEOUTS", DEFAULT_MAX_TIMEOUTS))
    print(
        "Mutation score: "
        f"{score:.2f}% killed={killed} survived={survived} "
        f"timeout={timed_out} total={total} "
        f"threshold={min_score:.2f}% max_timeouts={max_timeouts}"
    )
    if score < min_score or timed_out > max_timeouts:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
