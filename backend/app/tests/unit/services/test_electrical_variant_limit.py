"""Four-ER product limit contract."""

from app.electrical_variant_limits import MAX_ELECTRICAL_VARIANTS


def test_max_variants_is_four() -> None:
    assert MAX_ELECTRICAL_VARIANTS == 4
