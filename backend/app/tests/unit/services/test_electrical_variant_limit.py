"""Four-ER product limit and compatibility-slot contract."""

from app.services.electrical_variant_service import (
    _LEGACY_VARIANT_NUMBERS,
    MAX_ELECTRICAL_VARIANTS,
    ElectricalVariantService,
)


def test_max_variants_is_four() -> None:
    assert MAX_ELECTRICAL_VARIANTS == 4
    assert list(_LEGACY_VARIANT_NUMBERS) == [1, 2, 3, 4]


def test_fourth_legacy_slot_is_assigned() -> None:
    class V:
        def __init__(self, number: int) -> None:
            self.legacy_variant_number = number

    used = [V(1), V(2), V(3)]
    next_slot = ElectricalVariantService._next_legacy_variant_number(used)
    assert next_slot == 4


def test_no_fifth_legacy_slot() -> None:
    class V:
        def __init__(self, number: int) -> None:
            self.legacy_variant_number = number

    used = [V(number) for number in range(1, 5)]
    assert ElectricalVariantService._next_legacy_variant_number(used) is None
