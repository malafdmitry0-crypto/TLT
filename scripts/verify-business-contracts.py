#!/usr/bin/env python3
"""Validate the docs -> formula -> API -> UI -> tests contract matrix."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MATRIX = ROOT / "codex-docs" / "business-formula-contracts.json"
REQUIRED_REF_GROUPS = (
    "requirementRefs",
    "backendRefs",
    "apiRefs",
    "frontendRefs",
    "testRefs",
)


def fail(message: str) -> None:
    print(f"contract matrix error: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_matrix() -> dict[str, Any]:
    try:
        return json.loads(MATRIX.read_text(encoding="utf-8"))
    except FileNotFoundError:
      fail(f"{MATRIX.relative_to(ROOT)} not found")
    except json.JSONDecodeError as exc:
      fail(f"{MATRIX.relative_to(ROOT)} is not valid JSON: {exc}")


def ensure_existing_path(contract_id: str, group: str, ref: dict[str, Any]) -> None:
    raw_path = ref.get("path")
    if not isinstance(raw_path, str) or not raw_path:
        fail(f"{contract_id}.{group} contains a ref without path")

    path = ROOT / raw_path
    if not path.exists():
        fail(f"{contract_id}.{group} path does not exist: {raw_path}")

    symbol = ref.get("symbol")
    if isinstance(symbol, str) and symbol:
        try:
            subprocess.run(
                ["rg", "-n", "--fixed-strings", symbol, str(path)],
                check=True,
                cwd=ROOT,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except subprocess.CalledProcessError:
            fail(f"{contract_id}.{group} symbol not found in {raw_path}: {symbol}")


def main() -> None:
    matrix = load_matrix()
    contracts = matrix.get("contracts")
    if not isinstance(contracts, list) or not contracts:
        fail("contracts must be a non-empty array")

    seen_ids: set[str] = set()
    commands: set[str] = set()

    for contract in contracts:
        if not isinstance(contract, dict):
            fail("each contract must be an object")

        contract_id = contract.get("id")
        if not isinstance(contract_id, str) or not contract_id:
            fail("each contract needs a non-empty id")
        if contract_id in seen_ids:
            fail(f"duplicate contract id: {contract_id}")
        seen_ids.add(contract_id)

        for group in REQUIRED_REF_GROUPS:
            refs = contract.get(group)
            if not isinstance(refs, list) or not refs:
                fail(f"{contract_id}.{group} must be a non-empty array")
            for ref in refs:
                if not isinstance(ref, dict):
                    fail(f"{contract_id}.{group} contains a non-object ref")
                ensure_existing_path(contract_id, group, ref)

        for test_ref in contract["testRefs"]:
            command = test_ref.get("command")
            if isinstance(command, str) and command:
                commands.add(command)

    if not commands:
        fail("at least one testRef.command is required")

    print(f"✅ business contract matrix OK: {len(contracts)} contracts, {len(commands)} commands")


if __name__ == "__main__":
    main()
