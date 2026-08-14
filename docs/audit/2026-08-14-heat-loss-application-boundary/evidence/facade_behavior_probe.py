"""Behavior probe for the 2026-08-14 heat-loss application-boundary queue.

Compares successful facade JSON and protected error messages across A0 and AF.
Does not record Python signatures or exception class names: A3/A4 change those
on purpose.

Call the facade through the adapters below so A2 (delete calc_alpha_vnesh) and
A3 (K chosen before facade, no coefficients argument) do not break the probe.
"""

from __future__ import annotations

import argparse
import inspect
import json
import random
from collections.abc import Callable
from typing import Any

from heatcalc_heat_loss_core.profile import resolve_external_alpha
from pydantic import BaseModel, ValidationError

from app.formulas.heat_loss.insulation import (
    allowed_insulation_temperature_bases,
    normalize_insulation_temperature_basis,
    resolve_insulation_tm,
    validate_insulation_temperature_basis_for_placement,
)
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss, pipe_material_lambda
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.reference_data.loader import (
    get_insulation_conductivity,
    get_insulation_temperature_range,
    get_pipe_material_lambda,
    list_insulation_materials,
    list_pipe_materials,
    pipe_heat_loss_materials_version,
    tank_heat_loss_materials_version,
)
from app.schemas.calculation import PipeHeatLossParams, TankHeatLossParams


def call_pipe(params: PipeHeatLossParams, coefficients: dict[str, float] | None) -> Any:
    """Old facade: coefficients=. New facade: copy params with chosen K."""

    signature = inspect.signature(calc_pipe_heat_loss)
    if "coefficients" in signature.parameters:
        return calc_pipe_heat_loss(params, coefficients)
    if (
        coefficients is not None
        and "safety_factor" in coefficients
        and params.safety_factor is None
    ):
        params = params.model_copy(update={"safety_factor": coefficients["safety_factor"]})
    return calc_pipe_heat_loss(params)


def call_tank(params: TankHeatLossParams) -> Any:
    return calc_tank_heat_loss(params)


def call_alpha(wind_speed: float | None, placement: str) -> float:
    """Same semantics as the current facade wrapper, without importing it."""

    if placement == "indoor":
        return resolve_external_alpha(placement="indoor", wind_speed_m_s=wind_speed)
    if wind_speed is None:
        raise ValueError("Для outdoor auto требуется wind_speed")
    return resolve_external_alpha(placement="outdoor", wind_speed_m_s=wind_speed)


def _normalise(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return _normalise(value.model_dump(mode="python"))
    if isinstance(value, float):
        return {"float_hex": value.hex()}
    if isinstance(value, dict):
        return {str(key): _normalise(value[key]) for key in sorted(value, key=str)}
    if isinstance(value, list | tuple | set | frozenset):
        items = [_normalise(item) for item in value]
        return (
            sorted(items, key=lambda item: json.dumps(item, sort_keys=True))
            if isinstance(value, set | frozenset)
            else items
        )
    return value


def _capture(call: Callable[[], Any]) -> dict[str, Any]:
    try:
        return {"status": "ok", "value": _normalise(call())}
    except ValidationError as exc:
        return {
            "status": "error",
            "message": str(exc),
            "errors": _normalise(exc.errors(include_url=False)),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


def _manual_layers(rng: random.Random, count: int) -> list[dict[str, Any]]:
    return [
        {
            "thickness": round(rng.uniform(0.006, 0.12), 6),
            "material": "other",
            "conductivity": round(rng.uniform(0.025, 0.18), 7),
            "temperature_range": [-1000.0, 1000.0],
        }
        for _ in range(count)
    ]


def pipe_cases() -> list[tuple[str, PipeHeatLossParams, dict[str, float] | None]]:
    cases: list[tuple[str, PipeHeatLossParams, dict[str, float] | None]] = []
    rng = random.Random(20260812)
    placements = ("indoor", "outdoor", "underground")
    bases = {"indoor": "indoor", "outdoor": "outdoor_winter", "underground": "channel"}
    for index in range(72):
        placement = placements[index % len(placements)]
        layer_count = index % 3 + 1
        outer_diameter = round(rng.uniform(0.06, 1.2), 6)
        wall_thickness = round(min(rng.uniform(0.001, 0.025), outer_diameter / 5), 6)
        process_temperature = round(rng.uniform(40.0, 350.0), 5)
        local_count = index % 6
        data: dict[str, Any] = {
            "outer_diameter": outer_diameter,
            "wall_thickness": wall_thickness,
            "pipe_lambda": round(rng.uniform(8.0, 250.0), 6),
            "pipe_length": round(rng.uniform(0.5, 1500.0), 5),
            "insulation_layers": _manual_layers(rng, layer_count),
            "insulation_temperature_basis": bases[placement],
            "process_temperature": process_temperature,
            "placement": placement,
            "safety_factor": None if index % 4 == 0 else round(1.0 + (index % 8) / 12, 6),
            "num_local_elements": local_count,
            "local_element_equiv_length": (
                None if local_count == 0 else round(rng.uniform(0.1, 6.9), 5)
            ),
        }
        if placement == "underground":
            outer_radius = outer_diameter / 2 + sum(
                layer["thickness"] for layer in data["insulation_layers"]
            )
            data.update(
                ground_temperature=round(rng.uniform(-30.0, 20.0), 5),
                ground_conductivity=round(rng.uniform(0.5, 3.0), 6),
                pipe_centerline_depth=round(outer_radius + rng.uniform(0.05, 5.0), 6),
            )
        else:
            data["ambient_temperature"] = round(
                rng.uniform(-60.0, min(35.0, process_temperature - 1.0)), 5
            )
            if placement == "outdoor":
                data["wind_speed"] = round(rng.uniform(0.0, 20.0), 6)
        coefficients = (
            {"safety_factor": round(1.05 + (index % 5) * 0.1, 6)} if index % 4 == 0 else None
        )
        cases.append(
            (
                f"random-{index:03d}-{placement}-{layer_count}l",
                PipeHeatLossParams(**data),
                coefficients,
            )
        )

    reference_common = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.006,
        "pipe_material": "carbon_steel",
        "pipe_length": 53.25,
        "process_temperature": 80.0,
        "safety_factor": 1.2,
    }
    for placement, basis in bases.items():
        for layer_count in (1, 2, 3):
            data = dict(reference_common)
            data.update(
                placement=placement,
                insulation_temperature_basis=basis,
                insulation_layers=[
                    {
                        "thickness": 0.02 + layer_index * 0.005,
                        "material": "mineral_wool_boards_120",
                    }
                    for layer_index in range(layer_count)
                ],
            )
            if placement == "underground":
                outer_radius = data["outer_diameter"] / 2 + sum(
                    layer["thickness"] for layer in data["insulation_layers"]
                )
                data.update(
                    ground_temperature=5.0,
                    ground_conductivity=1.5,
                    pipe_centerline_depth=outer_radius + 1.0,
                )
            else:
                data["ambient_temperature"] = -30.0
                if placement == "outdoor":
                    data["wind_speed"] = 3.0
            cases.append(
                (f"reference-{placement}-{layer_count}l", PipeHeatLossParams(**data), None)
            )
    return cases


def tank_cases() -> list[tuple[str, TankHeatLossParams]]:
    cases: list[tuple[str, TankHeatLossParams]] = []
    rng = random.Random(8122026)
    placements = ("indoor", "outdoor", "underground")
    bases = {"indoor": "indoor", "outdoor": "outdoor_summer", "underground": "channel"}
    for index in range(72):
        placement = placements[index % len(placements)]
        shape = "cylindrical" if index % 2 == 0 else "rectangular"
        layer_count = index % 3 + 1
        height = round(rng.uniform(0.2, 25.0), 6)
        process_temperature = round(rng.uniform(40.0, 350.0), 5)
        data: dict[str, Any] = {
            "shape": shape,
            "height": height,
            "insulation_layers": _manual_layers(rng, layer_count),
            "ambient_temperature": round(
                rng.uniform(-60.0, min(35.0, process_temperature - 1.0)), 5
            ),
            "process_temperature": process_temperature,
            "insulation_temperature_basis": bases[placement],
            "placement": placement,
            "safety_factor": round(1.0 + (index % 8) / 12, 6),
            "q_additional": round(rng.uniform(0.0, 500.0), 6),
        }
        if shape == "cylindrical":
            data["diameter"] = round(rng.uniform(0.2, 20.0), 6)
        else:
            data["length"] = round(rng.uniform(0.2, 50.0), 6)
            data["width"] = round(rng.uniform(0.2, 50.0), 6)
        if index % 3:
            data["wall_thickness"] = round(rng.uniform(0.001, 0.08), 6)
            data["wall_lambda"] = round(rng.uniform(2.0, 300.0), 6)
        if placement in {"outdoor", "underground"}:
            data["wind_speed"] = round(rng.uniform(0.0, 20.0), 6)
        if placement == "underground":
            data["ground_temperature"] = round(
                rng.uniform(-30.0, min(20.0, process_temperature - 1.0)), 5
            )
            data["ground_conductivity"] = round(rng.uniform(0.5, 3.0), 6)
            data["tank_buried_height"] = round(rng.uniform(0.001, height), 6)
        cases.append(
            (
                f"random-{index:03d}-{shape}-{placement}-{layer_count}l",
                TankHeatLossParams(**data),
            )
        )

    for shape in ("cylindrical", "rectangular"):
        for placement, basis in bases.items():
            for layer_count in (1, 2, 3):
                data = {
                    "shape": shape,
                    "height": 3.0,
                    "insulation_layers": [
                        {
                            "thickness": 0.02 + layer_index * 0.005,
                            "material": "mineral_wool_boards_120",
                        }
                        for layer_index in range(layer_count)
                    ],
                    "ambient_temperature": -30.0,
                    "process_temperature": 70.0,
                    "insulation_temperature_basis": basis,
                    "placement": placement,
                    "wall_thickness": 0.008,
                    "wall_lambda": 50.0,
                    "safety_factor": 1.1,
                    "q_additional": 17.0,
                }
                if shape == "cylindrical":
                    data["diameter"] = 2.0
                else:
                    data.update(length=4.0, width=2.0)
                if placement in {"outdoor", "underground"}:
                    data["wind_speed"] = 3.0
                if placement == "underground":
                    data.update(
                        ground_temperature=5.0,
                        ground_conductivity=1.5,
                        tank_buried_height=1.0,
                    )
                cases.append(
                    (
                        f"reference-{shape}-{placement}-{layer_count}l",
                        TankHeatLossParams(**data),
                    )
                )
    return cases


def _invalid_cases() -> dict[str, Callable[[], Any]]:
    manual_bad_layer = {
        "thickness": 0.05,
        "material": "other",
        "conductivity": 0.04,
        "temperature_range": [-90.0, 60.0],
    }
    return {
        "pipe-layer-hot-side-range": lambda: call_pipe(
            PipeHeatLossParams(
                outer_diameter=0.108,
                wall_thickness=0.006,
                pipe_material="carbon_steel",
                pipe_length=50,
                insulation_layers=[manual_bad_layer],
                insulation_temperature_basis="outdoor_winter",
                ambient_temperature=-30,
                process_temperature=80,
                placement="outdoor",
                wind_speed=3,
            ),
            None,
        ),
        "tank-layer-hot-side-range": lambda: call_tank(
            TankHeatLossParams(
                shape="cylindrical",
                diameter=2,
                height=3,
                wall_thickness=0.008,
                wall_lambda=50,
                insulation_layers=[manual_bad_layer],
                insulation_temperature_basis="outdoor_winter",
                ambient_temperature=-30,
                process_temperature=70,
                placement="outdoor",
                wind_speed=3,
                safety_factor=1.1,
            )
        ),
        "pipe-schema-wall-too-thick": lambda: PipeHeatLossParams(
            outer_diameter=0.02,
            wall_thickness=0.011,
            pipe_lambda=40,
            pipe_length=1,
            insulation_layers=[
                {
                    "thickness": 0.01,
                    "material": "other",
                    "conductivity": 0.04,
                    "temperature_range": [-100, 100],
                }
            ],
            ambient_temperature=0,
            process_temperature=50,
            insulation_temperature_basis="indoor",
            placement="indoor",
        ),
        "pipe-schema-underground-depth": lambda: PipeHeatLossParams(
            outer_diameter=0.108,
            wall_thickness=0.006,
            pipe_lambda=40,
            pipe_length=1,
            insulation_layers=[
                {
                    "thickness": 0.05,
                    "material": "other",
                    "conductivity": 0.04,
                    "temperature_range": [-100, 100],
                }
            ],
            ground_temperature=5,
            process_temperature=50,
            insulation_temperature_basis="channel",
            placement="underground",
            pipe_centerline_depth=0.1,
            ground_conductivity=1.5,
        ),
        "tank-schema-buried-height": lambda: TankHeatLossParams(
            shape="rectangular",
            length=2,
            width=2,
            height=1,
            insulation_layers=[
                {
                    "thickness": 0.05,
                    "material": "other",
                    "conductivity": 0.04,
                    "temperature_range": [-100, 100],
                }
            ],
            ambient_temperature=0,
            ground_temperature=5,
            process_temperature=50,
            insulation_temperature_basis="channel",
            placement="underground",
            tank_buried_height=2,
            ground_conductivity=1.5,
            wind_speed=0,
            safety_factor=1.1,
        ),
        "unknown-pipe-material": lambda: pipe_material_lambda("missing", 20.0),
        "missing-tm-basis": lambda: normalize_insulation_temperature_basis(
            basis=None, location=None, placement="outdoor"
        ),
        "invalid-tm-placement": lambda: validate_insulation_temperature_basis_for_placement(
            basis="channel", location=None, placement="outdoor"
        ),
        "outdoor-alpha-missing-wind": lambda: call_alpha(None, "outdoor"),
    }


def build_contract() -> dict[str, Any]:
    contract: dict[str, Any] = {
        "versions": {},
        "tm": {},
        "alpha": {},
        "pipe_material_lambda": {},
        "insulation_conductivity": {},
        "pipe_results": {},
        "tank_results": {},
        "invalid": {},
    }
    contract["versions"] = {
        "pipe": pipe_heat_loss_materials_version(),
        "tank": tank_heat_loss_materials_version(),
    }

    bases = (
        "indoor",
        "outdoor_summer",
        "outdoor_winter",
        "channel",
        "tunnel",
        "technical_subfloor",
        "attic",
        "basement",
    )
    for process_temperature in (-90.0, -0.0, 0.0, 40.0, 80.0, 600.0):
        for basis in bases:
            key = f"{process_temperature.hex()}:{basis}"
            contract["tm"][key] = _capture(
                lambda p=process_temperature, b=basis: resolve_insulation_tm(
                    process_temperature=p, basis=b, location=None, placement=None
                )
            )
    for placement in ("indoor", "outdoor", "underground", "legacy"):
        contract["tm"][f"allowed:{placement}"] = _capture(
            lambda p=placement: allowed_insulation_temperature_bases(location=None, placement=p)
        )
    for placement in ("indoor", "outdoor", "unknown"):
        for wind_speed in (None, -4.0, -0.0, 0.0, 0.01, 1.0, 3.0, 20.0):
            contract["alpha"][f"{placement}:{wind_speed}"] = _capture(
                lambda p=placement, v=wind_speed: call_alpha(v, p)
            )

    for entry in list_pipe_materials():
        material = entry["material"]
        for temperature in (-90.0, -40.0, -0.0, 0.0, 80.0, 300.0, 600.0):
            contract["pipe_material_lambda"][f"{material}:{temperature.hex()}"] = _capture(
                lambda m=material, t=temperature: get_pipe_material_lambda(m, t)
            )
    for entry in list_insulation_materials():
        material = entry["material"]
        interval = _capture(lambda m=material: get_insulation_temperature_range(m))
        contract["insulation_conductivity"][f"{material}:range"] = interval
        if interval["status"] != "ok":
            continue
        low, high = get_insulation_temperature_range(material)
        temperatures = {low, high, (low + high) / 2.0}
        if low <= -60.0 <= high:
            temperatures.update((-60.0000001, -60.0, -59.9999999))
        for temperature in sorted(temperatures):
            contract["insulation_conductivity"][f"{material}:{temperature.hex()}"] = _capture(
                lambda m=material, t=temperature: get_insulation_conductivity(m, t)
            )

    for name, params, coefficients in pipe_cases():
        contract["pipe_results"][name] = _capture(lambda p=params, c=coefficients: call_pipe(p, c))
    for name, params in tank_cases():
        contract["tank_results"][name] = _capture(lambda p=params: call_tank(p))
    for name, call in _invalid_cases().items():
        contract["invalid"][name] = _capture(call)
    return _normalise(contract)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    args = parser.parse_args()
    contract = build_contract()
    output = args.output
    text = json.dumps(contract, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    with open(output, "w", encoding="utf-8") as handle:
        handle.write(text)
    print(
        json.dumps(
            {
                "pipe_cases": len(contract["pipe_results"]),
                "tank_cases": len(contract["tank_results"]),
                "invalid_cases": len(contract["invalid"]),
                "insulation_probes": len(contract["insulation_conductivity"]),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
