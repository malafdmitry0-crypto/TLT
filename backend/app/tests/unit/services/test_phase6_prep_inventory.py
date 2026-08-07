"""A3.1 characterization anchors for Phase 6 cutover prep."""

from app.services.electrical_variant_service import (
    _LEGACY_VARIANT_NUMBERS,
    MAX_ELECTRICAL_VARIANTS,
)


def test_expand_window_has_four_slots_before_uuid_only_cutover():
    """Freeze current expand-window contract until Phase 6 removes slots."""
    assert MAX_ELECTRICAL_VARIANTS == 4
    assert list(_LEGACY_VARIANT_NUMBERS) == [1, 2, 3, 4]


def test_legacy_slot_range_matches_db_check_contract():
    # Models/migrations must stay aligned with this range during expand window.
    assert min(_LEGACY_VARIANT_NUMBERS) == 1
    assert max(_LEGACY_VARIANT_NUMBERS) == 4
