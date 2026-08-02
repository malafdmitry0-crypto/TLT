"""Unit-тесты CalculationService с мок-БД.

Цель — покрыть ветки кода сервиса без обращения к реальной БД:
* `calc_heat_loss` — pipe / tank / unknown type
* `recalculate_object` — success / validation error path
* `batch_recalculate` — агрегация успехов и ошибок
* `_save_failed_electrical` — создание / обновление
* `select_cable_manual` — препроверки (объект не найден, теплопотери не посчитаны)

Интеграционные аспекты (commit, транзакции) покрываются через
test_calculations.py::TestManualCableSelection.
"""

from __future__ import annotations

import math
import time
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.electrical_input_validation import (
    PROCESS_TEMPERATURE_NUMBER_MESSAGE,
    PROCESS_TEMPERATURE_REQUIRED_MESSAGE,
)
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_variant import ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.schemas.calculation import ElectricalRequest
from app.services.calculation_service import (
    BatchCancelChecker,
    BatchCancelledError,
    CalculationError,
    CalculationService,
    build_heat_loss_error_payload,
)

MINERAL_WOOL = "mineral_wool_boards_120"


def test_sphere_critical_radius_formula_rejection_has_structured_context():
    payload = build_heat_loss_error_payload(
        ValueError(
            "sphere_below_critical_insulation_radius "
            "router=0.81 rcritical=0.95 conductivity_outermost=0.18 "
            "alpha_vnesh_applied=9.0"
        ),
        object_type="tank",
    )

    assert payload["error_code"] == "sphere_below_critical_insulation_radius"
    assert payload["category"] == "validation"
    assert payload["field"] == "insulation_layers"
    assert payload["error_context"] == {
        "router": 0.81,
        "rcritical": 0.95,
        "conductivity_outermost": 0.18,
        "alpha_vnesh_applied": 9.0,
    }


def _mock_db_empty() -> AsyncMock:
    """Мок AsyncSession, возвращающий пустой список при любом execute()."""
    db = AsyncMock()
    result = MagicMock()
    result.scalars = lambda: MagicMock(all=lambda: [], first=lambda: None)
    result.scalar = lambda: 0
    result.scalar_one_or_none = lambda: None
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


def _count_result(value: int) -> MagicMock:
    result = MagicMock()
    result.scalar = lambda: value
    return result


def _objects_result(objects: list[object]) -> MagicMock:
    result = MagicMock()
    result.scalars = lambda: MagicMock(all=lambda: objects)
    return result


def _statement_entity(statement: object) -> object | None:
    descriptions = getattr(statement, "column_descriptions", ())
    return descriptions[0].get("entity") if descriptions else None


def _batch_execute_mock(
    *,
    total_count: int,
    object_chunks: list[list[object]],
) -> AsyncMock:
    """Mock batch reads by query role, not by a fragile positional side effect."""
    remaining_chunks = iter(object_chunks)
    query_names: list[str] = []

    async def execute(statement: object) -> MagicMock:
        entity = _statement_entity(statement)
        if entity is Project:
            query_names.append("project_lock")
            return _objects_result([])
        if entity is ProjectObject:
            description = statement.column_descriptions[0]
            if description["name"] == "count":
                query_names.append("object_count")
                return _count_result(total_count)
            query_names.append("object_chunk")
            try:
                return _objects_result(next(remaining_chunks))
            except StopIteration as exc:
                raise AssertionError("Unexpected extra project-object chunk query") from exc
        raise AssertionError(f"Unexpected batch DB query for {entity!r}")

    mock = AsyncMock(side_effect=execute)
    mock.query_names = query_names
    return mock


def _stale_execute_mock(
    *,
    calculations: list[object],
    candidates: list[object],
    assignments: list[object],
) -> AsyncMock:
    """Provide explicit stale-invalidation reads for every affected ER entity."""
    query_names: list[str] = []

    async def execute(statement: object) -> MagicMock:
        entity = _statement_entity(statement)
        if entity is ElectricalCalculation:
            query_names.append("electrical_calculations")
            return _objects_result(calculations)
        if entity is ElectricalCandidate:
            query_names.append("electrical_candidates")
            return _objects_result(candidates)
        if entity is ElectricalVariantObject:
            query_names.append("electrical_assignments")
            return _objects_result(assignments)
        raise AssertionError(f"Unexpected stale-invalidation DB query for {entity!r}")

    mock = AsyncMock(side_effect=execute)
    mock.query_names = query_names
    return mock


def _minimal_pipe_params() -> dict[str, object]:
    return {
        "outer_diameter": 0.1,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -10,
        "process_temperature": 60,
        "pipe_length": 10,
        "placement": "outdoor",
        "wind_speed": 0,
    }


def _electrical_upsert_row(project_id: uuid.UUID, object_id: uuid.UUID) -> dict[str, object]:
    return {
        "id": uuid.uuid4(),
        "project_id": project_id,
        "object_id": object_id,
        "variant_number": 1,
        "cable_type": "self_regulating",
        "cable_type_source": "auto",
        "cable_mark": "TLT-30",
        "cable_mark_source": "auto",
        "params": {},
        "results": {"selected_cable": "TLT-30"},
    }


def _bulk_upsert_result(rows: list[dict[str, object]]) -> MagicMock:
    result = MagicMock()
    result.scalars = lambda: MagicMock(
        all=lambda: [SimpleNamespace(object_id=row["object_id"]) for row in rows]
    )
    return result


def _disable_stale_mark(service: CalculationService) -> None:
    service.mark_electrical_calculations_stale = AsyncMock(return_value=0)  # type: ignore[method-assign]
    service.mark_project_specifications_stale = AsyncMock(return_value=0)  # type: ignore[method-assign]


class ManualClock:
    def __init__(self) -> None:
        self.value = 0.0

    def __call__(self) -> float:
        return self.value

    def advance_ms(self, value: int) -> None:
        self.value += value / 1000


# ═══════════════════════════════════════════════════════════════════════════
# calc_heat_loss — ветки
# ═══════════════════════════════════════════════════════════════════════════


class TestCalcHeatLoss:
    async def test_pipe_happy_path(self):
        service = CalculationService(_mock_db_empty())
        result = await service.calc_heat_loss(
            "pipe",
            {**_minimal_pipe_params(), "outer_diameter": 0.108, "ambient_temperature": -30},
        )
        assert "heat_loss_per_meter_base" in result
        assert "total_heat_loss_design" in result
        assert result["heat_loss_per_meter_base"] > 0

    async def test_tank_happy_path(self):
        service = CalculationService(_mock_db_empty())
        result = await service.calc_heat_loss(
            "tank",
            {
                "shape": "cylindrical",
                "diameter": 2.0,
                "height": 3.0,
                "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "placement": "outdoor",
                "wind_speed": 0,
                "safety_factor": 1.1,
            },
        )
        assert "heat_loss_per_m2_bare_base" in result
        assert "surface_area_bare" in result
        assert result["surface_area_bare"] > 0

    async def test_unknown_object_type_raises(self):
        service = CalculationService(_mock_db_empty())
        with pytest.raises(CalculationError, match="Неподдерживаемый"):
            await service.calc_heat_loss("spaceship", {})


# ═══════════════════════════════════════════════════════════════════════════
# recalculate_object — success / failure path
# ═══════════════════════════════════════════════════════════════════════════


class TestRecalculateObject:
    async def test_success_sets_is_valid_true_and_clears_errors(self):
        """Корректный объект → is_valid=True, validation_errors=None."""
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            object_type="pipe",
            params={**_minimal_pipe_params(), "ambient_temperature": -30},
            results=None,
            is_valid=False,
            validation_errors={"message": "old"},
        )
        result = await service.recalculate_object(obj)
        assert result is obj
        assert obj.is_valid is True
        assert obj.validation_errors is None
        assert obj.results is not None
        assert obj.results["heat_loss_per_meter_base"] > 0

    async def test_failure_sets_is_valid_false_and_captures_error(self):
        """Некорректные параметры (T_proc ≤ T_amb) → is_valid=False + error."""
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            object_type="pipe",
            params={
                **_minimal_pipe_params(),
                "ambient_temperature": 50,
                "process_temperature": 50,
            },
            results=None,
            is_valid=True,  # начальное состояние
            validation_errors=None,
        )
        result = await service.recalculate_object(obj)
        assert result is obj
        assert obj.is_valid is False
        assert obj.validation_errors is not None
        assert obj.validation_errors["category"] == "validation"
        assert obj.validation_errors["error_code"] == "process_temperature_not_above_ambient"
        # Сообщение об ошибке содержит упоминание T_продукта
        err_msg = obj.validation_errors["message"].lower()
        assert "выше" in err_msg or "температур" in err_msg

    async def test_failure_clears_results(self):
        """При ошибке results должен обнулиться (а не сохранить старые)."""
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            object_type="pipe",
            params={"outer_diameter": -1},  # невалидный
            results={"heat_loss_per_meter_base": 123},  # старые данные
            is_valid=True,
            validation_errors=None,
        )
        await service.recalculate_object(obj)
        assert obj.results is None

    async def test_tank_recalculate(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            object_type="tank",
            params={
                "shape": "cylindrical",
                "diameter": 1.5,
                "height": 2.0,
                "insulation_layers": [{"thickness": 0.06, "material": MINERAL_WOOL}],
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -10,
                "process_temperature": 60,
                "placement": "outdoor",
                "wind_speed": 0,
                "safety_factor": 1.1,
            },
            results=None,
            is_valid=False,
            validation_errors=None,
        )
        await service.recalculate_object(obj)
        assert obj.is_valid is True
        assert obj.results["surface_area_bare"] > 0

    async def test_unknown_object_type_marks_invalid(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            object_type="what_is_this",
            params={},
            results=None,
            is_valid=True,
            validation_errors=None,
        )
        await service.recalculate_object(obj)
        assert obj.is_valid is False


# ═══════════════════════════════════════════════════════════════════════════
# get_coefficients — возвращает словарь по CorrectionCoefficient rows
# ═══════════════════════════════════════════════════════════════════════════


class TestGetCoefficients:
    async def test_returns_dict_from_db_rows(self):
        db = AsyncMock()
        # Имитируем строки CorrectionCoefficient
        rows = [
            SimpleNamespace(key="safety_factor", value=1.2),
            SimpleNamespace(key="wind_factor", value=1.0),
        ]
        result = MagicMock()
        result.scalars = lambda: MagicMock(all=lambda: rows)
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)
        coeffs = await service.get_coefficients()
        assert coeffs == {"safety_factor": 1.2}

    async def test_returns_empty_dict_when_no_rows(self):
        service = CalculationService(_mock_db_empty())
        coeffs = await service.get_coefficients()
        assert coeffs == {}


class TestClimatePolicy:
    def test_pipe_ge_100_uses_cold_fiveday_and_k_1_1(self):
        normalized = CalculationService._apply_climate_policy(
            "pipe",
            {
                "outer_diameter": 0.1,
                "ambient_temperature": -10,
                "climate_city": "Славгород",
            },
        )
        assert normalized["safety_factor"] == pytest.approx(1.1)
        assert normalized["ambient_temperature"] == pytest.approx(-35.0)
        assert normalized["climate_temperature_basis"] == "t_0_92"
        assert normalized["climate_policy_rule"] == "pipe_diameter_ge_100"

    def test_pipe_lt_100_uses_absolute_minimum_and_k_1_12(self):
        normalized = CalculationService._apply_climate_policy(
            "pipe",
            {
                "outer_diameter": 0.099,
                "ambient_temperature": -10,
                "climate_city": "Славгород",
            },
        )
        assert normalized["safety_factor"] == pytest.approx(1.12)
        assert normalized["ambient_temperature"] == pytest.approx(-48.0)
        assert normalized["climate_temperature_basis"] == "t_abs_min"
        assert normalized["climate_policy_rule"] == "pipe_diameter_lt_100"

    def test_non_pipe_uses_cold_fiveday_0_92_and_k_1_1(self):
        normalized = CalculationService._apply_climate_policy(
            "tank",
            {
                "ambient_temperature": -10,
                "climate_city": "Славгород",
            },
        )
        assert normalized["safety_factor"] == pytest.approx(1.1)
        assert normalized["ambient_temperature"] == pytest.approx(-35.0)
        assert normalized["climate_temperature_basis"] == "t_0_92"
        assert normalized["climate_policy_rule"] == "non_pipe_cold_fiveday_0_92"

    def test_backend_overrides_frontend_climate_basis_for_small_pipe(self):
        normalized = CalculationService._apply_climate_policy(
            "pipe",
            {
                "outer_diameter": 0.099,
                "ambient_temperature": -10,
                "climate_city": "Славгород",
                "climate_temperature_basis": "t_0_92",
            },
        )

        assert normalized["ambient_temperature"] == pytest.approx(-48.0)
        assert normalized["climate_temperature_basis"] == "t_abs_min"
        assert normalized["climate_policy_rule"] == "pipe_diameter_lt_100"

    def test_backend_preserves_manual_ambient_temperature_with_climate_city(self):
        normalized = CalculationService._apply_climate_policy(
            "pipe",
            {
                "outer_diameter": 0.108,
                "ambient_temperature": -40,
                "ambient_temperature_source": "manual",
                "climate_city": "Славгород",
            },
        )

        assert normalized["ambient_temperature"] == pytest.approx(-40.0)
        assert normalized["ambient_temperature_source"] == "manual"
        assert normalized["climate_temperature_basis"] == "t_0_92"
        assert normalized["climate_policy_rule"] == "pipe_diameter_ge_100"

    def test_backend_treats_default_safety_factor_as_overridable(self):
        normalized = CalculationService._apply_climate_policy(
            "pipe",
            {
                "outer_diameter": 0.099,
                "ambient_temperature": -10,
                "climate_city": "Славгород",
                "climate_temperature_basis": "t_0_92",
                "safety_factor": 1.1,
                "safety_factor_source": "default",
            },
        )

        assert normalized["safety_factor"] == pytest.approx(1.12)
        assert normalized["safety_factor_source"] == "climate_policy"

    def test_backend_preserves_manual_safety_factor(self):
        normalized = CalculationService._apply_climate_policy(
            "pipe",
            {
                "outer_diameter": 0.099,
                "ambient_temperature": -10,
                "climate_city": "Славгород",
                "safety_factor": 1.2,
            },
        )

        assert normalized["safety_factor"] == pytest.approx(1.2)
        assert normalized["safety_factor_source"] == "manual"

    def test_backend_preserves_manual_safety_factor_equal_to_default_without_source(self):
        normalized = CalculationService._apply_climate_policy(
            "pipe",
            {
                "outer_diameter": 0.099,
                "ambient_temperature": -10,
                "climate_city": "Славгород",
                "safety_factor": 1.1,
            },
        )

        assert normalized["safety_factor"] == pytest.approx(1.1)
        assert normalized["safety_factor_source"] == "manual"
        assert normalized["climate_policy_rule"] == "pipe_diameter_lt_100"

    def test_backend_drops_frontend_climate_basis_when_climate_not_applied(self):
        normalized = CalculationService._apply_climate_policy(
            "pipe",
            {
                "outer_diameter": 0.108,
                "ambient_temperature": -10,
                "climate_city": "Атлантида",
                "climate_temperature_basis": "t_abs_min",
            },
        )

        assert normalized["ambient_temperature"] == pytest.approx(-10.0)
        assert "climate_temperature_basis" not in normalized
        assert normalized["climate_policy_rule"] == "pipe_diameter_ge_100"

    def test_backend_drops_frontend_climate_basis_when_pipe_diameter_is_missing(self):
        normalized = CalculationService._apply_climate_policy(
            "pipe",
            {
                "ambient_temperature": -10,
                "climate_city": "Славгород",
                "climate_temperature_basis": "t_abs_min",
            },
        )

        assert normalized["ambient_temperature"] == pytest.approx(-10.0)
        assert "climate_temperature_basis" not in normalized
        assert "climate_policy_rule" not in normalized

    def test_backend_uses_climate_key_to_disambiguate_duplicate_city(self):
        hmao = CalculationService._apply_climate_policy(
            "pipe",
            {
                "outer_diameter": 0.099,
                "ambient_temperature": -10,
                "climate_key": "Ханты-Мансийский автономный округ – Югра|||Октябрьское",
                "climate_city": "Октябрьское",
                "climate_region": "Ханты-Мансийский автономный округ – Югра",
            },
        )
        chelyabinsk = CalculationService._apply_climate_policy(
            "pipe",
            {
                "outer_diameter": 0.099,
                "ambient_temperature": -10,
                "climate_key": "Челябинская область|||Октябрьское",
                "climate_city": "Октябрьское",
                "climate_region": "Челябинская область",
            },
        )

        assert hmao["ambient_temperature"] == pytest.approx(-56.0)
        assert chelyabinsk["ambient_temperature"] == pytest.approx(-44.0)


class TestCableLayoutMapping:
    def test_pipe_winding_pitch_converts_to_geometric_coefficient(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(object_type="pipe")
        coefficient = service._winding_coefficient(
            obj,
            {"winding_pitch": 1000},
            {"outer_diameter": 0.1},
            1.0,
        )
        assert coefficient > 1.0

    def test_pipe_winding_coefficient_must_not_exceed_diameter_limit(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(object_type="pipe")
        with pytest.raises(ValueError, match="Коэффициент навива"):
            service._winding_coefficient(
                obj,
                {"winding_coefficient": 1.5},
                {"outer_diameter": 0.108},
                1.0,
            )

    def test_pipe_winding_coefficient_allows_conservative_boundary(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(object_type="pipe")
        coefficient = service._winding_coefficient(
            obj,
            {"winding_coefficient": 1.4},
            {"outer_diameter": 0.108},
            1.0,
        )
        assert coefficient == pytest.approx(1.4)

    def test_implicit_default_winding_coefficient_is_clamped_to_diameter_limit(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(object_type="pipe")
        coefficient = service._winding_coefficient(
            obj,
            {},
            {"outer_diameter": 0.05},
            1.1,
        )
        assert coefficient == pytest.approx(1.0)

    def test_pipe_winding_pitch_must_exceed_outer_diameter(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(object_type="pipe")
        with pytest.raises(ValueError, match="больше наружного диаметра"):
            service._winding_coefficient(
                obj,
                {"winding_pitch": 50},
                {"outer_diameter": 0.1},
                1.0,
            )

    def test_saved_layout_is_used_when_batch_has_no_explicit_layout(self):
        service = CalculationService(_mock_db_empty())
        saved = SimpleNamespace(
            results={
                "winding_pitch": 120.0,
                "winding_coefficient": 2.79,
                "num_circuits": 2,
            }
        )
        layout = service._layout_overrides_from_existing(saved)
        merged = service._merge_electrical_overrides(
            {"supply_voltage": 220, "winding_pitch": None, "number_of_threads": None},
            layout,
        )
        assert merged["winding_pitch"] == 120.0
        assert merged["number_of_threads"] == 2
        assert "winding_coefficient" not in merged

    def test_auto_threads_are_not_reused_as_requested_layout(self):
        service = CalculationService(_mock_db_empty())
        saved = SimpleNamespace(
            cable_type="self_regulating",
            params={"number_of_threads_source": "auto"},
            results={
                "num_circuits": 2,
                "number_of_threads_source": "auto",
            },
        )
        layout = service._layout_overrides_from_existing(saved)
        assert "number_of_threads" not in layout

    def test_previous_manual_threads_are_reused_with_previous_source(self):
        service = CalculationService(_mock_db_empty())
        saved = SimpleNamespace(
            cable_type="self_regulating",
            params={"number_of_threads_source": "manual"},
            results={
                "num_circuits": 2,
                "number_of_threads_source": "manual",
            },
        )
        layout = service._layout_overrides_from_existing(saved)
        assert layout["number_of_threads"] == 2
        assert layout["number_of_threads_source"] == "previous_result"

    def test_explicit_batch_layout_overrides_saved_layout(self):
        service = CalculationService(_mock_db_empty())
        saved = SimpleNamespace(results={"winding_pitch": 120.0, "num_circuits": 2})
        merged = service._merge_electrical_overrides(
            {"winding_pitch": 0.0, "number_of_threads": 1},
            service._layout_overrides_from_existing(saved),
        )
        assert merged["winding_pitch"] == 0.0
        assert merged["number_of_threads"] == 1

    def test_auto_resistive_num_circuits_is_not_reused_as_manual_thread_override(self):
        service = CalculationService(_mock_db_empty())
        saved = SimpleNamespace(
            cable_type="single_core",
            results={
                "selection_mode": "auto",
                "winding_coefficient": 1.0,
                "num_circuits": 8,
            },
        )
        layout = service._layout_overrides_from_existing(saved)
        assert "number_of_threads" not in layout
        assert layout["winding_coefficient"] == pytest.approx(1.0)

    def test_tank_q_additional_is_not_safetied_twice_for_electrical_input(self):
        service = CalculationService(_mock_db_empty())
        safety_factor = 1.2
        total_heat_loss_base = 1000.0
        q_additional = 100.0
        total_heat_loss_design = total_heat_loss_base * safety_factor + q_additional
        heat_loss = service._tank_heat_loss_without_double_safety(
            {
                "total_heat_loss_base": total_heat_loss_base,
                "total_heat_loss_design": total_heat_loss_design,
                "safety_factor_applied": safety_factor,
                "q_additional_applied": q_additional,
            },
            fallback_safety_factor=1.1,
        )
        assert heat_loss == pytest.approx(total_heat_loss_design / safety_factor)
        # Downstream self-regulating formula applies K once and restores exact
        # Qdesign = Qbase*K + Qadditional (Qadditional is not multiplied twice).
        assert heat_loss * safety_factor == pytest.approx(total_heat_loss_design)

    def test_pipe_electrical_length_uses_effective_length(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            object_type="pipe",
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 50,
                "safety_factor": 1.1,
            },
            results={
                "heat_loss_per_meter_base": 20,
                "effective_length": 60,
            },
            is_valid=True,
        )

        data = service._build_electrical_data(
            obj=obj,
            cable_type="self_regulating",
            cable_mark=None,
            tlt_catalog=[],
            overrides={},
        )

        assert data["pipe_length"] == pytest.approx(60.0)
        assert data["number_of_threads"] is None
        assert data["requested_number_of_threads"] is None
        assert data["number_of_threads_source"] == "auto"

    def test_pipe_required_power_uses_raw_heat_loss_without_preapplied_factors(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            object_type="pipe",
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 50,
                "safety_factor": 1.1,
            },
            results={
                "heat_loss_per_meter_base": 20.0,
                "effective_length": 50,
            },
            is_valid=True,
        )

        data = service._build_electrical_data(
            obj=obj,
            cable_type="self_regulating",
            cable_mark=None,
            tlt_catalog=[],
            overrides={"safety_factor": 1.3},
        )

        assert data["required_power_per_meter"] == pytest.approx(20.0)
        assert data["safety_factor"] == pytest.approx(1.3)

    def test_ttn_uses_object_aggressive_product_when_override_absent(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            object_type="pipe",
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 50,
                "safety_factor": 1.1,
                "aggressive_product": True,
            },
            results={
                "heat_loss_per_meter_base": 20.0,
                "effective_length": 50,
            },
            is_valid=True,
        )

        data = service._build_electrical_data(
            obj=obj,
            cable_type="self_regulating_tt",
            cable_mark=None,
            tlt_catalog=[],
            overrides={},
        )

        assert data["aggressive_product"] is True

    def test_tlt_tank_required_power_uses_cable_geometry_not_m2(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            object_type="tank",
            params={
                "shape": "cylindrical",
                "diameter": 2.0,
                "height": 3.0,
                "ambient_temperature": -20,
                "process_temperature": 80,
                "safety_factor": 1.1,
            },
            results={
                "heat_loss_per_m2_bare_base": 60.0,
                "total_heat_loss_design": 1100.0,
                "safety_factor_applied": 1.1,
            },
            is_valid=True,
        )
        base_length = (math.pi * 2.0 / 2.0) * (3.0 / 0.1)

        data = service._build_electrical_data(
            obj=obj,
            cable_type="self_regulating",
            cable_mark=None,
            tlt_catalog=[],
            overrides={"laying_step": 0.1},
        )

        assert data["pipe_length"] == pytest.approx(base_length)
        assert data["required_power_per_meter"] == pytest.approx((1100.0 / 1.1) / base_length)
        assert data["required_power_per_meter"] != pytest.approx(60.0)

    def test_tank_electrical_requires_laying_geometry(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            object_type="tank",
            params={
                "shape": "cylindrical",
                "diameter": 2.0,
                "height": 3.0,
                "ambient_temperature": -20,
                "process_temperature": 80,
                "safety_factor": 1.1,
            },
            results={
                "heat_loss_per_m2_bare_base": 60.0,
                "total_heat_loss_design": 1100.0,
                "safety_factor_applied": 1.1,
            },
            is_valid=True,
        )

        with pytest.raises(CalculationError, match="геометрия укладки"):
            service._build_electrical_data(
                obj=obj,
                cable_type="self_regulating",
                cable_mark=None,
                tlt_catalog=[],
                overrides={},
            )

    def test_tlt_electrical_requires_process_temperature_for_tmax_check(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            object_type="pipe",
            params={
                "outer_diameter": 0.108,
                "ambient_temperature": -20,
                "pipe_length": 100,
                "safety_factor": 1.1,
            },
            results={
                "heat_loss_per_meter_base": 30,
                "total_heat_loss_design": 3000,
                "effective_length": 100,
            },
            is_valid=True,
        )

        with pytest.raises(CalculationError, match="температура продукта"):
            service._build_electrical_data(
                obj=obj,
                cable_type="self_regulating",
                cable_mark=None,
                tlt_catalog=[],
                overrides={},
            )

    @pytest.mark.parametrize("cable_type", ["self_regulating_tt", "single_core", "three_core"])
    def test_batch_electrical_data_requires_process_temperature_for_supported_types(
        self, cable_type: str
    ):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            object_type="pipe",
            params={
                "outer_diameter": 0.108,
                "ambient_temperature": -20,
                "pipe_length": 100,
                "safety_factor": 1.1,
            },
            results={
                "heat_loss_per_meter_base": 30,
                "total_heat_loss_design": 3000,
                "effective_length": 100,
            },
            is_valid=True,
        )

        with pytest.raises(CalculationError, match=PROCESS_TEMPERATURE_REQUIRED_MESSAGE):
            service._build_electrical_data(
                obj=obj,
                cable_type=cable_type,
                cable_mark=None,
                tlt_catalog=[],
                overrides={},
            )

    def test_direct_tlt_request_fills_process_temperature_from_object(self):
        service = CalculationService(_mock_db_empty())
        object_id = uuid.uuid4()
        request = ElectricalRequest(
            object_id=object_id,
            cable_type="self_regulating",
            data={
                "required_power_per_meter": 20,
                "ambient_temperature": -20,
                "pipe_length": 10,
            },
        )
        obj = SimpleNamespace(params={"process_temperature": 80})

        service._hydrate_electrical_request_from_object(request, obj)

        assert request.data["process_temperature"] == pytest.approx(80.0)

    @pytest.mark.parametrize(
        "cable_type",
        ["self_regulating", "self_regulating_tt", "single_core", "three_core"],
    )
    def test_direct_electrical_request_fills_process_temperature_for_all_supported_types(
        self, cable_type: str
    ):
        service = CalculationService(_mock_db_empty())
        request = ElectricalRequest(
            object_id=uuid.uuid4(),
            cable_type=cable_type,
            data={
                "required_power_per_meter": 20,
                "required_heat_loss": 1000,
                "ambient_temperature": -20,
                "pipe_length": 10,
            },
        )
        obj = SimpleNamespace(params={"process_temperature": 80})

        service._hydrate_electrical_request_from_object(request, obj)

        assert request.data["process_temperature"] == pytest.approx(80.0)

    def test_direct_tlt_request_requires_process_temperature_when_object_missing_it(self):
        service = CalculationService(_mock_db_empty())
        request = ElectricalRequest(
            object_id=uuid.uuid4(),
            cable_type="self_regulating",
            data={
                "required_power_per_meter": 20,
                "ambient_temperature": -20,
                "pipe_length": 10,
            },
        )
        obj = SimpleNamespace(params={})

        with pytest.raises(CalculationError, match="температура продукта"):
            service._hydrate_electrical_request_from_object(request, obj)

    @pytest.mark.parametrize(
        "cable_type",
        ["self_regulating", "self_regulating_tt", "single_core", "three_core"],
    )
    def test_direct_electrical_request_requires_process_temperature_for_all_supported_types(
        self, cable_type: str
    ):
        service = CalculationService(_mock_db_empty())
        request = ElectricalRequest(
            object_id=uuid.uuid4(),
            cable_type=cable_type,
            data={
                "required_power_per_meter": 20,
                "required_heat_loss": 1000,
                "ambient_temperature": -20,
                "pipe_length": 10,
            },
        )
        obj = SimpleNamespace(params={})

        with pytest.raises(CalculationError, match=PROCESS_TEMPERATURE_REQUIRED_MESSAGE):
            service._hydrate_electrical_request_from_object(request, obj)

    def test_direct_electrical_request_rejects_invalid_process_temperature_before_fallback(self):
        service = CalculationService(_mock_db_empty())
        request = ElectricalRequest(
            object_id=uuid.uuid4(),
            cable_type="single_core",
            data={
                "required_heat_loss": 1000,
                "ambient_temperature": -20,
                "pipe_length": 10,
                "process_temperature": "bad",
            },
        )
        obj = SimpleNamespace(params={"process_temperature": 80})

        with pytest.raises(CalculationError, match=PROCESS_TEMPERATURE_NUMBER_MESSAGE):
            service._hydrate_electrical_request_from_object(request, obj)

    def test_resistive_electrical_data_uses_db_policy_coefficients_with_fallbacks(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            object_type="pipe",
            params={
                "outer_diameter": 0.108,
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 100,
                "safety_factor": 1.1,
            },
            results={
                "heat_loss_per_meter_base": 30,
                "total_heat_loss_design": 3000,
                "effective_length": 100,
            },
            is_valid=True,
        )

        data = service._build_electrical_data(
            obj=obj,
            cable_type="single_core",
            cable_mark=None,
            tlt_catalog=[],
            overrides={},
            coefficients={
                "resistive_max_current_a": 60.0,
                "resistive_max_parallel_schemes": 7.0,
                "resistive_single_core_max_linear_power_w_m": 45.0,
            },
        )

        assert data["selection_mode"] == "auto"
        assert data["max_current_a"] == pytest.approx(60.0)
        assert data["max_parallel_schemes"] == 7
        assert data["max_linear_power_w_m"] == pytest.approx(45.0)
        assert data["high_voltage"] == pytest.approx(380.0)
        assert data["min_adjusted_voltage"] == pytest.approx(40.0)
        assert data["voltage_step"] == pytest.approx(5.0)

    def test_resistive_electrical_data_uses_three_core_catalog_cap_and_ignores_legacy_global(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            object_type="pipe",
            params={
                "outer_diameter": 0.108,
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 100,
                "safety_factor": 1.1,
            },
            results={
                "heat_loss_per_meter_base": 30,
                "total_heat_loss_design": 3000,
                "effective_length": 100,
            },
            is_valid=True,
        )

        data = service._build_electrical_data(
            obj=obj,
            cable_type="three_core",
            cable_mark=None,
            tlt_catalog=[],
            overrides={},
            coefficients={
                "resistive_max_linear_power_w_m": 40.0,
            },
        )

        assert data["selection_mode"] == "auto"
        assert data["max_linear_power_w_m"] == pytest.approx(50.0)


class TestCableSourceNormalization:
    def test_source_normalizers_accept_case_and_whitespace(self):
        assert CalculationService._normalize_cable_type_source(" Manual ") == "manual"
        assert CalculationService._normalize_cable_type_source("BULK") == "bulk"
        assert CalculationService._normalize_cable_mark_source(" Manual ") == "manual"
        assert (
            CalculationService._resolve_cable_mark_source(
                {"cable_mark": "ТЛТ-60", "cable_mark_source": "Manual"}
            )
            == "manual"
        )

    def test_skip_manual_is_conservative_for_unknown_source_with_saved_mark(self):
        calc = SimpleNamespace(
            cable_mark="ТЛТ-60",
            cable_mark_source="manuel",
            params={},
        )

        assert CalculationService._is_manual_cable_selection(calc) is True

    def test_skip_manual_does_not_treat_known_auto_mark_as_manual(self):
        calc = SimpleNamespace(
            cable_mark="ТЛТ-60",
            cable_mark_source="AUTO",
            params={},
        )

        assert CalculationService._is_manual_cable_selection(calc) is False


# ═══════════════════════════════════════════════════════════════════════════
# stale electrical calculations
# ═══════════════════════════════════════════════════════════════════════════


class TestElectricalStale:
    async def test_marks_existing_electrical_result_as_stale_without_losing_fields(self):
        project_id = uuid.uuid4()
        object_id = uuid.uuid4()
        calc = SimpleNamespace(
            project_id=project_id,
            object_id=object_id,
            results={
                "selected_cable": "ТЛТ-30",
                "cable_length": 12.0,
            },
        )
        db = _mock_db_empty()
        db.execute = _stale_execute_mock(
            calculations=[calc],
            candidates=[],
            assignments=[],
        )
        db.flush = AsyncMock()

        count = await CalculationService(db).mark_electrical_calculations_stale(
            project_id,
            [object_id],
        )

        assert count == 1
        assert calc.results["selected_cable"] == "ТЛТ-30"
        assert calc.results["category"] == "stale"
        assert calc.results["error_code"] == "STALE_HEAT_LOSS"
        assert db.execute.query_names == [
            "electrical_calculations",
            "electrical_candidates",
            "electrical_assignments",
        ]
        db.flush.assert_awaited_once()


# ═══════════════════════════════════════════════════════════════════════════
# batch_recalculate — агрегация
# ═══════════════════════════════════════════════════════════════════════════


class TestBatchRecalculate:
    async def test_no_objects_returns_zeros(self):
        db = _mock_db_empty()
        service = CalculationService(db)
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]

        updated, failed, errors = await service.batch_recalculate(uuid.uuid4())

        assert updated == 0
        assert failed == 0
        assert errors == []
        service.get_coefficients.assert_not_awaited()
        db.commit.assert_awaited_once()

    async def test_processes_objects_in_chunks(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr("app.services.calculation_service.BATCH_HEAT_RECALCULATE_CHUNK_SIZE", 2)
        project_id = uuid.uuid4()
        objects = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                object_type="pipe",
                sort_order=index,
                params=_minimal_pipe_params(),
                results=None,
                is_valid=True,
                validation_errors=None,
            )
            for index in range(5)
        ]
        db = AsyncMock()
        db.execute = _batch_execute_mock(
            total_count=5,
            object_chunks=[objects[:2], objects[2:4], objects[4:]],
        )
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        _disable_stale_mark(service)
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]

        async def mark_valid(obj, *, coefficients=None):
            obj.is_valid = True
            obj.validation_errors = None
            obj.results = {"ok": True}
            return obj

        service.try_recalculate = AsyncMock(side_effect=mark_valid)  # type: ignore[method-assign]

        updated, failed, errors = await service.batch_recalculate(project_id)

        assert updated == 5
        assert failed == 0
        assert errors == []
        assert db.execute.query_names == [
            "project_lock",
            "object_count",
            "object_chunk",
            "object_chunk",
            "object_chunk",
        ]
        assert db.execute.await_count == 5
        assert db.flush.await_count == 3
        assert service.try_recalculate.await_count == 5

    async def test_yields_event_loop_inside_large_chunk(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(
            "app.services.calculation_service.BATCH_HEAT_RECALCULATE_CHUNK_SIZE", 10
        )
        monkeypatch.setattr(
            "app.services.calculation_service.BATCH_HEAT_RECALCULATE_YIELD_EVERY_OBJECTS",
            2,
        )
        sleep = AsyncMock()
        monkeypatch.setattr("app.services.calculation_service.asyncio.sleep", sleep)
        project_id = uuid.uuid4()
        objects = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                object_type="pipe",
                sort_order=index,
                params=_minimal_pipe_params(),
                results=None,
                is_valid=True,
                validation_errors=None,
            )
            for index in range(5)
        ]
        db = AsyncMock()
        db.execute = _batch_execute_mock(total_count=5, object_chunks=[objects])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        _disable_stale_mark(service)
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]

        async def mark_valid(obj, *, coefficients=None):
            obj.is_valid = True
            obj.validation_errors = None
            obj.results = {"ok": True}
            return obj

        service.try_recalculate = AsyncMock(side_effect=mark_valid)  # type: ignore[method-assign]

        updated, failed, errors = await service.batch_recalculate(project_id)

        assert updated == 5
        assert failed == 0
        assert errors == []
        assert db.execute.query_names == ["project_lock", "object_count", "object_chunk"]
        assert sleep.await_count == 3
        assert all(item.args == (0,) for item in sleep.await_args_list)

    async def test_mixed_success_and_failure(self):
        """Один валидный + один невалидный — счётчики и список ошибок правильные."""
        db = AsyncMock()
        project_id = uuid.uuid4()
        objects = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                object_type="pipe",
                sort_order=0,
                params=_minimal_pipe_params(),
                results=None,
                is_valid=False,
                validation_errors=None,
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                object_type="pipe",
                sort_order=1,
                params=_minimal_pipe_params(),
                results=None,
                is_valid=False,
                validation_errors=None,
            ),
        ]
        db.execute = _batch_execute_mock(total_count=2, object_chunks=[objects])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        _disable_stale_mark(service)
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]
        service._calc_heat_loss_with_coefficients = MagicMock(  # type: ignore[method-assign]
            side_effect=[
                {"heat_loss_per_meter_base": 10},
                ValueError("process temperature ниже ambient"),
            ]
        )

        updated, failed, errors = await service.batch_recalculate(project_id)

        assert updated == 1
        assert failed == 1
        assert len(errors) == 1
        assert errors[0]["object_id"] == str(objects[1].id)
        assert errors[0]["error"]["message"] == "process temperature ниже ambient"
        assert errors[0]["error"]["error_code"] == "invalid_object_params"
        assert errors[0]["error"]["category"] == "validation"
        assert db.execute.query_names == ["project_lock", "object_count", "object_chunk"]
        db.commit.assert_awaited_once()

    async def test_loads_coefficients_once_for_batch(self):
        project_id = uuid.uuid4()
        objects = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                object_type="pipe",
                sort_order=index,
                params=_minimal_pipe_params(),
                results=None,
                is_valid=False,
                validation_errors=None,
            )
            for index in range(3)
        ]
        db = AsyncMock()
        db.execute = _batch_execute_mock(total_count=3, object_chunks=[objects])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        _disable_stale_mark(service)
        coefficients = {"safety_factor": 1.0}
        service.get_coefficients = AsyncMock(return_value=coefficients)  # type: ignore[method-assign]
        service._calc_heat_loss_with_coefficients = MagicMock(  # type: ignore[method-assign]
            return_value={"heat_loss_per_meter_base": 10}
        )

        updated, failed, errors = await service.batch_recalculate(project_id)

        assert updated == 3
        assert failed == 0
        assert errors == []
        service.get_coefficients.assert_awaited_once()
        assert service._calc_heat_loss_with_coefficients.call_count == 3
        assert all(
            call.args[2] is coefficients
            for call in service._calc_heat_loss_with_coefficients.call_args_list
        )
        assert db.execute.query_names == ["project_lock", "object_count", "object_chunk"]

    async def test_climate_lookup_is_indexed_for_late_and_unknown_city_batch(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        project_id = uuid.uuid4()
        object_count = 600
        late_city = {
            **_minimal_pipe_params(),
            "outer_diameter": 0.099,
            "climate_key": "Ярославская область|||Ярославль",
            "climate_region": "Ярославская область",
            "climate_city": "Ярославль",
            "ambient_temperature_source": "climate",
        }
        unknown_city = {
            **_minimal_pipe_params(),
            "outer_diameter": 0.099,
            "climate_city": "Атлантида",
        }
        objects = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                object_type="pipe",
                sort_order=index,
                params=dict(late_city if index % 2 == 0 else unknown_city),
                results=None,
                is_valid=False,
                validation_errors=None,
            )
            for index in range(object_count)
        ]
        db = AsyncMock()
        db.execute = _batch_execute_mock(total_count=object_count, object_chunks=[objects])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        _disable_stale_mark(service)
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]

        climate_calls = 0

        from app.services import calculation_service as calculation_service_module

        original_get_climate_entry = calculation_service_module.get_climate_entry

        def counting_get_climate_entry(**kwargs):
            nonlocal climate_calls
            climate_calls += 1
            return original_get_climate_entry(**kwargs)

        monkeypatch.setattr(
            "app.services.calculation_service.get_climate_entry",
            counting_get_climate_entry,
        )

        started = time.perf_counter()
        updated, failed, errors = await service.batch_recalculate(project_id)
        elapsed_s = time.perf_counter() - started

        assert updated == object_count
        assert failed == 0
        assert errors == []
        assert climate_calls == object_count
        assert db.execute.query_names == ["project_lock", "object_count", "object_chunk"]
        assert elapsed_s < 1.0, (
            "heat-loss batch with late-list and unknown climate cities regressed: "
            f"{elapsed_s:.3f}s for {object_count} objects"
        )

    async def test_reports_progress(self):
        project_id = uuid.uuid4()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            object_type="pipe",
            sort_order=0,
            params=_minimal_pipe_params(),
            results=None,
            is_valid=False,
            validation_errors=None,
        )
        db = AsyncMock()
        db.execute = _batch_execute_mock(total_count=1, object_chunks=[[obj]])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        _disable_stale_mark(service)
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]
        service._calc_heat_loss_with_coefficients = MagicMock(  # type: ignore[method-assign]
            return_value={"heat_loss_per_meter_base": 10}
        )
        progress = []

        updated, failed, errors = await service.batch_recalculate(
            project_id,
            progress_callback=lambda item: progress.append(item),
        )

        assert updated == 1
        assert failed == 0
        assert errors == []
        assert [item.phase for item in progress] == ["prepare", "calculate", "commit", "done"]
        assert progress[1].current == 1
        assert progress[1].total == 1
        assert progress[1].calculated == 1
        assert db.execute.query_names == ["project_lock", "object_count", "object_chunk"]

    async def test_cancel_stops_before_commit(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_count_result(1))
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]

        with pytest.raises(BatchCancelledError, match="теплопотерь"):
            await service.batch_recalculate(uuid.uuid4(), should_cancel=lambda: True)

        service.get_coefficients.assert_not_awaited()
        db.flush.assert_not_awaited()
        db.commit.assert_not_awaited()


class TestBulkElectricalUpsert:
    async def test_bulk_upsert_chunks_rows_below_bind_limit(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(
            "app.services.calculation_service.ELECTRICAL_BULK_UPSERT_TARGET_CHUNK_SIZE",
            2,
        )
        db = AsyncMock()
        project_id = uuid.uuid4()
        object_ids = [uuid.uuid4() for _ in range(5)]
        rows = [_electrical_upsert_row(project_id, object_id) for object_id in object_ids]
        db.execute = AsyncMock(
            side_effect=[
                _bulk_upsert_result(rows[:2]),
                _bulk_upsert_result(rows[2:4]),
                _bulk_upsert_result(rows[4:]),
            ]
        )

        calcs = await CalculationService(db)._bulk_upsert_electrical_calculations(rows)

        assert db.execute.await_count == 3
        assert [calc.object_id for calc in calcs] == object_ids

    async def test_bulk_upsert_chunks_when_results_are_not_requested(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(
            "app.services.calculation_service.ELECTRICAL_BULK_UPSERT_TARGET_CHUNK_SIZE",
            2,
        )
        db = AsyncMock()
        project_id = uuid.uuid4()
        rows = [
            _electrical_upsert_row(project_id, object_id)
            for object_id in [uuid.uuid4() for _ in range(5)]
        ]
        db.execute = AsyncMock()

        calcs = await CalculationService(db)._bulk_upsert_electrical_calculations(
            rows,
            return_calcs=False,
        )

        assert calcs == []
        assert db.execute.await_count == 3


class TestBatchCancelChecker:
    async def test_throttles_cancel_checks_by_object_count_and_time(self):
        checks = 0

        def should_cancel() -> bool:
            nonlocal checks
            checks += 1
            return False

        clock = ManualClock()
        checker = BatchCancelChecker(
            should_cancel,
            min_objects=500,
            min_interval_seconds=0.5,
            now_func=clock,
        )

        await checker.check(0, force=True)
        await checker.check(100)
        await checker.check(499)
        await checker.check(500)
        clock.advance_ms(600)
        await checker.check(501)

        assert checks == 3

    async def test_force_check_can_cancel_before_chunk_write(self):
        checker = BatchCancelChecker(lambda: True)

        with pytest.raises(BatchCancelledError):
            await checker.check(2000, force=True)


class TestBatchElectricalCallbacks:
    async def test_batch_electrical_processes_objects_in_chunks(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.calculation_service.BATCH_ELECTRICAL_CHUNK_SIZE", 2)
        project_id = uuid.uuid4()
        objects = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                object_type="pipe",
                sort_order=index,
                params={
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 10,
                },
                results={"heat_loss_per_meter_base": 30, "total_heat_loss_design": 300},
                is_valid=True,
            )
            for index in range(5)
        ]
        count_result = MagicMock()
        count_result.one = lambda: (5, 5)

        def objects_result(chunk):
            result = MagicMock()
            result.scalars = lambda: MagicMock(all=lambda: chunk)
            return result

        existing_result = MagicMock()
        existing_result.scalars = lambda: MagicMock(all=lambda: [])
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                count_result,
                objects_result(objects[:2]),
                existing_result,
                objects_result(objects[2:4]),
                existing_result,
                objects_result(objects[4:]),
                existing_result,
            ]
        )
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service._calculate_electrical_result = MagicMock(  # type: ignore[method-assign]
            return_value=("ТЛТ-30", {"selected_cable": "ТЛТ-30"})
        )
        service._bulk_upsert_electrical_calculations = AsyncMock(  # type: ignore[method-assign]
            return_value=[]
        )

        calculated, skipped, heat_loss_failed, errors, calcs = await service.batch_calc_electrical(
            project_id,
            return_calcs=False,
        )

        assert calculated == 5
        assert skipped == 0
        assert heat_loss_failed == 0
        assert errors == []
        assert calcs == []
        assert service._bulk_upsert_electrical_calculations.await_count == 3
        chunk_lengths = [
            len(call.args[0])
            for call in service._bulk_upsert_electrical_calculations.await_args_list
        ]
        assert chunk_lengths == [2, 2, 1]

    async def test_batch_electrical_reports_progress(self):
        project_id = uuid.uuid4()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            object_type="pipe",
            sort_order=0,
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 10,
            },
            results={"heat_loss_per_meter_base": 30, "total_heat_loss_design": 300},
            is_valid=True,
        )
        db = AsyncMock()
        count_result = MagicMock()
        count_result.one = lambda: (1, 1)
        objects_result = MagicMock()
        objects_result.scalars = lambda: MagicMock(all=lambda: [obj])
        existing_result = MagicMock()
        existing_result.scalars = lambda: MagicMock(all=lambda: [])
        db.execute = AsyncMock(side_effect=[count_result, objects_result, existing_result])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service._calculate_electrical_result = MagicMock(  # type: ignore[method-assign]
            return_value=("ТЛТ-30", {"selected_cable": "ТЛТ-30"})
        )
        service._bulk_upsert_electrical_calculations = AsyncMock(  # type: ignore[method-assign]
            return_value=[]
        )
        progress = []

        calculated, skipped, heat_loss_failed, errors, _ = await service.batch_calc_electrical(
            project_id,
            progress_callback=lambda item: progress.append(item),
        )

        assert calculated == 1
        assert skipped == 0
        assert heat_loss_failed == 0
        assert errors == []
        assert [item.phase for item in progress] == ["prepare", "calculate", "commit", "done"]
        assert progress[1].current == 1
        assert progress[1].total == 1

    async def test_batch_electrical_saves_structured_error_if_build_data_fails(self):
        project_id = uuid.uuid4()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            object_type="tank",
            sort_order=0,
            params={
                "name": "Spherical tank",
                "shape": "spherical",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
            results={"total_heat_loss_design": 300, "safety_factor_applied": 1.1},
            is_valid=True,
        )
        db = AsyncMock()
        count_result = MagicMock()
        count_result.one = lambda: (1, 1)
        objects_result = MagicMock()
        objects_result.scalars = lambda: MagicMock(all=lambda: [obj])
        existing_result = MagicMock()
        existing_result.scalars = lambda: MagicMock(all=lambda: [])
        db.execute = AsyncMock(side_effect=[count_result, objects_result, existing_result])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service._bulk_upsert_electrical_calculations = AsyncMock(  # type: ignore[method-assign]
            return_value=[SimpleNamespace()]
        )

        calculated, skipped, heat_loss_failed, errors, _ = await service.batch_calc_electrical(
            project_id,
            return_calcs=False,
        )

        assert calculated == 0
        assert skipped == 1
        assert heat_loss_failed == 0
        assert errors[0]["error_code"] == "unsupported_layout"
        assert errors[0]["category"] == "unsupported"
        assert errors[0]["suggested_actions"] == []
        rows = next(
            call.args[0]
            for call in service._bulk_upsert_electrical_calculations.await_args_list
            if call.args[0]
        )
        failed_payload = rows[0]["results"]
        assert failed_payload["error_code"] == "unsupported_layout"
        assert failed_payload["category"] == "unsupported"
        assert "error" not in failed_payload
        assert failed_payload["message"].startswith("Электрорасчёт укладки кабеля")
        assert failed_payload["error_context"]["shape"] == "spherical"
        assert failed_payload["error_context"]["cable_type"] == "self_regulating"

    async def test_batch_electrical_uses_existing_cable_type_per_object(self):
        project_id = uuid.uuid4()
        objects = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                object_type="pipe",
                sort_order=index,
                params={
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 10,
                },
                results={"heat_loss_per_meter_base": 30, "total_heat_loss_design": 300},
                is_valid=True,
            )
            for index in range(2)
        ]
        existing_calcs = [
            SimpleNamespace(
                id=uuid.uuid4(),
                object_id=objects[0].id,
                cable_type="single_core",
                params={},
                results={},
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                object_id=objects[1].id,
                cable_type="three_core",
                params={},
                results={},
            ),
        ]
        count_result = MagicMock()
        count_result.one = lambda: (2, 2)
        objects_result = MagicMock()
        objects_result.scalars = lambda: MagicMock(all=lambda: objects)
        existing_result = MagicMock()
        existing_result.scalars = lambda: MagicMock(all=lambda: existing_calcs)
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[count_result, objects_result, existing_result])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]
        service._calculate_electrical_result = MagicMock(  # type: ignore[method-assign]
            return_value=("Кабель", {"selected_cable": "Кабель"})
        )
        service._bulk_upsert_electrical_calculations = AsyncMock(  # type: ignore[method-assign]
            return_value=[]
        )

        calculated, skipped, heat_loss_failed, errors, _ = await service.batch_calc_electrical(
            project_id,
            cable_type="self_regulating",
            return_calcs=False,
        )

        assert calculated == 2
        assert skipped == 0
        assert heat_loss_failed == 0
        assert errors == []
        request_types = [
            call.args[0].cable_type for call in service._calculate_electrical_result.call_args_list
        ]
        assert request_types == ["single_core", "three_core"]
        rows = service._bulk_upsert_electrical_calculations.await_args.args[0]
        assert [row["cable_type"] for row in rows] == ["single_core", "three_core"]
        assert [row["cable_type_source"] for row in rows] == ["auto", "auto"]
        assert [row["cable_mark_source"] for row in rows] == ["auto", "auto"]

    async def test_batch_electrical_force_cable_type_ignores_existing_types(self):
        project_id = uuid.uuid4()
        objects = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                object_type="pipe",
                sort_order=index,
                params={
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 10,
                },
                results={"heat_loss_per_meter_base": 30, "total_heat_loss_design": 300},
                is_valid=True,
            )
            for index in range(2)
        ]
        existing_calcs = [
            SimpleNamespace(
                id=uuid.uuid4(),
                object_id=objects[0].id,
                cable_type="single_core",
                params={},
                results={},
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                object_id=objects[1].id,
                cable_type="three_core",
                params={},
                results={},
            ),
        ]
        count_result = MagicMock()
        count_result.one = lambda: (2, 2)
        objects_result = MagicMock()
        objects_result.scalars = lambda: MagicMock(all=lambda: objects)
        existing_result = MagicMock()
        existing_result.scalars = lambda: MagicMock(all=lambda: existing_calcs)
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[count_result, objects_result, existing_result])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]
        service._calculate_electrical_result = MagicMock(  # type: ignore[method-assign]
            return_value=("Кабель", {"selected_cable": "Кабель"})
        )
        service._bulk_upsert_electrical_calculations = AsyncMock(  # type: ignore[method-assign]
            return_value=[]
        )

        calculated, skipped, heat_loss_failed, errors, _ = await service.batch_calc_electrical(
            project_id,
            cable_type="self_regulating",
            force_cable_type=True,
            return_calcs=False,
        )

        assert calculated == 2
        assert skipped == 0
        assert heat_loss_failed == 0
        assert errors == []
        request_types = [
            call.args[0].cable_type for call in service._calculate_electrical_result.call_args_list
        ]
        assert request_types == ["self_regulating", "self_regulating"]
        rows = service._bulk_upsert_electrical_calculations.await_args.args[0]
        assert [row["cable_type"] for row in rows] == ["self_regulating", "self_regulating"]
        assert [row["cable_type_source"] for row in rows] == ["bulk", "bulk"]
        assert [row["cable_mark_source"] for row in rows] == ["auto", "auto"]

    async def test_batch_electrical_marks_object_override_as_manual_source(self):
        project_id = uuid.uuid4()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            object_type="pipe",
            sort_order=0,
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 10,
            },
            results={"heat_loss_per_meter_base": 30, "total_heat_loss_design": 300},
            is_valid=True,
        )
        count_result = MagicMock()
        count_result.one = lambda: (1, 1)
        ids_result = MagicMock()
        ids_result.scalars = lambda: MagicMock(all=lambda: [obj.id])
        objects_result = MagicMock()
        objects_result.scalars = lambda: MagicMock(all=lambda: [obj])
        existing_result = MagicMock()
        existing_result.scalars = lambda: MagicMock(all=lambda: [])
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[ids_result, ids_result, count_result, objects_result, existing_result]
        )
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]
        service._calculate_electrical_result = MagicMock(  # type: ignore[method-assign]
            return_value=("Кабель", {"selected_cable": "Кабель"})
        )
        service._bulk_upsert_electrical_calculations = AsyncMock(  # type: ignore[method-assign]
            return_value=[]
        )

        calculated, skipped, heat_loss_failed, errors, _ = await service.batch_calc_electrical(
            project_id,
            object_ids=[obj.id],
            object_overrides=[{"object_id": obj.id, "cable_type": "three_core"}],
            return_calcs=False,
        )

        assert calculated == 1
        assert skipped == 0
        assert heat_loss_failed == 0
        assert errors == []
        rows = service._bulk_upsert_electrical_calculations.await_args.args[0]
        assert rows[0]["cable_type"] == "three_core"
        assert rows[0]["cable_type_source"] == "manual"
        assert rows[0]["cable_mark_source"] == "auto"

    async def test_batch_electrical_three_core_builtin_uses_explicit_catalog_fields(self):
        project_id = uuid.uuid4()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            object_type="pipe",
            sort_order=0,
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 100,
            },
            results={"heat_loss_per_meter_base": 30, "total_heat_loss_design": 3000},
            is_valid=True,
        )
        count_result = MagicMock()
        count_result.one = lambda: (1, 1)
        objects_result = MagicMock()
        objects_result.scalars = lambda: MagicMock(all=lambda: [obj])
        existing_result = MagicMock()
        existing_result.scalars = lambda: MagicMock(all=lambda: [])
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[count_result, objects_result, existing_result])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]
        service._bulk_upsert_electrical_calculations = AsyncMock(  # type: ignore[method-assign]
            return_value=[]
        )

        calculated, skipped, heat_loss_failed, errors, _ = await service.batch_calc_electrical(
            project_id,
            cable_type="three_core",
            cable_source="builtin",
            return_calcs=False,
        )

        assert calculated == 1
        assert skipped == 0
        assert heat_loss_failed == 0
        assert errors == []
        rows = service._bulk_upsert_electrical_calculations.await_args.args[0]
        assert rows[0]["cable_type"] == "three_core"
        assert rows[0]["cable_mark"].startswith("ТТ Р3")
        assert rows[0]["results"]["resistance_ohm_km"] > 0

    async def test_batch_electrical_cancel_stops_before_commit(self):
        project_id = uuid.uuid4()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            object_type="pipe",
            sort_order=0,
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 10,
            },
            results={"heat_loss_per_meter_base": 30, "total_heat_loss_design": 300},
            is_valid=True,
        )
        db = AsyncMock()
        count_result = MagicMock()
        count_result.one = lambda: (1, 1)
        objects_result = MagicMock()
        objects_result.scalars = lambda: MagicMock(all=lambda: [obj])
        existing_result = MagicMock()
        existing_result.scalars = lambda: MagicMock(all=lambda: [])
        db.execute = AsyncMock(side_effect=[count_result, objects_result, existing_result])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service._calculate_electrical_result = MagicMock(  # type: ignore[method-assign]
            return_value=("ТЛТ-30", {"selected_cable": "ТЛТ-30"})
        )
        service._bulk_upsert_electrical_calculations = AsyncMock(  # type: ignore[method-assign]
            return_value=[]
        )
        checks = 0

        def should_cancel() -> bool:
            nonlocal checks
            checks += 1
            return checks >= 2

        with pytest.raises(BatchCancelledError):
            await service.batch_calc_electrical(project_id, should_cancel=should_cancel)

        service._bulk_upsert_electrical_calculations.assert_not_awaited()
        db.commit.assert_not_awaited()


# ═══════════════════════════════════════════════════════════════════════════
# select_cable_manual — препроверки
# ═══════════════════════════════════════════════════════════════════════════


class TestLoadCableCatalog:
    """Покрытие веток source: builtin / extended / all + invalid fallback."""

    async def test_builtin_returns_only_builtin(self):
        service = CalculationService(AsyncMock())
        result = await service.load_cable_catalog("builtin")
        assert all(c["source"] == "builtin" for c in result)
        assert len(result) > 0

    async def test_invalid_source_falls_back_to_builtin(self):
        service = CalculationService(AsyncMock())
        result = await service.load_cable_catalog("nonexistent")
        assert all(c["source"] == "builtin" for c in result)

    async def test_extended_only(self):
        ext = SimpleNamespace(
            cable_type="self_regulating",
            brand="X",
            model="X-Mod",
            power_per_meter=20.0,
            max_temperature=100.0,
            min_temperature=-30.0,
            resistance_per_meter=None,
            price_per_meter=500.0,
            stock_quantity_m=100.0,
            lead_time_days=3,
            supplier_priority=10,
            is_preferred=True,
            order_multiple_m=5.0,
        )
        db = AsyncMock()
        result = MagicMock()
        result.scalars = lambda: MagicMock(all=lambda: [ext])
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)
        cables = await service.load_cable_catalog("extended")
        assert len(cables) == 1
        assert cables[0]["source"] == "extended"
        assert cables[0]["brand"] == "X"
        assert cables[0]["price_per_meter"] == 500.0
        assert cables[0]["is_preferred"] is True

    async def test_all_returns_builtin_plus_extended(self):
        ext = SimpleNamespace(
            cable_type="self_regulating",
            brand="Y",
            model="Y-Mod",
            power_per_meter=30.0,
            max_temperature=100,
            min_temperature=-30,
            resistance_per_meter=None,
            price_per_meter=None,
            stock_quantity_m=None,
            lead_time_days=None,
            supplier_priority=None,
            is_preferred=False,
            order_multiple_m=None,
        )
        db = AsyncMock()
        result = MagicMock()
        result.scalars = lambda: MagicMock(all=lambda: [ext])
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)
        cables = await service.load_cable_catalog("all")
        sources = {c["source"] for c in cables}
        assert sources == {"builtin", "extended"}

    async def test_all_normalizes_legacy_external_self_reg_duplicate(self):
        ext = SimpleNamespace(
            cable_type="self_regulating",
            brand="ТЛТ",
            model="ТЛТ-100",
            power_per_meter=100.0,
            max_temperature=150.0,
            min_temperature=-60.0,
            resistance_per_meter=None,
            supplier_name="E2E supplier",
            article="E2E-TLT-100",
            currency="RUB",
            price_per_meter=1.0,
            stock_quantity_m=100000.0,
            stock_status="in_stock",
            lead_time_days=1,
            supplier_priority=1,
            is_preferred=True,
            order_multiple_m=1.0,
            min_order_quantity_m=0.0,
            is_discontinued=False,
            replacement_group=None,
            price_updated_at=None,
            stock_updated_at=None,
            commercial_data_source="e2e",
            params=None,
        )
        db = AsyncMock()
        result = MagicMock()
        result.scalars = lambda: MagicMock(all=lambda: [ext])
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)

        cables = await service.load_cable_catalog("all")
        duplicate = next(c for c in cables if c["source"] == "extended" and c["model"] == "ТЛТ-100")

        assert duplicate["voltage"] == 220

    async def test_commercial_merges_db_fields_over_builtin(self):
        ext = SimpleNamespace(
            cable_type="self_regulating",
            brand="ТЛТ",
            model="ТЛТ-25",
            power_per_meter=999.0,
            max_temperature=999.0,
            min_temperature=-999.0,
            resistance_per_meter=None,
            supplier_name="Поставщик",
            article="ART-25",
            currency="RUB",
            price_per_meter=460.0,
            stock_quantity_m=750.0,
            stock_status="in_stock",
            lead_time_days=3,
            supplier_priority=20,
            is_preferred=True,
            order_multiple_m=1.0,
            min_order_quantity_m=0.0,
            is_discontinued=False,
            replacement_group=None,
            price_updated_at=None,
            stock_updated_at=None,
            commercial_data_source="test",
            params={"voltage": 380},
        )
        db = AsyncMock()
        result = MagicMock()
        result.scalars = lambda: MagicMock(all=lambda: [ext])
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)

        cables = await service.load_cable_catalog("commercial")
        tlt25 = next(c for c in cables if c["model"] == "ТЛТ-25")

        assert tlt25["source"] == "commercial"
        assert tlt25["power_per_meter"] == 25
        assert tlt25["voltage"] == 220
        assert tlt25["price_per_meter"] == 460.0
        assert tlt25["supplier_name"] == "Поставщик"

    async def test_commercial_resistive_catalog_includes_sanitized_db_rows(self):
        ext = SimpleNamespace(
            cable_type="single_core",
            brand="ТТ",
            model="ТТ Р1 Custom",
            power_per_meter=None,
            max_temperature=None,
            min_temperature=None,
            resistance_per_meter=0.08,
            supplier_name="Поставщик",
            article="R1-CUSTOM",
            currency="RUB",
            price_per_meter=120.0,
            stock_quantity_m=1000.0,
            stock_status="in_stock",
            lead_time_days=2,
            supplier_priority=5,
            is_preferred=True,
            order_multiple_m=10.0,
            min_order_quantity_m=20.0,
            is_discontinued=False,
            replacement_group=None,
            price_updated_at=None,
            stock_updated_at=None,
            commercial_data_source="test",
            params={"conductor_section_mm2": 0.47},
        )
        db = AsyncMock()
        result = MagicMock()
        result.scalars = lambda: MagicMock(all=lambda: [ext])
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)

        cables = await service.load_resistive_cable_catalog("single_core", "commercial")
        custom = next(c for c in cables if c["model"] == "ТТ Р1 Custom")

        assert custom["source"] == "commercial"
        assert custom["resistance_ohm_km"] == pytest.approx(80.0)
        assert custom["conductor_cross_section"] == pytest.approx(0.47)
        assert custom["price_per_meter"] == 120.0

    async def test_resistive_builtin_catalog_has_default_temperature_fields(self):
        service = CalculationService(AsyncMock())

        cables = await service.load_resistive_cable_catalog("three_core", "builtin")
        row = next(c for c in cables if c["model"] == "ТТ Р3 х 1,5-1,0")

        assert row["max_temperature"] == pytest.approx(130.0)
        assert row["min_temperature"] == pytest.approx(-60.0)
        assert row["resistance_ohm_km"] == pytest.approx(11.666666666666666)
        assert row["conductor_section_mm2"] == pytest.approx(1.5)
        assert row["conductor_cross_section"] == pytest.approx(1.5)

    async def test_commercial_resistive_merge_fills_missing_builtin_technical_fields(self):
        ext = SimpleNamespace(
            cable_type="three_core",
            brand="ТТ Р3",
            model="ТТ Р3 х 1,5-1,0",
            power_per_meter=None,
            max_temperature=130.0,
            min_temperature=-60.0,
            resistance_per_meter=0.011666666666666665,
            supplier_name="Поставщик",
            article="R3-1-5",
            currency="RUB",
            price_per_meter=140.0,
            stock_quantity_m=1000.0,
            stock_status="in_stock",
            lead_time_days=2,
            supplier_priority=5,
            is_preferred=False,
            order_multiple_m=10.0,
            min_order_quantity_m=20.0,
            is_discontinued=False,
            replacement_group="ТТ Р3",
            price_updated_at=None,
            stock_updated_at=None,
            commercial_data_source="test",
            params={"conductor_section_mm2": 1.5},
        )
        db = AsyncMock()
        result = MagicMock()
        result.scalars = lambda: MagicMock(all=lambda: [ext])
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)

        cables = await service.load_resistive_cable_catalog("three_core", "commercial")
        merged = next(c for c in cables if c["model"] == "ТТ Р3 х 1,5-1,0")

        assert merged["source"] == "commercial"
        assert merged["resistance_ohm_km"] == pytest.approx(11.666666666666666)
        assert merged["conductor_section_mm2"] == pytest.approx(1.5)
        assert merged["price_per_meter"] == pytest.approx(140.0)
        assert merged["nominal_size_mm"] == "20,40 х 9,20"

    async def test_commercial_resistive_merge_preserves_builtin_technical_fields(self):
        ext = SimpleNamespace(
            cable_type="single_core",
            brand="ТТ Р1",
            model="ТТ Р1 8000",
            power_per_meter=None,
            max_temperature=130.0,
            min_temperature=-60.0,
            resistance_per_meter=999.0,
            supplier_name="Поставщик",
            article="R1-8000",
            currency="RUB",
            price_per_meter=140.0,
            stock_quantity_m=1000.0,
            stock_status="in_stock",
            lead_time_days=2,
            supplier_priority=5,
            is_preferred=False,
            order_multiple_m=10.0,
            min_order_quantity_m=20.0,
            is_discontinued=False,
            replacement_group="ТТ Р1",
            price_updated_at=None,
            stock_updated_at=None,
            commercial_data_source="test",
            params={"resistance_ohm_km": 999000.0, "conductor_section_mm2": 99.0},
        )
        db = AsyncMock()
        result = MagicMock()
        result.scalars = lambda: MagicMock(all=lambda: [ext])
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)

        cables = await service.load_resistive_cable_catalog("single_core", "commercial")
        merged = next(c for c in cables if c["model"] == "ТТ Р1 8000")

        assert merged["source"] == "commercial"
        assert merged["resistance_ohm_km"] == pytest.approx(8000.0)
        assert merged["conductor_section_mm2"] == pytest.approx(0.14)
        assert merged["price_per_meter"] == pytest.approx(140.0)

    def test_balanced_ranking_payload_is_unapproved_by_default(self):
        service = CalculationService(AsyncMock())
        payload = service._balanced_ranking_payload(
            overrides={},
            params={},
            coefficients={
                "commercial_balanced_weight_cost": 0.1,
                "commercial_balanced_weight_delivery": 0.9,
                "commercial_balanced_weights_approved": 0.0,
            },
        )

        assert payload["balanced_weights"]["delivery"] == pytest.approx(0.9)
        assert payload["balanced_weights_approved"] is False
        assert payload["balanced_weights_version"] == "db_coefficients"


class TestCoefficientsCaching:
    """Кэш коэффициентов — ключ-инвалидация работает, второй вызов не идёт в БД."""

    async def test_cache_hit_skips_db_query(self):
        from app.core.cache import cache as global_cache

        global_cache.invalidate("coefficients")
        # Первый — кэш пуст, идём в БД
        rows = [SimpleNamespace(key="k1", value=1.0)]
        db = AsyncMock()
        result = MagicMock()
        result.scalars = lambda: MagicMock(all=lambda: rows)
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)
        await service.get_coefficients()
        # Второй раз — execute не должен вызваться
        db.execute.reset_mock()
        await service.get_coefficients()
        db.execute.assert_not_awaited()
        global_cache.invalidate("coefficients")


class TestSaveFailedElectrical:
    """Прямые unit-тесты на _save_failed_electrical."""

    async def test_creates_new_when_no_existing(self):
        from app.services.calculation_service import CalculationService

        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="pipe",
            params={"name": "Failing"},
        )
        db = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service._bulk_upsert_electrical_calculations = AsyncMock(return_value=[SimpleNamespace()])  # type: ignore[method-assign]

        await service._save_failed_electrical(obj, "TestError")
        rows = service._bulk_upsert_electrical_calculations.await_args.args[0]
        assert rows[0]["project_id"] == obj.project_id
        assert rows[0]["object_id"] == obj.id
        assert rows[0]["variant_number"] == 1
        assert rows[0]["cable_mark"] is None
        assert rows[0]["results"]["message"] == "TestError"
        db.commit.assert_awaited_once()

    async def test_upserts_existing_failure_payload(self):
        from app.services.calculation_service import CalculationService

        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="tank",
            params={"name": "T"},
        )
        db = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service._bulk_upsert_electrical_calculations = AsyncMock(return_value=[SimpleNamespace()])  # type: ignore[method-assign]

        await service._save_failed_electrical(obj, "Some error")
        rows = service._bulk_upsert_electrical_calculations.await_args.args[0]
        row = rows[0]
        # cable_mark обнуляется, results заменяются на structured failure payload.
        assert row["cable_mark"] is None
        assert row["results"]["error_code"] == "UNKNOWN"
        assert row["results"]["category"] == "formula"
        assert "error" not in row["results"]
        assert row["results"]["message"] == "Some error"
        assert row["results"]["suggested_actions"] == [
            "CHECK_OBJECT_PARAMS",
            "TRY_OTHER_CABLE_TYPE",
        ]

    async def test_creates_record_with_given_variant_number(self):
        """Regression: фейл электрорасчёта варианта 2 сохраняется с variant_number=2,
        а не в дефолтный вариант 1 (иначе затирает успешный расчёт СО1)."""
        from app.services.calculation_service import CalculationService

        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="pipe",
            params={"name": "P"},
        )
        db = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service._bulk_upsert_electrical_calculations = AsyncMock(return_value=[SimpleNamespace()])  # type: ignore[method-assign]

        await service._save_failed_electrical(obj, "boom", variant_number=2)
        rows = service._bulk_upsert_electrical_calculations.await_args.args[0]
        assert rows[0]["variant_number"] == 2


class TestGetCableOptions:
    async def test_returns_builtin_tlt_list(self):
        from app.services.calculation_service import CalculationService

        result = await CalculationService(AsyncMock()).get_cable_options(uuid.uuid4())
        assert len(result) > 0
        assert all("brand" in c or "cable_mark" in c or "model" in c for c in result)


class TestSelectCableManual:
    async def test_object_not_found_raises(self):
        service = CalculationService(_mock_db_empty())
        with pytest.raises(CalculationError, match="не найден"):
            await service.select_cable_manual(uuid.uuid4(), "ТЛТ-25")

    async def test_select_cable_for_variants_commits_once(self):
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="pipe",
            params=_minimal_pipe_params(),
            results={"heat_loss_per_meter_base": 20},
            is_valid=True,
        )
        result = MagicMock()
        result.scalar_one_or_none = lambda: obj
        db = AsyncMock()
        db.execute = AsyncMock(return_value=result)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.rollback = AsyncMock()
        calcs = [
            SimpleNamespace(variant_number=1),
            SimpleNamespace(variant_number=3),
        ]
        service = CalculationService(db)
        service._select_cable_for_object = AsyncMock(side_effect=calcs)  # type: ignore[method-assign]

        result_calcs = await service.select_cable_for_variants(
            obj.id,
            "ТЛТ-30",
            variant_numbers=[1, 3],
        )

        assert result_calcs == calcs
        db.commit.assert_awaited_once()
        assert db.refresh.await_count == 2
        db.rollback.assert_not_awaited()
        assert [
            call.kwargs["variant_number"]
            for call in service._select_cable_for_object.await_args_list
        ] == [1, 3]
        assert all(
            call.kwargs["commit"] is False
            for call in service._select_cable_for_object.await_args_list
        )

    async def test_select_cable_for_variants_rolls_back_on_partial_failure(self):
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="pipe",
            params=_minimal_pipe_params(),
            results={"heat_loss_per_meter_base": 20},
            is_valid=True,
        )
        result = MagicMock()
        result.scalar_one_or_none = lambda: obj
        db = AsyncMock()
        db.execute = AsyncMock(return_value=result)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.rollback = AsyncMock()
        service = CalculationService(db)
        service._select_cable_for_object = AsyncMock(  # type: ignore[method-assign]
            side_effect=[SimpleNamespace(variant_number=1), CalculationError("boom")]
        )

        with pytest.raises(CalculationError, match="boom"):
            await service.select_cable_for_variants(
                obj.id,
                "ТЛТ-30",
                variant_numbers=[1, 3],
            )

        db.commit.assert_not_awaited()
        db.refresh.assert_not_awaited()
        db.rollback.assert_awaited_once()

    async def test_invalid_object_raises(self):
        """Если is_valid=False или results пусты — нельзя выбрать кабель."""
        db = AsyncMock()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            object_type="pipe",
            params={},
            results=None,
            is_valid=False,
        )
        result = MagicMock()
        result.scalar_one_or_none = lambda: obj
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)
        with pytest.raises(CalculationError, match="не рассчитан"):
            await service.select_cable_manual(obj.id, "ТЛТ-25")

    async def test_zero_heat_loss_raises(self):
        """q=0 → невозможно подобрать кабель."""
        db = AsyncMock()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="pipe",
            params={"ambient_temperature": -20, "pipe_length": 10},
            results={"heat_loss_per_meter_base": 0},
            is_valid=True,
        )
        result = MagicMock()
        result.scalar_one_or_none = lambda: obj
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)
        with pytest.raises(CalculationError, match="не требуется"):
            await service.select_cable_manual(obj.id, "ТЛТ-25")

    async def test_object_voltage_and_safety_factor_passed_to_electrical_request(self):
        """Рабочее напряжение и Kзап из формы объекта должны доходить до электрорасчёта."""
        db = AsyncMock()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="pipe",
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 10,
                "supply_voltage": 380,
                "safety_factor": 1.2,
            },
            results={"heat_loss_per_meter_base": 20},
            is_valid=True,
        )
        result = MagicMock()
        result.scalar_one_or_none = lambda: obj
        db.execute = AsyncMock(return_value=result)

        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service.calc_electrical = AsyncMock(return_value={"ok": True})  # type: ignore[method-assign]

        await service.select_cable_manual(obj.id, "ТЛТ-25")

        request = service.calc_electrical.call_args.args[0]
        assert request.data["supply_voltage"] == 380
        assert request.data["safety_factor"] == 1.2

    async def test_object_vapor_temperature_used_for_tt_when_global_empty(self):
        """Если общий T проп. не задан, ТТ-расчёт берёт температуру пропарки из params объекта."""
        db = AsyncMock()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="pipe",
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "maintain_temperature": 50,
                "pipe_length": 10,
                "vapor_temperature": 140,
            },
            results={"heat_loss_per_meter_base": 20},
            is_valid=True,
        )
        result = MagicMock()
        result.scalar_one_or_none = lambda: obj
        db.execute = AsyncMock(return_value=result)

        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service.calc_electrical = AsyncMock(return_value={"ok": True})  # type: ignore[method-assign]

        await service.select_cable_manual(
            obj.id,
            "30ТТВ2",
            cable_type="self_regulating_tt",
            electrical_params={"vapor_temperature": None},
        )

        request = service.calc_electrical.call_args.args[0]
        assert request.data["vapor_temperature"] == 140
        assert request.data["maintain_temperature"] == 50

    async def test_global_vapor_temperature_overrides_object_value(self):
        """Общий T проп. с вкладки электрорасчёта приоритетнее object params."""
        db = AsyncMock()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="pipe",
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "maintain_temperature": 50,
                "pipe_length": 10,
                "vapor_temperature": 140,
            },
            results={"heat_loss_per_meter_base": 20},
            is_valid=True,
        )
        result = MagicMock()
        result.scalar_one_or_none = lambda: obj
        db.execute = AsyncMock(return_value=result)

        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service.calc_electrical = AsyncMock(return_value={"ok": True})  # type: ignore[method-assign]

        await service.select_cable_manual(
            obj.id,
            "30ТТВ2",
            cable_type="self_regulating_tt",
            electrical_params={"vapor_temperature": 160},
        )

        request = service.calc_electrical.call_args.args[0]
        assert request.data["vapor_temperature"] == 160
        assert request.data["maintain_temperature"] == 50

    async def test_tt_maintain_temperature_falls_back_to_process_temperature(self):
        """T3 опционален: backend пропускает None, формула использует T1 как fallback."""
        db = AsyncMock()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="pipe",
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 10,
            },
            results={"heat_loss_per_meter_base": 20},
            is_valid=True,
        )
        result = MagicMock()
        result.scalar_one_or_none = lambda: obj
        db.execute = AsyncMock(return_value=result)

        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service.calc_electrical = AsyncMock(return_value={"ok": True})  # type: ignore[method-assign]

        await service.select_cable_manual(
            obj.id,
            "30ТТВ2",
            cable_type="self_regulating_tt",
            electrical_params={},
        )

        request = service.calc_electrical.call_args.args[0]
        assert request.data["maintain_temperature"] is None
        assert request.data["process_temperature"] == 80

    async def test_global_maintain_temperature_overrides_object_value(self):
        """T3 из панели электрорасчёта приоритетнее object params."""
        db = AsyncMock()
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="pipe",
            params={
                "ambient_temperature": -20,
                "process_temperature": 80,
                "maintain_temperature": 45,
                "pipe_length": 10,
            },
            results={"heat_loss_per_meter_base": 20},
            is_valid=True,
        )
        result = MagicMock()
        result.scalar_one_or_none = lambda: obj
        db.execute = AsyncMock(return_value=result)

        service = CalculationService(db)
        service.load_cable_catalog = AsyncMock(return_value=[])  # type: ignore[method-assign]
        service.calc_electrical = AsyncMock(return_value={"ok": True})  # type: ignore[method-assign]

        await service.select_cable_manual(
            obj.id,
            "30ТТВ2",
            cable_type="self_regulating_tt",
            electrical_params={"maintain_temperature": 55},
        )

        request = service.calc_electrical.call_args.args[0]
        assert request.data["maintain_temperature"] == 55
