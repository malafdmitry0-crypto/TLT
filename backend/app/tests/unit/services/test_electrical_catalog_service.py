"""Focused validation tests for immutable electrical catalog imports."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.config import settings
from app.services.electrical_catalog_service import (
    _BOM_MARKS,
    _TT_MODELS,
    ElectricalCatalogService,
    ElectricalCatalogServiceError,
    _canonical_checksum,
    _validate_rows,
)


def _power_rows() -> list[dict]:
    return [
        {
            "model": model,
            "q1": -0.1,
            "q2": 10 + index,
            "max_product_temp": 65,
            "max_vapor_temp": 85,
            "voltage": 230,
        }
        for index, model in enumerate(sorted(_TT_MODELS))
    ]


def test_power_catalog_requires_complete_unique_230v_rows():
    valid, rejected, diagnostics = _validate_rows("power", {"rows": _power_rows()})

    assert valid == 14
    assert rejected == 0
    assert diagnostics == []


def test_power_catalog_rejects_legacy_voltage_without_rewriting_it():
    rows = _power_rows()
    rows[0]["voltage"] = 220

    valid, rejected, diagnostics = _validate_rows("power", {"rows": rows})

    assert valid == 13
    assert rejected == 1
    assert diagnostics[0] == {
        "code": "ELECTRICAL_CATALOG_ROW_INVALID",
        "row": 0,
        "errors": ["voltage_must_be_230"],
    }
    assert rows[0]["voltage"] == 220


def test_power_catalog_rejects_non_finite_curve_coefficients():
    rows = _power_rows()
    rows[0]["q1"] = "NaN"

    valid, rejected, diagnostics = _validate_rows("power", {"rows": rows})

    assert valid == 13
    assert rejected == 1
    assert diagnostics[0]["errors"] == ["q_coefficients_required"]


def test_bom_catalog_requires_exact_18_unique_marks_and_codes():
    entries = [
        {"full_mark": mark, "nomenclature_code": f"CODE-{index}"}
        for index, mark in enumerate(sorted(_BOM_MARKS))
    ]
    entries[-1]["nomenclature_code"] = entries[0]["nomenclature_code"]

    valid, rejected, diagnostics = _validate_rows("bom", {"entries": entries})

    assert valid == 17
    assert rejected == 1
    assert diagnostics[-1]["errors"] == ["duplicate_secondary_key"]


def test_incomplete_catalog_is_never_activation_valid_even_when_rows_are_valid():
    valid, rejected, diagnostics = _validate_rows("power", {"rows": _power_rows()[:13]})

    assert valid == 13
    assert rejected == 1
    assert diagnostics[0]["code"] == "ELECTRICAL_CATALOG_ROW_COUNT_INVALID"


def test_payload_checksum_is_canonical_and_input_sensitive():
    first = _canonical_checksum({"rows": [{"b": 2, "a": 1}]})
    reordered = _canonical_checksum({"rows": [{"a": 1, "b": 2}]})
    changed = _canonical_checksum({"rows": [{"a": 1, "b": 3}]})

    assert first == reordered
    assert first != changed


def test_static_calculation_fallback_is_explicit_and_carries_payload():
    for kind in ("power", "section", "bom"):
        catalog = ElectricalCatalogService._static_calculation_fallback(kind)

        assert catalog["authority"] == "static_fallback"
        assert catalog["payload"].get("rows") or catalog["payload"].get("entries")
        assert catalog["payload_checksum"] == _canonical_checksum(catalog["payload"])


async def test_production_calculation_catalogs_fail_closed_without_three_db_active(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result

    with pytest.raises(ElectricalCatalogServiceError) as exc:
        await ElectricalCatalogService(db).active_calculation_catalogs()

    assert exc.value.code == "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED"
    assert exc.value.status_code == 503
    assert exc.value.details["missing_active_kinds"] == ["power", "section", "bom"]
    assert db.execute.await_count == 4
    lock_statements = [str(call.args[0]) for call in db.execute.await_args_list[:3]]
    assert all("pg_advisory_xact_lock_shared" in statement for statement in lock_statements)
