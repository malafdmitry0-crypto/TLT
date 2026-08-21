"""Prevent numeric electrical identity from returning to the calculation pipeline."""

from __future__ import annotations

import inspect

from app.services.calculation import (
    electrical_batch,
    electrical_failures,
    electrical_repository,
    electrical_single,
    electrical_summary,
)


def test_calculation_pipeline_uses_uuid_identity_only() -> None:
    sources = "\n".join(
        inspect.getsource(module)
        for module in (
            electrical_single,
            electrical_batch,
            electrical_summary,
            electrical_repository,
            electrical_failures,
        )
    )

    assert "variant_number" not in sources
