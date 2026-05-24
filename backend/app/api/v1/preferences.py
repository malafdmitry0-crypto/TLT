"""Endpoints пользовательских UI-настроек."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_employee
from app.generated.heatcalc_field_contract import (
    HEATCALC_FIELD_INPUT_FIELD_KEYS,
    HEATCALC_FIELD_INPUT_VERSION,
    HEATCALC_TABLE_COLUMN_KEYS,
    HEATCALC_TABLE_COLUMNS_VERSION,
)
from app.models.user_preference import UserPreference
from app.schemas.user_preference import UserPreferenceResponse, UserPreferenceUpdate

router = APIRouter()

HEATCALC_TABLE_COLUMNS_PREF_KEY = f"heatcalc.tableColumns.v{HEATCALC_TABLE_COLUMNS_VERSION}"
HEATCALC_TABLE_COLUMN_WIDTH_MIN = 3
HEATCALC_TABLE_COLUMN_WIDTH_MAX = 60
HEATCALC_TABLE_COLUMN_LAYOUT_KEYS = {"widthPct"}
HEATCALC_TABLE_VIEW_PREF_KEY = "heatcalc.tableView.v1"
HEATCALC_TABLE_VIEW_VERSION = 1
HEATCALC_TABLE_VIEW_KEYS = {
    "version",
    "fontSize",
    "tableLabelFormat",
    "settingsLabelFormat",
    "inlineEditingEnabled",
    "formPlacement",
    "sideFormWidthPct",
    "formSectionWeights",
}
HEATCALC_TABLE_VIEW_FONT_SIZES = {"compact", "standard", "comfortable", "large"}
TABLE_VIEW_LABEL_FORMATS = {"full", "short", "compact"}
HEATCALC_TABLE_VIEW_FORM_PLACEMENTS = {"top", "bottom", "left", "right"}
HEATCALC_TABLE_VIEW_SIDE_FORM_WIDTH_MIN = 22
HEATCALC_TABLE_VIEW_SIDE_FORM_WIDTH_MAX = 62
HEATCALC_FORM_SECTION_WEIGHT_COUNTS = {3, 4}
HEATCALC_FORM_SECTION_WEIGHT_MIN = 0.35
HEATCALC_FORM_SECTION_WEIGHT_MAX = 3
HEATCALC_FIELD_INPUT_PREF_KEY = "heatcalc.fieldInputs.v1"
HEATCALC_FIELD_INPUT_MAX_STEP = 1_000_000
HEATCALC_FIELD_INPUT_KEYS = {"version", "fields"}
HEATCALC_FIELD_INPUT_LAYOUT_KEYS = {"step"}
ELECTRICAL_TABLE_COLUMNS_VERSION = 5
ELECTRICAL_TABLE_COLUMNS_PREF_KEY = f"electrical.tableColumns.v{ELECTRICAL_TABLE_COLUMNS_VERSION}"
ELECTRICAL_TABLE_VIEW_PREF_KEY = "electrical.tableView.v4"
ELECTRICAL_TABLE_VIEW_VERSION = 4
ELECTRICAL_TABLE_VIEW_KEYS = {
    "version",
    "fontSize",
    "tableLabelFormat",
    "settingsLabelFormat",
    "calculationCableSource",
}
ELECTRICAL_CALCULATION_CABLE_SOURCES = {"builtin", "extended", "all"}
ELECTRICAL_TABLE_COLUMN_KEYS = {
    "index",
    "object_name",
    "object_type",
    "heat_loss_status",
    "electrical_status",
    "cable_type",
    "cable_mark",
    "cable_snapshot_status",
    "applied_selection_policy",
    "selection_reason",
    "winding_pitch_mm",
    "number_of_threads",
    "laying_step",
    "heating_height",
    "connection_type",
    "supply_voltage",
    "winding_coefficient",
    "vapor_temperature",
    "maintain_temperature",
    "aggressive_product",
    "installed_cable_length",
    "order_cable_length",
    "total_power",
    "current",
    "voltage",
    "price_per_meter",
    "required_order_length",
    "total_cost",
    "stock_status",
    "lead_time_days",
    "heat_loss_per_meter",
    "heat_loss_per_m2",
    "total_heat_loss",
    "message",
}
ELECTRICAL_TABLE_COLUMN_REQUIRED_KEYS = {"index", "object_name", "cable_mark"}
ELECTRICAL_TABLE_COLUMN_PAYLOAD_KEYS = {"version", "visibleOrder", "columns"}
ELECTRICAL_TABLE_COLUMN_LAYOUT_KEYS = {"widthPct"}
ELECTRICAL_CANDIDATE_TABLE_COLUMNS_VERSION = 1
ELECTRICAL_CANDIDATE_TABLE_COLUMNS_PREF_KEY = (
    f"electrical.candidateTableColumns.v{ELECTRICAL_CANDIDATE_TABLE_COLUMNS_VERSION}"
)
ELECTRICAL_CANDIDATE_TABLE_COLUMN_KEYS = (
    ELECTRICAL_TABLE_COLUMN_KEYS
    - {
        "index",
        "object_name",
        "object_type",
        "heat_loss_status",
        "electrical_status",
        "cable_snapshot_status",
        "message",
    }
) | {"marked", "actions", "mode"}
ELECTRICAL_CANDIDATE_TABLE_COLUMN_REQUIRED_KEYS = {"actions", "cable_mark"}
ELECTRICAL_VERSIONED_PREF_PREFIXES = (
    "electrical.tableColumns.",
    "electrical.tableView.",
    "electrical.candidateTableColumns.",
)

PreferenceKey = Annotated[
    str,
    Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$"),
]


def _preference_validation_error(message: str) -> None:
    raise HTTPException(status_code=422, detail=message)


def _validate_preference_key(key: str) -> None:
    if key.startswith(ELECTRICAL_VERSIONED_PREF_PREFIXES) and key not in {
        ELECTRICAL_TABLE_COLUMNS_PREF_KEY,
        ELECTRICAL_TABLE_VIEW_PREF_KEY,
        ELECTRICAL_CANDIDATE_TABLE_COLUMNS_PREF_KEY,
    }:
        _preference_validation_error("Unsupported electrical preference key")


def _validate_heatcalc_table_columns(value: dict[str, object]) -> None:
    if value.get("version") != HEATCALC_TABLE_COLUMNS_VERSION:
        _preference_validation_error("Unsupported heatcalc table column settings version")

    types = value.get("types")
    if not isinstance(types, dict):
        _preference_validation_error("HeatCalc table columns payload requires types")

    unknown_types = set(types) - set(HEATCALC_TABLE_COLUMN_KEYS)
    if unknown_types:
        _preference_validation_error("HeatCalc table columns payload contains unknown object type")

    for object_type, known_keys in HEATCALC_TABLE_COLUMN_KEYS.items():
        type_payload = types.get(object_type)
        if not isinstance(type_payload, dict):
            _preference_validation_error(
                "HeatCalc table columns payload requires pipe, tank and all settings"
            )

        visible_order = type_payload.get("visibleOrder")
        if not isinstance(visible_order, list) or not all(
            isinstance(key, str) for key in visible_order
        ):
            _preference_validation_error(
                "HeatCalc table columns visibleOrder must be a string array"
            )
        if len(visible_order) != len(set(visible_order)):
            _preference_validation_error(
                "HeatCalc table columns visibleOrder contains duplicate keys"
            )
        if any(key not in known_keys for key in visible_order):
            _preference_validation_error("HeatCalc table columns visibleOrder contains unknown key")

        columns = type_payload.get("columns")
        if not isinstance(columns, dict):
            _preference_validation_error("HeatCalc table columns payload requires columns")

        if any(not isinstance(key, str) or key not in known_keys for key in columns):
            _preference_validation_error(
                "HeatCalc table columns payload contains unknown column key"
            )

        for layout in columns.values():
            if not isinstance(layout, dict):
                _preference_validation_error("HeatCalc table column layout must be an object")
            if set(layout) - HEATCALC_TABLE_COLUMN_LAYOUT_KEYS:
                _preference_validation_error(
                    "HeatCalc table column layout can contain only widthPct"
                )
            if "widthPct" not in layout:
                continue
            width_pct = layout["widthPct"]
            if isinstance(width_pct, bool) or not isinstance(width_pct, int | float):
                _preference_validation_error("HeatCalc table column widthPct must be numeric")
            if not HEATCALC_TABLE_COLUMN_WIDTH_MIN <= width_pct <= HEATCALC_TABLE_COLUMN_WIDTH_MAX:
                _preference_validation_error("HeatCalc table column widthPct is out of range")


def _validate_electrical_table_columns(value: dict[str, object]) -> None:
    if set(value) - ELECTRICAL_TABLE_COLUMN_PAYLOAD_KEYS:
        _preference_validation_error(
            "Electrical table columns payload can contain only version, visibleOrder and columns"
        )
    if value.get("version") != ELECTRICAL_TABLE_COLUMNS_VERSION:
        _preference_validation_error("Unsupported electrical table column settings version")

    visible_order = value.get("visibleOrder")
    if not isinstance(visible_order, list) or not all(
        isinstance(key, str) for key in visible_order
    ):
        _preference_validation_error("Electrical table columns visibleOrder must be a string array")
    if len(visible_order) != len(set(visible_order)):
        _preference_validation_error(
            "Electrical table columns visibleOrder contains duplicate keys"
        )
    if any(key not in ELECTRICAL_TABLE_COLUMN_KEYS for key in visible_order):
        _preference_validation_error("Electrical table columns visibleOrder contains unknown key")
    if missing_required := ELECTRICAL_TABLE_COLUMN_REQUIRED_KEYS - set(visible_order):
        _preference_validation_error(
            "Electrical table columns visibleOrder missing required key: "
            + ", ".join(sorted(missing_required))
        )

    columns = value.get("columns")
    if not isinstance(columns, dict):
        _preference_validation_error("Electrical table columns payload requires columns")
    if any(not isinstance(key, str) or key not in ELECTRICAL_TABLE_COLUMN_KEYS for key in columns):
        _preference_validation_error("Electrical table columns payload contains unknown column key")

    for layout in columns.values():
        if not isinstance(layout, dict):
            _preference_validation_error("Electrical table column layout must be an object")
        if set(layout) - ELECTRICAL_TABLE_COLUMN_LAYOUT_KEYS:
            _preference_validation_error("Electrical table column layout can contain only widthPct")
        if "widthPct" not in layout:
            continue
        width_pct = layout["widthPct"]
        if isinstance(width_pct, bool) or not isinstance(width_pct, int | float):
            _preference_validation_error("Electrical table column widthPct must be numeric")
        if not HEATCALC_TABLE_COLUMN_WIDTH_MIN <= width_pct <= HEATCALC_TABLE_COLUMN_WIDTH_MAX:
            _preference_validation_error("Electrical table column widthPct is out of range")


def _validate_electrical_candidate_table_columns(value: dict[str, object]) -> None:
    if set(value) - ELECTRICAL_TABLE_COLUMN_PAYLOAD_KEYS:
        _preference_validation_error(
            "Electrical candidate table columns payload can contain only version, "
            "visibleOrder and columns"
        )
    if value.get("version") != ELECTRICAL_CANDIDATE_TABLE_COLUMNS_VERSION:
        _preference_validation_error(
            "Unsupported electrical candidate table column settings version"
        )

    visible_order = value.get("visibleOrder")
    if not isinstance(visible_order, list) or not all(
        isinstance(key, str) for key in visible_order
    ):
        _preference_validation_error(
            "Electrical candidate table columns visibleOrder must be a string array"
        )
    if len(visible_order) != len(set(visible_order)):
        _preference_validation_error(
            "Electrical candidate table columns visibleOrder contains duplicate keys"
        )
    if any(key not in ELECTRICAL_CANDIDATE_TABLE_COLUMN_KEYS for key in visible_order):
        _preference_validation_error(
            "Electrical candidate table columns visibleOrder contains unknown key"
        )
    if missing_required := ELECTRICAL_CANDIDATE_TABLE_COLUMN_REQUIRED_KEYS - set(
        visible_order
    ):
        _preference_validation_error(
            "Electrical candidate table columns visibleOrder missing required key: "
            + ", ".join(sorted(missing_required))
        )

    columns = value.get("columns")
    if not isinstance(columns, dict):
        _preference_validation_error(
            "Electrical candidate table columns payload requires columns"
        )
    if any(
        not isinstance(key, str) or key not in ELECTRICAL_CANDIDATE_TABLE_COLUMN_KEYS
        for key in columns
    ):
        _preference_validation_error(
            "Electrical candidate table columns payload contains unknown column key"
        )

    for layout in columns.values():
        if not isinstance(layout, dict):
            _preference_validation_error(
                "Electrical candidate table column layout must be an object"
            )
        if set(layout) - ELECTRICAL_TABLE_COLUMN_LAYOUT_KEYS:
            _preference_validation_error(
                "Electrical candidate table column layout can contain only widthPct"
            )
        if "widthPct" not in layout:
            continue
        width_pct = layout["widthPct"]
        if isinstance(width_pct, bool) or not isinstance(width_pct, int | float):
            _preference_validation_error(
                "Electrical candidate table column widthPct must be numeric"
            )
        if not HEATCALC_TABLE_COLUMN_WIDTH_MIN <= width_pct <= HEATCALC_TABLE_COLUMN_WIDTH_MAX:
            _preference_validation_error(
                "Electrical candidate table column widthPct is out of range"
            )


def _validate_heatcalc_table_view(value: dict[str, object]) -> None:
    if set(value) - HEATCALC_TABLE_VIEW_KEYS:
        _preference_validation_error("HeatCalc table view payload contains unsupported keys")
    if value.get("version") != HEATCALC_TABLE_VIEW_VERSION:
        _preference_validation_error("Unsupported heatcalc table view settings version")
    if value.get("fontSize") not in HEATCALC_TABLE_VIEW_FONT_SIZES:
        _preference_validation_error("HeatCalc table view fontSize is unsupported")
    if "tableLabelFormat" in value and value["tableLabelFormat"] not in TABLE_VIEW_LABEL_FORMATS:
        _preference_validation_error("HeatCalc table view tableLabelFormat is unsupported")
    if (
        "settingsLabelFormat" in value
        and value["settingsLabelFormat"] not in TABLE_VIEW_LABEL_FORMATS
    ):
        _preference_validation_error("HeatCalc table view settingsLabelFormat is unsupported")
    if "inlineEditingEnabled" in value and not isinstance(value["inlineEditingEnabled"], bool):
        _preference_validation_error("HeatCalc table view inlineEditingEnabled must be boolean")
    if value.get("formPlacement") not in HEATCALC_TABLE_VIEW_FORM_PLACEMENTS:
        _preference_validation_error("HeatCalc table view formPlacement is unsupported")
    if "sideFormWidthPct" in value:
        side_form_width = value["sideFormWidthPct"]
        if isinstance(side_form_width, bool) or not isinstance(side_form_width, int | float):
            _preference_validation_error("HeatCalc table view sideFormWidthPct must be numeric")
        if not (
            HEATCALC_TABLE_VIEW_SIDE_FORM_WIDTH_MIN
            <= side_form_width
            <= HEATCALC_TABLE_VIEW_SIDE_FORM_WIDTH_MAX
        ):
            _preference_validation_error("HeatCalc table view sideFormWidthPct is out of range")
    if "formSectionWeights" in value:
        weights = value["formSectionWeights"]
        if not isinstance(weights, list) or len(weights) not in HEATCALC_FORM_SECTION_WEIGHT_COUNTS:
            _preference_validation_error(
                "HeatCalc table view formSectionWeights must be a 3-item array "
                "or legacy 4-item array"
            )
        for weight in weights:
            if isinstance(weight, bool) or not isinstance(weight, int | float):
                _preference_validation_error(
                    "HeatCalc table view formSectionWeights must be numeric"
                )
            if not HEATCALC_FORM_SECTION_WEIGHT_MIN <= weight <= HEATCALC_FORM_SECTION_WEIGHT_MAX:
                _preference_validation_error(
                    "HeatCalc table view formSectionWeights value is out of range"
                )


def _validate_electrical_table_view(value: dict[str, object]) -> None:
    if set(value) - ELECTRICAL_TABLE_VIEW_KEYS:
        _preference_validation_error("Electrical table view payload contains unsupported keys")
    if value.get("version") != ELECTRICAL_TABLE_VIEW_VERSION:
        _preference_validation_error("Unsupported electrical table view settings version")
    if value.get("fontSize") not in HEATCALC_TABLE_VIEW_FONT_SIZES:
        _preference_validation_error("Electrical table view fontSize is unsupported")
    if value.get("tableLabelFormat") not in TABLE_VIEW_LABEL_FORMATS:
        _preference_validation_error("Electrical table view tableLabelFormat is unsupported")
    if value.get("settingsLabelFormat") not in TABLE_VIEW_LABEL_FORMATS:
        _preference_validation_error("Electrical table view settingsLabelFormat is unsupported")
    if value.get("calculationCableSource") not in ELECTRICAL_CALCULATION_CABLE_SOURCES:
        _preference_validation_error("Electrical table view calculationCableSource is unsupported")


def _validate_heatcalc_field_inputs(value: dict[str, object]) -> None:
    if set(value) - HEATCALC_FIELD_INPUT_KEYS:
        _preference_validation_error(
            "HeatCalc field input payload can contain only version and fields"
        )
    if value.get("version") != HEATCALC_FIELD_INPUT_VERSION:
        _preference_validation_error("Unsupported heatcalc field input settings version")

    fields = value.get("fields")
    if not isinstance(fields, dict):
        _preference_validation_error("HeatCalc field input payload requires fields")

    unknown_types = set(fields) - set(HEATCALC_FIELD_INPUT_FIELD_KEYS)
    if unknown_types:
        _preference_validation_error("HeatCalc field input payload contains unknown object type")

    for object_type, object_fields in fields.items():
        if not isinstance(object_fields, dict):
            _preference_validation_error("HeatCalc field input object fields must be an object")
        known_fields = HEATCALC_FIELD_INPUT_FIELD_KEYS[object_type]
        if any(not isinstance(key, str) or key not in known_fields for key in object_fields):
            _preference_validation_error("HeatCalc field input payload contains unknown field key")
        for layout in object_fields.values():
            if not isinstance(layout, dict):
                _preference_validation_error("HeatCalc field input layout must be an object")
            if set(layout) - HEATCALC_FIELD_INPUT_LAYOUT_KEYS:
                _preference_validation_error("HeatCalc field input layout can contain only step")
            step = layout.get("step")
            if isinstance(step, bool) or not isinstance(step, int | float):
                _preference_validation_error("HeatCalc field input step must be numeric")
            if not 0 < step <= HEATCALC_FIELD_INPUT_MAX_STEP:
                _preference_validation_error("HeatCalc field input step is out of range")


def _validate_preference_value(key: str, value: dict[str, object]) -> None:
    _validate_preference_key(key)
    if key == HEATCALC_TABLE_COLUMNS_PREF_KEY:
        _validate_heatcalc_table_columns(value)
    if key == ELECTRICAL_TABLE_COLUMNS_PREF_KEY:
        _validate_electrical_table_columns(value)
    if key == HEATCALC_TABLE_VIEW_PREF_KEY:
        _validate_heatcalc_table_view(value)
    if key == ELECTRICAL_TABLE_VIEW_PREF_KEY:
        _validate_electrical_table_view(value)
    if key == ELECTRICAL_CANDIDATE_TABLE_COLUMNS_PREF_KEY:
        _validate_electrical_candidate_table_columns(value)
    if key == HEATCALC_FIELD_INPUT_PREF_KEY:
        _validate_heatcalc_field_inputs(value)


@router.get(
    "/{key}",
    response_model=UserPreferenceResponse,
    summary="Получить UI-настройку текущего пользователя",
)
async def get_preference(
    key: PreferenceKey,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
) -> UserPreferenceResponse:
    _validate_preference_key(key)
    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == principal.user_id,
            UserPreference.key == key,
        )
    )
    preference = result.scalar_one_or_none()
    if preference is None:
        return UserPreferenceResponse(key=key, value=None, user_id=principal.user_id)
    return UserPreferenceResponse.model_validate(preference)


@router.put(
    "/{key}",
    response_model=UserPreferenceResponse,
    summary="Сохранить UI-настройку текущего пользователя",
)
async def update_preference(
    key: PreferenceKey,
    data: UserPreferenceUpdate,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
) -> UserPreferenceResponse:
    _validate_preference_value(key, data.value)

    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == principal.user_id,
            UserPreference.key == key,
        )
    )
    preference = result.scalar_one_or_none()
    if preference is None:
        preference = UserPreference(user_id=principal.user_id, key=key, value=data.value)
        db.add(preference)
    else:
        preference.value = data.value
    await db.commit()
    await db.refresh(preference)
    return UserPreferenceResponse.model_validate(preference)
