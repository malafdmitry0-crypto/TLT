"""Fail-closed validation for the specification catalog boundary."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.specification import (
    SpecificationCatalogItem,
    SpecificationCatalogVersion,
)
from app.services.specification_catalog_service import (
    SpecificationCatalogService,
    SpecificationCatalogServiceError,
    _canonical_checksum,
    validate_specification_catalog,
)
from app.tests.specification_catalog_fixtures import complete_specification_catalog_items


def _items_result(items):
    result = MagicMock()
    result.scalars.return_value.all.return_value = items
    return result


def _persisted_items():
    version_id = uuid.uuid4()
    items = []
    for position, item in enumerate(complete_specification_catalog_items()):
        payload = item.model_dump(mode="json")
        items.append(
            SpecificationCatalogItem(
                id=uuid.uuid4(),
                catalog_version_id=version_id,
                item_key=item.item_key,
                category=item.category.value,
                name=item.name,
                mark=item.mark,
                nomenclature_code=item.nomenclature_code,
                supply_unit=item.supply_unit,
                applicability=item.applicability,
                package_parameters=item.package_parameters,
                formula_parameters=item.formula_parameters,
                source_ref=item.source_ref,
                row_checksum=_canonical_checksum(payload),
                position=position,
            )
        )
    return items


def _payload_checksum(items):
    payloads = [
        {
            "item_key": item.item_key,
            "category": item.category,
            "name": item.name,
            "mark": item.mark,
            "nomenclature_code": item.nomenclature_code,
            "supply_unit": item.supply_unit,
            "applicability": item.applicability,
            "package_parameters": item.package_parameters,
            "formula_parameters": item.formula_parameters,
            "source_ref": item.source_ref,
        }
        for item in items
    ]
    return _canonical_checksum(sorted(payloads, key=lambda item: item["item_key"]))


def test_complete_test_catalog_passes_shape_validation():
    validation = validate_specification_catalog(complete_specification_catalog_items())

    assert validation.is_complete is True
    assert validation.issues == []


def test_glue_and_tape_catalog_gaps_block_completeness():
    items = [
        item
        for item in complete_specification_catalog_items()
        if item.category.value not in {"sealant", "fiberglass_tape", "aluminium_tape"}
    ]

    validation = validate_specification_catalog(items)

    assert validation.is_complete is False
    reasons = {issue["reason"] for issue in validation.issues}
    assert "sealant_catalog_missing" in reasons
    assert "fiberglass_temperature_groups_incomplete" in reasons
    assert "aluminium_tape_catalog_missing" in reasons


def test_missing_box_ex_or_r_gr_is_a_specific_production_blocker():
    items = complete_specification_catalog_items()
    first_box = next(item for item in items if item.category.value == "box")
    first_box.applicability.pop("Ex")
    first_box.applicability.pop("R_gr")

    validation = validate_specification_catalog(items)

    assert validation.is_complete is False
    matrix_issues = [
        issue for issue in validation.issues if issue["code"] == "SPEC_BOX_EX_RGR_MATRIX_MISSING"
    ]
    assert {issue["reason"] for issue in matrix_issues} >= {
        "authoritative_Ex_condition_missing",
        "authoritative_R_gr_condition_missing",
    }


def test_raw_unused_condition_is_rejected():
    items = complete_specification_catalog_items()
    first_box = next(item for item in items if item.category.value == "box")
    first_box.applicability["Ex"] = "unused"

    validation = validate_specification_catalog(items)

    assert validation.is_complete is False
    assert any(
        issue["reason"] == "legacy_unused_condition_rejected" for issue in validation.issues
    )


def test_unresolved_condition_makes_catalog_incomplete_but_is_valid_shape():
    items = complete_specification_catalog_items()
    first_box = next(item for item in items if item.category.value == "box")
    first_box.applicability["Ex"] = {"mode": "unresolved"}

    validation = validate_specification_catalog(items)

    assert validation.is_complete is False
    assert any(issue["reason"] == "condition_unresolved" for issue in validation.issues)


def test_not_applicable_without_decision_ref_blocks_completeness():
    items = complete_specification_catalog_items()
    first_box = next(item for item in items if item.category.value == "box")
    first_box.applicability["R_gr"] = {"mode": "not_applicable"}

    validation = validate_specification_catalog(items)

    assert validation.is_complete is False
    assert any(
        issue["reason"] == "not_applicable_decision_ref_missing" for issue in validation.issues
    )


def test_all_not_applicable_ex_rgr_without_bool_discrimination_blocked():
    from app.formulas.specification.catalog_conditions import not_applicable

    items = complete_specification_catalog_items()
    for item in items:
        if item.category.value != "box":
            continue
        item.applicability = {
            key: not_applicable(f"SPEC-OWNER-EX-RGR/test-all-na/{item.mark}/{key}")
            for key in (
                "d_ge_57",
                "K1i",
                "K2i",
                "Kiu",
                "L_sec_ge_L_K2i",
                "N_sec_ge_3",
                "Ex",
                "R_gr",
            )
        }

    validation = validate_specification_catalog(items)

    assert validation.is_complete is False
    assert any(
        issue["reason"] == "all_boxes_ex_rgr_not_applicable_without_discrimination"
        for issue in validation.issues
    )


def test_material_without_approval_reference_is_incomplete():
    items = complete_specification_catalog_items()
    sealant = next(item for item in items if item.category.value == "sealant")
    sealant.source_ref = "owner registry without approval token"

    validation = validate_specification_catalog(items)

    assert validation.is_complete is False
    assert any(
        issue["reason"] == "material_approval_reference_missing" for issue in validation.issues
    )


def test_invalid_decimal_rounding_and_duplicate_code_are_rejected():
    items = complete_specification_catalog_items()
    first_box = next(item for item in items if item.category.value == "box")
    first_box.formula_parameters["section_divider"] = "0"
    first_box.formula_parameters["rounding_mode"] = "nearest"
    items[1].nomenclature_code = items[0].nomenclature_code

    validation = validate_specification_catalog(items)

    reasons = {issue["reason"] for issue in validation.issues}
    assert "invalid_or_missing_section_divider" in reasons
    assert "box_rounding_mode_invalid" in reasons
    assert "duplicate_nomenclature_code" in reasons


def test_provisional_row_cannot_hide_inside_approved_catalog_shape():
    items = complete_specification_catalog_items()
    items[0].source_ref = "synthetic provisional matrix"

    validation = validate_specification_catalog(items)

    assert validation.is_complete is False
    assert any(issue["reason"] == "untrusted_source_ref" for issue in validation.issues)


def test_payload_checksum_is_order_insensitive_only_after_explicit_sort():
    items = [item.model_dump(mode="json") for item in complete_specification_catalog_items()]
    canonical = sorted(items, key=lambda item: item["item_key"])

    assert _canonical_checksum(canonical) == _canonical_checksum(list(canonical))
    changed = [dict(item) for item in canonical]
    changed[0] = {**changed[0], "mark": f"{changed[0]['mark']}-changed"}
    assert _canonical_checksum(canonical) != _canonical_checksum(changed)


@pytest.mark.parametrize(
    ("authority", "source"),
    [
        ("provisional", "owner registry"),
        ("synthetic", "owner registry"),
        ("approved", "synthetic generated registry"),
        ("approved", "demo catalog"),
    ],
)
async def test_activation_refuses_non_authoritative_sources(authority, source):
    catalog_id = uuid.uuid4()
    items = _persisted_items()
    target = SpecificationCatalogVersion(
        id=catalog_id,
        catalog_key="builtin-specification",
        version="test-v1",
        status="draft",
        authority=authority,
        source=source,
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=_payload_checksum(items),
        schema_version=1,
        item_count=0,
        is_complete=False,
        validation_issues=[],
    )
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[target, target])
    db.execute = AsyncMock(side_effect=[MagicMock(), _items_result(items)])
    db.commit = AsyncMock()

    with pytest.raises(SpecificationCatalogServiceError) as exc:
        await SpecificationCatalogService(db).activate(catalog_id)

    assert exc.value.code == "SPEC_CATALOG_VALIDATION_FAILED"
    db.commit.assert_awaited_once()


async def test_activation_retires_previous_version_and_marks_specs_stale():
    catalog_id = uuid.uuid4()
    items = _persisted_items()
    target = SpecificationCatalogVersion(
        id=catalog_id,
        catalog_key="builtin-specification",
        version="approved-v2",
        status="draft",
        authority="approved",
        source="owner registry",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=_payload_checksum(items),
        schema_version=1,
        item_count=0,
        is_complete=False,
        validation_issues=[],
    )
    previous = SpecificationCatalogVersion(
        id=uuid.uuid4(),
        catalog_key="builtin-specification",
        version="approved-v1",
        status="active",
        authority="approved",
        source="owner registry",
        source_checksum=f"sha256:{'c' * 64}",
        payload_checksum=f"sha256:{'d' * 64}",
        schema_version=1,
        item_count=40,
        is_complete=True,
        validation_issues=[],
    )
    stale_result = MagicMock(rowcount=3)
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[target, target])
    db.execute = AsyncMock(
        side_effect=[
            MagicMock(),
            _items_result(items),
            _items_result([previous, target]),
            stale_result,
        ]
    )
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    result = await SpecificationCatalogService(db).activate(catalog_id)

    assert previous.status == "retired"
    assert target.status == "active"
    assert target.is_complete is True
    assert result.stale_specification_count == 3
    db.commit.assert_awaited_once()


async def test_activation_refuses_incomplete_approved_catalog():
    catalog_id = uuid.uuid4()
    items = [item for item in _persisted_items() if item.category != "sealant"]
    target = SpecificationCatalogVersion(
        id=catalog_id,
        catalog_key="builtin-specification",
        version="approved-incomplete",
        status="draft",
        authority="approved",
        source="owner registry",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=_payload_checksum(items),
        schema_version=1,
        item_count=len(items),
        is_complete=False,
        validation_issues=[],
    )
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[target, target])
    db.execute = AsyncMock(side_effect=[MagicMock(), _items_result(items)])
    db.commit = AsyncMock()

    with pytest.raises(SpecificationCatalogServiceError) as exc:
        await SpecificationCatalogService(db).activate(catalog_id)

    assert exc.value.code == "SPEC_CATALOG_VALIDATION_FAILED"
    assert any(
        issue["reason"] == "sealant_catalog_missing" for issue in exc.value.details["issues"]
    )


async def test_activation_refuses_checksum_mismatch():
    catalog_id = uuid.uuid4()
    items = _persisted_items()
    items[0].row_checksum = f"sha256:{'f' * 64}"
    target = SpecificationCatalogVersion(
        id=catalog_id,
        catalog_key="builtin-specification",
        version="approved-corrupted",
        status="draft",
        authority="approved",
        source="owner registry",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=f"sha256:{'b' * 64}",
        schema_version=1,
        item_count=len(items),
        is_complete=True,
        validation_issues=[],
    )
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[target, target])
    db.execute = AsyncMock(side_effect=[MagicMock(), _items_result(items)])
    db.commit = AsyncMock()

    with pytest.raises(SpecificationCatalogServiceError) as exc:
        await SpecificationCatalogService(db).activate(catalog_id)

    assert exc.value.code == "SPEC_CATALOG_VALIDATION_FAILED"
    reasons = {issue["reason"] for issue in exc.value.details["issues"]}
    assert {"row_checksum_mismatch", "payload_checksum_mismatch"} <= reasons


async def test_activation_reports_invalid_persisted_required_fields_as_domain_error():
    catalog_id = uuid.uuid4()
    items = _persisted_items()
    items[0].name = ""
    target = SpecificationCatalogVersion(
        id=catalog_id,
        catalog_key="builtin-specification",
        version="approved-damaged-row",
        status="draft",
        authority="approved",
        source="owner registry",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=_payload_checksum(items),
        schema_version=1,
        item_count=len(items),
        is_complete=True,
        validation_issues=[],
    )
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[target, target])
    db.execute = AsyncMock(side_effect=[MagicMock(), _items_result(items)])
    db.commit = AsyncMock()

    with pytest.raises(SpecificationCatalogServiceError) as exc:
        await SpecificationCatalogService(db).activate(catalog_id)

    assert exc.value.code == "SPEC_CATALOG_VALIDATION_FAILED"
    invalid = next(
        issue
        for issue in exc.value.details["issues"]
        if issue["reason"] == "required_catalog_fields_invalid"
    )
    assert invalid["details"]["fields"] == ["name"]


async def test_resolve_active_fails_closed_when_no_active_catalog_exists():
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_items_result([]))

    with pytest.raises(SpecificationCatalogServiceError) as exc:
        await SpecificationCatalogService(db).resolve_active()

    assert exc.value.code == "SPEC_CATALOG_UNAVAILABLE"
    assert exc.value.status_code == 503


async def test_resolve_explicit_inactive_version_has_stable_conflict_code():
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_items_result([]))

    with pytest.raises(SpecificationCatalogServiceError) as exc:
        await SpecificationCatalogService(db).resolve_active(catalog_version="draft-v1")

    assert exc.value.code == "SPEC_CATALOG_VERSION_INACTIVE"
    assert exc.value.status_code == 409


async def test_resolve_default_uses_the_only_active_catalog_without_builtin_key():
    items = _persisted_items()
    version = SpecificationCatalogVersion(
        id=items[0].catalog_version_id,
        catalog_key="project-owner-catalog",
        version="approved-v1",
        status="active",
        authority="approved",
        source="owner registry",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=_payload_checksum(items),
        schema_version=1,
        item_count=len(items),
        is_complete=True,
        validation_issues=[],
    )
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[_items_result([version]), _items_result(items)]
    )

    resolved = await SpecificationCatalogService(db).resolve_active()

    assert resolved.version.catalog_key == "project-owner-catalog"
    first_query = str(db.execute.await_args_list[0].args[0])
    assert "specification_catalog_versions.catalog_key =" not in first_query


async def test_resolve_default_rejects_multiple_active_catalogs():
    first = SpecificationCatalogVersion(
        id=uuid.uuid4(),
        catalog_key="owner-a",
        version="v1",
        status="active",
        authority="approved",
        source="owner registry",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=f"sha256:{'b' * 64}",
        schema_version=1,
        item_count=1,
        is_complete=True,
        validation_issues=[],
    )
    second = SpecificationCatalogVersion(
        id=uuid.uuid4(),
        catalog_key="owner-b",
        version="v1",
        status="active",
        authority="approved",
        source="owner registry",
        source_checksum=f"sha256:{'c' * 64}",
        payload_checksum=f"sha256:{'d' * 64}",
        schema_version=1,
        item_count=1,
        is_complete=True,
        validation_issues=[],
    )
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_items_result([first, second]))

    with pytest.raises(SpecificationCatalogServiceError) as exc:
        await SpecificationCatalogService(db).resolve_active()

    assert exc.value.code == "SPEC_CATALOG_UNAVAILABLE"
    assert exc.value.details == {
        "reason": "multiple_active_catalogs",
        "active_catalog_count": 2,
    }


async def test_resolve_active_accepts_uuid_string_catalog_id():
    catalog_id = uuid.uuid4()
    items = _persisted_items()
    version = SpecificationCatalogVersion(
        id=catalog_id,
        catalog_key="builtin-specification",
        version="approved-v1",
        status="active",
        authority="approved",
        source="owner registry",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=_payload_checksum(items),
        schema_version=1,
        item_count=len(items),
        is_complete=True,
        validation_issues=[],
    )
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=version)
    db.execute = AsyncMock(return_value=_items_result(items))

    resolved = await SpecificationCatalogService(db).resolve_active(
        catalog_id=str(catalog_id),
        catalog_version="approved-v1",
    )

    assert resolved.version.id == catalog_id
    assert len(resolved.items) == len(items)


def test_error_detail_is_stable_and_repeatable():
    error = SpecificationCatalogServiceError(
        "SPEC_CATALOG_VALIDATION_FAILED",
        "invalid",
        status_code=422,
        details={"issues": [{"code": "x"}], "authority": "synthetic"},
    )

    assert (
        error.as_detail()
        == error.as_detail()
        == {
            "code": "SPEC_CATALOG_VALIDATION_FAILED",
            "message": "invalid",
            "issues": [{"code": "x"}],
            "details": {"authority": "synthetic"},
        }
    )
