"""Валидация Pydantic-схем расчётов."""

import pytest
from pydantic import ValidationError

from app.schemas.calculation import (
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
