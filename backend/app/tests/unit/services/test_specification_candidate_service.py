"""Unit tests for catalog candidate filtering and selection protocol."""

from __future__ import annotations

import uuid

from app.models.specification import SpecificationCatalogItem, SpecificationCatalogVersion
from app.schemas.specification import SpecificationDiagnosticCode, SpecificationIssueKind
from app.services.specification_candidate_service import (
    build_candidate_groups,
    catalog_selections_for_variant,
    stable_group_key,
)
from app.services.specification_catalog_service import ResolvedSpecificationCatalog
from app.tests.specification_catalog_fixtures import complete_specification_catalog_items


def _version() -> SpecificationCatalogVersion:
    return SpecificationCatalogVersion(
        id=uuid.uuid4(),
        catalog_key="builtin-specification",
        version="test-v1",
        status="active",
        authority="approved",
        source="unit test",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=f"sha256:{'b' * 64}",
        schema_version=1,
        item_count=0,
        is_complete=True,
        validation_issues=[],
    )


def _catalog_from_inputs(inputs) -> ResolvedSpecificationCatalog:
    version = _version()
    items: list[SpecificationCatalogItem] = []
    for index, item in enumerate(inputs):
        items.append(
            SpecificationCatalogItem(
                id=uuid.uuid4(),
                catalog_version_id=version.id,
                item_key=item.item_key,
                category=item.category.value if hasattr(item.category, "value") else item.category,
                name=item.name,
                mark=item.mark,
                nomenclature_code=item.nomenclature_code,
                supply_unit=item.supply_unit,
                applicability=dict(item.applicability or {}),
                package_parameters=dict(item.package_parameters or {}),
                formula_parameters=dict(item.formula_parameters or {}),
                source_ref=item.source_ref,
                row_checksum=f"sha256:{index:064x}",
                position=index,
            )
        )
    version.item_count = len(items)
    return ResolvedSpecificationCatalog(version=version, items=tuple(items))


def _result(*, mark: str = "30ТТВ2-СР", temperature_group: str = "high") -> dict:
    return {
        "cable": {"mark": mark, "nomenclature_code": "001-002-002"},
        "temperature_group": temperature_group,
        "selected_cable": mark.split("-")[0] if "-" in mark else mark,
    }


def test_zero_candidates_is_blocking_missing_item():
    catalog = _catalog_from_inputs(
        [
            item
            for item in complete_specification_catalog_items()
            if item.category != "connection_kit"
            and (
                getattr(item.category, "value", item.category) != "connection_kit"
            )
        ]
    )
    # Drop connection kits explicitly.
    catalog = ResolvedSpecificationCatalog(
        version=catalog.version,
        items=tuple(item for item in catalog.items if item.category != "connection_kit"),
    )
    built = build_candidate_groups(
        electrical_variant_id=uuid.uuid4(),
        catalog=catalog,
        contributing_results=[_result()],
    )
    assert any(
        d.code is SpecificationDiagnosticCode.ACCESSORY_CATALOG_ITEM_MISSING
        and d.kind is SpecificationIssueKind.BLOCKING
        for d in built.diagnostics
    )
    connection = next(g for g in built.groups if g.category == "connection_kit")
    assert connection.candidates == []
    assert connection.selected_catalog_item_id is None


def test_one_candidate_auto_selects_without_selection_required():
    # Single sealant + single aluminium + single repair for MEDIUM_HIGH + single cable.
    items = [
        item
        for item in complete_specification_catalog_items()
        if getattr(item.category, "value", item.category)
        in {"cable", "repair_kit", "sealant", "fiberglass_tape", "aluminium_tape"}
        or (
            getattr(item.category, "value", item.category) == "connection_kit"
            and item.mark == "КСВ-1"
        )
    ]
    # Keep only the matching cable mark.
    items = [
        item
        for item in items
        if getattr(item.category, "value", item.category) != "cable"
        or item.mark == "30ТТВ2-СР"
    ]
    catalog = _catalog_from_inputs(items)
    variant_id = uuid.uuid4()
    built = build_candidate_groups(
        electrical_variant_id=variant_id,
        catalog=catalog,
        contributing_results=[_result()],
    )
    assert not any(
        d.kind is SpecificationIssueKind.SELECTION_REQUIRED for d in built.diagnostics
    )
    assert not any(d.kind is SpecificationIssueKind.BLOCKING for d in built.diagnostics)
    for group in built.groups:
        assert group.selected_catalog_item_id is not None
        assert len(group.candidates) == 1
        assert group.selected_catalog_item_id == group.candidates[0].catalog_item_id


def test_many_candidates_without_selection_requires_choice():
    catalog = _catalog_from_inputs(complete_specification_catalog_items())
    built = build_candidate_groups(
        electrical_variant_id=uuid.uuid4(),
        catalog=catalog,
        contributing_results=[_result()],
    )
    connection = next(g for g in built.groups if g.category == "connection_kit")
    assert len(connection.candidates) == 2  # КСВ-1, КСВ-2 for MEDIUM_HIGH
    assert connection.selected_catalog_item_id is None
    assert any(
        d.code is SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED
        and d.kind is SpecificationIssueKind.SELECTION_REQUIRED
        for d in built.diagnostics
    )


def test_selection_of_item_from_wrong_group_is_rejected():
    catalog = _catalog_from_inputs(complete_specification_catalog_items())
    variant_id = uuid.uuid4()
    built = build_candidate_groups(
        electrical_variant_id=variant_id,
        catalog=catalog,
        contributing_results=[_result()],
    )
    connection = next(g for g in built.groups if g.category == "connection_kit")
    # Pick a LOW-temp kit that is not in this MEDIUM_HIGH group.
    low_kit = next(
        item for item in catalog.items if item.category == "connection_kit" and item.mark == "КСН-1"
    )
    rejected = build_candidate_groups(
        electrical_variant_id=variant_id,
        catalog=catalog,
        contributing_results=[_result()],
        catalog_selections={connection.group_key: low_kit.id},
    )
    connection2 = next(g for g in rejected.groups if g.category == "connection_kit")
    assert connection2.selected_catalog_item_id is None
    assert any(
        issue.get("reason") == "catalog_selection_not_in_group"
        for d in rejected.diagnostics
        for issue in d.issues
    )


def test_valid_selection_resolves_multi_candidate_group():
    catalog = _catalog_from_inputs(complete_specification_catalog_items())
    variant_id = uuid.uuid4()
    initial = build_candidate_groups(
        electrical_variant_id=variant_id,
        catalog=catalog,
        contributing_results=[_result()],
    )
    connection = next(g for g in initial.groups if g.category == "connection_kit")
    chosen = connection.candidates[0].catalog_item_id
    # Auto-selected groups keep their single pick; multi needs explicit selection.
    selections = {
        group.group_key: group.selected_catalog_item_id
        for group in initial.groups
        if group.selected_catalog_item_id is not None
    }
    selections[connection.group_key] = chosen
    resolved = build_candidate_groups(
        electrical_variant_id=variant_id,
        catalog=catalog,
        contributing_results=[_result()],
        catalog_selections=selections,
    )
    assert not any(
        d.kind is SpecificationIssueKind.SELECTION_REQUIRED for d in resolved.diagnostics
    )
    connection2 = next(g for g in resolved.groups if g.category == "connection_kit")
    assert connection2.selected_catalog_item_id == chosen


def test_group_key_is_stable_for_same_inputs():
    variant_id = uuid.uuid4()
    first = stable_group_key(
        electrical_variant_id=variant_id,
        category="connection_kit",
        conditions={"temperature_group": "MEDIUM_HIGH"},
    )
    second = stable_group_key(
        electrical_variant_id=variant_id,
        category="connection_kit",
        conditions={"temperature_group": "MEDIUM_HIGH"},
    )
    assert first == second
    assert first.startswith("cg_")
    other = stable_group_key(
        electrical_variant_id=variant_id,
        category="connection_kit",
        conditions={"temperature_group": "LOW"},
    )
    assert other != first


def test_selection_scope_keeps_own_er_and_ignores_another_er():
    first_id = uuid.uuid4()
    second_id = uuid.uuid4()
    first_key = stable_group_key(
        electrical_variant_id=first_id,
        category="connection_kit",
        conditions={"temperature_group": "MEDIUM_HIGH"},
    )
    second_key = stable_group_key(
        electrical_variant_id=second_id,
        category="connection_kit",
        conditions={"temperature_group": "MEDIUM_HIGH"},
    )
    first_item = uuid.uuid4()
    second_item = uuid.uuid4()

    assert catalog_selections_for_variant(
        {first_key: first_item, second_key: second_item},
        first_id,
        [first_id, second_id],
    ) == {first_key: first_item}


def test_selection_with_scope_outside_request_is_not_silently_ignored():
    requested_id = uuid.uuid4()
    foreign_key = stable_group_key(
        electrical_variant_id=uuid.uuid4(),
        category="connection_kit",
        conditions={"temperature_group": "MEDIUM_HIGH"},
    )
    item_id = uuid.uuid4()

    assert catalog_selections_for_variant(
        {foreign_key: item_id},
        requested_id,
        [requested_id],
    ) == {foreign_key: item_id}


def test_stale_selection_from_same_er_is_still_reported():
    catalog = _catalog_from_inputs(complete_specification_catalog_items())
    variant_id = uuid.uuid4()
    stale_key = stable_group_key(
        electrical_variant_id=variant_id,
        category="connection_kit",
        conditions={"temperature_group": "LOW"},
    )

    built = build_candidate_groups(
        electrical_variant_id=variant_id,
        catalog=catalog,
        contributing_results=[_result()],
        catalog_selections={stale_key: uuid.uuid4()},
    )

    assert any(
        issue == {"group_key": stale_key, "reason": "catalog_selection_stale_group"}
        for diagnostic in built.diagnostics
        for issue in diagnostic.issues
    )


def test_cable_candidate_requires_exact_mark_and_nomenclature_code():
    inputs = complete_specification_catalog_items()
    exact = next(item for item in inputs if item.item_key == "cable:30ТТВ2-СР")
    same_mark_wrong_code = exact.model_copy(deep=True)
    same_mark_wrong_code.item_key = "cable:30ТТВ2-СР:wrong-code"
    same_mark_wrong_code.nomenclature_code = "WRONG-CODE"
    catalog = _catalog_from_inputs([*inputs, same_mark_wrong_code])

    built = build_candidate_groups(
        electrical_variant_id=uuid.uuid4(),
        catalog=catalog,
        contributing_results=[_result()],
    )

    cable = next(group for group in built.groups if group.category == "cable")
    assert [item.nomenclature_code for item in cable.candidates] == ["001-002-002"]


def test_missing_explicit_cable_code_blocks_candidate_resolution():
    result = _result()
    result["cable"].pop("nomenclature_code")
    catalog = _catalog_from_inputs(complete_specification_catalog_items())

    built = build_candidate_groups(
        electrical_variant_id=uuid.uuid4(),
        catalog=catalog,
        contributing_results=[result],
    )

    assert any(
        diagnostic.code is SpecificationDiagnosticCode.CABLE_NOMENCLATURE_MISSING
        and diagnostic.kind is SpecificationIssueKind.BLOCKING
        for diagnostic in built.diagnostics
    )


def test_model_or_series_without_explicit_temperature_group_blocks():
    result = _result()
    result.pop("temperature_group")
    result["series"] = "ТТВ"
    catalog = _catalog_from_inputs(complete_specification_catalog_items())

    built = build_candidate_groups(
        electrical_variant_id=uuid.uuid4(),
        catalog=catalog,
        contributing_results=[result],
    )

    unresolved = [
        diagnostic
        for diagnostic in built.diagnostics
        if any(
            issue.get("reason") == "temperature_group_unresolved"
            for issue in diagnostic.issues
        )
    ]
    assert {diagnostic.details["category"] for diagnostic in unresolved} == {
        "connection_kit",
        "repair_kit",
        "fiberglass_tape",
    }


def test_boxes_are_not_included_in_selection_protocol():
    catalog = _catalog_from_inputs(complete_specification_catalog_items())
    built = build_candidate_groups(
        electrical_variant_id=uuid.uuid4(),
        catalog=catalog,
        contributing_results=[_result()],
    )
    assert all(group.category != "box" for group in built.groups)
