"""Case 1 assignment voltage persistence and query projection."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from heatcalc_electrical_core import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)

from app.schemas.calculation import ElectricalQueryRequest
from app.services.electrical_assignment_service import ElectricalAssignmentService
from app.services.electrical_query_service import ElectricalQueryService
from app.services.specification_service import SpecificationService


def _ready_result(*, voltage: int, source: str, assignment_version: int) -> dict:
    return {
        "cable_type": "self_regulating_tt",
        "cable_mark": "30ТТВ2-СР",
        "voltage": voltage,
        "resolved_inputs": {
            "nominal_voltage_v": voltage,
            "max_section_start_current_a": 13.065,
        },
        "catalogs": {
            kind: {"source_checksum": f"sha256:{kind}"} for kind in ("power", "section", "bom")
        },
        "provenance": {
            "formula_version": ELECTRICAL_TT_FORMULA_VERSION,
            "formula_fingerprint": ELECTRICAL_TT_FORMULA_FINGERPRINT,
            "assignment_version": assignment_version,
            "input_sources": {"nominal_voltage_v": source},
        },
    }


def _assignment_fixture():
    variant_id = uuid4()
    object_id = uuid4()
    project_id = uuid4()
    assignment = SimpleNamespace(
        id=uuid4(),
        project_id=project_id,
        electrical_variant_id=variant_id,
        object_id=object_id,
        system_type="self_regulating",
        assignment_state="stale",
        electrical_overrides={},
        version=5,
        requested_cable_type=None,
        object_version_snapshot=1,
        diagnostics={},
    )
    obj = SimpleNamespace(version=7)
    return assignment, obj


async def test_ready_explicit_380_is_persisted_and_version_matches_result_provenance(
    monkeypatch,
) -> None:
    assignment, obj = _assignment_fixture()
    query_result = MagicMock()
    query_result.all.return_value = [(assignment, obj)]
    db = AsyncMock()
    db.execute.return_value = query_result
    monkeypatch.setattr(
        SpecificationService,
        "mark_electrical_variant_specification_stale",
        AsyncMock(return_value=1),
    )
    results = _ready_result(voltage=380, source="explicit_request", assignment_version=6)
    row = {
        "project_id": assignment.project_id,
        "electrical_variant_id": assignment.electrical_variant_id,
        "object_id": assignment.object_id,
        "cable_type": "self_regulating_tt",
        "cable_mark": "30ТТВ2-СР",
        "results": results,
    }

    synced = await ElectricalAssignmentService(db).sync_from_calculation_rows([row])

    assert synced == 1
    assert assignment.electrical_overrides == {"supply_voltage_v": 380}
    assert assignment.version == results["provenance"]["assignment_version"] == 6
    assert assignment.assignment_state == "ready"


async def test_failed_row_never_persists_request_voltage(monkeypatch) -> None:
    assignment, obj = _assignment_fixture()
    query_result = MagicMock()
    query_result.all.return_value = [(assignment, obj)]
    db = AsyncMock()
    db.execute.return_value = query_result
    monkeypatch.setattr(
        SpecificationService,
        "mark_electrical_variant_specification_stale",
        AsyncMock(return_value=1),
    )
    row = {
        "project_id": assignment.project_id,
        "electrical_variant_id": assignment.electrical_variant_id,
        "object_id": assignment.object_id,
        "cable_type": "self_regulating_tt",
        "cable_mark": None,
        "results": {
            "cable_type": "self_regulating_tt",
            "category": "formula",
            "error_code": "ELECTRICAL_CABLE_POWER_INSUFFICIENT",
            "resolved_inputs": {"nominal_voltage_v": 380},
            "provenance": {"input_sources": {"nominal_voltage_v": "explicit_request"}},
        },
    }

    await ElectricalAssignmentService(db).sync_from_calculation_rows([row])

    assert assignment.electrical_overrides == {}
    assert assignment.version == 5
    assert assignment.assignment_state == "error"


async def test_query_projection_includes_persisted_supply_voltage_override() -> None:
    assignment, _obj = _assignment_fixture()
    assignment.electrical_overrides = {"supply_voltage_v": 380}
    query_result = MagicMock()
    query_result.scalars.return_value.all.return_value = [assignment]
    db = AsyncMock()
    db.execute.return_value = query_result
    data = ElectricalQueryRequest(
        project_id=assignment.project_id,
        variant_number=None,
        electrical_variant_id=assignment.electrical_variant_id,
    )

    projection = await ElectricalQueryService(db)._load_assignment_projection(
        data,
        [assignment.object_id],
    )

    assert projection[0].electrical_overrides == {"supply_voltage_v": 380}
