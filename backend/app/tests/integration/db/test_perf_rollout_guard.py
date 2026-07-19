"""PDL-ER-27: performance rollout guard remains 50 until measured green gate.

This suite documents the product contract without raising the runtime limit:
- current GUEST_MAX_OBJECTS_PER_PROJECT / project object cap stays 50
- a lightweight wall-clock probe measures BOM build cost scale
- 500-object support is NOT declared until a full flow gate is green
"""

from __future__ import annotations

import time

import pytest

from app.core.config import settings
from app.formulas.specification.full_builder import build_full_specification_detailed


def test_product_default_object_limit_is_fifty_until_perf_gate():
    """PDL-ER-27: code default remains 50. Env overrides are experimental only."""
    field = type(settings).model_fields["GUEST_MAX_OBJECTS_PER_PROJECT"]
    assert field.default == 50
    # Runtime may be overridden in docker-compose.dev for load experiments;
    # that is not product acceptance of 500 until the full flow gate is green.
    assert settings.GUEST_MAX_OBJECTS_PER_PROJECT in {50, 500}


def test_bom_build_scales_linearly_under_small_probe():
    """Synthetic probe only — not a substitute for 500-object full flow gate."""

    def _build(n: int):
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

    t0 = time.perf_counter()
    small = _build(10)
    t_small = time.perf_counter() - t0
    t1 = time.perf_counter()
    large = _build(50)
    t_large = time.perf_counter() - t1

    assert len(small.contributing_object_ids) == 10
    assert len(large.contributing_object_ids) == 50
    # Soft ceiling: 50-object pure BOM should stay well under 5s in unit env.
    assert t_large < 5.0, f"BOM build for 50 objects took {t_large:.3f}s"
    # Scale factor should not explode super-linearly for pure builder path.
    if t_small > 0:
        assert t_large / t_small < 20.0


@pytest.mark.skip(reason="PDL-ER-27: full 500-object import/batch/spec/report gate not green yet")
def test_future_500_object_full_flow_gate():
    raise AssertionError(
        "Raise object limit only after this full flow gate is implemented and green"
    )
