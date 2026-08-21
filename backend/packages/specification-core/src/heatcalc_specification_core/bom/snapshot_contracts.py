"""Typed immutable generation-snapshot contract."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from heatcalc_specification_core.bom.contracts import (
    CatalogIdentity,
    InputRevision,
    ResolvedOptions,
    SpecificationContribution,
)
from heatcalc_specification_core.json_types import mutable_json


@dataclass(frozen=True, slots=True)
class FormulaProvenance:
    formula_id: str
    formula_version: str
    formula_fingerprint: str


@dataclass(frozen=True, slots=True)
class CatalogSelectionSnapshot:
    catalog_item_id: UUID | None
    selection_source: str
    candidate_set_fingerprint: str | None
    candidate_count: int


@dataclass(frozen=True, slots=True)
class NormalizedObjectInput:
    object_id: UUID
    object_type_section: str
    cable_mark: str
    temperature_group: str
    section_count: int
    section_length_m: Decimal
    actual_installed_length_m: Decimal
    required_order_length_m: Decimal
    outer_diameter_mm: Decimal | None


@dataclass(frozen=True, slots=True)
class GenerationSnapshot:
    electrical_variant_id: UUID
    variant_updated_at: datetime
    resolved_options: ResolvedOptions
    settings_revision: int
    catalog: CatalogIdentity
    selections: Mapping[str, UUID]
    selected_catalog_item_ids: Mapping[str, UUID]
    formula_fingerprints: Mapping[str, str]
    formula_provenance: Mapping[str, FormulaProvenance]
    normalized_objects: tuple[NormalizedObjectInput, ...]
    input_revisions: tuple[InputRevision, ...]
    preflight_fingerprint_schema: str
    preflight_fingerprint: str
    excluded_unassigned_object_ids: tuple[UUID, ...]
    generated_at: datetime
    catalog_selections: Mapping[str, CatalogSelectionSnapshot]

    def to_dict(self) -> dict[str, object]:
        """Serialize exactly once at the application/persistence boundary."""
        options = _options_dict(self.resolved_options)
        return {
            "schema": "specification-generation",
            "schema_version": 1,
            "electrical_variant_id": str(self.electrical_variant_id),
            "variant_revision": {"updated_at": _datetime(self.variant_updated_at)},
            "resolved_options": options,
            "settings_revision": self.settings_revision,
            "catalog": _catalog_dict(self.catalog),
            "selections": {key: str(value) for key, value in self.selections.items()},
            "selected_catalog_item_ids": {
                key: str(value) for key, value in self.selected_catalog_item_ids.items()
            },
            "formula_fingerprints": dict(self.formula_fingerprints),
            "formula_provenance": {
                key: {
                    "formula_id": value.formula_id,
                    "formula_version": value.formula_version,
                    "formula_fingerprint": value.formula_fingerprint,
                }
                for key, value in self.formula_provenance.items()
            },
            "normalized_inputs": {
                "resolved_options": options,
                "objects": [_normalized_object(item) for item in self.normalized_objects],
            },
            "input_revisions": [_input_revision(item) for item in self.input_revisions],
            "preflight_fingerprint_schema": self.preflight_fingerprint_schema,
            "preflight_fingerprint": self.preflight_fingerprint,
            "excluded_unassigned_object_ids": [
                str(item) for item in sorted(self.excluded_unassigned_object_ids, key=str)
            ],
            "generated_at": self.generated_at.astimezone(UTC).isoformat(),
            "catalog_selections": {
                key: {
                    "catalog_item_id": (
                        str(value.catalog_item_id)
                        if value.catalog_item_id is not None
                        else None
                    ),
                    "selection_source": value.selection_source,
                    "candidate_set_fingerprint": value.candidate_set_fingerprint,
                    "candidate_count": value.candidate_count,
                }
                for key, value in self.catalog_selections.items()
            },
        }


def normalized_object(row: SpecificationContribution) -> NormalizedObjectInput:
    section = str(getattr(row.object_type_section, "value", row.object_type_section))
    return NormalizedObjectInput(
        object_id=row.object_id,
        object_type_section=section,
        cable_mark=row.cable_mark,
        temperature_group=row.temperature_group,
        section_count=row.section_count,
        section_length_m=row.section_length_m,
        actual_installed_length_m=row.actual_installed_length_m,
        required_order_length_m=row.required_order_length_m,
        outer_diameter_mm=row.outer_diameter_mm,
    )


def _options_dict(options: ResolvedOptions) -> dict[str, object]:
    return {
        "catalog_id": str(options.catalog_id),
        "catalog_version": options.catalog_version,
        "grouping_mode": str(getattr(options.grouping_mode, "value", options.grouping_mode)),
        "Ex": options.ex,
        "K1i": options.k1i,
        "K2i": options.k2i,
        "Kiu": options.kiu,
        "L_K2i_m": str(options.l_k2i_m),
        "R_gr": str(options.r_gr),
    }


def _catalog_dict(identity: CatalogIdentity) -> dict[str, object]:
    return {
        "id": str(identity.id),
        "catalog_key": identity.catalog_key,
        "version": identity.version,
        "source_checksum": identity.source_checksum,
        "payload_checksum": identity.payload_checksum,
        "schema_version": identity.schema_version,
    }


def _normalized_object(item: NormalizedObjectInput) -> dict[str, object]:
    result: dict[str, object] = {
        "object_id": str(item.object_id),
        "object_type_section": item.object_type_section,
        "cable_mark": item.cable_mark,
        "temperature_group": item.temperature_group,
        "section_plan": {
            "count": str(Decimal(item.section_count)),
            "length_m": str(item.section_length_m),
        },
        "layout": {
            "actual_installed_length_m": str(item.actual_installed_length_m),
            "required_order_length_m": str(item.required_order_length_m),
        },
    }
    if item.object_type_section == "pipe":
        if item.outer_diameter_mm is None:
            raise ValueError("pipe contribution requires outer_diameter_mm")
        result["outer_diameter_mm"] = str(item.outer_diameter_mm)
    return result


def _input_revision(value: InputRevision) -> dict[str, object]:
    result: dict[str, object] = {
        "object": {"id": str(value.object.id), "version": value.object.version},
        "excluded": value.excluded,
    }
    if value.assignment is not None:
        result["assignment"] = {
            "id": str(value.assignment.id),
            "version": value.assignment.version,
            "object_version_snapshot": value.assignment.object_version_snapshot,
            "state": value.assignment.state,
            "system_type": value.assignment.system_type,
        }
    if value.electrical_result is not None:
        result["electrical_result"] = {
            "id": str(value.electrical_result.id),
            "updated_at": _datetime(value.electrical_result.updated_at),
            "formula_version": value.electrical_result.formula_version,
            "formula_fingerprint": value.electrical_result.formula_fingerprint,
            "calculation_fingerprint": value.electrical_result.calculation_fingerprint,
            "object_version": value.electrical_result.object_version,
            "heat_result_version": value.electrical_result.heat_result_version,
            "assignment_version": value.electrical_result.assignment_version,
        }
    if value.section_plan_revision is not None:
        result["section_plan_revision"] = {
            "payload": mutable_json(value.section_plan_revision.payload),
            "calculation_fingerprint": (
                value.section_plan_revision.calculation_fingerprint
            ),
            "result_updated_at": (
                _datetime(value.section_plan_revision.result_updated_at)
                if value.section_plan_revision.result_updated_at is not None
                else None
            ),
        }
    return result


def _datetime(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("snapshot datetime must be timezone-aware")
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
