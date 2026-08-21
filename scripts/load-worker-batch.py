#!/usr/bin/env python3
"""Load scenario for asynchronous electrical batch jobs.

Example:
  python scripts/load-worker-batch.py \
    --api http://localhost:8000/api/v1 \
    --project-id <uuid> \
    --session-id <guest-session> \
    --concurrency 5
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def request_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = Request(url, data=body, method=method)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    for key, value in headers.items():
        req.add_header(key, value)
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed: HTTP {exc.code} {detail}") from exc


def run_job(args: argparse.Namespace, index: int) -> float:
    headers: dict[str, str] = {}
    if args.session_id:
        headers["X-Session-Id"] = args.session_id
    if args.token:
        headers["Authorization"] = f"Bearer {args.token}"
    headers["Idempotency-Key"] = f"{args.idempotency_prefix}-{index}-{time.time_ns()}"
    payload = {
        "project_id": args.project_id,
        "variant_number": args.variant,
        "cable_source": args.cable_source,
        "cable_type": args.cable_type,
        "include_results": False,
        "include_errors": False,
    }
    start = time.perf_counter()
    task = request_json(
        "POST",
        f"{args.api.rstrip('/')}/calc/electrical/batch/jobs",
        headers=headers,
        payload=payload,
    )
    task_id = task["id"]
    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        status = request_json(
            "GET",
            f"{args.api.rstrip('/')}/calc/jobs/{task_id}",
            headers=headers,
        )
        if status["status"] == "succeeded":
            return time.perf_counter() - start
        if status["status"] in {"failed", "cancelled"}:
            raise RuntimeError(f"task {task_id} finished as {status['status']}: {status}")
        time.sleep(args.poll_interval)
    raise TimeoutError(f"task {task_id} did not finish within {args.timeout}s")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000/api/v1")
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--session-id")
    parser.add_argument("--token")
    parser.add_argument("--concurrency", type=int, default=5)
    parser.add_argument("--variant", type=int, default=1)
    parser.add_argument("--cable-source", default="builtin")
    parser.add_argument("--cable-type", default="self_regulating")
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--poll-interval", type=float, default=0.5)
    parser.add_argument("--idempotency-prefix", default="load-worker-batch")
    args = parser.parse_args()
    if not args.session_id and not args.token:
        raise SystemExit("provide --session-id or --token")

    durations: list[float] = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [pool.submit(run_job, args, idx) for idx in range(args.concurrency)]
        for future in as_completed(futures):
            durations.append(future.result())

    durations.sort()
    p95_index = max(0, int(len(durations) * 0.95) - 1)
    print(
        json.dumps(
            {
                "jobs": len(durations),
                "min_s": min(durations),
                "median_s": statistics.median(durations),
                "p95_s": durations[p95_index],
                "max_s": max(durations),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
