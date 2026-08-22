"""Enforce independent mutation-score floors for formula domains."""

from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path

BACKEND_MUTANT_ROOTS = (Path("mutants/app/formulas/electrical"),)
CORE_MUTANT_ROOTS = (Path("packages/heat-loss-core/mutants/src/heatcalc_heat_loss_core"),)
ELECTRICAL_CORE_MUTANT_ROOTS = (
    Path("packages/electrical-core/mutants/src/heatcalc_electrical_core"),
)
SPECIFICATION_CORE_MUTANT_ROOTS = (
    Path("packages/specification-core/mutants/src/heatcalc_specification_core"),
)
MUTANT_ROOTS = (
    BACKEND_MUTANT_ROOTS
    + CORE_MUTANT_ROOTS
    + ELECTRICAL_CORE_MUTANT_ROOTS
    + SPECIFICATION_CORE_MUTANT_ROOTS
)
DEFAULT_BACKEND_MIN_SCORE = 65.0
DEFAULT_CORE_MIN_SCORE = 65.0
# Electrical core follows the existing standalone-core 65% policy. CI/users
# may raise it independently with MUTMUT_ELECTRICAL_CORE_MIN_SCORE.
DEFAULT_ELECTRICAL_CORE_MIN_SCORE = DEFAULT_CORE_MIN_SCORE
DEFAULT_SPECIFICATION_CORE_MIN_SCORE = 75.0
DEFAULT_MAX_TIMEOUTS = 12
DEFAULT_SPECIFICATION_CORE_MAX_TIMEOUTS = 0


def _status_counts(roots: tuple[Path, ...] | None = None) -> Counter[int]:
    counts: Counter[int] = Counter()
    for root in roots or MUTANT_ROOTS:
        for meta_path in root.rglob("*.meta"):
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            counts.update(data.get("exit_code_by_key", {}).values())
    return counts


def _score_line(label: str, counts: Counter[int], *, threshold: float) -> tuple[str, bool]:
    killed = counts[1]
    survived = counts[0]
    timed_out = counts[-24]
    total = killed + survived + timed_out
    if total == 0:
        return f"{label}: no scored mutants found", False

    score = killed / total * 100.0
    line = (
        f"{label}: {score:.2f}% killed={killed} survived={survived} "
        f"timeout={timed_out} total={total} threshold={threshold:.2f}%"
    )
    return line, score >= threshold


def main() -> int:
    backend_counts = _status_counts(BACKEND_MUTANT_ROOTS)
    core_counts = _status_counts(CORE_MUTANT_ROOTS)
    electrical_core_counts = _status_counts(ELECTRICAL_CORE_MUTANT_ROOTS)
    specification_core_counts = _status_counts(SPECIFICATION_CORE_MUTANT_ROOTS)
    scope = os.getenv("MUTMUT_SCOPE", "all")
    if scope not in {"all", "backend", "core", "electrical-core", "specification-core"}:
        print(f"Unknown MUTMUT_SCOPE: {scope}")
        return 2

    backend_min_score = float(
        os.getenv(
            "MUTMUT_BACKEND_MIN_SCORE",
            os.getenv("MUTMUT_MIN_SCORE", DEFAULT_BACKEND_MIN_SCORE),
        )
    )
    core_min_score = float(os.getenv("MUTMUT_CORE_MIN_SCORE", DEFAULT_CORE_MIN_SCORE))
    electrical_core_min_score = float(
        os.getenv("MUTMUT_ELECTRICAL_CORE_MIN_SCORE", DEFAULT_ELECTRICAL_CORE_MIN_SCORE)
    )
    specification_core_min_score = float(
        os.getenv(
            "MUTMUT_SPECIFICATION_CORE_MIN_SCORE",
            DEFAULT_SPECIFICATION_CORE_MIN_SCORE,
        )
    )
    max_timeouts = int(os.getenv("MUTMUT_MAX_TIMEOUTS", DEFAULT_MAX_TIMEOUTS))
    specification_core_max_timeouts = int(
        os.getenv(
            "MUTMUT_SPECIFICATION_CORE_MAX_TIMEOUTS",
            DEFAULT_SPECIFICATION_CORE_MAX_TIMEOUTS,
        )
    )

    backend_line, backend_passed = _score_line(
        "Backend formula mutation score",
        backend_counts,
        threshold=backend_min_score,
    )
    core_line, core_passed = _score_line(
        "Heat-loss core mutation score",
        core_counts,
        threshold=core_min_score,
    )
    electrical_core_line, electrical_core_passed = _score_line(
        "Electrical core mutation score",
        electrical_core_counts,
        threshold=electrical_core_min_score,
    )
    specification_core_line, specification_core_passed = _score_line(
        "Specification core mutation score",
        specification_core_counts,
        threshold=specification_core_min_score,
    )
    if scope in {"all", "backend"}:
        print(backend_line)
    if scope in {"all", "core"}:
        print(core_line)
    if scope in {"all", "electrical-core"}:
        print(electrical_core_line)
    if scope in {"all", "specification-core"}:
        print(specification_core_line)
    print(f"Mutation timeout limit: {max_timeouts}")
    if scope in {"all", "specification-core"}:
        print("Specification core mutation timeout limit: " f"{specification_core_max_timeouts}")

    timed_out = 0
    passed = True
    if scope in {"all", "backend"}:
        timed_out += backend_counts[-24]
        passed = passed and backend_passed
    if scope in {"all", "core"}:
        timed_out += core_counts[-24]
        passed = passed and core_passed
    if scope in {"all", "electrical-core"}:
        timed_out += electrical_core_counts[-24]
        passed = passed and electrical_core_passed
    if scope in {"all", "specification-core"}:
        timed_out += specification_core_counts[-24]
        passed = passed and specification_core_passed
    specification_core_timeouts_passed = (
        scope not in {"all", "specification-core"}
        or specification_core_counts[-24] <= specification_core_max_timeouts
    )
    if not passed or timed_out > max_timeouts or not specification_core_timeouts_passed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
