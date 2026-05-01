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
            outer_diameter=0.0108,
            wall_thickness=0.04,
            pipe_material="carbon_steel",
            insulation_thickness=0.001,
            insulation_material="mineral_wool",
            ambient_temperature=-70,
            process_temperature=600,
            pipe_length=200_000,
            burial_depth=200,
            wind_speed=20,
            local_element_equiv_length=6.9,
            safety_factor=1.05,
        )
        assert p.outer_diameter == 0.0108
        assert p.wall_thickness == 0.04

    @pytest.mark.parametrize(
        "field,value",
        [
            ("ambient_temperature", -71),
            ("ambient_temperature", 71),
            ("process_temperature", -91),
            ("process_temperature", 601),
            ("pipe_length", 200_000.1),
            ("wall_thickness", 0.0401),
        ],
    )
    def test_srs_pipe_limits_rejected(self, field: str, value: float):
        data = {
            "outer_diameter": 0.1,
            "wall_thickness": 0.004,
            "pipe_material": "carbon_steel",
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -20,
            "process_temperature": 80,
            "pipe_length": 10,
        }
        data[field] = value
        with pytest.raises(ValidationError):
            PipeHeatLossParams(**data)

    def test_wall_thickness_requires_pipe_material_or_lambda(self):
        with pytest.raises(ValidationError, match="материал трубы или λ трубы"):
            PipeHeatLossParams(
                outer_diameter=0.1,
                wall_thickness=0.004,
                insulation_thickness=0.05,
                insulation_material="mineral_wool",
                ambient_temperature=-30,
                process_temperature=80,
                pipe_length=10,
            )

    def test_wall_thickness_accepts_manual_pipe_lambda_without_material(self):
        p = PipeHeatLossParams(
            outer_diameter=0.1,
            wall_thickness=0.004,
            pipe_lambda=56.0,
            insulation_thickness=0.05,
            insulation_material="mineral_wool",
            ambient_temperature=-30,
            process_temperature=80,
            pipe_length=10,
        )
        assert p.pipe_lambda == 56.0

    def test_insulation_other_lambda_limits(self):
        assert InsulationLayer(thickness=0.05, material="other", conductivity=400.0)
        with pytest.raises(ValidationError):
            InsulationLayer(thickness=0.05, material="other", conductivity=400.1)


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
            diameter=3.0,
            height=200_000.0,
            insulation_thickness=0.1,
            insulation_material="mineral_wool",
            ambient_temperature=-70,
            process_temperature=600,
        )
        assert p.diameter == 3.0
        assert p.height == 200_000.0

    def test_too_small_dimension_rejected(self):
        with pytest.raises(ValidationError):
            TankHeatLossParams(
                shape="cylindrical",
                diameter=0.0107,
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
            ("ambient_temperature", 71),
            ("process_temperature", 601),
            ("process_temperature", -91),
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
