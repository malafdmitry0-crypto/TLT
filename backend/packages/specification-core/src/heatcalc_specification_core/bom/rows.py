"""BOM row construction shared by material stages."""

from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal
from uuid import UUID

from heatcalc_specification_core.bom.contracts import BomItem, CatalogItem

FORMULA_FINGERPRINTS: dict[str, str] = {
    "cable": "specification-calculators/cable@v1",
    "connection_kit": "specification-calculators/connection_kit@v1",
    "repair_kit": "specification-calculators/repair_kit@v1",
    "sealant": "specification-calculators/sealant@v1",
    "fiberglass_tape": "specification-calculators/fiberglass_tape@v1",
    "aluminium_tape": "specification-calculators/aluminium_tape@v1",
    "box": "specification-calculators/boxes@v1",
}


def item_from_catalog(
    item: CatalogItem,
    *,
    quantity: Decimal,
    catalog_id: UUID,
    catalog_version: str,
    electrical_variant_id: UUID,
    object_type_section: str,
    extra_params: Mapping[str, object] | None = None,
) -> BomItem:
    params: dict[str, object] = {
        "catalog_id": str(catalog_id),
        "catalog_version": catalog_version,
        "catalog_item_id": str(item.id),
        "mark": item.mark,
        "item_key": item.item_key,
        "nomenclature_code": item.nomenclature_code,
        "supply_unit": item.supply_unit,
        "object_type_section": object_type_section,
        "electrical_variant_id": str(electrical_variant_id),
    }
    if extra_params:
        params.update(extra_params)
    return BomItem(
        category=item.category,
        name=item.name,
        article=item.nomenclature_code,
        unit=item.supply_unit,
        quantity=quantity,
        params=params,
    )


def formula_provenance(identity: str) -> dict[str, str]:
    formula_id, separator, version = identity.rpartition("@")
    if not separator or not formula_id or not version:
        raise ValueError(f"invalid formula identity: {identity!r}")
    return {
        "formula_id": formula_id,
        "formula_version": version,
        "formula_fingerprint": identity,
    }
