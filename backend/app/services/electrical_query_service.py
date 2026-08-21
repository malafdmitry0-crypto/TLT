"""Backend query layer for electrical calculation table."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal
from functools import cmp_to_key
from math import ceil, isfinite
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import Float, String, and_, case, cast, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.electrical_result_status import (
    FAILED_ELECTRICAL_CATEGORIES,
    electrical_result_status,
)
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariantObject
from app.models.project_object import ProjectObject
from app.schemas.calculation import (
    ElectricalCalcSummary,
    ElectricalPageSummary,
    ElectricalQueryAssignment,
    ElectricalQueryCapabilitiesResponse,
    ElectricalQueryCounts,
    ElectricalQueryEcho,
    ElectricalQueryRequest,
    ElectricalQueryResponse,
)
from app.schemas.project import (
    ObjectQueryDefaultSort,
    ObjectQueryFieldCapability,
    ObjectQueryFieldFilterCapability,
    ObjectQueryFieldOptions,
    ObjectQueryFieldSortCapability,
    ObjectQueryOptionItem,
    ObjectQuerySearchCapability,
    ProjectObjectResponse,
    ProjectObjectsPageCursor,
    ProjectObjectsPageInfo,
)
from app.services.calculation.container import CalculationContainer
from app.services.electrical_result_lifecycle import current_tt_result_sql_predicate
from app.services.project_service import ProjectService

FieldType = Literal["display", "text", "number", "enum", "boolean"]
SortType = Literal["text", "number", "label", "enum_rank"]
OptionMode = Literal["inline", "dictionary", "project_values", "derived"]
SqlExprFactory = Callable[[], Any]

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
CAPABILITIES_SAMPLE_LIMIT = 1000
PYTHON_FALLBACK_MAX_ROWS = 1000
SQL_OFFSET_FALLBACK_MAX_OFFSET = 1000


class ElectricalQueryValidationError(ValueError):
    """Некорректный query для таблицы электрорасчёта."""


@dataclass(frozen=True)
class ElectricalQueryRow:
    obj: ProjectObject
    calc: ElectricalCalculation | None


@dataclass(frozen=True)
class SqlOrderSpec:
    key: str
    direction: Literal["asc", "desc"]
    value_expr: Any
    null_rank_expr: Any
    order_by: list[Any]


@dataclass(frozen=True)
class FieldDef:
    key: str
    label: str
    title: str
    data_type: FieldType
    value: Callable[[ElectricalQueryRow], Any]
    unit: str | None = None
    filter_ops: tuple[str, ...] = ()
    sortable: bool = False
    sort_type: SortType | None = None
    options_mode: OptionMode | None = None
    static_options: tuple[tuple[Any, str], ...] = ()
    filter_reason: str | None = None
    sort_reason: str | None = None

    @property
    def filterable(self) -> bool:
        return len(self.filter_ops) > 0


OBJECT_TYPE_OPTIONS = (("pipe", "Труба"), ("tank", "Резервуар"))
STATUS_OPTIONS = (
    ("calculated", "Рассчитан"),
    ("stale", "Требуется перерасчёт"),
    ("error", "Требуется корректировка"),
    ("unsupported", "Не применимо"),
    ("not_calculated", "Не рассчитан"),
)
CABLE_TYPE_OPTIONS = (
    ("self_regulating", "Саморегулирующийся"),
    ("self_regulating_tt", "ТТН/ТТВ/ТТХ"),
    ("single_core", "Однож. пост. мощн."),
    ("three_core", "Трёхж. пост. мощн."),
)
SELECTION_POLICY_OPTIONS = (
    ("technical_minimum", "Технический"),
    ("lowest_cost", "Дешевле"),
    ("fastest_delivery", "Быстрее"),
    ("in_stock", "В наличии"),
    ("preferred_supplier", "Приоритет"),
    ("balanced", "Баланс"),
    ("manual_selection", "Ручной выбор"),
)
STOCK_STATUS_OPTIONS = (
    ("in_stock", "В наличии"),
    ("limited", "Ограничено"),
    ("on_order", "Под заказ"),
    ("unknown", "Неизвестно"),
)
CONNECTION_TYPE_OPTIONS = (
    ("line_1ph", "Линия"),
    ("loop_1ph", "Петля"),
    ("star_3ph", "Звезда"),
    ("loop_2x3", "Петля 2×3"),
    ("loop_1x3", "Петля 1×3"),
    ("star_3x3", "Звезда 3×3"),
    ("star_1x3", "Звезда 1×3"),
)
DEFAULT_SEARCH_COLUMNS = ("object_name", "cable_mark", "selected_cable", "message")


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == "—"


def _normal_text(value: Any) -> str:
    if _is_empty(value):
        return ""
    return str(value).strip().lower()


def _sql_object_param_text(key: str) -> Any:
    return ProjectObject.params[key].astext


def _sql_object_result_text(key: str) -> Any:
    return ProjectObject.results[key].astext


def _sql_calc_param_text(key: str) -> Any:
    return ElectricalCalculation.params[key].astext


def _sql_calc_result_text(key: str) -> Any:
    return ElectricalCalculation.results[key].astext


def _sql_number(text_expr: Any) -> Any:
    return cast(func.nullif(text_expr, ""), Float)


def _sql_calc_param_number(key: str) -> Any:
    return _sql_number(_sql_calc_param_text(key))


def _sql_calc_result_number(key: str) -> Any:
    return _sql_number(_sql_calc_result_text(key))


def _sql_calc_result_path_text(*path: str) -> Any:
    expression: Any = ElectricalCalculation.results
    for key in path:
        expression = expression[key]
    return expression.astext


def _sql_calc_result_number_fallback(*paths: tuple[str, ...]) -> Any:
    return _sql_number(
        func.coalesce(*(func.nullif(_sql_calc_result_path_text(*path), "") for path in paths))
    )


def _sql_calc_commercial_text(key: str) -> Any:
    return ElectricalCalculation.results["commercial"][key].astext


def _sql_calc_commercial_number(key: str) -> Any:
    return _sql_number(_sql_calc_commercial_text(key))


def _sql_object_result_number(key: str) -> Any:
    return _sql_number(_sql_object_result_text(key))


def _sql_heat_loss_status() -> Any:
    return case(
        (
            and_(
                ProjectObject.is_valid.is_(True),
                ProjectObject.results.is_not(None),
            ),
            literal("calculated"),
        ),
        (
            ProjectObject.validation_errors["category"].astext == "unsupported",
            literal("unsupported"),
        ),
        (ProjectObject.validation_errors.is_not(None), literal("error")),
        else_=literal("not_calculated"),
    )


def _sql_calc_error() -> Any:
    return case(
        (
            or_(
                _sql_calc_result_text("error_code").is_not(None),
                _sql_calc_result_text("category").in_(tuple(FAILED_ELECTRICAL_CATEGORIES)),
            ),
            _sql_calc_result_text("message"),
        ),
        else_=None,
    )


def _sql_selected_cable() -> Any:
    return func.coalesce(
        ElectricalCalculation.cable_mark,
        _sql_calc_result_text("selected_cable"),
    )


def _sql_power_per_meter() -> Any:
    return _sql_calc_result_number("power_per_meter")


def _sql_installed_power_per_meter() -> Any:
    return _sql_calc_result_number("installed_power_per_meter")


def _sql_electrical_status() -> Any:
    stale_text = _sql_calc_result_text("stale")
    return case(
        (ElectricalCalculation.id.is_(None), literal("not_calculated")),
        (_sql_calc_result_text("category") == "unsupported", literal("unsupported")),
        (
            or_(_sql_calc_result_text("category") == "stale", stale_text == "true"),
            literal("stale"),
        ),
        (
            or_(
                _sql_calc_result_text("error_code").is_not(None),
                _sql_calc_result_text("category").in_(tuple(FAILED_ELECTRICAL_CATEGORIES)),
            ),
            literal("error"),
        ),
        (
            and_(
                ElectricalCalculation.results.is_not(None),
                _sql_calc_result_text("error_code").is_(None),
                _sql_calc_result_text("category").is_(None),
                func.coalesce(stale_text, "") != "true",
                or_(
                    ElectricalCalculation.cable_mark.is_not(None),
                    _sql_calc_result_text("selected_cable").is_not(None),
                ),
                current_tt_result_sql_predicate(),
            ),
            literal("calculated"),
        ),
        else_=literal("not_calculated"),
    )


def _sql_label_expr(expr: Any, options: tuple[tuple[Any, str], ...]) -> Any:
    whens: list[tuple[Any, Any]] = []
    text_expr = cast(expr, String)
    for value, label in options:
        whens.append((text_expr == str(value), literal(label)))
        if isinstance(value, bool):
            whens.append((text_expr == str(value).lower(), literal(label)))
    return case(*whens, else_=text_expr)


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if isfinite(numeric) else None


def _label_from_options(value: Any, options: tuple[tuple[Any, str], ...]) -> str:
    for option_value, label in options:
        if value == option_value or str(value) == str(option_value):
            return label
    return "" if _is_empty(value) else str(value)


def _calc_result(row: ElectricalQueryRow, key: str) -> Any:
    if row.calc is None or not isinstance(row.calc.results, dict):
        return None
    return row.calc.results.get(key)


def _calc_result_path(row: ElectricalQueryRow, *path: str) -> Any:
    if row.calc is None or not isinstance(row.calc.results, dict):
        return None
    value: Any = row.calc.results
    for key in path:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def _calc_result_fallback(row: ElectricalQueryRow, *paths: tuple[str, ...]) -> Any:
    for path in paths:
        value = _calc_result_path(row, *path)
        if value is not None and value != "":
            return value
    return None


def _calc_provenance_summary(row: ElectricalQueryRow) -> str | None:
    if row.calc is None or not isinstance(row.calc.results, dict):
        return None
    results = row.calc.results

    def dict_value(value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}

    layout = dict_value(results.get("layout"))
    provenance = dict_value(results.get("provenance"))
    input_sources = dict_value(provenance.get("input_sources")) or dict_value(
        results.get("input_sources")
    )
    catalogs = dict_value(provenance.get("catalogs")) or dict_value(results.get("catalogs"))
    section_catalog = dict_value(catalogs.get("section"))
    parts: list[str] = []
    thread_source = layout.get("thread_selection_source") or input_sources.get("thread_count")
    winding_source = input_sources.get("winding_pitch_mm") or input_sources.get(
        "winding_coefficient"
    )
    catalog_source = section_catalog.get("source") or section_catalog.get("authority")
    catalog_version = section_catalog.get("version") or section_catalog.get("id")
    formula_version = provenance.get("formula_version")
    formula_fingerprint = provenance.get("formula_fingerprint")
    if thread_source:
        parts.append(f"нитки: {thread_source}")
    if winding_source:
        parts.append(f"укладка: {winding_source}")
    if catalog_source or catalog_version:
        catalog_label = "/".join(str(value) for value in (catalog_source, catalog_version) if value)
        parts.append(f"секции: {catalog_label}")
    if formula_version or formula_fingerprint:
        formula_label = str(formula_version or "")
        if formula_fingerprint:
            fingerprint = str(formula_fingerprint)
            formula_label = f"{formula_label}; fp {fingerprint[:12]}".strip("; ")
        parts.append(f"формула: {formula_label}")
    return " · ".join(parts) or None


def _calc_power_per_meter(row: ElectricalQueryRow) -> float | None:
    return _to_float(_calc_result(row, "power_per_meter"))


def _calc_installed_power_per_meter(row: ElectricalQueryRow) -> float | None:
    return _to_float(_calc_result(row, "installed_power_per_meter"))


def _calc_commercial(row: ElectricalQueryRow, key: str) -> Any:
    if row.calc is None or not isinstance(row.calc.results, dict):
        return None
    commercial = row.calc.results.get("commercial")
    if not isinstance(commercial, dict):
        return None
    return commercial.get(key)


def _calc_param(row: ElectricalQueryRow, key: str) -> Any:
    if row.calc is None or not isinstance(row.calc.params, dict):
        return None
    return row.calc.params.get(key)


def _object_result(row: ElectricalQueryRow, key: str) -> Any:
    if not isinstance(row.obj.results, dict):
        return None
    return row.obj.results.get(key)


def _object_name(row: ElectricalQueryRow) -> str:
    return str(row.obj.params.get("name") or f"{row.obj.object_type} {row.obj.id}")


def _calc_error(row: ElectricalQueryRow) -> str | None:
    if row.calc is not None and isinstance(row.calc.results, dict):
        payload = (
            {**row.calc.results, "cable_type": row.calc.cable_type}
            if row.calc.cable_type == "self_regulating_tt"
            else row.calc.results
        )
        if electrical_result_status(row.calc.cable_mark, payload) == "stale":
            return None
    category = _calc_result(row, "category")
    if category == "stale" or _calc_result(row, "stale") is True:
        return None
    error_code = _calc_result(row, "error_code")
    message = _calc_result(row, "message")
    if category in FAILED_ELECTRICAL_CATEGORIES or error_code:
        return str(message) if message else None
    return None


def _selected_cable(row: ElectricalQueryRow) -> Any:
    if row.calc and row.calc.cable_mark:
        return row.calc.cable_mark
    return _calc_result(row, "selected_cable")


def _electrical_status(row: ElectricalQueryRow) -> str:
    if row.calc is None:
        return "not_calculated"
    if row.calc.results is None:
        return "not_calculated"
    payload = (
        {**row.calc.results, "cable_type": row.calc.cable_type}
        if row.calc.cable_type == "self_regulating_tt" and isinstance(row.calc.results, dict)
        else row.calc.results
    )
    status = electrical_result_status(row.calc.cable_mark, payload)
    if status == "unsupported":
        return "unsupported"
    if status == "stale":
        return "stale"
    if status == "failed":
        return "error"
    if status == "success":
        return "calculated"
    return "not_calculated"


def _heat_loss_status(row: ElectricalQueryRow) -> str:
    if row.obj.is_valid and row.obj.results is not None:
        return "calculated"
    if (
        isinstance(row.obj.validation_errors, dict)
        and row.obj.validation_errors.get("category") == "unsupported"
    ):
        return "unsupported"
    if row.obj.validation_errors:
        return "error"
    return "not_calculated"


def _field_label(field: FieldDef, value: Any) -> str:
    if field.static_options:
        return _label_from_options(value, field.static_options)
    return "" if _is_empty(value) else str(value)


FIELDS: tuple[FieldDef, ...] = (
    FieldDef("index", "Номер строки", "#", "display", lambda _row: None),
    FieldDef(
        "object_name",
        "Наименование объекта",
        "Объект",
        "text",
        _object_name,
        filter_ops=("contains",),
        sortable=True,
        sort_type="text",
    ),
    FieldDef(
        "object_type",
        "Тип объекта",
        "Тип",
        "enum",
        lambda row: row.obj.object_type,
        filter_ops=("in",),
        sortable=True,
        sort_type="label",
        options_mode="inline",
        static_options=OBJECT_TYPE_OPTIONS,
    ),
    FieldDef(
        "heat_loss_status",
        "Статус теплового расчёта",
        "Теплопотери",
        "enum",
        _heat_loss_status,
        filter_ops=("in",),
        sortable=True,
        sort_type="label",
        options_mode="inline",
        static_options=STATUS_OPTIONS,
    ),
    FieldDef(
        "electrical_status",
        "Статус электрорасчёта",
        "Статус",
        "enum",
        _electrical_status,
        filter_ops=("in",),
        sortable=True,
        sort_type="label",
        options_mode="inline",
        static_options=STATUS_OPTIONS,
    ),
    FieldDef(
        "cable_type",
        "Тип греющего кабеля",
        "Тип кабеля",
        "enum",
        lambda row: row.calc.cable_type if row.calc else None,
        filter_ops=("in",),
        sortable=True,
        sort_type="label",
        options_mode="inline",
        static_options=CABLE_TYPE_OPTIONS,
    ),
    FieldDef(
        "cable_mark",
        "Марка кабеля",
        "Марка",
        "text",
        lambda row: row.calc.cable_mark if row.calc else None,
        filter_ops=("contains", "in"),
        sortable=True,
        sort_type="text",
        options_mode="project_values",
    ),
    FieldDef(
        "selected_cable",
        "Подобранный кабель",
        "Подбор",
        "text",
        _selected_cable,
        filter_ops=("contains", "in"),
        sortable=True,
        sort_type="text",
        options_mode="project_values",
    ),
    FieldDef(
        "selection_policy",
        "Запрошенный критерий подбора",
        "Критерий",
        "enum",
        lambda row: _calc_result(row, "selection_policy"),
        filter_ops=("in",),
        sortable=True,
        sort_type="label",
        options_mode="inline",
        static_options=SELECTION_POLICY_OPTIONS,
    ),
    FieldDef(
        "applied_selection_policy",
        "Фактически применённый критерий",
        "Критерий",
        "enum",
        lambda row: _calc_result(row, "applied_selection_policy"),
        filter_ops=("in",),
        sortable=True,
        sort_type="label",
        options_mode="inline",
        static_options=SELECTION_POLICY_OPTIONS,
    ),
    FieldDef(
        "selection_reason",
        "Причина выбора кабеля",
        "Причина выбора",
        "text",
        lambda row: _calc_result(row, "selection_reason"),
        filter_ops=("contains",),
        sortable=True,
        sort_type="text",
    ),
    FieldDef(
        "winding_pitch_mm",
        "Шаг навива кабеля, мм",
        "Шаг навива, мм",
        "number",
        lambda row: _calc_result(row, "winding_pitch"),
        unit="мм",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "number_of_threads",
        "Количество ниток кабеля",
        "Ниток",
        "number",
        lambda row: _calc_result(row, "num_circuits"),
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "laying_step",
        "Шаг укладки на резервуаре, м",
        "Шаг укладки, м",
        "number",
        lambda row: _calc_param(row, "laying_step"),
        unit="м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "heating_height",
        "Высота обогреваемой зоны, м",
        "Высота обогр., м",
        "number",
        lambda row: _calc_param(row, "heating_height"),
        unit="м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "connection_type",
        "Схема подключения",
        "Схема",
        "enum",
        lambda row: _calc_param(row, "connection_type"),
        filter_ops=("in",),
        sortable=True,
        sort_type="label",
        options_mode="inline",
        static_options=CONNECTION_TYPE_OPTIONS,
    ),
    FieldDef(
        "supply_voltage",
        "Рабочее напряжение, В",
        "U, В",
        "number",
        lambda row: _calc_param(row, "supply_voltage"),
        unit="В",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "winding_coefficient",
        "Коэффициент навива",
        "w",
        "number",
        lambda row: _calc_param(row, "winding_coefficient"),
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "required_installed_length_m",
        "Требуемая общая длина кабеля до секционирования, м",
        "Lтреб, м",
        "number",
        lambda row: _calc_result_fallback(
            row,
            ("layout", "required_installed_length_m"),
            ("required_installed_length_m",),
            ("section_l_required_m",),
        ),
        unit="м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "installed_cable_length",
        "Фактическая общая длина кабеля после секционирования, м",
        "Lфакт, м",
        "number",
        lambda row: _calc_result_fallback(
            row,
            ("layout", "actual_installed_length_m"),
            ("installed_cable_length",),
        ),
        unit="м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "section_l_max_m",
        "Максимальная длина секции по каталогу, м",
        "Lмакс, м",
        "number",
        lambda row: _calc_result_fallback(row, ("section_plan", "l_max_m"), ("section_l_max_m",)),
        unit="м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "section_l_tok_m",
        "Максимальная длина секции по стартовому току, м",
        "Lток, м",
        "number",
        lambda row: _calc_result_fallback(row, ("section_plan", "l_tok_m"), ("section_l_tok_m",)),
        unit="м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "section_l_ogr_m",
        "Допустимая длина одной нагревательной секции, м",
        "Lогр, м",
        "number",
        lambda row: _calc_result_fallback(row, ("section_plan", "l_ogr_m"), ("section_l_ogr_m",)),
        unit="м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "section_l_excess_m",
        "Дополнительная длина после выравнивания секций, м",
        "Lдоп, м",
        "number",
        lambda row: _calc_result_fallback(
            row,
            ("layout", "excess_installed_length_m"),
            ("section_l_excess_m",),
        ),
        unit="м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "order_cable_length",
        "Заказная длина кабеля с монтажным запасом, м",
        "Lзаказ, м",
        "number",
        lambda row: _calc_result_fallback(
            row,
            ("layout", "required_order_length_m"),
            ("order_cable_length",),
        ),
        unit="м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "provenance",
        "Происхождение параметров длины и секционирования",
        "Источники",
        "text",
        _calc_provenance_summary,
        filter_reason="display_only",
        sort_reason="display_only",
    ),
    FieldDef(
        "total_power",
        "Суммарная мощность, Вт",
        "Мощность, Вт",
        "number",
        lambda row: _calc_result(row, "total_power"),
        unit="Вт",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "power_per_meter",
        "Удельная мощность выбранного кабеля, Вт/м",
        "P каб., Вт/м",
        "number",
        _calc_power_per_meter,
        unit="Вт/м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "installed_power_per_meter",
        "Установленная удельная мощность с учётом укладки, Вт/м",
        "P уст., Вт/м",
        "number",
        _calc_installed_power_per_meter,
        unit="Вт/м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "current",
        "Расчётный ток, А",
        "Ток, А",
        "number",
        lambda row: _calc_result(row, "current"),
        unit="А",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "voltage",
        "Напряжение в результате расчёта, В",
        "U расч., В",
        "number",
        lambda row: _calc_result(row, "voltage"),
        unit="В",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "price_per_meter",
        "Цена кабеля за метр",
        "Цена за м",
        "number",
        lambda row: _calc_commercial(row, "price_per_meter"),
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "required_order_length",
        "Заказная длина с учётом кратности и минимальной партии, м",
        "Заказ партия, м",
        "number",
        lambda row: _calc_commercial(row, "required_order_length"),
        unit="м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "total_cost",
        "Стоимость кабеля",
        "Стоимость",
        "number",
        lambda row: _calc_commercial(row, "total_cost"),
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "stock_status",
        "Статус склада",
        "Склад",
        "enum",
        lambda row: _calc_commercial(row, "stock_status"),
        filter_ops=("in",),
        sortable=True,
        sort_type="label",
        options_mode="inline",
        static_options=STOCK_STATUS_OPTIONS,
    ),
    FieldDef(
        "lead_time_days",
        "Срок поставки, дней",
        "Срок, дн.",
        "number",
        lambda row: _calc_commercial(row, "lead_time_days"),
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "heat_loss_per_meter_base",
        "Теплопотери трубы, Вт/м",
        "q, Вт/м",
        "number",
        lambda row: _object_result(row, "heat_loss_per_meter_base"),
        unit="Вт/м",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "heat_loss_per_m2_bare_base",
        "Теплопотери резервуара, Вт/м²",
        "q, Вт/м²",
        "number",
        lambda row: _object_result(row, "heat_loss_per_m2_bare_base"),
        unit="Вт/м²",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "total_heat_loss_design",
        "Суммарные теплопотери, Вт",
        "Q тепл., Вт",
        "number",
        lambda row: _object_result(row, "total_heat_loss_design"),
        unit="Вт",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "message",
        "Сообщение расчёта",
        "Сообщение",
        "text",
        _calc_error,
        filter_ops=("contains",),
        sortable=True,
        sort_type="text",
    ),
)

FIELDS_BY_KEY = {field.key: field for field in FIELDS}

ELECTRICAL_SQL_EXPRESSIONS: dict[str, SqlExprFactory] = {
    "object_name": lambda: _sql_object_param_text("name"),
    "object_type": lambda: ProjectObject.object_type,
    "heat_loss_status": _sql_heat_loss_status,
    "electrical_status": _sql_electrical_status,
    "cable_type": lambda: ElectricalCalculation.cable_type,
    "cable_mark": lambda: ElectricalCalculation.cable_mark,
    "selected_cable": _sql_selected_cable,
    "selection_policy": lambda: _sql_calc_result_text("selection_policy"),
    "applied_selection_policy": lambda: _sql_calc_result_text("applied_selection_policy"),
    "selection_reason": lambda: _sql_calc_result_text("selection_reason"),
    "winding_pitch_mm": lambda: _sql_calc_result_number("winding_pitch"),
    "number_of_threads": lambda: _sql_calc_result_number("num_circuits"),
    "laying_step": lambda: _sql_calc_param_number("laying_step"),
    "heating_height": lambda: _sql_calc_param_number("heating_height"),
    "connection_type": lambda: _sql_calc_param_text("connection_type"),
    "supply_voltage": lambda: _sql_calc_param_number("supply_voltage"),
    "winding_coefficient": lambda: _sql_calc_param_number("winding_coefficient"),
    "required_installed_length_m": lambda: _sql_calc_result_number_fallback(
        ("layout", "required_installed_length_m"),
        ("required_installed_length_m",),
        ("section_l_required_m",),
    ),
    "installed_cable_length": lambda: _sql_calc_result_number_fallback(
        ("layout", "actual_installed_length_m"), ("installed_cable_length",)
    ),
    "section_l_max_m": lambda: _sql_calc_result_number_fallback(
        ("section_plan", "l_max_m"), ("section_l_max_m",)
    ),
    "section_l_tok_m": lambda: _sql_calc_result_number_fallback(
        ("section_plan", "l_tok_m"), ("section_l_tok_m",)
    ),
    "section_l_ogr_m": lambda: _sql_calc_result_number_fallback(
        ("section_plan", "l_ogr_m"), ("section_l_ogr_m",)
    ),
    "section_l_excess_m": lambda: _sql_calc_result_number_fallback(
        ("layout", "excess_installed_length_m"), ("section_l_excess_m",)
    ),
    "order_cable_length": lambda: _sql_calc_result_number_fallback(
        ("layout", "required_order_length_m"), ("order_cable_length",)
    ),
    "total_power": lambda: _sql_calc_result_number("total_power"),
    "power_per_meter": _sql_power_per_meter,
    "installed_power_per_meter": _sql_installed_power_per_meter,
    "current": lambda: _sql_calc_result_number("current"),
    "voltage": lambda: _sql_calc_result_number("voltage"),
    "price_per_meter": lambda: _sql_calc_commercial_number("price_per_meter"),
    "required_order_length": lambda: _sql_calc_commercial_number("required_order_length"),
    "total_cost": lambda: _sql_calc_commercial_number("total_cost"),
    "stock_status": lambda: _sql_calc_commercial_text("stock_status"),
    "lead_time_days": lambda: _sql_calc_commercial_number("lead_time_days"),
    "heat_loss_per_meter_base": lambda: _sql_object_result_number("heat_loss_per_meter_base"),
    "heat_loss_per_m2_bare_base": lambda: _sql_object_result_number("heat_loss_per_m2_bare_base"),
    "total_heat_loss_design": lambda: _sql_object_result_number("total_heat_loss_design"),
    "message": _sql_calc_error,
}

ELECTRICAL_OBJECT_PARAM_KEYS = frozenset(
    {
        "name",
        "outer_diameter",
        "ambient_temperature",
        "ground_temperature",
        "placement",
        "min_switch_temperature",
        "climate_city",
        "climate_temperature_basis",
        "climate_policy_rule",
    }
)
ELECTRICAL_OBJECT_RESULT_KEYS = frozenset(
    {
        "heat_loss_per_meter_base",
        "heat_loss_per_m2_bare_base",
        "total_heat_loss_design",
    }
)
ELECTRICAL_CALC_PARAM_KEYS = frozenset(
    {
        "laying_step",
        "heating_height",
        "connection_type",
        "supply_voltage",
        "winding_coefficient",
        "cable_mark_source",
    }
)
ELECTRICAL_CALC_RESULT_KEYS = frozenset(
    {
        "selected_cable",
        "selection_policy",
        "applied_selection_policy",
        "selection_reason",
        "winding_pitch",
        "num_circuits",
        "required_installed_length_m",
        "section_l_required_m",
        "installed_cable_length",
        "section_l_max_m",
        "section_l_tok_m",
        "section_l_ogr_m",
        "section_l_excess_m",
        "order_cable_length",
        "total_power",
        "power_per_meter",
        "installed_power_per_meter",
        "current",
        "voltage",
        "message",
        "error_code",
        "category",
        "field",
        "hint",
        "suggested_actions",
        "error_context",
        "resolved_inputs",
        "commercial",
        "layout",
        "section_plan",
        "provenance",
        "input_sources",
        "catalogs",
    }
)


class ElectricalQueryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def capabilities(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
        principal: CurrentPrincipal,
    ) -> ElectricalQueryCapabilitiesResponse:
        await ProjectService(self.db).get_project_basic(project_id, principal)
        rows = await self._load_rows(
            project_id,
            electrical_variant_id,
            limit=CAPABILITIES_SAMPLE_LIMIT,
        )
        return ElectricalQueryCapabilitiesResponse(
            version=1,
            default_page_size=DEFAULT_PAGE_SIZE,
            max_page_size=MAX_PAGE_SIZE,
            default_sort=ObjectQueryDefaultSort(key="sort_order", dir="asc"),
            search=ObjectQuerySearchCapability(
                enabled=True,
                max_text_length=120,
                default_columns=list(DEFAULT_SEARCH_COLUMNS),
            ),
            fields=[self._field_capability(field, rows) for field in FIELDS],
        )

    async def query(
        self,
        data: ElectricalQueryRequest,
        principal: CurrentPrincipal,
    ) -> ElectricalQueryResponse:
        await ProjectService(self.db).get_project_basic(data.project_id, principal)
        page = max(data.page, 1)
        page_size = min(max(data.page_size, 1), MAX_PAGE_SIZE)

        if self._can_use_default_page(data):
            if page == 1 or (data.after_sort_order is not None and data.after_id is not None):
                return await self._query_default_keyset_page(data, page=page, page_size=page_size)
            objects, calculations, summary, page_info = await CalculationContainer(
                self.db
            ).electrical_summary.electrical_project_page(
                data.project_id,
                electrical_variant_id=data.electrical_variant_id,
                page=page,
                page_size=page_size,
            )
            calc_summaries = await self._calc_summaries(calculations, data.cable_source)
            return ElectricalQueryResponse(
                items=[self._object_summary(obj) for obj in objects],
                calculations=calc_summaries,
                assignments=await self._load_assignment_projection(
                    data,
                    [obj.id for obj in objects],
                ),
                summary=ElectricalPageSummary(**summary),
                page_info=page_info,
                counts=ElectricalQueryCounts(
                    total=int(summary["total_objects"]),
                    filtered=int(summary["total_objects"]),
                ),
                query=self._query_echo(data),
            )
        if self._can_use_sql_query(data):
            if page == 1 or self._has_keyset_cursor(data):
                return await self._query_sql_keyset_page(data, page=page, page_size=page_size)
            return await self._query_sql_offset_page(data, page=page, page_size=page_size)

        await self._ensure_python_fallback_size(data.project_id)
        rows = await self._load_rows(
            data.project_id,
            data.electrical_variant_id,
        )
        filtered_rows = self._apply_search(rows, data)
        filtered_rows = self._apply_filters(filtered_rows, data)
        sorted_rows = self._apply_sort(filtered_rows, data)

        filtered_count = len(sorted_rows)
        offset = (page - 1) * page_size
        page_rows = sorted_rows[offset : offset + page_size]
        total_pages = ceil(filtered_count / page_size) if filtered_count else 0

        _, _, summary, _ = await CalculationContainer(
            self.db
        ).electrical_summary.electrical_project_page(
            data.project_id,
            electrical_variant_id=data.electrical_variant_id,
            page=1,
            page_size=1,
        )
        page_calcs = [row.calc for row in page_rows if row.calc is not None]
        calc_summaries = await self._calc_summaries(page_calcs, data.cable_source)

        return ElectricalQueryResponse(
            items=[self._object_summary(row.obj) for row in page_rows],
            calculations=calc_summaries,
            assignments=await self._load_assignment_projection(
                data,
                [row.obj.id for row in page_rows],
            ),
            summary=ElectricalPageSummary(**summary),
            page_info=ProjectObjectsPageInfo(
                page=page,
                page_size=page_size,
                offset=offset,
                total_pages=total_pages,
                has_next_page=page * page_size < filtered_count,
                has_previous_page=page > 1,
            ),
            counts=ElectricalQueryCounts(total=len(rows), filtered=filtered_count),
            query=self._query_echo(data),
        )

    async def _query_default_keyset_page(
        self,
        data: ElectricalQueryRequest,
        *,
        page: int,
        page_size: int,
    ) -> ElectricalQueryResponse:
        conditions = [ProjectObject.project_id == data.project_id]
        if data.after_sort_order is not None and data.after_id is not None:
            conditions.append(
                or_(
                    ProjectObject.sort_order > data.after_sort_order,
                    and_(
                        ProjectObject.sort_order == data.after_sort_order,
                        ProjectObject.id > data.after_id,
                    ),
                )
            )

        objects_result = await self.db.execute(
            select(ProjectObject)
            .where(*conditions)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
            .limit(page_size + 1)
        )
        fetched_objects = list(objects_result.scalars().all())
        has_next_page = len(fetched_objects) > page_size
        objects = fetched_objects[:page_size]
        object_ids = [obj.id for obj in objects]

        if object_ids:
            calculations_result = await self.db.execute(
                select(ElectricalCalculation).where(
                    *self._calculation_scope_conditions(data),
                    ElectricalCalculation.object_id.in_(object_ids),
                )
            )
            calculations = list(calculations_result.scalars().all())
        else:
            calculations = []

        _, _, summary, _ = await CalculationContainer(
            self.db
        ).electrical_summary.electrical_project_page(
            data.project_id,
            electrical_variant_id=data.electrical_variant_id,
            page=1,
            page_size=1,
        )
        total_objects = int(summary["total_objects"])
        total_pages = ceil(total_objects / page_size) if total_objects else 0
        offset = (page - 1) * page_size
        last_object = objects[-1] if has_next_page and objects else None
        calc_summaries = await self._calc_summaries(calculations, data.cable_source)

        return ElectricalQueryResponse(
            items=[self._object_summary(obj) for obj in objects],
            calculations=calc_summaries,
            assignments=await self._load_assignment_projection(data, object_ids),
            summary=ElectricalPageSummary(**summary),
            page_info=ProjectObjectsPageInfo(
                page=page,
                page_size=page_size,
                offset=offset,
                total_pages=total_pages,
                has_next_page=has_next_page,
                has_previous_page=page > 1,
                next_cursor=ProjectObjectsPageCursor(
                    sort_order=last_object.sort_order,
                    id=last_object.id,
                    key="sort_order",
                    value=last_object.sort_order,
                    value_is_null=False,
                )
                if last_object is not None
                else None,
            ),
            counts=ElectricalQueryCounts(total=total_objects, filtered=total_objects),
            query=self._query_echo(data),
        )

    @staticmethod
    def _calculation_scope_conditions(data: ElectricalQueryRequest) -> list[Any]:
        conditions: list[Any] = [ElectricalCalculation.project_id == data.project_id]
        conditions.append(ElectricalCalculation.electrical_variant_id == data.electrical_variant_id)
        return conditions

    @classmethod
    def _calculation_join_condition(cls, data: ElectricalQueryRequest) -> Any:
        return and_(
            ElectricalCalculation.object_id == ProjectObject.id,
            *cls._calculation_scope_conditions(data),
        )

    @staticmethod
    def _query_echo(data: ElectricalQueryRequest) -> ElectricalQueryEcho:
        return ElectricalQueryEcho(
            electrical_variant_id=data.electrical_variant_id,
            sort=data.sort,
        )

    def _sql_expr(self, field: FieldDef) -> Any:
        factory = ELECTRICAL_SQL_EXPRESSIONS.get(field.key)
        if factory is None:
            raise ElectricalQueryValidationError(f"Поле {field.key} не поддерживает SQL-query")
        return factory()

    def _sql_text_expr(self, field: FieldDef, expr: Any | None = None) -> Any:
        expr = self._sql_expr(field) if expr is None else expr
        if field.static_options:
            return _sql_label_expr(expr, field.static_options)
        return cast(expr, String)

    def _sql_empty_clause(self, expr: Any) -> Any:
        text_expr = cast(expr, String)
        return or_(expr.is_(None), text_expr == "", text_expr == "—")

    def _sql_search_clause(self, data: ElectricalQueryRequest) -> Any | None:
        text = (data.search.text if data.search else "").strip()
        if not text:
            return None
        columns = (
            data.search.columns
            if data.search and data.search.columns
            else list(DEFAULT_SEARCH_COLUMNS)
        )
        needle = _normal_text(text)
        clauses = []
        for key in columns:
            field = self._field(key)
            clauses.append(func.lower(self._sql_text_expr(field)).contains(needle))
        return or_(*clauses) if clauses else None

    def _sql_filter_clause(self, field: FieldDef, item: Any) -> Any | None:
        expr = self._sql_expr(field)
        empty_clause = self._sql_empty_clause(expr)
        if item.op == "contains":
            needle = _normal_text(item.value)
            if not needle:
                return None
            return func.lower(self._sql_text_expr(field, expr)).contains(needle)

        if item.op == "range":
            clauses = [empty_clause] if item.include_empty else []
            range_clauses = [empty_clause.is_(False)]
            if item.min is not None:
                range_clauses.append(expr >= item.min)
            if item.max is not None:
                range_clauses.append(expr <= item.max)
            clauses.append(and_(*range_clauses))
            return or_(*clauses) if item.include_empty else clauses[-1]

        if item.op == "in":
            values = [str(value) for value in item.values or []]
            clauses = [empty_clause] if item.include_empty else []
            if values:
                clauses.append(cast(expr, String).in_(values))
                if field.static_options:
                    clauses.append(self._sql_text_expr(field, expr).in_(values))
            return or_(*clauses) if clauses else None

        if item.op == "equals":
            clauses = [empty_clause] if item.include_empty else []
            if item.value is not None:
                clauses.append(cast(expr, String) == str(item.value))
            return or_(*clauses) if clauses else None

        return None

    def _sql_order_by(self, data: ElectricalQueryRequest) -> list[Any]:
        return self._sql_order_spec(data).order_by

    def _sql_order_spec(self, data: ElectricalQueryRequest) -> SqlOrderSpec:
        if data.sort is None:
            return SqlOrderSpec(
                key="sort_order",
                direction="asc",
                value_expr=ProjectObject.sort_order,
                null_rank_expr=literal(0),
                order_by=[ProjectObject.sort_order.asc(), ProjectObject.id.asc()],
            )
        field = self._field(data.sort.key)
        expr = self._sql_expr(field)
        if field.sort_type in {"text", "label"}:
            order_value_expr = func.lower(self._sql_text_expr(field, expr))
        else:
            order_value_expr = expr
        empty_clause = self._sql_empty_clause(expr)
        null_rank_expr = case((empty_clause, 1), else_=0)
        value_expr = case((empty_clause, None), else_=order_value_expr)
        ordered = value_expr.desc() if data.sort.dir == "desc" else value_expr.asc()
        return SqlOrderSpec(
            key=field.key,
            direction=data.sort.dir,
            value_expr=value_expr,
            null_rank_expr=null_rank_expr,
            order_by=[
                null_rank_expr.asc(),
                ordered,
                ProjectObject.sort_order.asc(),
                ProjectObject.id.asc(),
            ],
        )

    def _has_keyset_cursor(self, data: ElectricalQueryRequest) -> bool:
        return data.after_sort_order is not None and data.after_id is not None

    def _sql_keyset_clause(self, spec: SqlOrderSpec, data: ElectricalQueryRequest) -> Any | None:
        if not self._has_keyset_cursor(data):
            return None
        cursor_key = data.after_key or "sort_order"
        if cursor_key != spec.key:
            raise ElectricalQueryValidationError(
                "Курсор не соответствует текущей сортировке таблицы"
            )
        if spec.key == "sort_order":
            return or_(
                ProjectObject.sort_order > data.after_sort_order,
                and_(
                    ProjectObject.sort_order == data.after_sort_order,
                    ProjectObject.id > data.after_id,
                ),
            )

        cursor_null_rank = 1 if data.after_value_is_null else 0
        if data.after_value is None and cursor_null_rank == 0:
            raise ElectricalQueryValidationError("Курсор сортировки не содержит значение")

        same_null_rank = spec.null_rank_expr == cursor_null_rank
        same_value = self._sql_cursor_value_equals(spec, data)
        clauses = [spec.null_rank_expr > cursor_null_rank]
        if cursor_null_rank == 0:
            value_compare = (
                spec.value_expr < data.after_value
                if spec.direction == "desc"
                else spec.value_expr > data.after_value
            )
            clauses.append(and_(same_null_rank, value_compare))
        clauses.append(
            and_(
                same_null_rank,
                same_value,
                ProjectObject.sort_order > data.after_sort_order,
            )
        )
        clauses.append(
            and_(
                same_null_rank,
                same_value,
                ProjectObject.sort_order == data.after_sort_order,
                ProjectObject.id > data.after_id,
            )
        )
        return or_(*clauses)

    def _sql_cursor_value_equals(self, spec: SqlOrderSpec, data: ElectricalQueryRequest) -> Any:
        if data.after_value_is_null:
            return spec.null_rank_expr == 1
        return spec.value_expr == data.after_value

    async def _ensure_python_fallback_size(self, project_id: UUID) -> None:
        count_result = await self.db.execute(
            select(func.count())
            .select_from(ProjectObject)
            .where(ProjectObject.project_id == project_id)
        )
        total = int(count_result.scalar_one() or 0)
        if total > PYTHON_FALLBACK_MAX_ROWS:
            raise ElectricalQueryValidationError(
                "Этот фильтр/сортировка недоступны для больших проектов без SQL-пути. "
                "Уточните запрос или используйте поддерживаемые поля таблицы."
            )

    @staticmethod
    def _cursor_value(value: Any) -> Any:
        if isinstance(value, Decimal):
            return float(value)
        return value

    async def _load_rows(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
        *,
        limit: int | None = None,
    ) -> list[ElectricalQueryRow]:
        objects_stmt = (
            select(ProjectObject)
            .where(ProjectObject.project_id == project_id)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
        )
        if limit is not None:
            objects_stmt = objects_stmt.limit(limit)
        objects_result = await self.db.execute(objects_stmt)
        objects = list(objects_result.scalars().all())
        object_ids = [obj.id for obj in objects]
        if not object_ids:
            return []

        calculation_conditions: list[Any] = [
            ElectricalCalculation.project_id == project_id,
            ElectricalCalculation.object_id.in_(object_ids),
        ]
        calculation_conditions.append(
            ElectricalCalculation.electrical_variant_id == electrical_variant_id
        )
        calculations_result = await self.db.execute(
            select(ElectricalCalculation).where(*calculation_conditions)
        )
        calculations_by_object_id = {
            calc.object_id: calc for calc in calculations_result.scalars().all()
        }
        return [
            ElectricalQueryRow(obj=obj, calc=calculations_by_object_id.get(obj.id))
            for obj in objects
        ]

    async def _load_assignment_projection(
        self,
        data: ElectricalQueryRequest,
        object_ids: list[UUID],
    ) -> list[ElectricalQueryAssignment]:
        """Load one exact UUID-scoped assignment page in a single bounded query."""

        if data.electrical_variant_id is None or not object_ids:
            return []
        result = await self.db.execute(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.project_id == data.project_id,
                ElectricalVariantObject.electrical_variant_id == data.electrical_variant_id,
                ElectricalVariantObject.object_id.in_(object_ids),
            )
        )
        by_object_id = {
            assignment.object_id: ElectricalQueryAssignment(
                object_id=assignment.object_id,
                system_type=assignment.system_type,
                assignment_state=assignment.assignment_state,
                version=assignment.version,
                electrical_overrides=assignment.electrical_overrides or {},
            )
            for assignment in result.scalars().all()
        }
        return [by_object_id[object_id] for object_id in object_ids if object_id in by_object_id]

    def _field_capability(
        self,
        field: FieldDef,
        rows: list[ElectricalQueryRow],
    ) -> ObjectQueryFieldCapability:
        options = self._field_options(field, rows)
        return ObjectQueryFieldCapability(
            key=field.key,
            label=field.label,
            title=field.title,
            data_type=field.data_type,
            unit=field.unit,
            filter=ObjectQueryFieldFilterCapability(
                enabled=field.filterable,
                ops=list(field.filter_ops),
                include_empty=field.filterable,
                reason=None if field.filterable else field.filter_reason or "unsupported",
            ),
            sort=ObjectQueryFieldSortCapability(
                enabled=field.sortable,
                type=field.sort_type,
                nulls="last" if field.sortable else None,
                collation="db_ru"
                if field.sortable and field.sort_type in {"text", "label"}
                else None,
                reason=None if field.sortable else field.sort_reason or "unsupported",
            ),
            options=options,
        )

    def _field_options(
        self,
        field: FieldDef,
        rows: list[ElectricalQueryRow],
    ) -> ObjectQueryFieldOptions | None:
        if field.options_mode is None:
            return None
        if field.options_mode in {"inline", "dictionary"}:
            items = [
                ObjectQueryOptionItem(value=value, label=label)
                for value, label in field.static_options
            ]
        else:
            values: dict[str, ObjectQueryOptionItem] = {}
            for row in rows:
                value = field.value(row)
                if _is_empty(value):
                    continue
                option_value = str(value)
                values[option_value] = ObjectQueryOptionItem(
                    value=option_value,
                    label=_field_label(field, value),
                )
            items = list(values.values())
        items.sort(key=lambda item: _normal_text(item.label))
        return ObjectQueryFieldOptions(
            mode=field.options_mode,
            items=items,
            include_empty=field.filterable,
        )

    def _field(self, key: str) -> FieldDef:
        field = FIELDS_BY_KEY.get(key)
        if field is None:
            raise ElectricalQueryValidationError(f"Неизвестное поле таблицы: {key}")
        return field

    def _can_use_default_page(self, data: ElectricalQueryRequest) -> bool:
        search_text = (data.search.text if data.search else "").strip()
        return not search_text and not data.filters and data.sort is None

    def _can_use_sql_query(self, data: ElectricalQueryRequest) -> bool:
        search_text = (data.search.text if data.search else "").strip()
        if search_text:
            columns = (
                data.search.columns
                if data.search and data.search.columns
                else list(DEFAULT_SEARCH_COLUMNS)
            )
            if any(self._field(key).key not in ELECTRICAL_SQL_EXPRESSIONS for key in columns):
                return False
        for item in data.filters:
            field = self._field(item.key)
            if item.op not in field.filter_ops or field.key not in ELECTRICAL_SQL_EXPRESSIONS:
                return False
            if (
                item.op == "range"
                and item.min is not None
                and item.max is not None
                and item.min > item.max
            ):
                raise ElectricalQueryValidationError("min не может быть больше max")
        if data.sort is not None:
            field = self._field(data.sort.key)
            if not field.sortable or field.key not in ELECTRICAL_SQL_EXPRESSIONS:
                return False
        return True

    async def _query_sql_keyset_page(
        self,
        data: ElectricalQueryRequest,
        *,
        page: int,
        page_size: int,
    ) -> ElectricalQueryResponse:
        join_condition = self._calculation_join_condition(data)
        conditions = [ProjectObject.project_id == data.project_id]
        search_clause = self._sql_search_clause(data)
        if search_clause is not None:
            conditions.append(search_clause)
        for item in data.filters:
            clause = self._sql_filter_clause(self._field(item.key), item)
            if clause is not None:
                conditions.append(clause)

        order_spec = self._sql_order_spec(data)
        keyset_clause = self._sql_keyset_clause(order_spec, data)
        if keyset_clause is not None:
            conditions.append(keyset_clause)

        count_conditions = conditions[:-1] if keyset_clause is not None else conditions
        count_result = await self.db.execute(
            select(func.count())
            .select_from(ProjectObject)
            .outerjoin(ElectricalCalculation, join_condition)
            .where(*count_conditions)
        )
        filtered_count = int(count_result.scalar_one() or 0)

        rows_result = await self.db.execute(
            select(
                ProjectObject,
                ElectricalCalculation,
                order_spec.value_expr.label("_cursor_value"),
                order_spec.null_rank_expr.label("_cursor_null_rank"),
            )
            .outerjoin(ElectricalCalculation, join_condition)
            .where(*conditions)
            .order_by(*order_spec.order_by)
            .limit(page_size + 1)
        )
        fetched_rows = list(rows_result.all())
        has_next_page = len(fetched_rows) > page_size
        fetched_page = fetched_rows[:page_size]
        page_rows = [
            ElectricalQueryRow(obj=obj, calc=calc)
            for obj, calc, _cursor_value, _cursor_null_rank in fetched_page
        ]
        total_pages = ceil(filtered_count / page_size) if filtered_count else 0

        _, _, summary, _ = await CalculationContainer(
            self.db
        ).electrical_summary.electrical_project_page(
            data.project_id,
            electrical_variant_id=data.electrical_variant_id,
            page=1,
            page_size=1,
        )
        offset = (page - 1) * page_size
        next_cursor = None
        if has_next_page and fetched_page:
            last_obj, _last_calc, cursor_value, cursor_null_rank = fetched_page[-1]
            next_cursor = ProjectObjectsPageCursor(
                sort_order=last_obj.sort_order,
                id=last_obj.id,
                key=order_spec.key,
                value=self._cursor_value(cursor_value),
                value_is_null=bool(cursor_null_rank),
            )
        page_calcs = [row.calc for row in page_rows if row.calc is not None]
        calc_summaries = await self._calc_summaries(page_calcs, data.cable_source)

        return ElectricalQueryResponse(
            items=[self._object_summary(row.obj) for row in page_rows],
            calculations=calc_summaries,
            assignments=await self._load_assignment_projection(
                data,
                [row.obj.id for row in page_rows],
            ),
            summary=ElectricalPageSummary(**summary),
            page_info=ProjectObjectsPageInfo(
                page=page,
                page_size=page_size,
                offset=offset,
                total_pages=total_pages,
                has_next_page=has_next_page,
                has_previous_page=page > 1,
                next_cursor=next_cursor,
            ),
            counts=ElectricalQueryCounts(
                total=int(summary["total_objects"]),
                filtered=filtered_count,
            ),
            query=self._query_echo(data),
        )

    async def _query_sql_offset_page(
        self,
        data: ElectricalQueryRequest,
        *,
        page: int,
        page_size: int,
    ) -> ElectricalQueryResponse:
        join_condition = self._calculation_join_condition(data)
        conditions = [ProjectObject.project_id == data.project_id]
        search_clause = self._sql_search_clause(data)
        if search_clause is not None:
            conditions.append(search_clause)
        for item in data.filters:
            clause = self._sql_filter_clause(self._field(item.key), item)
            if clause is not None:
                conditions.append(clause)

        count_result = await self.db.execute(
            select(func.count())
            .select_from(ProjectObject)
            .outerjoin(ElectricalCalculation, join_condition)
            .where(*conditions)
        )
        filtered_count = int(count_result.scalar_one() or 0)
        offset = (page - 1) * page_size
        if offset > SQL_OFFSET_FALLBACK_MAX_OFFSET:
            raise ElectricalQueryValidationError(
                "Глубокая пагинация без cursor недоступна для SQL-query таблицы. "
                "Перейдите последовательно вперёд или сбросьте страницу."
            )
        rows_result = await self.db.execute(
            select(ProjectObject, ElectricalCalculation)
            .outerjoin(ElectricalCalculation, join_condition)
            .where(*conditions)
            .order_by(*self._sql_order_by(data))
            .offset(offset)
            .limit(page_size)
        )
        page_rows = [ElectricalQueryRow(obj=obj, calc=calc) for obj, calc in rows_result.all()]
        total_pages = ceil(filtered_count / page_size) if filtered_count else 0

        _, _, summary, _ = await CalculationContainer(
            self.db
        ).electrical_summary.electrical_project_page(
            data.project_id,
            electrical_variant_id=data.electrical_variant_id,
            page=1,
            page_size=1,
        )
        page_calcs = [row.calc for row in page_rows if row.calc is not None]
        calc_summaries = await self._calc_summaries(page_calcs, data.cable_source)

        return ElectricalQueryResponse(
            items=[self._object_summary(row.obj) for row in page_rows],
            calculations=calc_summaries,
            assignments=await self._load_assignment_projection(
                data,
                [row.obj.id for row in page_rows],
            ),
            summary=ElectricalPageSummary(**summary),
            page_info=ProjectObjectsPageInfo(
                page=page,
                page_size=page_size,
                offset=offset,
                total_pages=total_pages,
                has_next_page=page * page_size < filtered_count,
                has_previous_page=page > 1,
            ),
            counts=ElectricalQueryCounts(
                total=int(summary["total_objects"]),
                filtered=filtered_count,
            ),
            query=self._query_echo(data),
        )

    def _apply_search(
        self,
        rows: list[ElectricalQueryRow],
        data: ElectricalQueryRequest,
    ) -> list[ElectricalQueryRow]:
        text = (data.search.text if data.search else "").strip()
        if not text:
            return rows
        columns = (
            data.search.columns
            if data.search and data.search.columns
            else list(DEFAULT_SEARCH_COLUMNS)
        )
        fields = [self._field(key) for key in columns]
        needle = _normal_text(text)
        return [
            row
            for row in rows
            if any(
                needle in _normal_text(_field_label(field, field.value(row))) for field in fields
            )
        ]

    def _apply_filters(
        self,
        rows: list[ElectricalQueryRow],
        data: ElectricalQueryRequest,
    ) -> list[ElectricalQueryRow]:
        result = rows
        for item in data.filters:
            field = self._field(item.key)
            if item.op not in field.filter_ops:
                raise ElectricalQueryValidationError(
                    f"Операция {item.op} недоступна для поля {item.key}"
                )
            if (
                item.op == "range"
                and item.min is not None
                and item.max is not None
                and item.min > item.max
            ):
                raise ElectricalQueryValidationError("min не может быть больше max")
            result = [row for row in result if self._matches_filter(row, field, item)]
        return result

    def _matches_filter(self, row: ElectricalQueryRow, field: FieldDef, item: Any) -> bool:
        value = field.value(row)
        if item.op == "contains":
            needle = _normal_text(item.value)
            return not needle or needle in _normal_text(_field_label(field, value))

        if item.op == "range":
            if _is_empty(value):
                return bool(item.include_empty)
            numeric = _to_float(value)
            if numeric is None:
                return False
            if item.min is not None and numeric < item.min:
                return False
            return not (item.max is not None and numeric > item.max)

        if item.op == "in":
            values = [str(v) for v in item.values or []]
            if _is_empty(value):
                return bool(item.include_empty)
            return str(value) in values or _field_label(field, value) in values

        if item.op == "equals":
            if _is_empty(value):
                return bool(item.include_empty)
            return value == item.value or str(value) == str(item.value)

        return True

    def _apply_sort(
        self,
        rows: list[ElectricalQueryRow],
        data: ElectricalQueryRequest,
    ) -> list[ElectricalQueryRow]:
        if data.sort is None:
            return sorted(rows, key=lambda row: (row.obj.sort_order, str(row.obj.id)))
        field = self._field(data.sort.key)
        if not field.sortable:
            raise ElectricalQueryValidationError(f"Поле {field.key} не поддерживает сортировку")
        direction = data.sort.dir

        def compare(left: ElectricalQueryRow, right: ElectricalQueryRow) -> int:
            result = self._compare_values(field, left, right)
            if direction == "desc":
                result = -result
            if result != 0:
                return result
            return (
                (left.obj.sort_order > right.obj.sort_order)
                - (left.obj.sort_order < right.obj.sort_order)
            ) or ((str(left.obj.id) > str(right.obj.id)) - (str(left.obj.id) < str(right.obj.id)))

        return sorted(rows, key=cmp_to_key(compare))

    def _compare_values(
        self,
        field: FieldDef,
        left: ElectricalQueryRow,
        right: ElectricalQueryRow,
    ) -> int:
        left_value = field.value(left)
        right_value = field.value(right)
        left_empty = _is_empty(left_value)
        right_empty = _is_empty(right_value)
        if left_empty and right_empty:
            return 0
        if left_empty:
            return 1
        if right_empty:
            return -1
        if field.sort_type == "number":
            left_number = _to_float(left_value)
            right_number = _to_float(right_value)
            if left_number is not None and right_number is not None:
                return (left_number > right_number) - (left_number < right_number)
        left_label = _normal_text(_field_label(field, left_value))
        right_label = _normal_text(_field_label(field, right_value))
        return (left_label > right_label) - (left_label < right_label)

    async def _calc_summaries(
        self,
        calculations: list[ElectricalCalculation],
        catalog_source: str = "builtin",
    ) -> list[ElectricalCalcSummary]:
        statuses = await CalculationContainer(self.db).electrical_snapshots.statuses(
            calculations,
            catalog_source,
        )
        return [self._calc_summary(calc, statuses.get(calc.id)) for calc in calculations]

    def _calc_summary(
        self,
        calc: ElectricalCalculation | None,
        cable_snapshot_status: dict[str, Any] | None = None,
    ) -> ElectricalCalcSummary:
        if calc is None:
            raise ElectricalQueryValidationError("Нельзя сериализовать пустой электрорасчёт")
        return ElectricalCalcSummary(
            id=calc.id,
            object_id=calc.object_id,
            cable_type=calc.cable_type,
            cable_type_source=calc.cable_type_source,
            cable_mark=calc.cable_mark,
            cable_mark_source=calc.cable_mark_source,
            cable_snapshot=calc.cable_snapshot,
            cable_snapshot_status=cable_snapshot_status,
            electrical_variant_id=calc.electrical_variant_id,
            params=self._prune_dict(calc.params, ELECTRICAL_CALC_PARAM_KEYS),
            results=self._prune_dict(calc.results, ELECTRICAL_CALC_RESULT_KEYS),
        )

    def _object_summary(self, obj: ProjectObject) -> ProjectObjectResponse:
        return ProjectObjectResponse(
            id=obj.id,
            project_id=obj.project_id,
            version=obj.version,
            object_type=obj.object_type,
            sort_order=obj.sort_order,
            params=self._prune_dict(obj.params, ELECTRICAL_OBJECT_PARAM_KEYS) or {},
            results=self._prune_dict(obj.results, ELECTRICAL_OBJECT_RESULT_KEYS),
            is_valid=obj.is_valid,
            validation_errors=obj.validation_errors,
            created_at=obj.created_at,
            updated_at=obj.updated_at,
        )

    @staticmethod
    def _prune_dict(
        value: dict[str, Any] | None,
        keys: frozenset[str],
    ) -> dict[str, Any] | None:
        if not isinstance(value, dict):
            return None
        return {key: value[key] for key in keys if key in value}
