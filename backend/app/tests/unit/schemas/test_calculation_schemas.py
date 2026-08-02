"""Валидация Pydantic-схем расчётов."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.reference_data.loader import list_soil_conductivity
from app.schemas.calculation import (
    ElectricalBatchJobRequest,
    ElectricalCableSelectionVariantsRequest,
    InsulationLayer,
    PipeHeatLossParams,
    ResistiveSingleCoreParams,
    ResistiveThreeCoreParams,
    SelfRegulatingParams,
    SelfRegulatingTTParams,
    TankHeatLossParams,
)

MINERAL_WOOL = "mineral_wool_boards_120"
POLYURETHANE = "polyurethane_products_40"
MANUAL_HIGH_TEMP_LAYER = InsulationLayer(
    thickness=0.05,
    material="other",
    conductivity=0.021,
    temperature_range=(-200, 650),
)


def _canonical_tank(**overrides: object) -> TankHeatLossParams:
    data: dict[str, object] = {
        "shape": "cylindrical", "diameter": 2.0, "height": 3.0,
        "placement": "outdoor", "ambient_temperature": -20.0,
        "process_temperature": 80.0, "wind_speed": 0.0, "safety_factor": 1.1,
        "insulation_temperature_basis": "outdoor_winter",
        "insulation_layers": [InsulationLayer(thickness=.1, material=MINERAL_WOOL)],
    }
    data.update(overrides)
    return TankHeatLossParams(**data)


class TestCanonicalTankHeatLossParams:
    def test_cylindrical_and_rectangular_inputs(self):
        assert _canonical_tank().shape == "cylindrical"
        assert _canonical_tank(shape="rectangular", diameter=None, length=4.0, width=2.0).shape == "rectangular"

    @pytest.mark.parametrize(
        "legacy_field", ["location", "burial_depth", "insulation_thickness", "insulation_material"]
    )
    def test_legacy_tank_fields_are_rejected(self, legacy_field: str):
        with pytest.raises(ValidationError):
            _canonical_tank(**{legacy_field: 1})

    def test_underground_requires_separate_ground_contract(self):
        tank = _canonical_tank(
            placement="underground", ground_temperature=0.0, ground_conductivity=1.5,
            tank_buried_height=1.0, wind_speed=2.0, insulation_temperature_basis="channel",
        )
        assert tank.tank_buried_height == 1.0
        with pytest.raises(ValidationError, match="process_temperature_not_above_ground"):
            _canonical_tank(
                placement="underground", ground_temperature=70.0, ground_conductivity=1.5,
                tank_buried_height=1.0, process_temperature=70.0, insulation_temperature_basis="channel",
            )

    def test_shape_specific_geometry_and_wall_pair_are_strict(self):
        with pytest.raises(ValidationError):
            _canonical_tank(length=1.0)
        with pytest.raises(ValidationError):
            _canonical_tank(wall_thickness=.01)
        with pytest.raises(ValidationError):
            _canonical_tank(shape="rectangular", diameter=2.0, length=2.0, width=2.0)


def _outdoor_pipe(**overrides) -> PipeHeatLossParams:
    data = {
        "outer_diameter": 0.1,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [InsulationLayer(thickness=0.05, material=MINERAL_WOOL)],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -30,
        "process_temperature": 80,
        "pipe_length": 10,
        "placement": "outdoor",
        "wind_speed": 0,
    }
    data.update(overrides)
    return PipeHeatLossParams(**data)


def _underground_pipe(**overrides) -> PipeHeatLossParams:
    data = {
        "outer_diameter": 0.1,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [InsulationLayer(thickness=0.05, material=MINERAL_WOOL)],
        "insulation_temperature_basis": "channel",
        "process_temperature": 80,
        "pipe_length": 10,
        "placement": "underground",
        "ground_temperature": -20,
        "pipe_centerline_depth": 1.2,
        "ground_conductivity": 1.5,
    }
    data.update(overrides)
    return PipeHeatLossParams(**data)


class TestPipeHeatLossParams:
    def test_valid(self):
        assert _outdoor_pipe().outer_diameter == 0.1

    def test_negative_diameter_rejected(self):
        with pytest.raises(ValidationError):
            _outdoor_pipe(outer_diameter=-0.1)

    def test_unknown_field_rejected(self):
        with pytest.raises(ValidationError):
            _outdoor_pipe(legacy_alias=1)

    def test_zero_thickness_rejected(self):
        with pytest.raises(ValidationError):
            _outdoor_pipe(
                insulation_layers=[InsulationLayer(thickness=0, material=MINERAL_WOOL)]
            )

    def test_srs_pipe_limits(self):
        p = _underground_pipe(
            outer_diameter=0.1,
            wall_thickness=0.04,
            pipe_material="carbon_steel",
            insulation_layers=[MANUAL_HIGH_TEMP_LAYER],
            process_temperature=600,
            pipe_length=200_000,
            pipe_centerline_depth=200,
            num_local_elements=100,
            local_element_equiv_length=6.9,
            safety_factor=1.05,
        )
        assert p.pipe_centerline_depth == 200
        assert p.wall_thickness == 0.04

    def test_reference_insulation_temperature_range_is_enforced(self):
        with pytest.raises(ValidationError, match="вне диапазона"):
            _outdoor_pipe(
                insulation_layers=[InsulationLayer(thickness=0.05, material=POLYURETHANE)],
                process_temperature=450,
            )

    def test_reference_insulation_temperature_range_accepts_boundary(self):
        p = _outdoor_pipe(
            insulation_layers=[InsulationLayer(thickness=0.05, material=POLYURETHANE)],
            process_temperature=400,
        )
        assert p.process_temperature == 400

    @pytest.mark.parametrize("basis", ["indoor", "attic", "basement", "channel"])
    def test_outdoor_location_rejects_non_outdoor_insulation_temperature_basis(self, basis):
        with pytest.raises(ValidationError, match="Режим tm"):
            _outdoor_pipe(insulation_temperature_basis=basis)

    def test_underground_placement_accepts_channel_insulation_temperature_basis(self):
        assert _underground_pipe().insulation_temperature_basis == "channel"

    def test_underground_placement_rejects_attic_insulation_temperature_basis(self):
        with pytest.raises(ValidationError, match="Режим tm"):
            _underground_pipe(insulation_temperature_basis="attic")

    @pytest.mark.parametrize("basis", ["attic", "basement"])
    def test_indoor_location_accepts_building_insulation_temperature_basis(self, basis):
        p = _outdoor_pipe(
            placement="indoor",
            wind_speed=None,
            insulation_temperature_basis=basis,
            ambient_temperature=20,
        )
        assert p.insulation_temperature_basis == basis

    def test_num_local_elements_is_canonical_formula_count(self):
        p = _outdoor_pipe(num_local_elements=6, local_element_equiv_length=1.5)
        assert p.num_local_elements == 6

    @pytest.mark.parametrize("legacy_field", ["valve_count", "flange_count", "support_count"])
    def test_named_local_element_counts_are_rejected(self, legacy_field):
        with pytest.raises(ValidationError):
            _outdoor_pipe(**{legacy_field: 1})

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
        data = {"wall_thickness": 0.004, "pipe_material": "carbon_steel", field: value}
        with pytest.raises(ValidationError):
            _outdoor_pipe(**data)

    def test_wall_thickness_requires_exactly_one_lambda_source(self):
        with pytest.raises(ValidationError, match="ровно один источник"):
            _outdoor_pipe(wall_thickness=0.004, pipe_material=None)
        with pytest.raises(ValidationError, match="ровно один источник"):
            _outdoor_pipe(
                wall_thickness=0.004,
                pipe_material="carbon_steel",
                pipe_lambda=56.0,
            )

    def test_wall_thickness_accepts_manual_pipe_lambda_without_material(self):
        p = _outdoor_pipe(wall_thickness=0.004, pipe_material=None, pipe_lambda=56.0)
        assert p.pipe_lambda == 56.0

    def test_insulation_other_lambda_limits(self):
        assert InsulationLayer(
            thickness=0.05,
            material="other",
            conductivity=400.0,
            temperature_range=(-60, 180),
        )
        with pytest.raises(ValidationError):
            InsulationLayer(
                thickness=0.05,
                material="other",
                conductivity=400.1,
                temperature_range=(-60, 180),
            )

    def test_insulation_other_requires_manual_temperature_range(self):
        with pytest.raises(ValidationError, match="temperature_range"):
            InsulationLayer(thickness=0.05, material="other", conductivity=0.061)

    def test_reference_soil_conductivity_values_are_valid(self):
        for row in list_soil_conductivity():
            p = _underground_pipe(ground_conductivity=row["conductivity"])
            assert p.ground_conductivity == row["conductivity"]


class LegacyTankHeatLossParams:
    def test_valid_cylindrical(self):
        p = TankHeatLossParams(
            shape="cylindrical",
            diameter=2,
            height=3,
            insulation_thickness=0.1,
            insulation_material=MINERAL_WOOL,
            insulation_temperature_basis="outdoor_winter",
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
                insulation_material=MINERAL_WOOL,
                insulation_temperature_basis="outdoor_winter",
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
            insulation_material="other",
            insulation_layers=[MANUAL_HIGH_TEMP_LAYER],
            insulation_temperature_basis="outdoor_winter",
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
            insulation_material="other",
            insulation_layers=[MANUAL_HIGH_TEMP_LAYER],
            insulation_temperature_basis="outdoor_winter",
            ambient_temperature=-70,
            process_temperature=600,
        )
        assert rectangular.length == 100.0
        assert rectangular.width == 100.0

    def test_tank_reference_insulation_temperature_range_is_enforced(self):
        with pytest.raises(ValidationError, match="вне диапазона"):
            TankHeatLossParams(
                shape="cylindrical",
                diameter=2,
                height=3,
                insulation_thickness=0.1,
                insulation_material=POLYURETHANE,
                insulation_temperature_basis="outdoor_winter",
                ambient_temperature=-20,
                process_temperature=450,
            )

    def test_tank_reference_insulation_temperature_range_accepts_boundary(self):
        p = TankHeatLossParams(
            shape="cylindrical",
            diameter=2,
            height=3,
            insulation_thickness=0.1,
            insulation_material=POLYURETHANE,
            insulation_temperature_basis="outdoor_winter",
            ambient_temperature=-20,
            process_temperature=400,
        )

        assert p.process_temperature == 400

    @pytest.mark.parametrize("basis", ["indoor", "attic", "basement", "channel"])
    def test_outdoor_location_rejects_non_outdoor_insulation_temperature_basis(self, basis):
        with pytest.raises(ValidationError, match="Режим tm"):
            TankHeatLossParams(
                shape="cylindrical",
                diameter=2,
                height=3,
                insulation_thickness=0.1,
                insulation_material=MINERAL_WOOL,
                insulation_temperature_basis=basis,
                ambient_temperature=-20,
                process_temperature=80,
                location="outdoor",
            )

    def test_underground_placement_accepts_channel_insulation_temperature_basis(self):
        p = TankHeatLossParams(
            shape="cylindrical",
            diameter=2,
            height=3,
            insulation_thickness=0.1,
            insulation_material=MINERAL_WOOL,
            insulation_temperature_basis="channel",
            ambient_temperature=-20,
            process_temperature=80,
            location="outdoor",
            placement="underground",
            burial_depth=1.2,
        )

        assert p.insulation_temperature_basis == "channel"

    def test_underground_placement_rejects_attic_insulation_temperature_basis(self):
        with pytest.raises(ValidationError, match="Режим tm"):
            TankHeatLossParams(
                shape="cylindrical",
                diameter=2,
                height=3,
                insulation_thickness=0.1,
                insulation_material=MINERAL_WOOL,
                insulation_temperature_basis="attic",
                ambient_temperature=-20,
                process_temperature=80,
                location="outdoor",
                placement="underground",
                burial_depth=1.2,
            )

    @pytest.mark.parametrize("basis", ["attic", "basement"])
    def test_indoor_location_accepts_building_insulation_temperature_basis(self, basis):
        p = TankHeatLossParams(
            shape="cylindrical",
            diameter=2,
            height=3,
            insulation_thickness=0.1,
            insulation_material=MINERAL_WOOL,
            insulation_temperature_basis=basis,
            ambient_temperature=20,
            process_temperature=80,
            location="indoor",
            placement="indoor",
        )

        assert p.insulation_temperature_basis == basis

    def test_too_small_dimension_rejected(self):
        with pytest.raises(ValidationError):
            TankHeatLossParams(
                shape="cylindrical",
                diameter=0.099,
                height=1.0,
                insulation_thickness=0.1,
                insulation_material=MINERAL_WOOL,
                insulation_temperature_basis="outdoor_winter",
                ambient_temperature=-20,
                process_temperature=80,
            )

    def test_invalid_shape_rejected(self):
        with pytest.raises(ValidationError):
            TankHeatLossParams(
                shape="pyramid",
                insulation_thickness=0.1,
                insulation_material=MINERAL_WOOL,
                insulation_temperature_basis="outdoor_winter",
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
            "insulation_material": MINERAL_WOOL,
            "insulation_temperature_basis": "outdoor_winter",
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
            "insulation_material": MINERAL_WOOL,
            "insulation_temperature_basis": "outdoor_winter",
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
                insulation_material=MINERAL_WOOL,
                insulation_temperature_basis="outdoor_winter",
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
            process_temperature=80,
            pipe_length=10,
        )
        assert p.safety_factor == 1.1

    def test_safety_factor_minimum(self):
        with pytest.raises(ValidationError):
            SelfRegulatingParams(
                required_power_per_meter=20,
                cable_mark="ТЛТ-25",
                ambient_temperature=-20,
                process_temperature=80,
                pipe_length=10,
                safety_factor=0.5,
            )

    def test_process_temperature_required_for_tmax_check(self):
        with pytest.raises(ValidationError):
            SelfRegulatingParams(
                required_power_per_meter=20,
                cable_mark="ТЛТ-25",
                ambient_temperature=-20,
                pipe_length=10,
            )


class TestElectricalTankLayingStepLimits:
    def test_tank_laying_step_bounds_match_source_document(self):
        """Source: Блок теплопотери и выбор кабеля/переменные резервуар.xlsx, Лист1!A22:D22."""
        valid = dict(
            required_power_per_meter=20,
            pipe_length=10,
            process_temperature=80,
            heating_height=2,
        )
        assert SelfRegulatingTTParams(**valid, laying_step=0.1).laying_step == 0.1
        assert SelfRegulatingTTParams(**valid, laying_step=0.4).laying_step == 0.4
        with pytest.raises(ValidationError):
            SelfRegulatingTTParams(**valid, laying_step=0.099)
        with pytest.raises(ValidationError):
            SelfRegulatingTTParams(**valid, laying_step=0.401)

    def test_resistive_tank_laying_step_bounds_match_source_document(self):
        """Source: Блок теплопотери и выбор кабеля/переменные резервуар.xlsx, Лист1!A22:D22."""
        base = dict(required_heat_loss=5000, pipe_length=10, process_temperature=80)
        assert ResistiveSingleCoreParams(**base, laying_step=0.1).laying_step == 0.1
        assert ResistiveThreeCoreParams(**base, laying_step=0.4).laying_step == 0.4
        with pytest.raises(ValidationError):
            ResistiveSingleCoreParams(**base, laying_step=0.099)
        with pytest.raises(ValidationError):
            ResistiveThreeCoreParams(**base, laying_step=0.401)

    def test_electrical_request_laying_step_bounds_match_source_document(self):
        """Source: Блок теплопотери и выбор кабеля/переменные резервуар.xlsx, Лист1!A22:D22."""
        object_id = uuid4()
        assert ElectricalCableSelectionVariantsRequest(
            object_id=object_id,
            laying_step=0.1,
        ).laying_step == 0.1
        assert ElectricalCableSelectionVariantsRequest(
            object_id=object_id,
            laying_step=0.4,
        ).laying_step == 0.4
        with pytest.raises(ValidationError):
            ElectricalCableSelectionVariantsRequest(object_id=object_id, laying_step=0.099)
        with pytest.raises(ValidationError):
            ElectricalCableSelectionVariantsRequest(object_id=object_id, laying_step=0.401)

        project_id = uuid4()
        assert ElectricalBatchJobRequest(project_id=project_id, laying_step=0.1).laying_step == 0.1
        assert ElectricalBatchJobRequest(project_id=project_id, laying_step=0.4).laying_step == 0.4
        with pytest.raises(ValidationError):
            ElectricalBatchJobRequest(project_id=project_id, laying_step=0.099)
        with pytest.raises(ValidationError):
            ElectricalBatchJobRequest(project_id=project_id, laying_step=0.401)
