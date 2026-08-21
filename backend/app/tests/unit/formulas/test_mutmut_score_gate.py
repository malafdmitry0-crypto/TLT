"""Regression tests for the formula mutation-score inventory."""

from __future__ import annotations

import importlib.util
import json
from collections import Counter
from pathlib import Path
from types import ModuleType

import pytest


def _load_score_gate() -> ModuleType:
    script_path = Path(__file__).parents[4] / "scripts" / "mutmut_score_gate.py"
    spec = importlib.util.spec_from_file_location("mutmut_score_gate", script_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_status_counts_include_requested_mutation_roots(
    tmp_path: Path,
) -> None:
    score_gate = _load_score_gate()
    electrical_root = tmp_path / "electrical"
    canonical_root = tmp_path / "heat_loss_core"
    electrical_root.mkdir()
    canonical_root.mkdir()
    (electrical_root / "wire.meta").write_text(
        json.dumps({"exit_code_by_key": {"one": 1, "survived": 0}}),
        encoding="utf-8",
    )
    (canonical_root / "pipe.meta").write_text(
        json.dumps({"exit_code_by_key": {"timeout": -24}}),
        encoding="utf-8",
    )
    assert score_gate._status_counts((electrical_root, canonical_root)) == {1: 1, 0: 1, -24: 1}


def test_score_line_rejects_missing_mutants_and_scores_real_results() -> None:
    score_gate = _load_score_gate()

    missing_line, missing_passed = score_gate._score_line(
        "Core",
        score_gate.Counter(),
        threshold=65.0,
    )
    line, passed = score_gate._score_line(
        "Core",
        score_gate.Counter({1: 2, 0: 1}),
        threshold=65.0,
    )

    assert missing_line == "Core: no scored mutants found"
    assert missing_passed is False
    assert line == "Core: 66.67% killed=2 survived=1 timeout=0 total=3 threshold=65.00%"
    assert passed is True


def test_backend_and_core_floors_are_independent(monkeypatch: pytest.MonkeyPatch) -> None:
    score_gate = _load_score_gate()

    def status_counts(roots: tuple[Path, ...] | None = None) -> Counter[int]:
        if roots == score_gate.BACKEND_MUTANT_ROOTS:
            return score_gate.Counter({1: 45, 0: 55})
        if roots == score_gate.CORE_MUTANT_ROOTS:
            return score_gate.Counter({1: 87, 0: 13})
        if roots == score_gate.ELECTRICAL_CORE_MUTANT_ROOTS:
            return score_gate.Counter({1: 87, 0: 13})
        if roots == score_gate.SPECIFICATION_CORE_MUTANT_ROOTS:
            return score_gate.Counter({1: 87, 0: 13})
        raise AssertionError(f"unexpected roots: {roots!r}")

    monkeypatch.setattr(score_gate, "_status_counts", status_counts)

    assert score_gate.main() == 1


def test_core_scope_does_not_require_backend_artifacts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    score_gate = _load_score_gate()

    def status_counts(roots: tuple[Path, ...] | None = None) -> Counter[int]:
        if roots == score_gate.BACKEND_MUTANT_ROOTS:
            return Counter()
        if roots == score_gate.CORE_MUTANT_ROOTS:
            return Counter({1: 87, 0: 13})
        if roots == score_gate.ELECTRICAL_CORE_MUTANT_ROOTS:
            return Counter()
        if roots == score_gate.SPECIFICATION_CORE_MUTANT_ROOTS:
            return Counter()
        raise AssertionError(f"unexpected roots: {roots!r}")

    monkeypatch.setattr(score_gate, "_status_counts", status_counts)
    monkeypatch.setenv("MUTMUT_SCOPE", "core")

    assert score_gate.main() == 0


def test_electrical_core_scope_does_not_require_other_artifacts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    score_gate = _load_score_gate()

    def status_counts(roots: tuple[Path, ...] | None = None) -> Counter[int]:
        if roots in {score_gate.BACKEND_MUTANT_ROOTS, score_gate.CORE_MUTANT_ROOTS}:
            return Counter()
        if roots == score_gate.ELECTRICAL_CORE_MUTANT_ROOTS:
            return Counter({1: 87, 0: 13})
        if roots == score_gate.SPECIFICATION_CORE_MUTANT_ROOTS:
            return Counter()
        raise AssertionError(f"unexpected roots: {roots!r}")

    monkeypatch.setattr(score_gate, "_status_counts", status_counts)
    monkeypatch.setenv("MUTMUT_SCOPE", "electrical-core")

    assert score_gate.main() == 0


def test_specification_core_scope_is_independent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    score_gate = _load_score_gate()

    def status_counts(roots: tuple[Path, ...] | None = None) -> Counter[int]:
        if roots == score_gate.SPECIFICATION_CORE_MUTANT_ROOTS:
            return Counter({1: 80, 0: 20})
        if roots in {
            score_gate.BACKEND_MUTANT_ROOTS,
            score_gate.CORE_MUTANT_ROOTS,
            score_gate.ELECTRICAL_CORE_MUTANT_ROOTS,
        }:
            return Counter()
        raise AssertionError(f"unexpected roots: {roots!r}")

    monkeypatch.setattr(score_gate, "_status_counts", status_counts)
    monkeypatch.setenv("MUTMUT_SCOPE", "specification-core")

    assert score_gate.main() == 0
