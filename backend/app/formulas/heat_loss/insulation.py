"""Rules for reference insulation lambda temperature basis.

Internal reference docs define λ for insulation as a function of `tm`, not as
the average of product and ambient temperatures.
"""

from heatcalc_heat_loss_core.profile import (
    InsulationTemperatureBasis as InsulationTemperatureBasis,
)
from heatcalc_heat_loss_core.profile import resolve_insulation_temperature

from app.formulas.heat_loss.core.insulation_contract import (
    ALLOWED_INSULATION_BASES_BY_PLACEMENT,
)

INSULATION_TEMPERATURE_BASIS_LABELS: dict[str, str] = {
    "indoor": "помещение",
    "outdoor_summer": "открытый воздух, лето",
    "outdoor_winter": "открытый воздух, зима",
    "channel": "канал",
    "tunnel": "тоннель",
    "technical_subfloor": "техническое подполье",
    "attic": "чердак",
    "basement": "подвал",
}

INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE = (
    "Режим tm изоляции не соответствует размещению объекта"
)

INSULATION_TEMPERATURE_PLACEMENT_LABELS: dict[str, str] = {
    "indoor": "в помещении",
    "outdoor": "на открытом воздухе",
    "underground": "подземно",
}


def effective_insulation_temperature_placement(
    *,
    location: str | None,
    placement: str | None,
) -> str:
    if placement in ALLOWED_INSULATION_BASES_BY_PLACEMENT:
        return placement
    if location == "indoor":
        return "indoor"
    return "outdoor"


def allowed_insulation_temperature_bases(
    *,
    location: str | None,
    placement: str | None,
) -> frozenset[str]:
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        placement=placement,
    )
    return ALLOWED_INSULATION_BASES_BY_PLACEMENT[effective_placement]  # type: ignore[index]


def validate_insulation_temperature_basis_for_placement(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> None:
    if basis is None:
        return
    allowed = allowed_insulation_temperature_bases(location=location, placement=placement)
    if basis in allowed:
        return
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        placement=placement,
    )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item] for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(basis, str(basis))
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        effective_placement,
        effective_placement,
    )
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def normalize_insulation_temperature_basis(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    if basis in INSULATION_TEMPERATURE_BASIS_LABELS:
        return basis  # type: ignore[return-value]
    if placement == "indoor" or location == "indoor":
        return "indoor"
    raise ValueError(
        "Для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def resolve_insulation_tm(
    *,
    process_temperature: float,
    basis: str | None,
    location: str | None,
    placement: str | None = None,
) -> float:
    resolved = normalize_insulation_temperature_basis(
        basis=basis,
        location=location,
        placement=placement,
    )
    return resolve_insulation_temperature(
        process_temperature,
        basis=resolved,
    )
