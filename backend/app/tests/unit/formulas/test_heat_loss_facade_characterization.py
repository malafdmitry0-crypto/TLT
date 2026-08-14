"""Public facade snapshots captured before heat-loss core extraction."""

import json
import math

import pytest

from app.formulas.heat_loss.catalog_preparation import HeatLossPreparationError
from app.formulas.heat_loss.insulation import resolve_insulation_tm
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.calculation import PipeHeatLossParams, TankHeatLossParams


def test_outdoor_winter_tm_preserves_legacy_signed_zero() -> None:
    result = resolve_insulation_tm(
        process_temperature=-0.0,
        basis="outdoor_winter",
        location="outdoor",
        placement="outdoor",
    )
    assert result == 0.0
    assert math.copysign(1.0, result) == -1.0


def _pipe_air_manual() -> PipeHeatLossParams:
    return PipeHeatLossParams(
        outer_diameter=0.108,
        wall_thickness=0.006,
        pipe_material="carbon_steel",
        pipe_length=50,
        insulation_layers=[
            {
                "thickness": 0.05,
                "material": "other",
                "conductivity": 0.04,
                "temperature_range": [-90, 600],
            }
        ],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-30,
        process_temperature=80,
        placement="outdoor",
        wind_speed=3,
        safety_factor=1.2,
        num_local_elements=2,
        local_element_equiv_length=1.5,
    )


def _pipe_ground_reference() -> PipeHeatLossParams:
    return PipeHeatLossParams(
        outer_diameter=0.108,
        wall_thickness=0.006,
        pipe_material="carbon_steel",
        pipe_length=50,
        insulation_layers=[{"thickness": 0.05, "material": "mineral_wool_boards_120"}],
        insulation_temperature_basis="channel",
        process_temperature=80,
        placement="underground",
        ground_temperature=5,
        ground_conductivity=1.5,
        pipe_centerline_depth=1.2,
        safety_factor=1.1,
    )


def _tank_air_reference() -> TankHeatLossParams:
    return TankHeatLossParams(
        shape="cylindrical",
        diameter=2,
        height=3,
        wall_thickness=0.008,
        wall_lambda=50,
        insulation_layers=[{"thickness": 0.08, "material": "mineral_wool_boards_120"}],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-30,
        process_temperature=70,
        placement="outdoor",
        wind_speed=3,
        safety_factor=1.1,
        q_additional=0,
    )


def _tank_ground_manual() -> TankHeatLossParams:
    return TankHeatLossParams(
        shape="rectangular",
        length=4,
        width=2,
        height=2,
        wall_thickness=0.008,
        wall_lambda=50,
        insulation_layers=[
            {
                "thickness": 0.08,
                "material": "other",
                "conductivity": 0.04,
                "temperature_range": [-90, 600],
            }
        ],
        insulation_temperature_basis="channel",
        ambient_temperature=-20,
        ground_temperature=5,
        process_temperature=70,
        placement="underground",
        tank_buried_height=1,
        ground_conductivity=1.5,
        wind_speed=3,
        safety_factor=1.2,
        q_additional=17,
    )


@pytest.mark.parametrize(
    ("calculate", "params_factory", "snapshot"),
    [
        pytest.param(
            calc_pipe_heat_loss,
            _pipe_air_manual,
            r"""{"additional_equivalent_length":3.0,"alpha_vnesh_applied":23.724,"ambient_temperature_applied":-30.0,"applied_units":{"additional_equivalent_length":"m","alpha_vnesh_applied":"W/(m2*K)","effective_length":"m","external_resistance":"m*K/W","ground_conductivity_applied":"W/(m*K)","heat_loss_per_meter_base":"W/m","heat_loss_per_meter_design":"W/m","insulation_resistance":"m*K/W","safety_factor_applied":"1","thermal_resistance":"m*K/W","total_heat_loss_base":"W","total_heat_loss_design":"W","wall_resistance":"m*K/W"},"effective_length":53.0,"external_resistance":0.064505,"formula_model":"pipe_heat_loss","formula_model_version":"2","ground_conductivity_applied":null,"ground_temperature_applied":null,"heat_loss_per_meter_base":41.158,"heat_loss_per_meter_design":49.389,"input_units":{"ambient_temperature":"degC","insulation_layers.conductivity":"W/(m*K)","insulation_layers.thickness":"m","local_element_equiv_length":"m","num_local_elements":"1","outer_diameter":"m","pipe_length":"m","process_temperature":"degC","safety_factor":"1","wall_thickness":"m","wind_speed":"m/s"},"insulation_layers_applied":[{"conductivity_applied":0.04,"conductivity_source":"manual","conductivity_temperature_applied":40.0,"index":1,"material":"other","resistance":2.607781008098658,"resistance_unit":"m*K/W","thickness":0.05}],"insulation_resistance":2.607781,"local_element_equiv_length_applied":1.5,"local_elements_count_applied":2,"model_assumptions":["steady_state_one_dimensional_radial_heat_flow","uniform_equivalent_length_per_local_element"],"process_temperature_applied":80.0,"safety_factor_applied":1.2,"source_corrections":["base_and_design_heat_losses_reported_separately","outdoor_auto_alpha_requires_explicit_wind_speed"],"thermal_resistance":2.672636,"total_heat_loss_base":2181.367,"total_heat_loss_design":2617.64,"wall_resistance":0.00035,"wind_speed_applied":3.0}""",
            id="pipe-air-manual-layer-wall-local-elements-and-k",
        ),
        pytest.param(
            calc_pipe_heat_loss,
            _pipe_ground_reference,
            r"""{"additional_equivalent_length":0.0,"alpha_vnesh_applied":null,"ambient_temperature_applied":null,"applied_units":{"additional_equivalent_length":"m","alpha_vnesh_applied":"W/(m2*K)","effective_length":"m","external_resistance":"m*K/W","ground_conductivity_applied":"W/(m*K)","heat_loss_per_meter_base":"W/m","heat_loss_per_meter_design":"W/m","insulation_resistance":"m*K/W","safety_factor_applied":"1","thermal_resistance":"m*K/W","total_heat_loss_base":"W","total_heat_loss_design":"W","wall_resistance":"m*K/W"},"effective_length":50.0,"external_resistance":0.332841,"formula_model":"pipe_heat_loss","formula_model_version":"2","ground_conductivity_applied":1.5,"ground_temperature_applied":5.0,"heat_loss_per_meter_base":34.979,"heat_loss_per_meter_design":38.477,"input_units":{"ground_conductivity":"W/(m*K)","ground_temperature":"degC","insulation_layers.thickness":"m","local_element_equiv_length":"m","num_local_elements":"1","outer_diameter":"m","pipe_centerline_depth":"m","pipe_length":"m","process_temperature":"degC","safety_factor":"1","wall_thickness":"m"},"insulation_layers_applied":[{"conductivity_applied":0.0576,"conductivity_source":"reference_data","conductivity_temperature_applied":60.0,"index":1,"material":"mineral_wool_boards_120","resistance":1.810959033401846,"resistance_unit":"m*K/W","thickness":0.05}],"insulation_resistance":1.810959,"local_element_equiv_length_applied":0.0,"local_elements_count_applied":0,"model_assumptions":["steady_state_one_dimensional_radial_heat_flow","uniform_equivalent_length_per_local_element","direct_buried_pipe_in_homogeneous_ground"],"process_temperature_applied":80.0,"safety_factor_applied":1.1,"source_corrections":["base_and_design_heat_losses_reported_separately","ground_temperature_used_for_underground_pipe"],"thermal_resistance":2.144162,"total_heat_loss_base":1748.935,"total_heat_loss_design":1923.829,"wall_resistance":0.000362,"wind_speed_applied":null}""",
            id="pipe-ground-reference-layer-and-null-air-trace",
        ),
        pytest.param(
            calc_tank_heat_loss,
            _tank_air_reference,
            r"""{"air_surface_area":null,"alpha_vnesh_applied":23.72435565298214,"ambient_temperature_applied":-30.0,"applied_units":{"air_surface_area":"m2","alpha_vnesh_applied":"W/(m2*K)","external_resistance_areal_bare":"m2*K/W","ground_conductivity_applied":"W/(m*K)","ground_resistance_areal_bare":"m2*K/W","ground_surface_area":"m2","heat_loss_air_base":"W","heat_loss_ground_base":"W","heat_loss_per_m2_bare_base":"W/m2","heat_loss_per_m2_bare_design":"W/m2","insulation_resistance_areal_bare":"m2*K/W","q_additional_applied":"W","safety_factor_applied":"1","surface_area_bare":"m2","thermal_resistance_areal_bare":"m2*K/W","total_heat_loss_base":"W","total_heat_loss_design":"W","wall_resistance_areal_bare":"m2*K/W","wind_speed_applied":"m/s"},"external_resistance_areal_bare":0.04215077596319462,"formula_model":"tank_heat_loss","formula_model_version":"3","ground_conductivity_applied":null,"ground_resistance_areal_bare":null,"ground_surface_area":null,"ground_temperature_applied":null,"heat_loss_air_base":null,"heat_loss_ground_base":null,"heat_loss_per_m2_bare_base":63.67453586526941,"heat_loss_per_m2_bare_design":70.04198945179635,"input_units":{"ambient_temperature":"degC","diameter":"m","ground_conductivity":"W/(m*K)","ground_temperature":"degC","height":"m","insulation_layers.conductivity":"W/(m*K)","insulation_layers.thickness":"m","length":"m","process_temperature":"degC","q_additional":"W","safety_factor":"1","tank_buried_height":"m","wall_lambda":"W/(m*K)","wall_thickness":"m","width":"m","wind_speed":"m/s"},"insulation_layers_applied":[{"conductivity_applied":0.05235,"conductivity_source":"reference_data","conductivity_temperature_applied":35.0,"index":1,"material":"mineral_wool_boards_120","resistance":1.5281757402101241,"resistance_unit":"m2*K/W","thickness":0.08}],"insulation_resistance_areal_bare":1.5281757402101241,"model_assumptions":["plane_wall_resistance_for_cylindrical_and_rectangular_tank"],"process_temperature_applied":70.0,"q_additional_applied":0.0,"safety_factor_applied":1.1,"source_corrections":["tank_external_resistance_is_areal_inverse_alpha","tank_air_and_ground_temperatures_are_separate","tank_additional_load_is_applied_after_safety_factor"],"surface_area_bare":25.132741228718345,"thermal_resistance_areal_bare":1.5704865161733188,"total_heat_loss_base":1600.3156327605616,"total_heat_loss_design":1760.3471960366178,"wall_resistance_areal_bare":0.00016,"wind_speed_applied":3.0}""",
            id="tank-air-reference-layer-wall-and-null-ground-trace",
        ),
        pytest.param(
            calc_tank_heat_loss,
            _tank_ground_manual,
            r"""{"air_surface_area":20.0,"alpha_vnesh_applied":23.72435565298214,"ambient_temperature_applied":-20.0,"applied_units":{"air_surface_area":"m2","alpha_vnesh_applied":"W/(m2*K)","external_resistance_areal_bare":"m2*K/W","ground_conductivity_applied":"W/(m*K)","ground_resistance_areal_bare":"m2*K/W","ground_surface_area":"m2","heat_loss_air_base":"W","heat_loss_ground_base":"W","heat_loss_per_m2_bare_base":"W/m2","heat_loss_per_m2_bare_design":"W/m2","insulation_resistance_areal_bare":"m2*K/W","q_additional_applied":"W","safety_factor_applied":"1","surface_area_bare":"m2","thermal_resistance_areal_bare":"m2*K/W","total_heat_loss_base":"W","total_heat_loss_design":"W","wall_resistance_areal_bare":"m2*K/W","wind_speed_applied":"m/s"},"external_resistance_areal_bare":0.04215077596319462,"formula_model":"tank_heat_loss","formula_model_version":"3","ground_conductivity_applied":1.5,"ground_resistance_areal_bare":0.6666666666666666,"ground_surface_area":20.0,"ground_temperature_applied":5.0,"heat_loss_air_base":881.3546014568151,"heat_loss_ground_base":487.4707517548947,"heat_loss_per_m2_bare_base":34.22063383029275,"heat_loss_per_m2_bare_design":41.489760596351296,"input_units":{"ambient_temperature":"degC","diameter":"m","ground_conductivity":"W/(m*K)","ground_temperature":"degC","height":"m","insulation_layers.conductivity":"W/(m*K)","insulation_layers.thickness":"m","length":"m","process_temperature":"degC","q_additional":"W","safety_factor":"1","tank_buried_height":"m","wall_lambda":"W/(m*K)","wall_thickness":"m","width":"m","wind_speed":"m/s"},"insulation_layers_applied":[{"conductivity_applied":0.04,"conductivity_source":"manual","conductivity_temperature_applied":55.0,"index":1,"material":"other","resistance":2.0,"resistance_unit":"m2*K/W","thickness":0.08}],"insulation_resistance_areal_bare":2.0,"model_assumptions":["plane_wall_resistance_for_cylindrical_and_rectangular_tank"],"process_temperature_applied":70.0,"q_additional_applied":17.0,"safety_factor_applied":1.2,"source_corrections":["tank_external_resistance_is_areal_inverse_alpha","tank_air_and_ground_temperatures_are_separate","tank_additional_load_is_applied_after_safety_factor"],"surface_area_bare":40.0,"thermal_resistance_areal_bare":null,"total_heat_loss_base":1368.8253532117099,"total_heat_loss_design":1659.5904238540518,"wall_resistance_areal_bare":0.00016,"wind_speed_applied":3.0}""",
            id="tank-ground-manual-layer-and-q-additional-after-k",
        ),
    ],
)
def test_public_facade_model_dump_is_frozen(calculate, params_factory, snapshot: str) -> None:
    assert calculate(params_factory()).model_dump() == json.loads(snapshot)


@pytest.mark.parametrize(
    ("calculate", "params", "message"),
    [
        pytest.param(
            calc_pipe_heat_loss,
            PipeHeatLossParams(
                outer_diameter=0.108,
                wall_thickness=0.006,
                pipe_material="carbon_steel",
                pipe_length=50,
                insulation_layers=[
                    {
                        "thickness": 0.05,
                        "material": "other",
                        "conductivity": 0.04,
                        "temperature_range": [-90, 60],
                    }
                ],
                insulation_temperature_basis="outdoor_winter",
                ambient_temperature=-30,
                process_temperature=80,
                placement="outdoor",
                wind_speed=3,
            ),
            "Температура горячей стороны слоя изоляции #1 (79.9856 °C) вне диапазона "
            "материала 'other': -90…60 °C",
            id="pipe",
        ),
        pytest.param(
            calc_tank_heat_loss,
            TankHeatLossParams(
                shape="cylindrical",
                diameter=2,
                height=3,
                wall_thickness=0.008,
                wall_lambda=50,
                insulation_layers=[
                    {
                        "thickness": 0.08,
                        "material": "other",
                        "conductivity": 0.04,
                        "temperature_range": [-90, 60],
                    }
                ],
                insulation_temperature_basis="outdoor_winter",
                ambient_temperature=-30,
                process_temperature=70,
                placement="outdoor",
                wind_speed=3,
                safety_factor=1.1,
            ),
            "Температура горячей стороны слоя изоляции #1 (69.9922 °C) вне диапазона "
            "материала 'other': -90…60 °C",
            id="tank",
        ),
    ],
)
def test_public_facade_layer_temperature_errors_are_frozen(calculate, params, message: str) -> None:
    with pytest.raises(HeatLossPreparationError) as error:
        calculate(params)

    assert str(error.value) == message
    assert error.value.code == "temperature_outside_interval"
    assert error.value.path == "insulation_layers.0"
    assert error.value.message == message
