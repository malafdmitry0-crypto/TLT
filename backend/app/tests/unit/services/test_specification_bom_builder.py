"""Unit goldens for pure-ish specification BOM materializer (CANON-06)."""

from __future__ import annotations

import uuid
from decimal import Decimal
from types import SimpleNamespace
from typing import Any
from uuid import UUID

import pytest

from app.schemas.specification import (
    SpecificationCandidateGroup,
    SpecificationDiagnosticCode,
    SpecificationGroupingMode,
    SpecificationResolvedOptions,
)
from app.services.specification_bom_builder import (
    BomBuildFailure,
    BomBuildSuccess,
    materialize_specification_bom,
)


def _catalog_item(
    *,
    category: str,
    mark: str,
    code: str,
    name: str,
    unit: str = "шт.",
    applicability: dict[str, Any] | None = None,
    package_parameters: dict[str, Any] | None = None,
    formula_parameters: dict[str, Any] | None = None,
    item_id: UUID | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=item_id or uuid.uuid4(),
        item_key=f"{category}:{mark}",
        category=category,
        name=name,
        mark=mark,
        nomenclature_code=code,
        supply_unit=unit,
        applicability=applicability or {},
        package_parameters=package_parameters or {},
        formula_parameters=formula_parameters or {},
    )


def _catalog(items: list[Any]) -> SimpleNamespace:
    version = SimpleNamespace(
        id=uuid.uuid4(),
        catalog_key="test-catalog",
        version="v1",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=f"sha256:{'b' * 64}",
        schema_version=1,
    )
    return SimpleNamespace(version=version, items=tuple(items))


def _options() -> SpecificationResolvedOptions:
    return SpecificationResolvedOptions.model_validate(
        {
            "catalog_id": "test-catalog",
            "catalog_version": "v1",
            "grouping_mode": SpecificationGroupingMode.SEPARATE_BY_OBJECT_TYPE,
            "Ex": False,
            "K1i": False,
            "K2i": False,
            "Kiu": False,
            "L_K2i_m": "0",
            "R_gr": "1",
        }
    )


def _group(
    *,
    electrical_variant_id: UUID,
    category: str,
    selected: UUID,
    conditions: dict[str, Any] | None = None,
) -> SpecificationCandidateGroup:
    return SpecificationCandidateGroup(
        group_key=f"{category}:{uuid.uuid4().hex[:8]}",
        electrical_variant_id=electrical_variant_id,
        category=category,
        conditions=conditions or {},
        candidates=[],
        selected_catalog_item_id=selected,
    )


def _result(
    *,
    mark: str = "30ТТВ2-СР",
    temp: str = "high",
    section_count: int = 9,
    section_length: float = 81.0,
    actual: float = 729.0,
    order: float = 801.9,
    object_id: str | None = None,
) -> dict[str, Any]:
    return {
        "object_id": object_id or str(uuid.uuid4()),
        "cable_type": "self_regulating_tt",
        "cable_mark": mark,
        "cable": {"mark": mark, "nomenclature_code": "001-002-002"},
        "temperature_group": temp,
        "section_plan": {"count": section_count, "length_m": section_length},
        "layout": {
            "actual_installed_length_m": actual,
            "required_order_length_m": order,
        },
    }


def _fixture_catalog_and_groups(
    variant_id: UUID,
) -> tuple[SimpleNamespace, list[SpecificationCandidateGroup], dict[str, UUID]]:
    cable = _catalog_item(
        category="cable",
        mark="30ТТВ2-СР",
        code="001-002-002",
        name="Греющий кабель",
        unit="м",
    )
    connection = _catalog_item(
        category="connection_kit",
        mark="КСВ-2",
        code="001-005-002",
        name="Соединительный комплект",
        applicability={"temperature_group": "MEDIUM_HIGH"},
        package_parameters={"sections_per_kit": "2"},
    )
    repair = _catalog_item(
        category="repair_kit",
        mark="КСР-2",
        code="001-006-002",
        name="Ремонтный комплект",
        applicability={"temperature_group": "MEDIUM_HIGH"},
        package_parameters={"cable_length_per_kit_m": "150"},
    )
    sealant = _catalog_item(
        category="sealant",
        mark="TEST-SEALANT",
        code="TEST-003-001",
        name="Клей-герметик",
        package_parameters={"kits_per_sealant_unit": "7"},
    )
    fiberglass = _catalog_item(
        category="fiberglass_tape",
        mark="ЛКВ 12",
        code="TEST-004-002",
        name="Стекловолоконная лента",
        unit="катушка",
        applicability={"temperature_group": "MEDIUM_HIGH"},
        package_parameters={"reel_length_m": "30"},
    )
    aluminium = _catalog_item(
        category="aluminium_tape",
        mark="TEST-ALUMINIUM",
        code="TEST-005-001",
        name="Алюминиевая лента",
        unit="катушка",
        package_parameters={"reel_length_m": "50"},
        formula_parameters={"consumption_m_per_cable_m": "1"},
    )
    box = _catalog_item(
        category="box",
        mark="СКВ 1201",
        code="002-001-001",
        name="Соединительная коробка",
        applicability={
            "d_ge_57": "unused",
            "K1i": "unused",
            "K2i": "unused",
            "Kiu": "unused",
            "L_sec_ge_L_K2i": "unused",
            "N_sec_ge_3": "unused",
            "Ex": "unused",
            "R_gr": "unused",
        },
        formula_parameters={
            "section_divider": "3",
            "rounding_mode": "up",
            "min_quantity": "1",
        },
    )
    catalog = _catalog([cable, connection, repair, sealant, fiberglass, aluminium, box])
    groups = [
        _group(
            electrical_variant_id=variant_id,
            category="cable",
            selected=cable.id,
            conditions={"mark": "30ТТВ2-СР"},
        ),
        _group(
            electrical_variant_id=variant_id,
            category="connection_kit",
            selected=connection.id,
            conditions={"temperature_group": "MEDIUM_HIGH"},
        ),
        _group(
            electrical_variant_id=variant_id,
            category="repair_kit",
            selected=repair.id,
            conditions={"temperature_group": "MEDIUM_HIGH"},
        ),
        _group(
            electrical_variant_id=variant_id,
            category="sealant",
            selected=sealant.id,
        ),
        _group(
            electrical_variant_id=variant_id,
            category="fiberglass_tape",
            selected=fiberglass.id,
            conditions={"temperature_group": "MEDIUM_HIGH"},
        ),
        _group(
            electrical_variant_id=variant_id,
            category="aluminium_tape",
            selected=aluminium.id,
        ),
    ]
    ids = {
        "cable": cable.id,
        "connection": connection.id,
        "repair": repair.id,
        "sealant": sealant.id,
        "fiberglass": fiberglass.id,
        "aluminium": aluminium.id,
        "box": box.id,
    }
    return catalog, groups, ids


class TestBomBuilderGoldens:
    def test_connection_repair_sealant_aluminium_goldens(self) -> None:
        """ceil(9/2)=5, ceil(729/150)=5, ceil((5+5)/7)=2, ceil(729/50)=15."""
        variant_id = uuid.uuid4()
        object_id = str(uuid.uuid4())
        catalog, groups, ids = _fixture_catalog_and_groups(variant_id)
        result = _result(object_id=object_id, section_count=9, actual=729.0, order=801.9)
        objects = {
            object_id: {
                "object_type": "pipe",
                "outer_diameter": 0.108,
            }
        }

        bom = materialize_specification_bom(
            electrical_variant_id=variant_id,
            contributing_results=[result],
            objects_by_id=objects,
            catalog=catalog,  # type: ignore[arg-type]
            candidate_groups=groups,
            resolved_options=_options(),
            preflight_fingerprint=f"sha256:{'1' * 64}",
        )
        assert isinstance(bom, BomBuildSuccess)
        by_category = {item.category: item for item in bom.items}

        assert by_category["cable"].quantity == Decimal("801.9")
        assert by_category["cable"].article == "001-002-002"
        assert by_category["cable"].source == "auto"

        assert by_category["connection_kit"].quantity == Decimal("5")
        assert by_category["repair_kit"].quantity == Decimal("5")
        assert by_category["sealant"].quantity == Decimal("2")
        assert by_category["aluminium_tape"].quantity == Decimal("15")
        assert by_category["fiberglass_tape"].quantity > 0
        assert by_category["box"].quantity >= 1

        assert bom.snapshot["schema"] == "specification-generation"
        assert bom.snapshot["schema_version"] == 1
        assert bom.snapshot["electrical_variant_id"] == str(variant_id)
        assert "formula_fingerprints" in bom.snapshot
        assert bom.snapshot["preflight_fingerprint"] == f"sha256:{'1' * 64}"

    def test_missing_selection_is_blocking_no_partial(self) -> None:
        variant_id = uuid.uuid4()
        catalog, groups, _ids = _fixture_catalog_and_groups(variant_id)
        # Drop selection on connection kit.
        groups[1] = groups[1].model_copy(update={"selected_catalog_item_id": None})
        object_id = str(uuid.uuid4())
        bom = materialize_specification_bom(
            electrical_variant_id=variant_id,
            contributing_results=[_result(object_id=object_id)],
            objects_by_id={object_id: {"object_type": "pipe", "outer_diameter": 0.108}},
            catalog=catalog,  # type: ignore[arg-type]
            candidate_groups=groups,
            resolved_options=_options(),
        )
        assert isinstance(bom, BomBuildFailure)
        assert bom.diagnostics[0].code is SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED

    def test_box_matrix_missing_ex_rgr_is_blocking(self) -> None:
        variant_id = uuid.uuid4()
        catalog, groups, ids = _fixture_catalog_and_groups(variant_id)
        # Replace box with incomplete Ex/R_gr (None).
        bad_box = _catalog_item(
            category="box",
            mark="BAD BOX",
            code="002-999-001",
            name="Bad box",
            applicability={
                "d_ge_57": "unused",
                "K1i": "unused",
                "K2i": "unused",
                "Kiu": "unused",
                "L_sec_ge_L_K2i": "unused",
                "N_sec_ge_3": "unused",
                # Ex / R_gr intentionally missing
            },
            formula_parameters={
                "section_divider": "3",
                "rounding_mode": "up",
                "min_quantity": "1",
            },
            item_id=ids["box"],
        )
        items = [item for item in catalog.items if item.category != "box"] + [bad_box]
        catalog = _catalog(items)
        object_id = str(uuid.uuid4())
        bom = materialize_specification_bom(
            electrical_variant_id=variant_id,
            contributing_results=[_result(object_id=object_id)],
            objects_by_id={object_id: {"object_type": "pipe", "outer_diameter": 0.108}},
            catalog=catalog,  # type: ignore[arg-type]
            candidate_groups=groups,
            resolved_options=_options(),
        )
        assert isinstance(bom, BomBuildFailure)
        assert bom.diagnostics[0].code is SpecificationDiagnosticCode.BOX_EX_RGR_MATRIX_MISSING
