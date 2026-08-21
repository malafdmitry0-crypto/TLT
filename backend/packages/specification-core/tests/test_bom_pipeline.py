from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from heatcalc_specification_core.bom import (
    CandidateGroup,
    CatalogIdentity,
    CatalogItem,
    GenerationFailure,
    GenerationInput,
    GenerationSuccess,
    ObjectTypeSection,
    ResolvedOptions,
    RevisionContext,
    SelectionSource,
    SpecificationCatalog,
    SpecificationContribution,
    run_specification,
)
from heatcalc_specification_core.bom.selections import candidate_set_fingerprint
from heatcalc_specification_core.catalog_conditions import not_applicable

VARIANT_ID = UUID("00000000-0000-0000-0000-000000000101")
CATALOG_ID = UUID("00000000-0000-0000-0000-000000000201")
OBJECT_ID = UUID("00000000-0000-0000-0000-000000000301")


def _item(
    number: int,
    category: str,
    mark: str,
    code: str,
    *,
    applicability: dict[str, object] | None = None,
    package: dict[str, object] | None = None,
    formula: dict[str, object] | None = None,
    unit: str = "шт.",
) -> CatalogItem:
    return CatalogItem(
        id=UUID(f"00000000-0000-0000-0000-{number:012d}"),
        item_key=f"item-{number}",
        category=category,
        name=f"Item {number}",
        mark=mark,
        nomenclature_code=code,
        supply_unit=unit,
        applicability=applicability or {},
        package_parameters=package or {},
        formula_parameters=formula or {},
    )


def _catalog_and_groups() -> tuple[SpecificationCatalog, tuple[CandidateGroup, ...]]:
    owner = "SPEC-OWNER-EX-RGR/test"
    box_conditions = {
        name: not_applicable(f"{owner}/{name}")
        for name in (
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
    items = (
        _item(1, "cable", "30ТТВ2-СР", "001-002-002", unit="м"),
        _item(
            2,
            "connection_kit",
            "КСВ-2",
            "002-001-001",
            applicability={"temperature_group": "MEDIUM_HIGH"},
            package={"sections_per_kit": "2"},
        ),
        _item(
            3,
            "repair_kit",
            "РК",
            "003-001-001",
            applicability={"temperature_group": "MEDIUM_HIGH"},
            package={"cable_length_per_kit_m": "150"},
        ),
        _item(4, "sealant", "Г", "004-001-001", package={"kits_per_sealant_unit": "7"}),
        _item(
            5,
            "fiberglass_tape",
            "СЛ",
            "005-001-001",
            applicability={"temperature_group": "MEDIUM_HIGH"},
            package={"reel_length_m": "30"},
        ),
        _item(
            6,
            "aluminium_tape",
            "АЛ",
            "006-001-001",
            package={"reel_length_m": "50"},
            formula={"consumption_m_per_cable_m": "1"},
        ),
        _item(
            7,
            "box",
            "BOX",
            "007-001-001",
            applicability=box_conditions,
            formula={"section_divider": "3", "rounding_mode": "up", "min_quantity": "1"},
        ),
    )
    catalog = SpecificationCatalog(
        identity=CatalogIdentity(
            id=CATALOG_ID,
            catalog_key="test-catalog",
            version="v1",
            source_checksum=f"sha256:{'a' * 64}",
            payload_checksum=f"sha256:{'b' * 64}",
            schema_version=1,
        ),
        items=items,
    )
    groups = tuple(_group(index, item) for index, item in enumerate(items[:-1], start=1))
    return catalog, groups


def _group(index: int, item: CatalogItem) -> CandidateGroup:
    digest = hashlib.sha256(f"group-{index}".encode()).hexdigest()[:40]
    candidates = (item.id,)
    return CandidateGroup(
        group_key=f"cg_{VARIANT_ID.hex}_{digest}",
        electrical_variant_id=VARIANT_ID,
        category=item.category,
        candidate_catalog_item_ids=candidates,
        selected_catalog_item_id=item.id,
        selection_source=SelectionSource.AUTO_SINGLE,
        candidate_set_fingerprint=candidate_set_fingerprint(candidates),
    )


def _input(*, groups: tuple[CandidateGroup, ...] | None = None) -> GenerationInput:
    catalog, default_groups = _catalog_and_groups()
    return GenerationInput(
        electrical_variant_id=VARIANT_ID,
        contributions=(
            SpecificationContribution(
                object_id=OBJECT_ID,
                object_type_section=ObjectTypeSection.PIPE,
                outer_diameter_mm=Decimal("108.000"),
                cable_mark="30ТТВ2-СР",
                nomenclature_code="001-002-002",
                temperature_group="MEDIUM_HIGH",
                section_count=9,
                section_length_m=Decimal("81.0"),
                actual_installed_length_m=Decimal("729.0"),
                required_order_length_m=Decimal("801.9"),
            ),
        ),
        catalog=catalog,
        candidate_groups=groups if groups is not None else default_groups,
        options=ResolvedOptions(
            catalog_id=CATALOG_ID,
            catalog_version="v1",
            grouping_mode="separate_by_object_type",
            ex=False,
            k1i=False,
            k2i=False,
            kiu=False,
            l_k2i_m=Decimal("0"),
            r_gr=Decimal("1"),
        ),
        revision_context=RevisionContext(
            variant_updated_at=datetime(2026, 1, 2, 3, 4, tzinfo=UTC),
            settings_revision=7,
            input_revisions=({"object": {"id": OBJECT_ID, "version": 4}},),
        ),
        preflight_fingerprint=f"sha256:{'1' * 64}",
        generated_at=datetime(2026, 1, 2, 3, 5, tzinfo=UTC),
    )


def test_full_pipeline_matches_existing_golden_quantities_and_snapshot() -> None:
    outcome = run_specification(_input())
    assert isinstance(outcome, GenerationSuccess)
    by_category = {item.category: item for item in outcome.items}
    assert by_category["cable"].quantity == Decimal("801.9")
    assert by_category["connection_kit"].quantity == Decimal("5")
    assert by_category["repair_kit"].quantity == Decimal("5")
    assert by_category["sealant"].quantity == Decimal("2")
    assert by_category["aluminium_tape"].quantity == Decimal("15")
    assert by_category["fiberglass_tape"].quantity > 0
    assert by_category["box"].quantity == Decimal("3")
    assert all(item.source == "auto" for item in outcome.items)

    snapshot = outcome.snapshot
    assert snapshot["schema"] == "specification-generation"
    assert snapshot["generated_at"] == "2026-01-02T03:05:00+00:00"
    assert snapshot["preflight_fingerprint"] == f"sha256:{'1' * 64}"
    assert snapshot["normalized_inputs"]["objects"][0]["outer_diameter_mm"] == "108.000"
    assert run_specification(_input()) == outcome


def test_missing_selection_is_fail_closed_without_partial_items() -> None:
    catalog, groups = _catalog_and_groups()
    del catalog
    changed = list(groups)
    changed[1] = CandidateGroup(
        group_key=changed[1].group_key,
        electrical_variant_id=VARIANT_ID,
        category=changed[1].category,
        candidate_catalog_item_ids=changed[1].candidate_catalog_item_ids,
        selected_catalog_item_id=None,
        candidate_set_fingerprint=changed[1].candidate_set_fingerprint,
    )
    outcome = run_specification(_input(groups=tuple(changed)))
    assert isinstance(outcome, GenerationFailure)
    assert outcome.diagnostics[0].code == "SPEC_ACCESSORY_SELECTION_REQUIRED"


def test_candidate_set_fingerprint_mismatch_is_fail_closed() -> None:
    _catalog_value, groups = _catalog_and_groups()
    changed = list(groups)
    changed[0] = CandidateGroup(
        group_key=changed[0].group_key,
        electrical_variant_id=VARIANT_ID,
        category=changed[0].category,
        candidate_catalog_item_ids=changed[0].candidate_catalog_item_ids,
        selected_catalog_item_id=changed[0].selected_catalog_item_id,
        candidate_set_fingerprint=f"sha256:{'f' * 64}",
    )
    outcome = run_specification(_input(groups=tuple(changed)))
    assert isinstance(outcome, GenerationFailure)
    assert outcome.diagnostics[0].issues[0]["reason"] == "candidate_set_fingerprint_mismatch"
