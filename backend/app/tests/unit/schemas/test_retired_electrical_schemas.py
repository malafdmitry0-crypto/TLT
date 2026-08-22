"""Regression lock for the electrical schema lineage retired by DEC-07."""

from app.schemas import calculation

RETIRED_ELECTRICAL_SCHEMA_NAMES = (
    "SelfRegulatingParams",
    "SelfRegulatingResult",
    "ResistiveSingleCoreParams",
    "ResistiveSingleCoreResult",
    "ResistiveThreeCoreParams",
    "ResistiveThreeCoreResult",
    "RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE",
    "RESISTIVE_DEFAULT_VOLTAGE_STEP",
)


def test_retired_electrical_schemas_are_absent() -> None:
    assert all(not hasattr(calculation, name) for name in RETIRED_ELECTRICAL_SCHEMA_NAMES)
    assert hasattr(calculation, "SelfRegulatingTTParams")
    assert hasattr(calculation, "SelfRegulatingTTResult")
