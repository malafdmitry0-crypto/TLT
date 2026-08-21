#!/usr/bin/env python3
"""Fail when strict-mypy production errors grow in any migration zone."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

BASELINE_MARKER = "mypy-ratchet-baseline:"
ERROR_RE = re.compile(r"^(app/[^:]+):\d+: error:")


def zone_for(path: str) -> str:
    if path.startswith("app/core/"):
        return "core"
    if path.startswith("app/api/"):
        return "api"
    if (
        path.startswith("app/reports/")
        or path.startswith("app/schemas/specification")
        or path.startswith("app/formulas/specification/")
        or path.startswith("app/services/specification")
        or path.startswith("app/services/report")
    ):
        return "reports_specification"
    if path.startswith("app/services/"):
        return "services_infrastructure"
    return "other"


def read_baseline(path: Path) -> dict[str, int]:
    for line in path.read_text(encoding="utf-8").splitlines():
        if BASELINE_MARKER in line:
            payload = line.split(BASELINE_MARKER, 1)[1].split("-->", 1)[0].strip()
            data = json.loads(payload)
            if not isinstance(data, dict) or not all(
                isinstance(key, str) and isinstance(value, int) and value >= 0
                for key, value in data.items()
            ):
                raise ValueError("baseline must be a string-to-non-negative-int mapping")
            return data
    raise ValueError(f"missing {BASELINE_MARKER!r} marker in {path}")


def run_mypy(repo_root: Path) -> tuple[str, int]:
    command = [
        "docker",
        "compose",
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.dev.yml",
        "run",
        "-T",
        "--rm",
        "--entrypoint",
        "",
        "backend",
        "mypy",
        "app",
        "--exclude",
        "app/tests/",
        "--no-pretty",
    ]
    completed = subprocess.run(
        command,
        cwd=repo_root,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    return completed.stdout, completed.returncode


def count_errors(output: str) -> Counter[str]:
    counts: Counter[str] = Counter()
    for line in output.splitlines():
        match = ERROR_RE.match(line)
        if match:
            counts[zone_for(match.group(1))] += 1
    return counts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--baseline",
        type=Path,
        default=Path("docs/audit/2026-08-21-backend-mypy-ratchet/snapshot.md"),
    )
    parser.add_argument("--input", type=Path, help="Parse saved mypy output instead of Docker")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    baseline_path = args.baseline
    if not baseline_path.is_absolute():
        baseline_path = repo_root / baseline_path
    baseline = read_baseline(baseline_path)

    if args.input:
        output = args.input.read_text(encoding="utf-8")
        return_code = 1 if ERROR_RE.search(output) else 0
    else:
        output, return_code = run_mypy(repo_root)

    current = count_errors(output)
    unknown = sorted(set(current) - set(baseline))
    regressions = {
        zone: (current[zone], limit)
        for zone, limit in baseline.items()
        if current[zone] > limit
    }
    for zone, limit in baseline.items():
        print(f"{zone}: {current[zone]}/{limit}")

    if unknown or regressions:
        if unknown:
            print(f"Unknown mypy zones: {', '.join(unknown)}", file=sys.stderr)
        for zone, (actual, limit) in regressions.items():
            print(f"Mypy ratchet regression in {zone}: {actual} > {limit}", file=sys.stderr)
        return 1
    if return_code not in {0, 1}:
        print(output, file=sys.stderr)
        return return_code
    print(f"mypy ratchet PASS: {sum(current.values())} production errors (shrink-only)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
