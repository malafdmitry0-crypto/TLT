from __future__ import annotations

from uuid import UUID

from heatcalc_specification_core.candidates import (
    CableCondition,
    CandidateCatalog,
    CandidateCatalogItem,
    CandidateCatalogVersion,
    CandidateGroup,
    SelectionSource,
    SpecificationCandidate,
    TemperatureCondition,
    UniversalCondition,
    candidate_groups_fingerprint_payload,
    candidate_set_fingerprint,
    stable_group_key,
)
from heatcalc_specification_core.candidates.filtering import filter_candidates
from heatcalc_specification_core.candidates.selections import (
    resolve_selection,
    stale_selection_diagnostic,
)
from heatcalc_specification_core.catalog import CatalogParameters
from heatcalc_specification_core.json_types import mutable_json
from heatcalc_specification_core.types import TemperatureGroup

VARIANT_ID = UUID("10000000-0000-0000-0000-000000000001")
CATALOG_ID = UUID("30000000-0000-0000-0000-000000000003")
FIRST_ID = UUID("40000000-0000-0000-0000-000000000001")
SECOND_ID = UUID("40000000-0000-0000-0000-000000000002")
FOREIGN_ID = UUID("90000000-0000-0000-0000-000000000009")
GROUP_KEY = "cg_10000000000000000000000000000001_" + "a" * 40
CONDITION = CableCondition("30ТТВ2-СР", "001-002-002")


def _catalog() -> CandidateCatalog:
    return CandidateCatalog(
        version=CandidateCatalogVersion(
            id=CATALOG_ID,
            version="approved-v1",
            payload_checksum="sha256:" + "b" * 64,
        ),
        items=(),
    )


def _candidate(item_id: UUID, suffix: str) -> SpecificationCandidate:
    return SpecificationCandidate(
        catalog_item_id=item_id,
        catalog_id=CATALOG_ID,
        catalog_version="approved-v1",
        category="cable",
        name=f"Cable {suffix}",
        mark=f"MARK-{suffix}",
        nomenclature_code=f"CODE-{suffix}",
        supply_unit="м",
    )


def test_zero_candidates_has_exact_blocking_diagnostic() -> None:
    selected, source, diagnostics = resolve_selection(
        group_key=GROUP_KEY,
        category="cable",
        condition=CONDITION,
        candidates=(),
        selections={},
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
    )

    assert selected is None
    assert source is SelectionSource.NONE
    assert len(diagnostics) == 1
    diagnostic = diagnostics[0]
    assert diagnostic.code.value == "SPEC_ACCESSORY_CATALOG_ITEM_MISSING"
    assert diagnostic.kind.value == "blocking"
    assert diagnostic.message == "В активном каталоге нет подходящей позиции для комплектующих"
    assert tuple(mutable_json(item) for item in diagnostic.issues) == (
        {
            "reason": "no_matching_catalog_item",
            "category": "cable",
            "conditions": {"mark": "30ТТВ2-СР", "nomenclature_code": "001-002-002"},
            "group_key": GROUP_KEY,
        },
    )
    assert mutable_json(diagnostic.details) == {
        "electrical_variant_id": str(VARIANT_ID),
        "category": "cable",
        "conditions": {"mark": "30ТТВ2-СР", "nomenclature_code": "001-002-002"},
        "catalog_id": str(CATALOG_ID),
        "catalog_version": "approved-v1",
    }


def test_single_candidate_is_auto_selected_but_foreign_submission_is_rejected() -> None:
    candidate = _candidate(FIRST_ID, "one")

    assert resolve_selection(
        group_key=GROUP_KEY,
        category="cable",
        condition=CONDITION,
        candidates=(candidate,),
        selections={},
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
    ) == (FIRST_ID, SelectionSource.AUTO_SINGLE, ())
    assert resolve_selection(
        group_key=GROUP_KEY,
        category="cable",
        condition=CONDITION,
        candidates=(candidate,),
        selections={GROUP_KEY: FIRST_ID},
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
    ) == (FIRST_ID, SelectionSource.AUTO_SINGLE, ())

    selected, source, diagnostics = resolve_selection(
        group_key=GROUP_KEY,
        category="cable",
        condition=CONDITION,
        candidates=(candidate,),
        selections={GROUP_KEY: FOREIGN_ID},
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
    )
    assert selected is None
    assert source is SelectionSource.NONE
    diagnostic = diagnostics[0]
    assert diagnostic.code.value == "SPEC_ACCESSORY_SELECTION_REQUIRED"
    assert diagnostic.kind.value == "selection_required"
    assert diagnostic.message == "Выбранная позиция не входит в кандидатов группы"
    assert tuple(mutable_json(item) for item in diagnostic.issues) == (
        {
            "reason": "catalog_selection_not_in_group",
            "group_key": GROUP_KEY,
            "catalog_item_id": str(FOREIGN_ID),
            "category": "cable",
        },
    )
    assert mutable_json(diagnostic.details) == {
        "electrical_variant_id": str(VARIANT_ID),
        "group_key": GROUP_KEY,
        "catalog_id": str(CATALOG_ID),
        "catalog_version": "approved-v1",
    }


def test_multiple_candidates_require_an_exact_member() -> None:
    candidates = (_candidate(FIRST_ID, "one"), _candidate(SECOND_ID, "two"))

    selected, source, diagnostics = resolve_selection(
        group_key=GROUP_KEY,
        category="cable",
        condition=CONDITION,
        candidates=candidates,
        selections={},
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
    )
    assert selected is None
    assert source is SelectionSource.NONE
    diagnostic = diagnostics[0]
    assert diagnostic.code.value == "SPEC_ACCESSORY_SELECTION_REQUIRED"
    assert diagnostic.kind.value == "selection_required"
    assert diagnostic.message == "Требуется выбор позиции каталога для комплектующих"
    assert tuple(mutable_json(item) for item in diagnostic.issues) == (
        {
            "reason": "catalog_selection_missing",
            "group_key": GROUP_KEY,
            "category": "cable",
            "candidate_count": 2,
        },
    )
    assert mutable_json(diagnostic.details) == {
        "electrical_variant_id": str(VARIANT_ID),
        "group_key": GROUP_KEY,
        "category": "cable",
        "conditions": {"mark": "30ТТВ2-СР", "nomenclature_code": "001-002-002"},
        "catalog_id": str(CATALOG_ID),
        "catalog_version": "approved-v1",
    }
    assert resolve_selection(
        group_key=GROUP_KEY,
        category="cable",
        condition=CONDITION,
        candidates=candidates,
        selections={GROUP_KEY: SECOND_ID},
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
    ) == (SECOND_ID, SelectionSource.EXPLICIT, ())

    rejected, rejected_source, rejected_diagnostics = resolve_selection(
        group_key=GROUP_KEY,
        category="cable",
        condition=CONDITION,
        candidates=candidates,
        selections={GROUP_KEY: FOREIGN_ID},
        electrical_variant_id=VARIANT_ID,
        catalog=_catalog(),
    )
    assert rejected is None
    assert rejected_source is SelectionSource.NONE
    assert mutable_json(rejected_diagnostics[0].issues[0]) == {
        "reason": "catalog_selection_not_in_group",
        "group_key": GROUP_KEY,
        "catalog_item_id": str(FOREIGN_ID),
        "category": "cable",
    }


def test_stale_selection_diagnostic_keeps_order_and_catalog_identity() -> None:
    diagnostic = stale_selection_diagnostic(stale_keys=("stale-z", "stale-a"), catalog=_catalog())

    assert diagnostic.code.value == "SPEC_ACCESSORY_SELECTION_REQUIRED"
    assert diagnostic.kind.value == "selection_required"
    assert diagnostic.message == "Сохранённый выбор относится к другой группе или версии каталога"
    assert tuple(mutable_json(item) for item in diagnostic.issues) == (
        {"group_key": "stale-z", "reason": "catalog_selection_stale_group"},
        {"group_key": "stale-a", "reason": "catalog_selection_stale_group"},
    )
    assert mutable_json(diagnostic.details) == {
        "catalog_id": str(CATALOG_ID),
        "catalog_version": "approved-v1",
        "payload_checksum": "sha256:" + "b" * 64,
    }


def test_candidate_fingerprints_are_exact_and_order_independent() -> None:
    assert (
        stable_group_key(
            electrical_variant_id=VARIANT_ID,
            category="cable",
            condition=CONDITION,
            object_type_section="pipe",
        )
        == "cg_10000000000000000000000000000001_63d1ec386730053a95faf170094c84a59911636a"
    )
    assert candidate_set_fingerprint((SECOND_ID, FIRST_ID)) == (
        "sha256:67b69ae1671c7a8a8a7a5c657c908a702ea0641586ff17cc9f132f791cb69c3e"
    )
    assert candidate_set_fingerprint(()) == (
        "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
    )
    assert stable_group_key(
        electrical_variant_id=VARIANT_ID,
        category="cable",
        condition=CONDITION,
        object_type_section="tank",
    ) != stable_group_key(
        electrical_variant_id=VARIANT_ID,
        category="cable",
        condition=CONDITION,
        object_type_section="pipe",
    )


def test_candidate_group_payload_is_complete_sorted_and_json_mutable() -> None:
    first = _candidate(FIRST_ID, "one")
    second = _candidate(SECOND_ID, "two")
    groups = (
        CandidateGroup(
            group_key="group-z",
            electrical_variant_id=VARIANT_ID,
            category="cable",
            object_type_section="pipe",
            condition=CONDITION,
            candidates=(second, first),
            selected_catalog_item_id=SECOND_ID,
            selection_source=SelectionSource.EXPLICIT,
            candidate_set_fingerprint="set-z",
        ),
        CandidateGroup(
            group_key="group-a",
            electrical_variant_id=VARIANT_ID,
            category="connection_kit",
            object_type_section=None,
            condition=TemperatureCondition(TemperatureGroup.LOW),
            candidates=(first,),
            selected_catalog_item_id=None,
            selection_source=SelectionSource.NONE,
            candidate_set_fingerprint="set-a",
        ),
    )

    assert mutable_json(candidate_groups_fingerprint_payload(groups)) == [
        {
            "group_key": "group-a",
            "category": "connection_kit",
            "conditions": {"temperature_group": "LOW"},
            "object_type_section": None,
            "candidate_ids": [str(FIRST_ID)],
            "selected_catalog_item_id": None,
        },
        {
            "group_key": "group-z",
            "category": "cable",
            "conditions": {"mark": "30ТТВ2-СР", "nomenclature_code": "001-002-002"},
            "object_type_section": "pipe",
            "candidate_ids": [str(FIRST_ID), str(SECOND_ID)],
            "selected_catalog_item_id": str(SECOND_ID),
        },
    ]


def test_candidate_order_uses_uuid_as_the_final_deterministic_tie_breaker() -> None:
    items = tuple(
        CandidateCatalogItem(
            id=item_id,
            category="sealant",
            name="Same",
            mark="Same",
            nomenclature_code="SAME",
            supply_unit="шт.",
            parameters=CatalogParameters(),
        )
        for item_id in (SECOND_ID, FIRST_ID)
    )
    catalog = CandidateCatalog(version=_catalog().version, items=items)

    assert [
        item.catalog_item_id
        for item in filter_candidates(
            catalog=catalog,
            category="sealant",
            condition=UniversalCondition(),
        )
    ] == [FIRST_ID, SECOND_ID]
