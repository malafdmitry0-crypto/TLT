"""Pure orchestration for one resolved self-regulating TT calculation."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Protocol

from heatcalc_electrical_core import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
    PipeLayout,
    TankLayout,
    TTFormulaDomainError,
    TTPreparationInput,
)
from heatcalc_electrical_core import (
    run_tt_formula as run_tt_formula,
)

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.catalog_preparation import prepare_tt_catalog_bundle
from app.formulas.electrical.decimal_math import SIX_PLACES, decimal_value, round_result
from app.formulas.electrical.outcome_errors import (
    raise_electrical_formula_domain_error,
    raise_electrical_formula_report,
)
from app.schemas.electrical_inputs import ResolvedElectricalInputs

ELECTRICAL_POWER_CATALOG_PROVISIONAL = "ELECTRICAL_POWER_CATALOG_PROVISIONAL"
# DEC-19: исполнение выбрано правилом по умолчанию («-СТ»), а не пользователем.
ELECTRICAL_EXECUTION_DEFAULTED = "ELECTRICAL_EXECUTION_DEFAULTED"
_PRODUCTION_CATALOG_STATUSES = {
    "power": {"active"},
    "section": {"active", "registered"},
    "bom": {"active"},
}


class _SectionPlanSnapshot(Protocol):
    """Core section values retained in the legacy application snapshot."""

    @property
    def cold_start_temperature(self) -> Decimal: ...

    @property
    def l_max_m(self) -> Decimal: ...

    @property
    def i_st_ud_a_per_m(self) -> Decimal: ...


@dataclass(frozen=True, slots=True)
class PipeElectricalLayout:
    """Pipe-only layout contract for the shared TT physics pipeline."""


@dataclass(frozen=True, slots=True)
class TankElectricalLayout:
    """Tank-only layout contract; pipe winding fields cannot be represented."""

    shape: str
    heating_height_m: float
    laying_step_m: float
    base_length_m: float
    base_length_source: str
    input_sources: Mapping[str, str]


def _stable_hash(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _merged_snapshot(
    default: Mapping[str, Any], override: Mapping[str, Any] | None
) -> dict[str, Any]:
    return {**default, **dict(override or {})}


def _power_catalog_snapshot(
    cable_row: Mapping[str, Any],
    override: Mapping[str, Any] | None,
    *,
    catalog_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    default: dict[str, Any] = {
        "kind": "power",
        "payload_checksum": _stable_hash(catalog_rows),
    }
    default["row"] = dict(cable_row)
    return _merged_snapshot(default, override)


def _section_catalog_snapshot(
    plan: _SectionPlanSnapshot,
    base_model: str,
    override: Mapping[str, Any] | None,
) -> dict[str, Any]:
    row = {
        "base_model": base_model,
        "cold_start_temperature_c": float(plan.cold_start_temperature),
        "l_max_m": float(plan.l_max_m),
        "specific_start_current_a_per_m": float(plan.i_st_ud_a_per_m),
    }
    default = {
        "kind": "section",
        "row": row,
        "row_checksum": _stable_hash(row),
    }
    return _merged_snapshot(default, override)


def _bom_catalog_snapshot(
    bom_entry: Mapping[str, Any], override: Mapping[str, Any] | None
) -> dict[str, Any]:
    catalog = bom_entry.get("catalog")
    default = {
        **(dict(catalog) if isinstance(catalog, Mapping) else {}),
        "row": {key: value for key, value in bom_entry.items() if key != "catalog"},
    }
    return _merged_snapshot(default, override)


def _catalog_payload_rows(
    calculation_catalogs: Mapping[str, Mapping[str, Any]],
    kind: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    raw = calculation_catalogs.get(kind)
    if not isinstance(raw, Mapping):
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED",
            "Не зарегистрирован обязательный каталог электрического расчёта",
            details={"catalog_kind": kind},
            status_code=503,
        )
    payload = raw.get("payload")
    if not isinstance(payload, Mapping):
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED",
            "Активная версия каталога не содержит расчётный payload",
            details={"catalog_kind": kind, "catalog_id": raw.get("id")},
            status_code=503,
        )
    key = "entries" if kind == "bom" else "rows"
    rows = payload.get(key)
    if kind == "power" and rows is None:
        rows = payload.get("cables")
    if not isinstance(rows, list) or not rows:
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED",
            "Активная версия каталога не содержит расчётные строки",
            details={"catalog_kind": kind, "catalog_id": raw.get("id")},
            status_code=503,
        )
    normalized = [dict(row) for row in rows if isinstance(row, Mapping)]
    if len(normalized) != len(rows):
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "Каталог содержит строку неверного формата",
            details={"catalog_kind": kind, "catalog_id": raw.get("id")},
        )
    metadata = {key: value for key, value in raw.items() if key != "payload"}
    return normalized, metadata


def _exact_row(
    rows: list[dict[str, Any]],
    *,
    key: str,
    value: str,
) -> dict[str, Any] | None:
    normalized = "".join(value.split()).upper()
    return next(
        (row for row in rows if "".join(str(row.get(key) or "").split()).upper() == normalized),
        None,
    )


def electrical_tt_catalog_eligibility(
    catalogs: Mapping[str, Any],
) -> tuple[bool, list[dict[str, Any]]]:
    """Return fail-closed status for the three immutable TT catalog snapshots."""
    invalid: list[dict[str, Any]] = []
    for kind, allowed_statuses in _PRODUCTION_CATALOG_STATUSES.items():
        raw = catalogs.get(kind)
        catalog = raw if isinstance(raw, Mapping) else {}
        status = catalog.get("status")
        checksum = catalog.get("source_checksum") or catalog.get("payload_checksum")
        authority = str(catalog.get("authority") or "").strip().lower()
        if status not in allowed_statuses or authority != "database" or not checksum:
            invalid.append(
                {
                    "kind": kind,
                    "status": status,
                    "version": catalog.get("version"),
                    "checksum": checksum,
                }
            )
    return not invalid, invalid


def _assert_catalog_snapshot_identity(catalogs: Mapping[str, Any]) -> None:
    """Retain the former final-gate metadata rule in the application adapter.

    The standalone core intentionally sees raw engineering rows only. Version
    and checksum authority therefore remain an application responsibility.
    """
    for kind in ("power", "section", "bom"):
        catalog = catalogs.get(kind)
        if not isinstance(catalog, Mapping):
            raise ElectricalFormulaError(
                "ELECTRICAL_FINAL_GATE_FAILED",
                f"Отсутствует snapshot каталога {kind}",
                details={"check": "catalog_missing", "left": kind, "right": None},
            )
        checksum = catalog.get("source_checksum") or catalog.get("payload_checksum")
        version = catalog.get("version")
        if not (isinstance(checksum, str) and checksum.strip()) and not (
            isinstance(version, str) and version.strip()
        ):
            raise ElectricalFormulaError(
                "ELECTRICAL_FINAL_GATE_FAILED",
                f"Каталог {kind} без version/checksum",
                details={"check": "catalog_identity", "left": kind, "right": None},
            )


def calculate_electrical_tt(
    resolved: ResolvedElectricalInputs,
    *,
    layout: PipeElectricalLayout | TankElectricalLayout,
    provenance: Mapping[str, Any] | None = None,
    calculation_catalogs: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Calculate cable, winding, equal sections, BOM identity and provenance.

    ``resolved`` is the only engineering input. Optional ``provenance`` supplies
    immutable object/Heat snapshots. ``calculation_catalogs`` contains the
    versioned DB payloads that are the sole power/section/BOM authority.
    """
    values = resolved.values
    if isinstance(layout, TankElectricalLayout) and (
        values.winding_pitch_mm is not None or values.outer_diameter_mm is not None
    ):
        raise ElectricalFormulaError(
            "ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED",
            "Tank layout does not accept pipe winding inputs",
        )
    source_provenance = dict(provenance or {})
    power_rows, power_metadata = _catalog_payload_rows(calculation_catalogs, "power")
    section_rows, section_metadata = _catalog_payload_rows(calculation_catalogs, "section")
    bom_rows, bom_metadata = _catalog_payload_rows(calculation_catalogs, "bom")

    catalog_bundle = prepare_tt_catalog_bundle(
        power_rows=power_rows,
        section_rows=section_rows,
        bom_rows=bom_rows,
    )

    core_layout: PipeLayout | TankLayout = (
        PipeLayout(
            base_length_m=values.base_length_m,
            outer_diameter_mm=values.outer_diameter_mm,
            winding_pitch_mm=values.winding_pitch_mm,
        )
        if isinstance(layout, PipeElectricalLayout)
        else TankLayout(base_length_m=values.base_length_m)
    )
    preparation = TTPreparationInput(
        required_power_per_meter_w=values.heat_loss_per_meter_w,
        product_temperature_c=values.product_temperature_c,
        ambient_temperature_c=values.ambient_temperature_c,
        supply_voltage_v=values.nominal_voltage_v,
        safety_factor=values.safety_factor,
        cold_start_temperature_c=values.cold_start_temperature_c,
        layout=core_layout,
        catalogs=catalog_bundle,
        max_start_current_per_section_a=values.max_section_start_current_a,
        max_start_current_source=resolved.sources.get("max_section_start_current_a")
        or "manual_input",
        number_of_threads=values.thread_count,
        manual_cable_mark=values.manual_cable_model,
        selection_policy=values.selection_policy,
    )
    try:
        outcome = run_tt_formula(preparation)
    except TTFormulaDomainError as error:
        raise_electrical_formula_domain_error(error)
        raise AssertionError("core domain error mapping must raise") from error
    if not outcome.is_success:
        raise_electrical_formula_report(outcome.report)
        raise AssertionError("blocking core outcome must raise")
    formula_result = outcome.result
    if formula_result is None:  # pragma: no cover - protected by TTFormulaOutcome invariant
        raise AssertionError("successful core outcome must contain a result")

    selected_model = formula_result.selected_cable
    cable_row = _exact_row(power_rows, key="model", value=selected_model)
    if cable_row is None:  # defensive: the formula selected from this exact catalog
        raise ElectricalFormulaError(
            "ELECTRICAL_CABLE_NOT_FOUND", "Выбранная модель отсутствует в power-каталоге"
        )
    power_exact = formula_result.power_per_meter_w
    plan = formula_result.section_plan
    bom_entry = _exact_row(bom_rows, key="full_mark", value=formula_result.cable_mark)
    if bom_entry is None or not str(bom_entry.get("nomenclature_code") or "").strip():
        raise ElectricalFormulaError(
            "SPEC_CABLE_NOMENCLATURE_MISSING",
            "Для полного маркоразмера отсутствует точная BOM-позиция",
            details={"full_mark": formula_result.cable_mark},
        )

    power_catalog = _power_catalog_snapshot(
        cable_row,
        power_metadata,
        catalog_rows=power_rows,
    )
    section_catalog = _section_catalog_snapshot(
        plan,
        selected_model,
        section_metadata,
    )
    bom_catalog = _bom_catalog_snapshot(bom_entry, bom_metadata)
    catalogs = {
        "power": power_catalog,
        "section": section_catalog,
        "bom": bom_catalog,
    }
    _assert_catalog_snapshot_identity(catalogs)
    catalog_production_eligible, _invalid_catalogs = electrical_tt_catalog_eligibility(catalogs)
    warnings = list(resolved.warnings)
    if not catalog_production_eligible:
        warnings.append(ELECTRICAL_POWER_CATALOG_PROVISIONAL)
    if formula_result.execution_defaulted:
        warnings.append(ELECTRICAL_EXECUTION_DEFAULTED)
    warnings = list(dict.fromkeys(warnings))
    production_eligible = resolved.production_eligible and catalog_production_eligible
    resolved_values = values.model_dump(mode="json")
    if values.max_section_start_current_a is None:
        resolved_values["max_section_start_current_a"] = str(decimal_value(plan.i_dop_a))
    applied_input_sources = dict(resolved.sources)
    applied_input_sources["max_section_start_current_a"] = plan.i_dop_source
    calculation_fingerprint = _stable_hash(
        {
            "formula": ELECTRICAL_TT_FORMULA_FINGERPRINT,
            "inputs": resolved_values,
            "input_sources": applied_input_sources,
            "source_provenance": source_provenance,
            "power_catalog": power_catalog,
            "section_catalog": section_catalog,
            "bom_catalog": bom_catalog,
        }
    )
    suffix = formula_result.cable_mark.rsplit("-", 1)[-1]
    sections = [
        {
            "index": index + 1,
            "length_m": float(section.length_m),
            "power_w": float(section.power_w),
            "start_current_a": float(section.start_current_a),
            "working_current_a": float(section.working_current_a),
            "voltage_v": float(section.voltage_v),
        }
        for index, section in enumerate(formula_result.equal_sections)
    ]
    applied_threads = formula_result.num_circuits
    winding_factor = formula_result.winding_factor
    required_power = formula_result.required_power_per_meter_w
    installed_power = formula_result.installed_power_per_meter_w

    layout_result: dict[str, Any] = {
        "requested_threads": values.thread_count,
        "threads": applied_threads,
        "thread_selection_source": (
            "manual"
            if values.thread_count is not None
            else "manual_default"
            if values.manual_cable_model
            else "auto"
        ),
        "winding_factor": float(round_result(winding_factor, SIX_PLACES)),
        "required_installed_length_m": float(formula_result.required_cable_length_m),
        "actual_installed_length_m": float(plan.l_fact_m),
        "excess_installed_length_m": float(plan.l_excess_m),
        "required_order_length_m": float(plan.order_cable_length_m),
    }
    if isinstance(layout, PipeElectricalLayout):
        layout_result["winding_pitch_mm"] = (
            float(values.winding_pitch_mm) if values.winding_pitch_mm is not None else None
        )
    else:
        layout_result["tank"] = {
            "shape": layout.shape,
            "heating_height_m": layout.heating_height_m,
            "laying_step_m": layout.laying_step_m,
            "base_length_m": layout.base_length_m,
            "base_length_source": layout.base_length_source,
            "input_sources": dict(layout.input_sources),
        }

    result = {
        "status": "ready",
        "inputs": resolved_values,
        "cable": {
            "type": "self_regulating_tt",
            "series": formula_result.series,
            "base_model": formula_result.selected_cable,
            "mark": formula_result.cable_mark,
            "suffix": suffix,
            "nomenclature_code": bom_entry["nomenclature_code"],
            "passport_power_w_per_m": float(round_result(power_exact)),
            "selection_source": "manual" if values.manual_cable_model else "auto",
            "execution_source": (
                "manual"
                if values.manual_cable_model
                else "default"
                if formula_result.execution_defaulted
                else "single"
            ),
            "selection_policy": values.selection_policy,
        },
        "layout": layout_result,
        "section_plan": {
            "count": plan.section_count,
            "length_m": float(plan.section_length_m),
            "l_max_m": float(plan.l_max_m),
            "l_tok_m": float(plan.l_tok_m),
            "l_ogr_m": float(plan.l_ogr_m),
            "max_start_current_a": float(plan.i_dop_a),
            "max_start_current_source": plan.i_dop_source,
            "specific_start_current_a_per_m": float(plan.i_st_ud_a_per_m),
            "start_current_per_section_a": float(plan.start_current_per_section_a),
            "working_current_per_section_a": float(plan.working_current_per_section_a),
            "power_per_section_w": float(plan.power_per_section_w),
            "items": sections,
        },
        "electrical": {
            "nominal_voltage_v": float(values.nominal_voltage_v),
            "required_power_per_meter_w": float(round_result(required_power)),
            "installed_power_per_meter_w": float(round_result(installed_power)),
            "total_power_w": float(plan.total_power_w),
            "working_current_a": float(plan.working_current_a),
            "start_current_a": float(plan.start_current_a),
        },
        "catalogs": catalogs,
        "provenance": {
            **{
                key: value
                for key, value in source_provenance.items()
                if key not in {"power_catalog", "section_catalog", "bom_catalog"}
            },
            "resolved_inputs": resolved_values,
            "input_sources": applied_input_sources,
            "section_current_limit": {
                "value_a": float(plan.i_dop_a),
                "source": plan.i_dop_source,
            },
            "mocked_fields": list(resolved.mocked_fields),
            "legacy_aliases": list(resolved.legacy_aliases),
            "warnings": warnings,
            "production_eligible": production_eligible,
            "system_voltage_v": float(values.nominal_voltage_v),
            "formula_version": ELECTRICAL_TT_FORMULA_VERSION,
            "formula_fingerprint": ELECTRICAL_TT_FORMULA_FINGERPRINT,
            "calculation_fingerprint": calculation_fingerprint,
            "catalogs": catalogs,
        },
        # Compatibility fields consumed by the current calculation/specification layer.
        "cable_type": "self_regulating_tt",
        "selected_cable": formula_result.selected_cable,
        "cable_model": formula_result.selected_cable,
        "cable_mark": formula_result.cable_mark,
        "nomenclature_code": bom_entry["nomenclature_code"],
        "series": formula_result.series,
        "temperature_group": formula_result.temperature_group,
        "num_circuits": applied_threads,
        "power_per_meter": float(round_result(power_exact)),
        "installed_power_per_meter": float(round_result(installed_power)),
        "cable_length": float(plan.l_fact_m),
        "installed_cable_length": float(plan.l_fact_m),
        "order_cable_length": float(plan.order_cable_length_m),
        "total_power": float(plan.total_power_w),
        "current": float(plan.working_current_a),
        "voltage": float(values.nominal_voltage_v),
        "winding_coefficient": float(round_result(winding_factor, SIX_PLACES)),
        "num_sections": plan.section_count,
        "section_count": plan.section_count,
        "section_length_m": float(plan.section_length_m),
        "section_l_max_m": float(plan.l_max_m),
        "section_l_tok_m": float(plan.l_tok_m),
        "section_l_ogr_m": float(plan.l_ogr_m),
        "section_l_fact_m": float(plan.l_fact_m),
        "section_l_excess_m": float(plan.l_excess_m),
        "section_start_current_a": float(plan.start_current_a),
        "section_working_current_a": float(plan.working_current_a),
        "section_power_w": float(plan.power_per_section_w),
        "sections": sections,
        "start_current": float(plan.start_current_a),
        "working_current": float(plan.working_current_a),
        "resolved_inputs": resolved_values,
        "input_sources": applied_input_sources,
        "mocked_fields": list(resolved.mocked_fields),
        "legacy_aliases": list(resolved.legacy_aliases),
        "warnings": warnings,
        "production_eligible": production_eligible,
    }
    if isinstance(layout, PipeElectricalLayout):
        result["winding_pitch"] = (
            float(values.winding_pitch_mm) if values.winding_pitch_mm is not None else 0.0
        )
    return result
