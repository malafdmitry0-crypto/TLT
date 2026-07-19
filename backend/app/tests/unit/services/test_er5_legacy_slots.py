"""ER5 write cutover: five legacy compatibility slots available."""

from app.services.electrical_variant_service import (
    _LEGACY_VARIANT_NUMBERS,
    MAX_ELECTRICAL_VARIANTS,
    ElectricalVariantService,
)


def test_max_variants_is_five():
    assert MAX_ELECTRICAL_VARIANTS == 5
    assert list(_LEGACY_VARIANT_NUMBERS) == [1, 2, 3, 4, 5]


def test_fifth_legacy_slot_is_assigned():
    class V:
        def __init__(self, n):
            self.legacy_variant_number = n

    used = [V(1), V(2), V(3), V(4)]
    next_slot = ElectricalVariantService._next_legacy_variant_number(used)
    assert next_slot == 5


def test_no_sixth_legacy_slot():
    class V:
        def __init__(self, n):
            self.legacy_variant_number = n

    used = [V(n) for n in range(1, 6)]
    assert ElectricalVariantService._next_legacy_variant_number(used) is None
