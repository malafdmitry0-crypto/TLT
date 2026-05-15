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
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.calculation_service import (
    BatchCancelChecker,
    BatchCancelledError,
    CalculationError,
    CalculationService,
)


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


def _minimal_pipe_params() -> dict[str, object]:
    return {
        "outer_diameter": 0.1,
        "insulation_thickness": 0.05,
        "insulation_material": "mineral_wool",
        "ambient_temperature": -10,
        "process_temperature": 60,
        "pipe_length": 10,
    }


def _electrical_upsert_row(project_id: uuid.UUID, object_id: uuid.UUID) -> dict[str, object]:
    return {
        "id": uuid.uuid4(),
        "project_id": project_id,
        "object_id": object_id,
        "variant_number": 1,
        "cable_type": "self_regulating",
        "cable_mark": "TLT-30",
        "params": {},
        "results": {"selected_cable": "TLT-30"},
    }


def _bulk_upsert_result(rows: list[dict[str, object]]) -> MagicMock:
    result = MagicMock()
    result.scalars = lambda: MagicMock(
        all=lambda: [SimpleNamespace(object_id=row["object_id"]) for row in rows]
    )
    return result


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
            {
                "outer_diameter": 0.108,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -30,
                "process_temperature": 80,
                "pipe_length": 10,
            },
        )
        assert "heat_loss_per_meter" in result
        assert "total_heat_loss" in result
        assert result["heat_loss_per_meter"] > 0

    async def test_tank_happy_path(self):
        service = CalculationService(_mock_db_empty())
        result = await service.calc_heat_loss(
            "tank",
            {
                "shape": "cylindrical",
                "diameter": 2.0,
                "height": 3.0,
                "insulation_thickness": 0.08,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
        )
        assert "heat_loss_per_m2" in result
        assert "surface_area" in result
        assert result["surface_area"] > 0

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
            params={
                "outer_diameter": 0.1,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -30,
                "process_temperature": 80,
                "pipe_length": 10,
            },
            results=None,
            is_valid=False,
            validation_errors={"error": "old"},
        )
        result = await service.recalculate_object(obj)
        assert result is obj
        assert obj.is_valid is True
        assert obj.validation_errors is None
        assert obj.results is not None
        assert obj.results["heat_loss_per_meter"] > 0

    async def test_failure_sets_is_valid_false_and_captures_error(self):
        """Некорректные параметры (T_proc ≤ T_amb) → is_valid=False + error."""
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            object_type="pipe",
            params={
                "outer_diameter": 0.1,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool",
                "ambient_temperature": 50,
                "process_temperature": 50,  # равно → нет перепада
                "pipe_length": 10,
            },
            results=None,
            is_valid=True,  # начальное состояние
            validation_errors=None,
        )
        result = await service.recalculate_object(obj)
        assert result is obj
        assert obj.is_valid is False
        assert obj.validation_errors is not None
        assert "error" in obj.validation_errors
        # Сообщение об ошибке содержит упоминание T_продукта
        err_msg = obj.validation_errors["error"].lower()
        assert "выше" in err_msg or "температур" in err_msg

    async def test_failure_clears_results(self):
        """При ошибке results должен обнулиться (а не сохранить старые)."""
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            object_type="pipe",
            params={"outer_diameter": -1},  # невалидный
            results={"heat_loss_per_meter": 123},  # старые данные
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
                "shape": "spherical",
                "diameter": 1.5,
                "insulation_thickness": 0.06,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -10,
                "process_temperature": 60,
            },
            results=None,
            is_valid=False,
            validation_errors=None,
        )
        await service.recalculate_object(obj)
        assert obj.is_valid is True
        assert obj.results["surface_area"] > 0

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
        assert coeffs == {"safety_factor": 1.2, "wind_factor": 1.0}

    async def test_returns_empty_dict_when_no_rows(self):
        service = CalculationService(_mock_db_empty())
        coeffs = await service.get_coefficients()
        assert coeffs == {}


class TestCableLayoutMapping:
    def test_pipe_winding_pitch_converts_to_geometric_coefficient(self):
        service = CalculationService(_mock_db_empty())
        obj = SimpleNamespace(object_type="pipe")
        coefficient = service._winding_coefficient(
            obj,
            {"winding_pitch": 200},
            {"outer_diameter": 0.1},
            1.0,
        )
        assert coefficient > 1.0

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
        heat_loss = service._tank_heat_loss_without_double_safety(
            {
                "total_heat_loss": 1300.0,
                "safety_factor": 1.2,
                "q_additional": 100.0,
            },
            fallback_safety_factor=1.1,
        )
        assert heat_loss == pytest.approx(1300.0 / 1.2)

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
                "heat_loss_per_meter": 20,
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
                "heat_loss_per_m2": 60.0,
                "total_heat_loss": 1100.0,
                "safety_factor": 1.1,
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
                "heat_loss_per_m2": 60.0,
                "total_heat_loss": 1100.0,
                "safety_factor": 1.1,
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
        db.execute = AsyncMock(
            side_effect=[
                _count_result(5),
                _objects_result(objects[:2]),
                _objects_result(objects[2:4]),
                _objects_result(objects[4:]),
            ]
        )
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
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
        assert db.execute.await_count == 4
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
        db.execute = AsyncMock(side_effect=[_count_result(5), _objects_result(objects)])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
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
                params={
                    "outer_diameter": 0.1,
                    "insulation_thickness": 0.05,
                    "insulation_material": "mineral_wool",
                    "ambient_temperature": -10,
                    "process_temperature": 60,
                    "pipe_length": 10,
                },
                results=None,
                is_valid=False,
                validation_errors=None,
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                object_type="pipe",
                sort_order=1,
                params={
                    "outer_diameter": 0.1,
                    "insulation_thickness": 0.05,
                    "insulation_material": "mineral_wool",
                    "ambient_temperature": 100,
                    "process_temperature": 50,  # невалидно
                    "pipe_length": 10,
                },
                results=None,
                is_valid=False,
                validation_errors=None,
            ),
        ]
        db.execute = AsyncMock(side_effect=[_count_result(2), _objects_result(objects)])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]
        service._calc_heat_loss_with_coefficients = MagicMock(  # type: ignore[method-assign]
            side_effect=[
                {"heat_loss_per_meter": 10},
                ValueError("process temperature ниже ambient"),
            ]
        )

        updated, failed, errors = await service.batch_recalculate(project_id)

        assert updated == 1
        assert failed == 1
        assert len(errors) == 1
        assert errors[0]["object_id"] == str(objects[1].id)
        assert errors[0]["error"] == {"error": "process temperature ниже ambient"}
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
        db.execute = AsyncMock(side_effect=[_count_result(3), _objects_result(objects)])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        coefficients = {"safety_factor": 1.0}
        service.get_coefficients = AsyncMock(return_value=coefficients)  # type: ignore[method-assign]
        service._calc_heat_loss_with_coefficients = MagicMock(  # type: ignore[method-assign]
            return_value={"heat_loss_per_meter": 10}
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
        db.execute = AsyncMock(side_effect=[_count_result(1), _objects_result([obj])])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        service = CalculationService(db)
        service.get_coefficients = AsyncMock(return_value={})  # type: ignore[method-assign]
        service._calc_heat_loss_with_coefficients = MagicMock(  # type: ignore[method-assign]
            return_value={"heat_loss_per_meter": 10}
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
                results={"heat_loss_per_meter": 30, "total_heat_loss": 300},
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
            results={"heat_loss_per_meter": 30, "total_heat_loss": 300},
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
                results={"heat_loss_per_meter": 30, "total_heat_loss": 300},
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
            results={"heat_loss_per_meter": 30, "total_heat_loss": 300},
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

    async def test_all_returns_builtin_plus_extended(self):
        ext = SimpleNamespace(
            cable_type="self_regulating",
            brand="Y",
            model="Y-Mod",
            power_per_meter=30.0,
            max_temperature=100,
            min_temperature=-30,
            resistance_per_meter=None,
        )
        db = AsyncMock()
        result = MagicMock()
        result.scalars = lambda: MagicMock(all=lambda: [ext])
        db.execute = AsyncMock(return_value=result)
        service = CalculationService(db)
        cables = await service.load_cable_catalog("all")
        sources = {c["source"] for c in cables}
        assert sources == {"builtin", "extended"}


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
    """Прямые unit-тесты на _save_failed_electrical (восстанавливает запись с error)."""

    async def test_creates_new_when_no_existing(self):
        from app.services.calculation_service import CalculationService

        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="pipe",
            params={"name": "Failing"},
        )
        db = AsyncMock()
        result = MagicMock()
        result.scalars = lambda: MagicMock(first=lambda: None)
        db.execute = AsyncMock(return_value=result)
        db.add = MagicMock()
        db.commit = AsyncMock()

        await CalculationService(db)._save_failed_electrical(obj, "TestError")
        db.add.assert_called_once()
        db.commit.assert_awaited_once()

    async def test_updates_existing(self):
        from app.services.calculation_service import CalculationService

        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            object_type="tank",
            params={"name": "T"},
        )
        existing = SimpleNamespace(
            cable_mark="ТЛТ-25",
            results={"selected_cable": "ТЛТ-25"},
        )
        db = AsyncMock()
        result = MagicMock()
        result.scalars = lambda: MagicMock(first=lambda: existing)
        db.execute = AsyncMock(return_value=result)
        db.commit = AsyncMock()

        await CalculationService(db)._save_failed_electrical(obj, "Some error")
        # cable_mark обнуляется, results заменяются на error
        assert existing.cable_mark is None
        assert existing.results["error"] == "Some error"

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
        result = MagicMock()
        result.scalars = lambda: MagicMock(first=lambda: None)
        db.execute = AsyncMock(return_value=result)
        db.add = MagicMock()
        db.commit = AsyncMock()

        await CalculationService(db)._save_failed_electrical(obj, "boom", variant_number=2)
        created = db.add.call_args.args[0]
        assert created.variant_number == 2


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
            results={"heat_loss_per_meter": 0},
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
            results={"heat_loss_per_meter": 20},
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
                "pipe_length": 10,
                "vapor_temperature": 140,
            },
            results={"heat_loss_per_meter": 20},
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
                "pipe_length": 10,
                "vapor_temperature": 140,
            },
            results={"heat_loss_per_meter": 20},
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
