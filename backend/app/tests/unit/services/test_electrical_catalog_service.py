"""Focused validation and rollout tests for immutable electrical catalogs."""

from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.dependencies import CurrentPrincipal
from app.services.electrical_catalog_service import (
    _BOM_MARKS,
    _TT_MODELS,
    ElectricalCatalogService,
    ElectricalCatalogServiceError,
    _canonical_checksum,
    _validate_rows,
    bundled_electrical_catalog_documents,
)


def _power_rows() -> list[dict]:
    return [
        {
            "model": model,
            "nominal_power": 10 + index,
            "max_product_temp": 65,
        }
        for index, model in enumerate(sorted(_TT_MODELS))
    ]


def test_case1_power_catalog_requires_complete_unique_passport_rows():
    valid, rejected, diagnostics = _validate_rows("power", {"rows": _power_rows()})

    assert valid == 14
    assert rejected == 0
    assert diagnostics == []


@pytest.mark.parametrize(
    ("field", "error"),
    [
        ("nominal_power", "nominal_power_required"),
        ("max_product_temp", "max_product_temp_required"),
    ],
)
def test_case1_power_catalog_rejects_missing_selector_authority(field: str, error: str):
    rows = _power_rows()
    rows[0].pop(field)

    valid, rejected, diagnostics = _validate_rows("power", {"rows": rows})

    assert valid == 13
    assert rejected == 1
    assert diagnostics[0]["errors"] == [error]


def test_curve_vapor_and_voltage_fields_are_irrelevant_to_case1_power_validation():
    rows = _power_rows()
    rows[0].update(
        {
            "q1": "NaN",
            "q2": None,
            "max_vapor_temp": -999,
            "voltage": 380,
        }
    )

    valid, rejected, diagnostics = _validate_rows("power", {"rows": rows})

    assert valid == 14
    assert rejected == 0
    assert diagnostics == []


def test_section_catalog_lookup_authority_does_not_filter_by_working_voltage():
    payload = deepcopy(bundled_electrical_catalog_documents()["section"].payload)
    payload["rows"][0]["voltage_v"] = 380

    valid, rejected, diagnostics = _validate_rows("section", payload)

    assert valid == 126
    assert rejected == 0
    assert diagnostics == []


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


async def test_calculation_catalogs_fail_closed_without_complete_db_authority():
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result

    with pytest.raises(ElectricalCatalogServiceError) as raised:
        await ElectricalCatalogService(db).active_calculation_catalogs()

    assert raised.value.code == "ELECTRICAL_CATALOG_NOT_READY"
    assert raised.value.status_code == 503
    assert raised.value.details == {"missing_active_kinds": ["power", "section", "bom"]}
    assert db.execute.await_count == 4
    lock_statements = [str(call.args[0]) for call in db.execute.await_args_list[:3]]
    assert all("pg_advisory_xact_lock_shared" in statement for statement in lock_statements)


async def test_calculation_catalog_database_error_never_falls_back_to_builtin():
    db = AsyncMock()
    lock_result = MagicMock()
    db.execute.side_effect = [lock_result, lock_result, lock_result, RuntimeError("db unavailable")]

    with pytest.raises(RuntimeError, match="db unavailable"):
        await ElectricalCatalogService(db).active_calculation_catalogs()

    assert db.execute.await_count == 4


async def test_calculation_catalogs_reject_an_active_non_current_schema():
    service = ElectricalCatalogService(AsyncMock())
    service._active_rows = AsyncMock(
        return_value={
            "power": SimpleNamespace(schema_version=1),
            "section": SimpleNamespace(schema_version=1),
            "bom": SimpleNamespace(schema_version=1),
        }
    )

    with pytest.raises(ElectricalCatalogServiceError) as raised:
        await service.active_calculation_catalogs()

    assert raised.value.code == "ELECTRICAL_CATALOG_SCHEMA_UNSUPPORTED"
    assert raised.value.status_code == 503
    assert raised.value.details == {
        "catalogs": [{"kind": "power", "schema_version": 1, "supported_schema_version": 2}]
    }


async def test_import_rejects_a_non_current_schema_version():
    document = bundled_electrical_catalog_documents()["power"].model_copy(
        update={"schema_version": 1}
    )

    with pytest.raises(ElectricalCatalogServiceError) as raised:
        await ElectricalCatalogService(AsyncMock()).import_draft(
            "power",
            document,
            CurrentPrincipal(role="guest", session_id="catalog-import"),
        )

    assert raised.value.code == "ELECTRICAL_CATALOG_IMPORT_INVALID"
    assert raised.value.details == {
        "kind": "power",
        "schema_version": 1,
        "supported_schema_version": 2,
    }


@pytest.mark.parametrize(
    ("kind", "old_version"),
    [
        ("power", "tt-power-approved-r1-2026-08-03-5ebb23d7"),
        ("section", "tt-section-2026-07-20-230v-a7a37087"),
    ],
)
async def test_bundled_bootstrap_rolls_old_bundled_catalog_forward_to_case1_r2(
    kind: str,
    old_version: str,
):
    documents = bundled_electrical_catalog_documents()
    old_catalog = SimpleNamespace(
        kind=kind,
        version=old_version,
        source=documents[kind].source,
    )
    next_catalog = SimpleNamespace(
        id=uuid4(),
        kind=kind,
        version=documents[kind].version,
        source=documents[kind].source,
        status="draft",
    )
    active = {
        "power": SimpleNamespace(
            kind="power",
            version=documents["power"].version,
            source=documents["power"].source,
        ),
        "section": SimpleNamespace(
            kind="section",
            version=documents["section"].version,
            source=documents["section"].source,
        ),
        "bom": SimpleNamespace(
            kind="bom",
            version=documents["bom"].version,
            source=documents["bom"].source,
        ),
    }
    active[kind] = old_catalog
    db = AsyncMock()
    db.scalar.return_value = None
    service = ElectricalCatalogService(db)
    service._active_rows = AsyncMock(side_effect=lambda: dict(active))
    service.import_draft = AsyncMock(return_value=next_catalog)

    async def activate(catalog_id, principal, *, commit):
        assert catalog_id == next_catalog.id
        assert commit is False
        next_catalog.status = "active"
        active[kind] = next_catalog

    service.activate = AsyncMock(side_effect=activate)

    result = await service.ensure_bundled_catalogs_active(
        CurrentPrincipal(role="guest", session_id="catalog-bootstrap"),
    )

    service.import_draft.assert_awaited_once_with(
        kind,
        documents[kind],
        ANY,
        commit=False,
    )
    service.activate.assert_awaited_once()
    assert result[kind].version == documents[kind].version
    db.commit.assert_awaited_once()


async def test_bundled_bootstrap_keeps_custom_active_power_authority():
    documents = bundled_electrical_catalog_documents()
    custom_power = SimpleNamespace(
        kind="power",
        version="engineering-approved-custom-v7",
        source="s3://engineering/electrical/power-v7.json",
    )
    active = {
        "power": custom_power,
        "section": SimpleNamespace(
            kind="section",
            version=documents["section"].version,
            source=documents["section"].source,
        ),
        "bom": SimpleNamespace(
            kind="bom",
            version=documents["bom"].version,
            source=documents["bom"].source,
        ),
    }
    db = AsyncMock()
    service = ElectricalCatalogService(db)
    service._active_rows = AsyncMock(return_value=active)
    service.import_draft = AsyncMock()
    service.activate = AsyncMock()

    result = await service.ensure_bundled_catalogs_active(
        CurrentPrincipal(role="guest", session_id="catalog-bootstrap"),
    )

    service.import_draft.assert_not_awaited()
    service.activate.assert_not_awaited()
    assert result["power"] is custom_power


async def test_catalog_activation_marks_an_old_calculation_result_stale():
    calculation = SimpleNamespace(
        results={
            "status": "ready",
            "catalogs": {"power": {"id": str(uuid4())}},
        },
        electrical_variant_id=None,
    )
    query_result = MagicMock()
    query_result.scalars.return_value.all.return_value = [calculation]
    db = AsyncMock()
    db.execute.return_value = query_result
    service = ElectricalCatalogService(db)

    counts = await service._mark_dependents_stale(SimpleNamespace(id=uuid4(), kind="power"))

    assert counts == (1, 0, 0)
    assert calculation.results["category"] == "stale"
    assert calculation.results["error_code"] == "ELECTRICAL_RECALCULATION_REQUIRED"
