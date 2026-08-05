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

import time
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_variant import ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.services.calculation_service import (
    BatchCancelChecker,
    BatchCancelledError,
    CalculationError,
    CalculationService,
    build_heat_loss_error_payload,
)
from app.services.project_object_params import ProjectObjectParamsError

MINERAL_WOOL = "mineral_wool_boards_120"


def test_heat_loss_error_payload_uses_structured_required_fields():
    error = ProjectObjectParamsError(
        "Заполните обязательные поля объекта",
        code="OBJECT_REQUIRED_FIELDS_MISSING",
        fields=("outer_diameter", "insulation_layers.1.material"),
    )

    payload = build_heat_loss_error_payload(error, object_type="pipe")

    assert payload["error_code"] == "missing_required_fields"
    assert payload["missing_fields"] == [
        "outer_diameter",
        "insulation_layers.1.material",
    ]
    assert payload["field"] is None


def test_heat_loss_error_payload_uses_structured_invalid_fields():
    error = ProjectObjectParamsError(
        "Проверьте параметры объекта",
        code="OBJECT_PARAMS_INVALID",
        fields=("insulation_temperature_basis",),
    )

    payload = build_heat_loss_error_payload(error, object_type="pipe")

    assert payload["error_code"] == "invalid_object_params"
    assert payload["field"] == "insulation_temperature_basis"
    assert payload["fields"] == {
        "insulation_temperature_basis": "Проверьте параметры объекта"
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
    def test_explicit_null_clears_saved_batch_layout(self):
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
        assert merged["winding_pitch"] is None
        assert merged["number_of_threads"] is None
        assert "winding_coefficient" not in merged

    def test_omitted_batch_layout_reuses_saved_values(self):
        service = CalculationService(_mock_db_empty())
        saved = SimpleNamespace(
            results={
                "winding_pitch": 120.0,
                "num_circuits": 2,
                "number_of_threads_source": "manual",
            }
        )
        layout = service._layout_overrides_from_existing(saved)

        merged = service._merge_electrical_overrides({"supply_voltage": 230}, layout)

        assert merged["winding_pitch"] == 120.0
        assert merged["number_of_threads"] == 2

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

    def test_tt_build_data_keeps_only_authoritative_auto_mark_in_explicit_overrides(self):
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

        assert data["_tt_explicit_overrides"] == {"cable_mark": None}

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


# ═══════════════════════════════════════════════════════════════════════════
# select_cable_manual — препроверки
# ═══════════════════════════════════════════════════════════════════════════


class TestLoadCableCatalog:
    """Покрытие веток source: builtin / extended / all + invalid fallback."""

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
    async def test_returns_tt_options_for_object_with_heat(self, monkeypatch):
        from app.services.calculation_service import CalculationService
        from app.services.electrical_catalog_service import ElectricalCatalogService

        obj_id = uuid.uuid4()
        obj = SimpleNamespace(
            id=obj_id,
            project_id=uuid.uuid4(),
            object_type="pipe",
            version=1,
            is_valid=True,
            params={
                "process_temperature": 80.0,
                "outer_diameter": 0.108,
                "maintain_temperature": 10.0,
                "aggressive_product": False,
            },
            results={
                "heat_loss_per_meter_base": 20.0,
                "effective_length": 50.0,
                "safety_factor_applied": 1.1,
            },
        )
        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = obj
        db.execute = AsyncMock(return_value=result_mock)

        service = CalculationService(db)
        service._tt_calculation_catalogs_cache = {
            kind: ElectricalCatalogService._static_calculation_fallback(kind)
            for kind in ("power", "section", "bom")
        }

        options = await service.get_cable_options(obj_id)
        assert len(options) > 0
        assert all(opt.get("model") for opt in options)
        eligible = [opt for opt in options if opt["eligible"]]
        assert eligible
        assert all(opt["series"] == "ТТВ" for opt in eligible)
        assert all(opt["required_series"] == "ТТВ" for opt in options)

    async def test_requires_heat_results(self):
        from app.services.calculation_service import CalculationService
        from app.services.electrical_input_resolver import ElectricalInputResolutionError

        obj_id = uuid.uuid4()
        obj = SimpleNamespace(
            id=obj_id,
            project_id=uuid.uuid4(),
            object_type="pipe",
            is_valid=False,
            params={"process_temperature": 80.0},
            results=None,
        )
        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = obj
        db.execute = AsyncMock(return_value=result_mock)

        with pytest.raises(ElectricalInputResolutionError) as exc:
            await CalculationService(db).get_cable_options(obj_id)
        assert exc.value.code == "ELECTRICAL_HEAT_LOSS_REQUIRED"


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
