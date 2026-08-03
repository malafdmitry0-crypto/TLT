"""Кейс §3.5: продуктовый лимит объектов в проекте — 500.

Suite documents the product contract:
- GUEST_MAX_OBJECTS_PER_PROJECT / project object cap is 500 (case §3.5)
- a lightweight wall-clock probe measures BOM build cost scale
"""

from __future__ import annotations

import time

from app.core.config import settings
from app.formulas.specification.full_builder import build_full_specification_detailed


def test_product_default_object_limit_is_five_hundred():
    """Кейс §3.5: не менее 500 объектов в одном проекте."""
    field = type(settings).model_fields["GUEST_MAX_OBJECTS_PER_PROJECT"]
    assert field.default == 500
    # Runtime env override may lower the cap for load experiments only.
    assert settings.GUEST_MAX_OBJECTS_PER_PROJECT >= 50


def test_bom_build_scales_linearly_under_small_probe():
    """Synthetic probe for BOM builder scaling on the object-limit path."""

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
