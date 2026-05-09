"""Endpoints пользовательских UI-настроек."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_employee
from app.models.user_preference import UserPreference
from app.schemas.user_preference import UserPreferenceResponse, UserPreferenceUpdate

router = APIRouter()

HEATCALC_TABLE_COLUMNS_PREF_KEY = "heatcalc.tableColumns.v1"
HEATCALC_TABLE_COLUMNS_VERSION = 3
HEATCALC_TABLE_COLUMN_WIDTH_MIN = 3
HEATCALC_TABLE_COLUMN_WIDTH_MAX = 60
HEATCALC_TABLE_COLUMN_LAYOUT_KEYS = {"widthPct"}
HEATCALC_TABLE_VIEW_PREF_KEY = "heatcalc.tableView.v1"
HEATCALC_TABLE_VIEW_VERSION = 1
HEATCALC_TABLE_VIEW_KEYS = {"version", "fontSize"}
HEATCALC_TABLE_VIEW_FONT_SIZES = {"compact", "standard", "comfortable", "large"}

HEATCALC_TABLE_COLUMN_KEYS: dict[str, set[str]] = {
    "pipe": {
        "index",
        "type",
        "name",
        "pipe_outer_diameter",
        "pipe_dn",
        "pipe_length",
        "pipe_wall_thickness",
        "pipe_material",
        "pipe_lambda",
        "pipe_lambda_mode",
        "placement",
        "insulation_layer_count",
        "insulation_thickness",
        "insulation_material",
        "first_insulation_lambda",
        "second_insulation_thickness",
        "second_insulation_material",
        "second_insulation_lambda",
        "third_insulation_thickness",
        "third_insulation_material",
        "third_insulation_lambda",
        "insulation_cover_material",
        "process_temperature",
        "ambient_temperature",
        "ambient_temperature_source",
        "max_ambient_temperature",
        "max_process_temperature",
        "wind_speed",
        "wind_speed_source",
        "alpha_vnesh",
        "environment",
        "zone_classification",
        "temperature_group",
        "climate_city",
        "climate_region",
        "climate_key",
        "climate_temperature_basis",
        "burial_depth",
        "ground_type",
        "ground_conductivity",
        "min_switch_temperature",
        "supply_voltage",
        "safety_factor",
        "steam_tracing",
        "valve_count",
        "flange_count",
        "support_count",
        "local_element_equiv_length",
    },
    "tank": {
        "index",
        "type",
        "name",
        "tank_shape",
        "tank_dimensions",
        "tank_diameter",
        "tank_height",
        "tank_length",
        "tank_width",
        "tank_wall_thickness",
        "tank_wall_lambda",
        "placement",
        "insulation_layer_count",
        "insulation_thickness",
        "insulation_material",
        "first_insulation_lambda",
        "second_insulation_thickness",
        "second_insulation_material",
        "second_insulation_lambda",
        "third_insulation_thickness",
        "third_insulation_material",
        "third_insulation_lambda",
        "insulation_cover_material",
        "process_temperature",
        "ambient_temperature",
        "ambient_temperature_source",
        "max_ambient_temperature",
        "max_process_temperature",
        "wind_speed",
        "wind_speed_source",
        "alpha_vnesh",
        "environment",
        "zone_classification",
        "temperature_group",
        "climate_city",
        "climate_region",
        "climate_key",
        "climate_temperature_basis",
        "burial_depth",
        "ground_type",
        "ground_conductivity",
        "min_switch_temperature",
        "supply_voltage",
        "safety_factor",
        "q_additional",
        "steam_tracing",
    },
}

PreferenceKey = Annotated[
    str,
    Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$"),
]


def _preference_validation_error(message: str) -> None:
    raise HTTPException(status_code=422, detail=message)


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
                "HeatCalc table columns payload requires pipe and tank settings"
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


def _validate_heatcalc_table_view(value: dict[str, object]) -> None:
    if set(value) - HEATCALC_TABLE_VIEW_KEYS:
        _preference_validation_error(
            "HeatCalc table view payload can contain only version and fontSize"
        )
    if value.get("version") != HEATCALC_TABLE_VIEW_VERSION:
        _preference_validation_error("Unsupported heatcalc table view settings version")
    if value.get("fontSize") not in HEATCALC_TABLE_VIEW_FONT_SIZES:
        _preference_validation_error("HeatCalc table view fontSize is unsupported")


def _validate_preference_value(key: str, value: dict[str, object]) -> None:
    if key == HEATCALC_TABLE_COLUMNS_PREF_KEY:
        _validate_heatcalc_table_columns(value)
    if key == HEATCALC_TABLE_VIEW_PREF_KEY:
        _validate_heatcalc_table_view(value)


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
