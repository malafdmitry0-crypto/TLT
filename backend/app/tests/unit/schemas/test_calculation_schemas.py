"""Валидация Pydantic-схем расчётов."""

import pytest
from pydantic import ValidationError

from app.schemas.calculation import (
    InsulationLayer,
    PipeHeatLossParams,
    SelfRegulatingParams,
    TankHeatLossParams,
)


class TestPipeHeatLossParams:
    def test_valid(self):
        p = PipeHeatLossParams(
            outer_diameter=0.1,
            insulation_thickness=0.05,
            insulation_material="mineral_wool",
            ambient_temperature=-30,
            process_temperature=80,
            pipe_length=10,
        )
        assert p.outer_diameter == 0.1

    def test_negative_diameter_rejected(self):
        with pytest.raises(ValidationError):
            PipeHeatLossParams(
                outer_diameter=-0.1,
                insulation_thickness=0.05,
                insulation_material="mineral_wool",
                ambient_temperature=-30,
                process_temperature=80,
                pipe_length=10,
            )

    def test_zero_thickness_rejected(self):
        with pytest.raises(ValidationError):
            PipeHeatLossParams(
                outer_diameter=0.1,
                insulation_thickness=0,
                insulation_material="mineral_wool",
                ambient_temperature=-30,
                process_temperature=80,
                pipe_length=10,
            )

    def test_srs_pipe_limits(self):
        p = PipeHeatLossParams(
            outer_diameter=0.01,
            wall_thickness=0.1,
            insulation_thickness=0.001,
            insulation_material="mineral_wool",
            ambient_temperature=-60,
            process_temperature=350,
            pipe_length=10_000,
            burial_depth=5,
            wind_speed=50,
            local_element_equiv_length=50,
            safety_factor=1.0,
        )
        assert p.outer_diameter == 0.01
        assert p.wall_thickness == 0.1

    @pytest.mark.parametrize(
        "field,value",
        [
            ("ambient_temperature", -61),
            ("ambient_temperature", 51),
            ("process_temperature", -61),
            ("process_temperature", 351),
            ("pipe_length", 10_000.1),
            ("wall_thickness", 0.1001),
        ],
    )
    def test_srs_pipe_limits_rejected(self, field: str, value: float):
        data = {
            "outer_diameter": 0.1,
            "wall_thickness": 0.004,
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -20,
            "process_temperature": 80,
            "pipe_length": 10,
        }
        data[field] = value
        with pytest.raises(ValidationError):
            PipeHeatLossParams(**data)

    def test_insulation_other_lambda_limits(self):
        assert InsulationLayer(thickness=0.05, material="other", conductivity=5.0)
        with pytest.raises(ValidationError):
            InsulationLayer(thickness=0.05, material="other", conductivity=5.1)


class TestTankHeatLossParams:
    def test_valid_cylindrical(self):
        p = TankHeatLossParams(
            shape="cylindrical",
            diameter=2,
            height=3,
            insulation_thickness=0.1,
            insulation_material="mineral_wool",
            ambient_temperature=-20,
            process_temperature=80,
        )
        assert p.shape == "cylindrical"

    def test_srs_max_dimension_accepted(self):
        p = TankHeatLossParams(
            shape="cylindrical",
            diameter=50.0,
            height=50.0,
            insulation_thickness=0.1,
            insulation_material="mineral_wool",
            ambient_temperature=-20,
            process_temperature=80,
        )
        assert p.diameter == 50.0
        assert p.height == 50.0

    def test_too_small_dimension_rejected(self):
        with pytest.raises(ValidationError):
            TankHeatLossParams(
                shape="cylindrical",
                diameter=0.05,
                height=1.0,
                insulation_thickness=0.1,
                insulation_material="mineral_wool",
                ambient_temperature=-20,
                process_temperature=80,
            )

    def test_invalid_shape_rejected(self):
        with pytest.raises(ValidationError):
            TankHeatLossParams(
                shape="pyramid",
                insulation_thickness=0.1,
                insulation_material="mineral_wool",
                ambient_temperature=-20,
                process_temperature=80,
            )

    @pytest.mark.parametrize(
        "field,value",
        [
            ("ambient_temperature", 51),
            ("process_temperature", 351),
            ("process_temperature", -61),
        ],
    )
    def test_tank_srs_temperature_limits_rejected(self, field: str, value: float):
        data = {
            "shape": "cylindrical",
            "diameter": 2,
            "height": 3,
            "insulation_thickness": 0.1,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        data[field] = value
        with pytest.raises(ValidationError):
            TankHeatLossParams(**data)


class TestSelfRegulatingParams:
    def test_valid(self):
        p = SelfRegulatingParams(
            required_power_per_meter=20,
            cable_mark="ТЛТ-25",
            ambient_temperature=-20,
            pipe_length=10,
        )
        assert p.safety_factor == 1.1

    def test_safety_factor_minimum(self):
        with pytest.raises(ValidationError):
            SelfRegulatingParams(
                required_power_per_meter=20,
                cable_mark="ТЛТ-25",
                ambient_temperature=-20,
                pipe_length=10,
                safety_factor=0.5,
            )
