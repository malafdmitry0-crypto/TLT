from __future__ import annotations

from collections.abc import Mapping
from uuid import UUID

import pytest
from heatcalc_specification_core.candidates import (
    CableCondition,
    CandidateCatalog,
    CandidateCatalogItem,
    CandidateCatalogVersion,
    CandidateDiagnosticCode,
    CandidateIssueKind,
    CandidateResultSnapshot,
    SelectionSource,
    TemperatureCondition,
    build_candidate_groups,
    candidate_groups_fingerprint_payload,
    candidate_set_fingerprint,
    catalog_selections_for_variant,
    condition_from_json,
    condition_json,
    stable_group_key,
)
from heatcalc_specification_core.catalog import CatalogParameters
from heatcalc_specification_core.types import TemperatureGroup

VARIANT_ID = UUID("10000000-0000-0000-0000-000000000001")
OTHER_VARIANT_ID = UUID("20000000-0000-0000-0000-000000000002")
CATALOG_ID = UUID("30000000-0000-0000-0000-000000000003")


def _item(
    number: int,
    category: str,
    mark: str,
    *,
    code: str | None = None,
    temperature_group: str | None = None,
    applicability: Mapping[str, object] | None = None,
) -> CandidateCatalogItem:
    conditions = dict(applicability or {})
    if temperature_group is not None:
        conditions["temperature_group"] = temperature_group
    return CandidateCatalogItem(
        id=UUID(f"40000000-0000-0000-0000-{number:012d}"),
        category=category,
        name=f"Name {mark}",
        mark=mark,
        nomenclature_code=code or f"CODE-{number}",
        supply_unit="шт.",
        parameters=(
            CatalogParameters.parse(
                category=category,
                applicability=conditions,
                package_parameters={"capacity": number},
                formula_parameters={"factor": number},
            )
            if category != "box"
            else CatalogParameters()
        ),
    )


def _catalog(*, multiple_connection_kits: bool = False) -> CandidateCatalog:
    items = [
        _item(1, "cable", "30ТТВ2-СР", code="001-002-002"),
        _item(2, "connection_kit", "КСВ-1", temperature_group="MEDIUM_HIGH"),
        _item(3, "repair_kit", "КСР-2", temperature_group="MEDIUM_HIGH"),
        _item(4, "fiberglass_tape", "ЛКВ 12", temperature_group="MEDIUM_HIGH"),
        _item(5, "sealant", "Герметик"),
        _item(6, "aluminium_tape", "Лента"),
        _item(7, "box", "Коробка"),
    ]
    if multiple_connection_kits:
        items.append(_item(8, "connection_kit", "КСВ-2", temperature_group="high"))
    return CandidateCatalog(
        version=CandidateCatalogVersion(
            id=CATALOG_ID,
            version="approved-v1",
            payload_checksum="sha256:" + "b" * 64,
        ),
        items=tuple(items),
    )


def _result(
    *, temperature_group: str | None = "high", include_code: bool = True
) -> CandidateResultSnapshot:
    payload: dict[str, object] = {
        "cable": {"mark": "30ТТВ2-СР", "nomenclature_code": "001-002-002"},
    }
    if temperature_group is not None:
        payload["temperature_group"] = temperature_group
    if not include_code:
        cable = payload["cable"]
        assert isinstance(cable, dict)
        cable.pop("nomenclature_code")
    return CandidateResultSnapshot.from_mapping(payload)


def test_single_candidates_auto_select_and_boxes_stay_out() -> None:
    built = build_candidate_groups(
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
        contributing_results=[_result()],
    )

    assert built.diagnostics == ()
    assert [group.category for group in built.groups] == [
        "aluminium_tape",
        "cable",
        "connection_kit",
        "fiberglass_tape",
        "repair_kit",
        "sealant",
    ]
    assert all(group.selection_source is SelectionSource.AUTO_SINGLE for group in built.groups)
    assert all(
        group.selected_catalog_item_id == group.candidates[0].catalog_item_id
        for group in built.groups
    )


def test_zero_candidates_is_blocking_and_group_is_still_returned() -> None:
    catalog = _catalog()
    catalog = CandidateCatalog(
        version=catalog.version,
        items=tuple(item for item in catalog.items if item.category != "connection_kit"),
    )
    built = build_candidate_groups(
        electrical_variant_id=VARIANT_ID,
        catalog=catalog,
        contributing_results=[_result()],
    )

    connection = next(group for group in built.groups if group.category == "connection_kit")
    assert connection.candidates == ()
    assert connection.selected_catalog_item_id is None
    assert any(
        item.code is CandidateDiagnosticCode.ACCESSORY_CATALOG_ITEM_MISSING
        and item.kind is CandidateIssueKind.BLOCKING
        for item in built.diagnostics
    )


def test_multi_candidate_requires_explicit_member_and_rejects_foreign_item() -> None:
    catalog = _catalog(multiple_connection_kits=True)
    initial = build_candidate_groups(
        electrical_variant_id=VARIANT_ID,
        catalog=catalog,
        contributing_results=[_result()],
    )
    group = next(item for item in initial.groups if item.category == "connection_kit")
    assert len(group.candidates) == 2
    assert group.selection_source is SelectionSource.NONE
    assert any(item.kind is CandidateIssueKind.SELECTION_REQUIRED for item in initial.diagnostics)

    chosen = group.candidates[0].catalog_item_id
    resolved = build_candidate_groups(
        electrical_variant_id=VARIANT_ID,
        catalog=catalog,
        contributing_results=[_result()],
        catalog_selections={group.group_key: chosen},
    )
    resolved_group = next(item for item in resolved.groups if item.category == "connection_kit")
    assert resolved_group.selected_catalog_item_id == chosen
    assert resolved_group.selection_source is SelectionSource.EXPLICIT

    rejected = build_candidate_groups(
        electrical_variant_id=VARIANT_ID,
        catalog=catalog,
        contributing_results=[_result()],
        catalog_selections={group.group_key: catalog.items[-2].id},
    )
    assert any(
        issue.get("reason") == "catalog_selection_not_in_group"
        for diagnostic in rejected.diagnostics
        for issue in diagnostic.issues
    )


def test_exact_cable_identity_and_explicit_temperature_group_are_fail_closed() -> None:
    cable_failure = build_candidate_groups(
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
        contributing_results=[_result(include_code=False)],
    )
    assert any(
        item.code is CandidateDiagnosticCode.CABLE_NOMENCLATURE_MISSING
        for item in cable_failure.diagnostics
    )

    temperature_failure = build_candidate_groups(
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
        contributing_results=[_result(temperature_group=None)],
    )
    assert {
        diagnostic.details["category"]
        for diagnostic in temperature_failure.diagnostics
        if any(issue.get("reason") == "temperature_group_unresolved" for issue in diagnostic.issues)
    } == {"connection_kit", "repair_kit", "fiberglass_tape"}


def test_selection_scope_isolated_but_malformed_and_unknown_scopes_fail_closed() -> None:
    own_key = stable_group_key(
        electrical_variant_id=VARIANT_ID,
        category="connection_kit",
        condition=TemperatureCondition(TemperatureGroup.MEDIUM_HIGH),
    )
    other_key = stable_group_key(
        electrical_variant_id=OTHER_VARIANT_ID,
        category="connection_kit",
        condition=TemperatureCondition(TemperatureGroup.MEDIUM_HIGH),
    )
    outside_key = stable_group_key(
        electrical_variant_id=UUID("90000000-0000-0000-0000-000000000009"),
        category="connection_kit",
        condition=TemperatureCondition(TemperatureGroup.MEDIUM_HIGH),
    )
    selected = _catalog().items[1].id

    assert catalog_selections_for_variant(
        {
            own_key: selected,
            other_key: selected,
            outside_key: selected,
            "malformed": selected,
        },
        VARIANT_ID,
        [VARIANT_ID, OTHER_VARIANT_ID],
    ) == {own_key: selected, outside_key: selected, "malformed": selected}


def test_stale_selection_diagnostic_is_sorted_and_keeps_catalog_identity() -> None:
    selected = _catalog().items[1].id
    built = build_candidate_groups(
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
        contributing_results=[_result()],
        catalog_selections={"stale-z": selected, "stale-a": selected},
    )
    stale = built.diagnostics[-1]
    assert [item["group_key"] for item in stale.issues] == ["stale-a", "stale-z"]
    assert stale.details == {
        "catalog_id": str(CATALOG_ID),
        "catalog_version": "approved-v1",
        "payload_checksum": "sha256:" + "b" * 64,
    }


def test_fingerprints_and_payload_are_deterministic() -> None:
    first = _catalog().items[0].id
    second = _catalog().items[1].id
    assert candidate_set_fingerprint([first, second]) == candidate_set_fingerprint([second, first])

    built = build_candidate_groups(
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
        contributing_results=[_result()],
    )
    assert candidate_groups_fingerprint_payload(
        tuple(reversed(built.groups))
    ) == candidate_groups_fingerprint_payload(built.groups)
    assert stable_group_key(
        electrical_variant_id=VARIANT_ID,
        category="cable",
        condition=CableCondition("30ТТВ2-СР", "001-002-002"),
    ) == stable_group_key(
        electrical_variant_id=VARIANT_ID,
        category="cable",
        condition=CableCondition("30ТТВ2-СР", "001-002-002"),
    )


def test_contracts_parse_catalog_parameters_without_aliasing_input() -> None:
    source = {f"key-{index}": {"values": [index]} for index in range(40)}
    item = _item(10, "sealant", "Seal", applicability=source)
    source["key-0"]["values"].append(99)
    assert item.parameters.applicability_dict()["key-0"] == {"values": [0]}

    catalog = CandidateCatalog(
        version=_catalog().version,
        items=(item,),
    )
    built = build_candidate_groups(
        electrical_variant_id=VARIANT_ID,
        catalog=catalog,
        contributing_results=[_result()],
    )
    sealant = next(group for group in built.groups if group.category == "sealant")
    assert len(sealant.candidates[0].parameters.applicability_dict()) == 40


def test_empty_contributing_results_has_no_groups_or_diagnostics() -> None:
    built = build_candidate_groups(
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
        contributing_results=[],
        catalog_selections={"malformed": UUID("50000000-0000-0000-0000-000000000005")},
    )
    assert built.groups == ()
    assert built.diagnostics == ()


def test_candidate_snapshot_and_condition_are_typed_and_detached_from_input() -> None:
    source: dict[str, object] = {
        "cable": {"mark": " 30ТТВ2-СР ", "nomenclature_code": " 001-002-002 "},
        "cable_snapshot": {"technical": {"temperature_group": "medium-high"}},
    }

    snapshot = CandidateResultSnapshot.from_mapping(source)
    assert snapshot.cable_identity is not None
    assert snapshot.cable_identity.mark == "30ТТВ2-СР"
    assert snapshot.cable_identity.nomenclature_code == "001-002-002"
    assert snapshot.temperature_group is TemperatureGroup.MEDIUM_HIGH

    condition = condition_from_json(
        {"mark": snapshot.cable_identity.mark, "nomenclature_code": "001-002-002"}
    )
    frozen = condition_json(condition)
    cable = source["cable"]
    assert isinstance(cable, dict)
    cable["mark"] = "changed"
    assert frozen == {"mark": "30ТТВ2-СР", "nomenclature_code": "001-002-002"}


def test_candidate_condition_parser_rejects_partial_and_unknown_shapes() -> None:
    with pytest.raises(ValueError, match="requires mark"):
        condition_from_json({"mark": "30ТТВ2-СР"})
    with pytest.raises(ValueError, match="unknown candidate condition"):
        condition_from_json({"temperature_group": "not-a-group"})
