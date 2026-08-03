"""Unit tests for catalog candidate filtering and selection protocol."""

from __future__ import annotations

import uuid

from app.models.specification import SpecificationCatalogItem, SpecificationCatalogVersion
from app.schemas.specification import SpecificationDiagnosticCode, SpecificationIssueKind
from app.services.specification_candidate_service import (
    build_candidate_groups,
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


def test_boxes_are_not_included_in_selection_protocol():
    catalog = _catalog_from_inputs(complete_specification_catalog_items())
    built = build_candidate_groups(
        electrical_variant_id=uuid.uuid4(),
        catalog=catalog,
        contributing_results=[_result()],
    )
    assert all(group.category != "box" for group in built.groups)
