"""Валидация Pydantic-схем расчётов."""

import pytest
from pydantic import ValidationError

from app.reference_data.loader import list_soil_conductivity
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

    def test_unknown_field_rejected(self):
        with pytest.raises(ValidationError):
            PipeHeatLossParams(
                outer_diameter=0.1,
                insulation_thickness=0.05,
                insulation_material="mineral_wool",
                ambient_temperature=-30,
                process_temperature=80,
                pipe_length=10,
                legacy_alias=1,
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

    def test_local_element_counts_are_mapped_to_formula_count(self):
        p = PipeHeatLossParams(
            outer_diameter=0.1,
            insulation_thickness=0.05,
            insulation_material="mineral_wool",
            ambient_temperature=-30,
            process_temperature=80,
            pipe_length=10,
            valve_count=1,
            flange_count=2,
            support_count=3,
            local_element_equiv_length=1.5,
        )

        assert p.num_local_elements == 6

    def test_explicit_num_local_elements_wins_over_named_counts(self):
        p = PipeHeatLossParams(
            outer_diameter=0.1,
            insulation_thickness=0.05,
            insulation_material="mineral_wool",
            ambient_temperature=-30,
            process_temperature=80,
            pipe_length=10,
            num_local_elements=4,
            valve_count=1,
            flange_count=2,
            support_count=3,
            local_element_equiv_length=1.5,
        )

        assert p.num_local_elements == 4

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

    def test_reference_soil_conductivity_values_are_valid(self):
        for row in list_soil_conductivity():
            p = PipeHeatLossParams(
                outer_diameter=0.1,
                insulation_thickness=0.05,
                insulation_material="mineral_wool",
                ambient_temperature=-30,
                process_temperature=80,
                pipe_length=10,
                ground_conductivity=row["conductivity"],
            )
            assert p.ground_conductivity == row["conductivity"]


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

    def test_unknown_field_rejected(self):
        with pytest.raises(ValidationError):
            TankHeatLossParams(
                shape="cylindrical",
                diameter=2,
                height=3,
                insulation_thickness=0.1,
                insulation_material="mineral_wool",
                ambient_temperature=-20,
                process_temperature=80,
                legacy_alias=1,
            )

    def test_tank_dimension_limits_accepted(self):
        p = TankHeatLossParams(
            shape="cylindrical",
            diameter=30.0,
            height=50.0,
            insulation_thickness=0.1,
            insulation_material="mineral_wool",
            ambient_temperature=-70,
            process_temperature=600,
        )
        assert p.diameter == 30.0
        assert p.height == 50.0

        rectangular = TankHeatLossParams(
            shape="rectangular",
            length=100.0,
            width=100.0,
            height=50.0,
            insulation_thickness=0.1,
            insulation_material="mineral_wool",
            ambient_temperature=-70,
            process_temperature=600,
        )
        assert rectangular.length == 100.0
        assert rectangular.width == 100.0

    def test_too_small_dimension_rejected(self):
        with pytest.raises(ValidationError):
            TankHeatLossParams(
                shape="cylindrical",
                diameter=0.099,
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

    @pytest.mark.parametrize(
        "field,value",
        [
            ("diameter", 30.1),
            ("height", 50.1),
            ("length", 100.1),
            ("width", 100.1),
        ],
    )
    def test_tank_dimension_limits_rejected(self, field: str, value: float):
        data = {
            "shape": "rectangular" if field in {"length", "width"} else "cylindrical",
            "diameter": 2,
            "height": 3,
            "length": 5,
            "width": 4,
            "insulation_thickness": 0.1,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        data[field] = value
        with pytest.raises(ValidationError):
            TankHeatLossParams(**data)

    def test_reference_soil_conductivity_values_are_valid(self):
        for row in list_soil_conductivity():
            p = TankHeatLossParams(
                shape="cylindrical",
                diameter=2,
                height=3,
                insulation_thickness=0.1,
                insulation_material="mineral_wool",
                ambient_temperature=-20,
                process_temperature=80,
                ground_conductivity=row["conductivity"],
            )
            assert p.ground_conductivity == row["conductivity"]


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
