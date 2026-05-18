"""Rules for reference insulation lambda temperature basis.

Internal reference docs define λ for insulation as a function of `tm`, not as
the average of product and ambient temperatures.
"""

from typing import Literal

InsulationTemperatureBasis = Literal[
    "indoor",
    "outdoor_summer",
    "outdoor_winter",
    "channel",
    "tunnel",
    "technical_subfloor",
    "attic",
    "basement",
]

WARM_40_BASES: set[str] = {
    "indoor",
    "outdoor_summer",
    "channel",
    "tunnel",
    "technical_subfloor",
    "attic",
    "basement",
}

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
    if resolved == "outdoor_winter":
        return process_temperature / 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")
