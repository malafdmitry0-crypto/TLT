"""Кейс §3.5: продуктовый лимит объектов в проекте — 500.

Suite documents the product contract:
- GUEST_MAX_OBJECTS_PER_PROJECT / project object cap is 500 (case §3.5)
- a lightweight wall-clock probe measures canonical pure-calculator BOM cost scale
  (no legacy full_builder).
"""

from __future__ import annotations

import time

from heatcalc_specification_core.connection_kit import calculate_connection_kits
from heatcalc_specification_core.repair_kit import calculate_repair_kits
from heatcalc_specification_core.sealant import calculate_sealant

from app.core.config import settings


def test_product_default_object_limit_is_five_hundred():
    """Кейс §3.5: не менее 500 объектов в одном проекте."""
    field = type(settings).model_fields["GUEST_MAX_OBJECTS_PER_PROJECT"]
    assert field.default == 500
    # Runtime env override may lower the cap for load experiments only.
    assert settings.GUEST_MAX_OBJECTS_PER_PROJECT >= 50


def test_canonical_accessory_formulas_scale_under_object_probe():
    """Synthetic probe: ER-level ceil path scales for object-limit order of magnitude.

    Mirrors production aggregation (sum raw inputs → one ceil), not per-section
    legacy dual-ceil.
    """

    def _aggregate(n_objects: int) -> dict[str, int]:
        # Two sections per synthetic object; length 20 m each.
        n_sections = n_objects * 2
        length_m = n_objects * 20
        connection = calculate_connection_kits(n_sections, 2, temperature_group="LOW")
        repair = calculate_repair_kits(length_m, 150, temperature_group="LOW")
        sealant = calculate_sealant(connection.quantity, repair.quantity, 7)
        return {
            "objects": n_objects,
            "connection": connection.quantity,
            "repair": repair.quantity,
            "sealant": sealant.quantity,
        }

    t0 = time.perf_counter()
    small = _aggregate(10)
    t_small = time.perf_counter() - t0
    t1 = time.perf_counter()
    large = _aggregate(50)
    t_large = time.perf_counter() - t1

    assert small["objects"] == 10
    assert large["objects"] == 50
    # Normative one-ceil: 50 objects × 2 sections / 2 capacity → 50 kits
    assert large["connection"] == 50
    assert t_large < 5.0, f"canonical formulas for 50 objects took {t_large:.3f}s"
    if t_small > 0:
        assert t_large / t_small < 20.0
