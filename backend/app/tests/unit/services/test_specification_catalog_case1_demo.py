"""Case 1 demo catalog: deterministic, complete and non-production only."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.config import settings
from app.reference_data.specification_catalog_case1_demo import (
    CASE1_DEMO_BOX_NA_DECISION_REF,
    CASE1_DEMO_CATALOG_KEY,
    CASE1_DEMO_EX_RGR_NA_DECISION_REF,
    CASE1_DEMO_SCHEMA_VERSION,
    CASE1_DEMO_VERSION,
    bundled_case1_demo_catalog_document,
    case1_demo_payload_checksum,
)
from app.services.specification_catalog import (
    SpecificationCatalogService,
    SpecificationCatalogServiceError,
    is_case1_demo_catalog_version,
    validate_specification_catalog,
)
from app.services.specification_catalog.policy import (
    active_authority_allowed,
    catalog_demo_markers_compatible,
)

_EXPECTED_BOX_ROWS = {
    "СКВ 1201": (True, False, None, None, None, None, "3", "up"),
    "СКВ 1202": (False, False, None, None, None, None, "3", "up"),
    "СКВ 1201-С": (True, None, True, False, True, None, "3", "up"),
    "СКВ 1201-С1": (True, None, True, True, True, None, "1", "up"),
    "СКВ 1202-С": (False, None, True, False, True, None, "1", "up"),
    "СКВ 1202-С1": (False, None, True, True, True, None, "1", "up"),
    "СКВ 1601": (True, False, None, None, None, None, "3", "down"),
    "СКВ 1602": (False, False, None, None, None, True, "3", "down"),
    "СКВ 1601-С": (True, True, None, False, None, None, "3", "up"),
    "СКВ 1601-С1": (True, True, None, True, None, None, "3", "up"),
    "СКВ 1602-С": (False, True, None, False, None, None, "3", "up"),
    "СКВ 1602-С1": (False, True, None, True, None, None, "3", "up"),
}
_BOOL_KEYS = (
    "d_ge_57",
    "K1i",
    "K2i",
    "Kiu",
    "L_sec_ge_L_K2i",
    "N_sec_ge_3",
)


def _walk(value: Any) -> Iterator[Any]:
    if isinstance(value, dict):
        for key, nested in value.items():
            yield key
            yield from _walk(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _walk(nested)
    else:
        yield value


def test_case1_demo_document_validates_without_legacy_values_or_test_codes():
    document = bundled_case1_demo_catalog_document()

    assert (document.catalog_key, document.version, document.schema_version) == (
        CASE1_DEMO_CATALOG_KEY,
        CASE1_DEMO_VERSION,
        CASE1_DEMO_SCHEMA_VERSION,
    )
    validation = validate_specification_catalog(document.items)
    assert validation.is_complete is True, validation.issues
    assert all(
        str(part).casefold() != "unused"
        for item in document.items
        for part in _walk(item.model_dump(mode="json"))
    )
    assert all(
        not item.item_key.startswith("TEST-")
        and not item.mark.startswith("TEST-")
        and not item.nomenclature_code.startswith("TEST-")
        for item in document.items
    )


def test_case1_demo_boxes_copy_page_76_and_keep_minimum_quantity_one():
    boxes = [item for item in bundled_case1_demo_catalog_document().items if item.category == "box"]
    assert len(boxes) == 12
    assert {box.mark for box in boxes} == set(_EXPECTED_BOX_ROWS)

    for box in boxes:
        expected = _EXPECTED_BOX_ROWS[box.mark]
        for key, expected_value in zip(_BOOL_KEYS, expected[:6], strict=True):
            condition = box.applicability[key]
            if expected_value is None:
                assert condition == {
                    "mode": "not_applicable",
                    "decision_ref": CASE1_DEMO_BOX_NA_DECISION_REF,
                }
            else:
                assert condition == {"mode": "match", "operator": "eq", "value": expected_value}
        assert box.formula_parameters == {
            "section_divider": expected[6],
            "rounding_mode": expected[7],
            "min_quantity": "1",
        }
        assert box.applicability["Ex"] == {
            "mode": "not_applicable",
            "decision_ref": CASE1_DEMO_EX_RGR_NA_DECISION_REF,
        }
        assert box.applicability["R_gr"] == {
            "mode": "not_applicable",
            "decision_ref": CASE1_DEMO_EX_RGR_NA_DECISION_REF,
        }


def test_case1_demo_box_boundaries_are_explicit_matches():
    boxes = {
        box.mark: box
        for box in bundled_case1_demo_catalog_document().items
        if box.category == "box"
    }
    assert boxes["СКВ 1201"].applicability["d_ge_57"] == {
        "mode": "match",
        "operator": "eq",
        "value": True,
    }
    assert boxes["СКВ 1602"].applicability["N_sec_ge_3"] == {
        "mode": "match",
        "operator": "eq",
        "value": True,
    }
    assert all(box.formula_parameters["min_quantity"] == "1" for box in boxes.values())


def test_case1_demo_checksum_is_stable():
    first = bundled_case1_demo_catalog_document()
    second = bundled_case1_demo_catalog_document()
    assert first.source_checksum == second.source_checksum
    assert first.source_checksum.startswith("sha256:")


def test_case1_demo_identity_is_exact():
    document = bundled_case1_demo_catalog_document()
    demo = MagicMock(
        catalog_key=CASE1_DEMO_CATALOG_KEY,
        version=CASE1_DEMO_VERSION,
        source=document.source,
        source_checksum=document.source_checksum,
        payload_checksum=case1_demo_payload_checksum(),
        authority="demo",
    )
    assert is_case1_demo_catalog_version(demo) is True
    unrelated = MagicMock(
        catalog_key=CASE1_DEMO_CATALOG_KEY,
        version=CASE1_DEMO_VERSION,
        source="wrong source",
        source_checksum=document.source_checksum,
        payload_checksum=case1_demo_payload_checksum(),
        authority="demo",
    )
    assert is_case1_demo_catalog_version(unrelated) is False
    wrong_payload = MagicMock(
        catalog_key=CASE1_DEMO_CATALOG_KEY,
        version=CASE1_DEMO_VERSION,
        source=document.source,
        source_checksum=document.source_checksum,
        payload_checksum="sha256:" + "0" * 64,
        authority="demo",
    )
    assert is_case1_demo_catalog_version(wrong_payload) is False
    wrong_authority = MagicMock(
        catalog_key=CASE1_DEMO_CATALOG_KEY,
        version=CASE1_DEMO_VERSION,
        source=document.source,
        source_checksum=document.source_checksum,
        payload_checksum=case1_demo_payload_checksum(),
        authority="approved",
    )
    assert is_case1_demo_catalog_version(wrong_authority) is False


def test_arbitrary_demo_authority_is_not_allowed_in_any_environment(
    monkeypatch: pytest.MonkeyPatch,
):
    arbitrary_demo = MagicMock(
        authority="demo",
        catalog_key="other-catalog",
        version="other-demo-v1",
        source="owner registry",
        source_checksum="sha256:" + "a" * 64,
        payload_checksum=case1_demo_payload_checksum(),
    )
    monkeypatch.setattr(settings, "APP_ENV", "development")
    assert active_authority_allowed(arbitrary_demo) is False
    monkeypatch.setattr(settings, "APP_ENV", "production")
    assert active_authority_allowed(arbitrary_demo) is False


def test_case1_demo_markers_cannot_be_reused_by_an_approved_non_demo_catalog():
    document = bundled_case1_demo_catalog_document()
    wrong_version = MagicMock(
        catalog_key=CASE1_DEMO_CATALOG_KEY,
        version="owner-v2",
        authority="approved",
        source="owner registry",
        source_checksum="sha256:" + "a" * 64,
        payload_checksum=case1_demo_payload_checksum(),
    )

    assert catalog_demo_markers_compatible(wrong_version, document.items) is False


@pytest.mark.asyncio
async def test_resolve_rejects_valid_looking_browser_qa_catalog_before_bom():
    browser_qa = MagicMock(
        version="browser-qa-2026-08-03",
        authority="approved",
        is_complete=True,
        schema_version=CASE1_DEMO_SCHEMA_VERSION,
        catalog_key=CASE1_DEMO_CATALOG_KEY,
        source="owner registry",
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [browser_qa]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    with pytest.raises(SpecificationCatalogServiceError) as exc:
        await SpecificationCatalogService(db).resolve_active()

    assert exc.value.details["reason"] == "browser_qa_catalog_forbidden"


@pytest.mark.asyncio
async def test_resolve_rejects_current_schema_catalog_with_untrusted_source_before_bom():
    untrusted = MagicMock(
        version="owner-v1",
        authority="approved",
        is_complete=True,
        schema_version=CASE1_DEMO_SCHEMA_VERSION,
        catalog_key=CASE1_DEMO_CATALOG_KEY,
        source="mock generated registry",
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [untrusted]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    with pytest.raises(SpecificationCatalogServiceError) as exc:
        await SpecificationCatalogService(db).resolve_active()

    assert exc.value.details["reason"] == "catalog_source_not_compatible"


@pytest.mark.asyncio
async def test_case1_demo_bootstrap_is_forbidden_in_production(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    db = AsyncMock()

    with pytest.raises(SpecificationCatalogServiceError) as exc:
        await SpecificationCatalogService(db).ensure_case1_demo_catalog_active(
            principal=None,
            commit=False,
        )

    assert exc.value.code == "SPEC_CATALOG_DEMO_FORBIDDEN"
    db.scalar.assert_not_awaited()


@pytest.mark.asyncio
async def test_resolve_exact_case1_demo_is_forbidden_in_production(
    monkeypatch: pytest.MonkeyPatch,
):
    document = bundled_case1_demo_catalog_document()
    demo = MagicMock(
        catalog_key=CASE1_DEMO_CATALOG_KEY,
        version=CASE1_DEMO_VERSION,
        source=document.source,
        source_checksum=document.source_checksum,
        payload_checksum=case1_demo_payload_checksum(),
        authority="demo",
        is_complete=True,
        schema_version=CASE1_DEMO_SCHEMA_VERSION,
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [demo]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    monkeypatch.setattr(settings, "APP_ENV", "production")

    with pytest.raises(SpecificationCatalogServiceError) as exc:
        await SpecificationCatalogService(db).resolve_active()

    assert exc.value.code == "SPEC_CATALOG_DEMO_FORBIDDEN"
