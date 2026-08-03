"""Complete in-memory catalog used only by backend tests."""

from __future__ import annotations

from app.schemas.specification_catalog import SpecificationCatalogItemInput

_CABLES = [
    ("10ТТН2-СТ", "001-001-001"),
    ("17ТТН2-СТ", "001-001-002"),
    ("25ТТН2-СТ", "001-001-003"),
    ("31ТТН2-СТ", "001-001-004"),
    ("10ТТН2-СР", "001-001-005"),
    ("17ТТН2-СР", "001-001-006"),
    ("25ТТН2-СР", "001-001-007"),
    ("31ТТН2-СР", "001-001-008"),
    ("15ТТВ2-СР", "001-002-001"),
    ("30ТТВ2-СР", "001-002-002"),
    ("45ТТВ2-СР", "001-002-003"),
    ("60ТТВ2-СР", "001-002-004"),
    ("15ТТХ2-СР", "001-003-001"),
    ("30ТТХ2-СР", "001-003-002"),
    ("45ТТХ2-СР", "001-003-003"),
    ("60ТТХ2-СР", "001-003-004"),
    ("75ТТХ2-СР", "001-003-005"),
    ("90ТТХ2-СР", "001-003-006"),
]
_CONNECTION_KITS = [
    ("КСН-1", "001-004-001", "LOW", "1"),
    ("КСН-2", "001-004-002", "LOW", "2"),
    ("КСВ-1", "001-005-001", "MEDIUM_HIGH", "1"),
    ("КСВ-2", "001-005-002", "MEDIUM_HIGH", "2"),
]
_REPAIR_KITS = [
    ("КСР-1", "001-006-001", "LOW"),
    ("КСР-2", "001-006-002", "MEDIUM_HIGH"),
]
_BOXES = [
    ("СКВ 1201", "002-001-001", "3", "up"),
    ("СКВ 1202", "002-001-002", "3", "up"),
    ("СКВ 1201-С", "002-001-003", "3", "up"),
    ("СКВ 1201-С1", "002-001-004", "1", "up"),
    ("СКВ 1202-С", "002-001-005", "1", "up"),
    ("СКВ 1202-С1", "002-001-006", "1", "up"),
    ("СКВ 1601", "002-001-007", "3", "down"),
    ("СКВ 1602", "002-001-008", "3", "down"),
    ("СКВ 1601-С", "002-001-009", "3", "up"),
    ("СКВ 1601-С1", "002-001-010", "3", "up"),
    ("СКВ 1602-С", "002-001-011", "3", "up"),
    ("СКВ 1602-С1", "002-001-012", "3", "up"),
]


def complete_specification_catalog_items() -> list[SpecificationCatalogItemInput]:
    """Return a complete approved-shape catalog without seeding production data."""

    items: list[SpecificationCatalogItemInput] = []
    for mark, code in _CABLES:
        items.append(
            SpecificationCatalogItemInput(
                item_key=f"cable:{mark}",
                category="cable",
                name="Греющий кабель",
                mark=mark,
                nomenclature_code=code,
                supply_unit="м",
                source_ref="normalized backend test fixture",
            )
        )
    for mark, code, temperature_group, capacity in _CONNECTION_KITS:
        items.append(
            SpecificationCatalogItemInput(
                item_key=f"connection:{mark}",
                category="connection_kit",
                name="Соединительный комплект",
                mark=mark,
                nomenclature_code=code,
                supply_unit="шт.",
                applicability={"temperature_group": temperature_group},
                package_parameters={"sections_per_kit": capacity},
                source_ref="normalized backend test fixture",
            )
        )
    for mark, code, temperature_group in _REPAIR_KITS:
        items.append(
            SpecificationCatalogItemInput(
                item_key=f"repair:{mark}",
                category="repair_kit",
                name="Ремонтный комплект",
                mark=mark,
                nomenclature_code=code,
                supply_unit="шт.",
                applicability={"temperature_group": temperature_group},
                package_parameters={"cable_length_per_kit_m": "150"},
                source_ref="normalized backend test fixture",
            )
        )
    items.extend(
        [
            SpecificationCatalogItemInput(
                item_key="sealant:test-approved",
                category="sealant",
                name="Клей-герметик",
                mark="TEST-SEALANT",
                nomenclature_code="TEST-003-001",
                supply_unit="шт.",
                package_parameters={"kits_per_sealant_unit": "7"},
                source_ref="normalized backend test fixture",
            ),
            SpecificationCatalogItemInput(
                item_key="fiberglass:low",
                category="fiberglass_tape",
                name="Стекловолоконная лента",
                mark="ЛКС 12",
                nomenclature_code="TEST-004-001",
                supply_unit="катушка",
                applicability={"temperature_group": "LOW"},
                package_parameters={"reel_length_m": "30"},
                source_ref="normalized backend test fixture",
            ),
            SpecificationCatalogItemInput(
                item_key="fiberglass:medium-high",
                category="fiberglass_tape",
                name="Стекловолоконная лента",
                mark="ЛКВ 12",
                nomenclature_code="TEST-004-002",
                supply_unit="катушка",
                applicability={"temperature_group": "MEDIUM_HIGH"},
                package_parameters={"reel_length_m": "30"},
                source_ref="normalized backend test fixture",
            ),
            SpecificationCatalogItemInput(
                item_key="aluminium:test-approved",
                category="aluminium_tape",
                name="Алюминиевая лента",
                mark="TEST-ALUMINIUM",
                nomenclature_code="TEST-005-001",
                supply_unit="катушка",
                package_parameters={"reel_length_m": "50"},
                formula_parameters={"consumption_m_per_cable_m": "1"},
                source_ref="normalized backend test fixture",
            ),
        ]
    )
    box_conditions = {
        "d_ge_57": "unused",
        "K1i": "unused",
        "K2i": "unused",
        "Kiu": "unused",
        "L_sec_ge_L_K2i": "unused",
        "N_sec_ge_3": "unused",
        "Ex": "unused",
        "R_gr": "unused",
    }
    for mark, code, divider, rounding_mode in _BOXES:
        items.append(
            SpecificationCatalogItemInput(
                item_key=f"box:{mark}",
                category="box",
                name="Соединительная коробка",
                mark=mark,
                nomenclature_code=code,
                supply_unit="шт.",
                applicability=dict(box_conditions),
                formula_parameters={
                    "section_divider": divider,
                    "rounding_mode": rounding_mode,
                    "min_quantity": "1",
                },
                source_ref="normalized backend test fixture",
            )
        )
    return items
