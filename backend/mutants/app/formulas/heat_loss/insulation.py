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

ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT: dict[str, set[str]] = {
    "indoor": {"indoor", "attic", "basement"},
    "outdoor": {"outdoor_summer", "outdoor_winter"},
    "underground": {"channel", "tunnel", "technical_subfloor"},
}

INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE = (
    "Режим tm изоляции не соответствует размещению объекта"
)

INSULATION_TEMPERATURE_PLACEMENT_LABELS: dict[str, str] = {
    "indoor": "в помещении",
    "outdoor": "на открытом воздухе",
    "underground": "подземно",
}
from typing import Annotated
from typing import Callable
from typing import ClassVar

MutantDict = Annotated[dict[str, Callable], "Mutant"] # type: ignore


def _mutmut_trampoline(orig, mutants, call_args, call_kwargs, self_arg = None): # type: ignore
    """Forward call to original or mutated function, depending on the environment"""
    import os # type: ignore
    mutant_under_test = os.environ['MUTANT_UNDER_TEST'] # type: ignore
    if mutant_under_test == 'fail': # type: ignore
        from mutmut.__main__ import MutmutProgrammaticFailException # type: ignore
        raise MutmutProgrammaticFailException('Failed programmatically')       # type: ignore
    elif mutant_under_test == 'stats': # type: ignore
        from mutmut.__main__ import record_trampoline_hit # type: ignore
        record_trampoline_hit(orig.__module__ + '.' + orig.__name__) # type: ignore
        # (for class methods, orig is bound and thus does not need the explicit self argument)
        result = orig(*call_args, **call_kwargs) # type: ignore
        return result # type: ignore
    prefix = orig.__module__ + '.' + orig.__name__ + '__mutmut_' # type: ignore
    if not mutant_under_test.startswith(prefix): # type: ignore
        result = orig(*call_args, **call_kwargs) # type: ignore
        return result # type: ignore
    mutant_name = mutant_under_test.rpartition('.')[-1] # type: ignore
    if self_arg is not None: # type: ignore
        # call to a class method where self is not bound
        result = mutants[mutant_name](self_arg, *call_args, **call_kwargs) # type: ignore
    else:
        result = mutants[mutant_name](*call_args, **call_kwargs) # type: ignore
    return result # type: ignore


def effective_insulation_temperature_placement(
    *,
    location: str | None,
    placement: str | None,
) -> str:
    args = []# type: ignore
    kwargs = {'location': location, 'placement': placement}# type: ignore
    return _mutmut_trampoline(x_effective_insulation_temperature_placement__mutmut_orig, x_effective_insulation_temperature_placement__mutmut_mutants, args, kwargs, None)


def x_effective_insulation_temperature_placement__mutmut_orig(
    *,
    location: str | None,
    placement: str | None,
) -> str:
    if placement in ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT:
        return placement
    if location == "indoor":
        return "indoor"
    return "outdoor"


def x_effective_insulation_temperature_placement__mutmut_1(
    *,
    location: str | None,
    placement: str | None,
) -> str:
    if placement not in ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT:
        return placement
    if location == "indoor":
        return "indoor"
    return "outdoor"


def x_effective_insulation_temperature_placement__mutmut_2(
    *,
    location: str | None,
    placement: str | None,
) -> str:
    if placement in ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT:
        return placement
    if location != "indoor":
        return "indoor"
    return "outdoor"


def x_effective_insulation_temperature_placement__mutmut_3(
    *,
    location: str | None,
    placement: str | None,
) -> str:
    if placement in ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT:
        return placement
    if location == "XXindoorXX":
        return "indoor"
    return "outdoor"


def x_effective_insulation_temperature_placement__mutmut_4(
    *,
    location: str | None,
    placement: str | None,
) -> str:
    if placement in ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT:
        return placement
    if location == "INDOOR":
        return "indoor"
    return "outdoor"


def x_effective_insulation_temperature_placement__mutmut_5(
    *,
    location: str | None,
    placement: str | None,
) -> str:
    if placement in ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT:
        return placement
    if location == "indoor":
        return "XXindoorXX"
    return "outdoor"


def x_effective_insulation_temperature_placement__mutmut_6(
    *,
    location: str | None,
    placement: str | None,
) -> str:
    if placement in ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT:
        return placement
    if location == "indoor":
        return "INDOOR"
    return "outdoor"


def x_effective_insulation_temperature_placement__mutmut_7(
    *,
    location: str | None,
    placement: str | None,
) -> str:
    if placement in ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT:
        return placement
    if location == "indoor":
        return "indoor"
    return "XXoutdoorXX"


def x_effective_insulation_temperature_placement__mutmut_8(
    *,
    location: str | None,
    placement: str | None,
) -> str:
    if placement in ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT:
        return placement
    if location == "indoor":
        return "indoor"
    return "OUTDOOR"

x_effective_insulation_temperature_placement__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_effective_insulation_temperature_placement__mutmut_1': x_effective_insulation_temperature_placement__mutmut_1, 
    'x_effective_insulation_temperature_placement__mutmut_2': x_effective_insulation_temperature_placement__mutmut_2, 
    'x_effective_insulation_temperature_placement__mutmut_3': x_effective_insulation_temperature_placement__mutmut_3, 
    'x_effective_insulation_temperature_placement__mutmut_4': x_effective_insulation_temperature_placement__mutmut_4, 
    'x_effective_insulation_temperature_placement__mutmut_5': x_effective_insulation_temperature_placement__mutmut_5, 
    'x_effective_insulation_temperature_placement__mutmut_6': x_effective_insulation_temperature_placement__mutmut_6, 
    'x_effective_insulation_temperature_placement__mutmut_7': x_effective_insulation_temperature_placement__mutmut_7, 
    'x_effective_insulation_temperature_placement__mutmut_8': x_effective_insulation_temperature_placement__mutmut_8
}
x_effective_insulation_temperature_placement__mutmut_orig.__name__ = 'x_effective_insulation_temperature_placement'


def allowed_insulation_temperature_bases(
    *,
    location: str | None,
    placement: str | None,
) -> set[str]:
    args = []# type: ignore
    kwargs = {'location': location, 'placement': placement}# type: ignore
    return _mutmut_trampoline(x_allowed_insulation_temperature_bases__mutmut_orig, x_allowed_insulation_temperature_bases__mutmut_mutants, args, kwargs, None)


def x_allowed_insulation_temperature_bases__mutmut_orig(
    *,
    location: str | None,
    placement: str | None,
) -> set[str]:
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        placement=placement,
    )
    return ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT[effective_placement]


def x_allowed_insulation_temperature_bases__mutmut_1(
    *,
    location: str | None,
    placement: str | None,
) -> set[str]:
    effective_placement = None
    return ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT[effective_placement]


def x_allowed_insulation_temperature_bases__mutmut_2(
    *,
    location: str | None,
    placement: str | None,
) -> set[str]:
    effective_placement = effective_insulation_temperature_placement(
        location=None,
        placement=placement,
    )
    return ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT[effective_placement]


def x_allowed_insulation_temperature_bases__mutmut_3(
    *,
    location: str | None,
    placement: str | None,
) -> set[str]:
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        placement=None,
    )
    return ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT[effective_placement]


def x_allowed_insulation_temperature_bases__mutmut_4(
    *,
    location: str | None,
    placement: str | None,
) -> set[str]:
    effective_placement = effective_insulation_temperature_placement(
        placement=placement,
    )
    return ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT[effective_placement]


def x_allowed_insulation_temperature_bases__mutmut_5(
    *,
    location: str | None,
    placement: str | None,
) -> set[str]:
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        )
    return ALLOWED_INSULATION_TEMPERATURE_BASES_BY_PLACEMENT[effective_placement]

x_allowed_insulation_temperature_bases__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_allowed_insulation_temperature_bases__mutmut_1': x_allowed_insulation_temperature_bases__mutmut_1, 
    'x_allowed_insulation_temperature_bases__mutmut_2': x_allowed_insulation_temperature_bases__mutmut_2, 
    'x_allowed_insulation_temperature_bases__mutmut_3': x_allowed_insulation_temperature_bases__mutmut_3, 
    'x_allowed_insulation_temperature_bases__mutmut_4': x_allowed_insulation_temperature_bases__mutmut_4, 
    'x_allowed_insulation_temperature_bases__mutmut_5': x_allowed_insulation_temperature_bases__mutmut_5
}
x_allowed_insulation_temperature_bases__mutmut_orig.__name__ = 'x_allowed_insulation_temperature_bases'


def validate_insulation_temperature_basis_for_placement(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> None:
    args = []# type: ignore
    kwargs = {'basis': basis, 'location': location, 'placement': placement}# type: ignore
    return _mutmut_trampoline(x_validate_insulation_temperature_basis_for_placement__mutmut_orig, x_validate_insulation_temperature_basis_for_placement__mutmut_mutants, args, kwargs, None)


def x_validate_insulation_temperature_basis_for_placement__mutmut_orig(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_1(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> None:
    if basis is not None:
        return
    allowed = allowed_insulation_temperature_bases(location=location, placement=placement)
    if basis in allowed:
        return
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        placement=placement,
    )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_2(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> None:
    if basis is None:
        return
    allowed = None
    if basis in allowed:
        return
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        placement=placement,
    )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_3(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> None:
    if basis is None:
        return
    allowed = allowed_insulation_temperature_bases(location=None, placement=placement)
    if basis in allowed:
        return
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        placement=placement,
    )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_4(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> None:
    if basis is None:
        return
    allowed = allowed_insulation_temperature_bases(location=location, placement=None)
    if basis in allowed:
        return
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        placement=placement,
    )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_5(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> None:
    if basis is None:
        return
    allowed = allowed_insulation_temperature_bases(placement=placement)
    if basis in allowed:
        return
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        placement=placement,
    )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_6(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> None:
    if basis is None:
        return
    allowed = allowed_insulation_temperature_bases(location=location, )
    if basis in allowed:
        return
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        placement=placement,
    )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_7(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> None:
    if basis is None:
        return
    allowed = allowed_insulation_temperature_bases(location=location, placement=placement)
    if basis not in allowed:
        return
    effective_placement = effective_insulation_temperature_placement(
        location=location,
        placement=placement,
    )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_8(
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
    effective_placement = None
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_9(
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
        location=None,
        placement=placement,
    )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_10(
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
        placement=None,
    )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_11(
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
        placement=placement,
    )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_12(
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
        )
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_13(
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
    allowed_labels = None
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_14(
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
        None
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_15(
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
    allowed_labels = "XX, XX".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_16(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(None)
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


def x_validate_insulation_temperature_basis_for_placement__mutmut_17(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = None
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        effective_placement,
        effective_placement,
    )
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def x_validate_insulation_temperature_basis_for_placement__mutmut_18(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(None, str(basis))
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        effective_placement,
        effective_placement,
    )
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def x_validate_insulation_temperature_basis_for_placement__mutmut_19(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(basis, None)
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        effective_placement,
        effective_placement,
    )
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def x_validate_insulation_temperature_basis_for_placement__mutmut_20(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(str(basis))
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        effective_placement,
        effective_placement,
    )
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def x_validate_insulation_temperature_basis_for_placement__mutmut_21(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(basis, )
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        effective_placement,
        effective_placement,
    )
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def x_validate_insulation_temperature_basis_for_placement__mutmut_22(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(basis, str(None))
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        effective_placement,
        effective_placement,
    )
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def x_validate_insulation_temperature_basis_for_placement__mutmut_23(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(basis, str(basis))
    placement_label = None
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def x_validate_insulation_temperature_basis_for_placement__mutmut_24(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(basis, str(basis))
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        None,
        effective_placement,
    )
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def x_validate_insulation_temperature_basis_for_placement__mutmut_25(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(basis, str(basis))
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        effective_placement,
        None,
    )
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def x_validate_insulation_temperature_basis_for_placement__mutmut_26(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(basis, str(basis))
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        effective_placement,
    )
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def x_validate_insulation_temperature_basis_for_placement__mutmut_27(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(basis, str(basis))
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        effective_placement,
        )
    raise ValueError(
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def x_validate_insulation_temperature_basis_for_placement__mutmut_28(
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
        INSULATION_TEMPERATURE_BASIS_LABELS[item]
        for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(basis, str(basis))
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(
        effective_placement,
        effective_placement,
    )
    raise ValueError(
        None
    )

x_validate_insulation_temperature_basis_for_placement__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_validate_insulation_temperature_basis_for_placement__mutmut_1': x_validate_insulation_temperature_basis_for_placement__mutmut_1, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_2': x_validate_insulation_temperature_basis_for_placement__mutmut_2, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_3': x_validate_insulation_temperature_basis_for_placement__mutmut_3, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_4': x_validate_insulation_temperature_basis_for_placement__mutmut_4, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_5': x_validate_insulation_temperature_basis_for_placement__mutmut_5, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_6': x_validate_insulation_temperature_basis_for_placement__mutmut_6, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_7': x_validate_insulation_temperature_basis_for_placement__mutmut_7, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_8': x_validate_insulation_temperature_basis_for_placement__mutmut_8, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_9': x_validate_insulation_temperature_basis_for_placement__mutmut_9, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_10': x_validate_insulation_temperature_basis_for_placement__mutmut_10, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_11': x_validate_insulation_temperature_basis_for_placement__mutmut_11, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_12': x_validate_insulation_temperature_basis_for_placement__mutmut_12, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_13': x_validate_insulation_temperature_basis_for_placement__mutmut_13, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_14': x_validate_insulation_temperature_basis_for_placement__mutmut_14, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_15': x_validate_insulation_temperature_basis_for_placement__mutmut_15, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_16': x_validate_insulation_temperature_basis_for_placement__mutmut_16, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_17': x_validate_insulation_temperature_basis_for_placement__mutmut_17, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_18': x_validate_insulation_temperature_basis_for_placement__mutmut_18, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_19': x_validate_insulation_temperature_basis_for_placement__mutmut_19, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_20': x_validate_insulation_temperature_basis_for_placement__mutmut_20, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_21': x_validate_insulation_temperature_basis_for_placement__mutmut_21, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_22': x_validate_insulation_temperature_basis_for_placement__mutmut_22, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_23': x_validate_insulation_temperature_basis_for_placement__mutmut_23, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_24': x_validate_insulation_temperature_basis_for_placement__mutmut_24, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_25': x_validate_insulation_temperature_basis_for_placement__mutmut_25, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_26': x_validate_insulation_temperature_basis_for_placement__mutmut_26, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_27': x_validate_insulation_temperature_basis_for_placement__mutmut_27, 
    'x_validate_insulation_temperature_basis_for_placement__mutmut_28': x_validate_insulation_temperature_basis_for_placement__mutmut_28
}
x_validate_insulation_temperature_basis_for_placement__mutmut_orig.__name__ = 'x_validate_insulation_temperature_basis_for_placement'


def normalize_insulation_temperature_basis(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    args = []# type: ignore
    kwargs = {'basis': basis, 'location': location, 'placement': placement}# type: ignore
    return _mutmut_trampoline(x_normalize_insulation_temperature_basis__mutmut_orig, x_normalize_insulation_temperature_basis__mutmut_mutants, args, kwargs, None)


def x_normalize_insulation_temperature_basis__mutmut_orig(
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


def x_normalize_insulation_temperature_basis__mutmut_1(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    if basis not in INSULATION_TEMPERATURE_BASIS_LABELS:
        return basis  # type: ignore[return-value]
    if placement == "indoor" or location == "indoor":
        return "indoor"
    raise ValueError(
        "Для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_2(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    if basis in INSULATION_TEMPERATURE_BASIS_LABELS:
        return basis  # type: ignore[return-value]
    if placement == "indoor" and location == "indoor":
        return "indoor"
    raise ValueError(
        "Для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_3(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    if basis in INSULATION_TEMPERATURE_BASIS_LABELS:
        return basis  # type: ignore[return-value]
    if placement != "indoor" or location == "indoor":
        return "indoor"
    raise ValueError(
        "Для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_4(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    if basis in INSULATION_TEMPERATURE_BASIS_LABELS:
        return basis  # type: ignore[return-value]
    if placement == "XXindoorXX" or location == "indoor":
        return "indoor"
    raise ValueError(
        "Для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_5(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    if basis in INSULATION_TEMPERATURE_BASIS_LABELS:
        return basis  # type: ignore[return-value]
    if placement == "INDOOR" or location == "indoor":
        return "indoor"
    raise ValueError(
        "Для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_6(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    if basis in INSULATION_TEMPERATURE_BASIS_LABELS:
        return basis  # type: ignore[return-value]
    if placement == "indoor" or location != "indoor":
        return "indoor"
    raise ValueError(
        "Для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_7(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    if basis in INSULATION_TEMPERATURE_BASIS_LABELS:
        return basis  # type: ignore[return-value]
    if placement == "indoor" or location == "XXindoorXX":
        return "indoor"
    raise ValueError(
        "Для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_8(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    if basis in INSULATION_TEMPERATURE_BASIS_LABELS:
        return basis  # type: ignore[return-value]
    if placement == "indoor" or location == "INDOOR":
        return "indoor"
    raise ValueError(
        "Для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_9(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    if basis in INSULATION_TEMPERATURE_BASIS_LABELS:
        return basis  # type: ignore[return-value]
    if placement == "indoor" or location == "indoor":
        return "XXindoorXX"
    raise ValueError(
        "Для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_10(
    *,
    basis: str | None,
    location: str | None,
    placement: str | None,
) -> InsulationTemperatureBasis:
    if basis in INSULATION_TEMPERATURE_BASIS_LABELS:
        return basis  # type: ignore[return-value]
    if placement == "indoor" or location == "indoor":
        return "INDOOR"
    raise ValueError(
        "Для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_11(
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
        None
    )


def x_normalize_insulation_temperature_basis__mutmut_12(
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
        "XXДля расчёта λ изоляции выберите режим температуры изоляции XX"
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_13(
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
        "для расчёта λ изоляции выберите режим температуры изоляции "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_14(
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
        "ДЛЯ РАСЧЁТА Λ ИЗОЛЯЦИИ ВЫБЕРИТЕ РЕЖИМ ТЕМПЕРАТУРЫ ИЗОЛЯЦИИ "
        "(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)"
    )


def x_normalize_insulation_temperature_basis__mutmut_15(
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
        "XX(помещение/улица лето/улица зима/канал/тоннель/подполье/чердак/подвал)XX"
    )


def x_normalize_insulation_temperature_basis__mutmut_16(
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
        "(ПОМЕЩЕНИЕ/УЛИЦА ЛЕТО/УЛИЦА ЗИМА/КАНАЛ/ТОННЕЛЬ/ПОДПОЛЬЕ/ЧЕРДАК/ПОДВАЛ)"
    )

x_normalize_insulation_temperature_basis__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_normalize_insulation_temperature_basis__mutmut_1': x_normalize_insulation_temperature_basis__mutmut_1, 
    'x_normalize_insulation_temperature_basis__mutmut_2': x_normalize_insulation_temperature_basis__mutmut_2, 
    'x_normalize_insulation_temperature_basis__mutmut_3': x_normalize_insulation_temperature_basis__mutmut_3, 
    'x_normalize_insulation_temperature_basis__mutmut_4': x_normalize_insulation_temperature_basis__mutmut_4, 
    'x_normalize_insulation_temperature_basis__mutmut_5': x_normalize_insulation_temperature_basis__mutmut_5, 
    'x_normalize_insulation_temperature_basis__mutmut_6': x_normalize_insulation_temperature_basis__mutmut_6, 
    'x_normalize_insulation_temperature_basis__mutmut_7': x_normalize_insulation_temperature_basis__mutmut_7, 
    'x_normalize_insulation_temperature_basis__mutmut_8': x_normalize_insulation_temperature_basis__mutmut_8, 
    'x_normalize_insulation_temperature_basis__mutmut_9': x_normalize_insulation_temperature_basis__mutmut_9, 
    'x_normalize_insulation_temperature_basis__mutmut_10': x_normalize_insulation_temperature_basis__mutmut_10, 
    'x_normalize_insulation_temperature_basis__mutmut_11': x_normalize_insulation_temperature_basis__mutmut_11, 
    'x_normalize_insulation_temperature_basis__mutmut_12': x_normalize_insulation_temperature_basis__mutmut_12, 
    'x_normalize_insulation_temperature_basis__mutmut_13': x_normalize_insulation_temperature_basis__mutmut_13, 
    'x_normalize_insulation_temperature_basis__mutmut_14': x_normalize_insulation_temperature_basis__mutmut_14, 
    'x_normalize_insulation_temperature_basis__mutmut_15': x_normalize_insulation_temperature_basis__mutmut_15, 
    'x_normalize_insulation_temperature_basis__mutmut_16': x_normalize_insulation_temperature_basis__mutmut_16
}
x_normalize_insulation_temperature_basis__mutmut_orig.__name__ = 'x_normalize_insulation_temperature_basis'


def resolve_insulation_tm(
    *,
    process_temperature: float,
    basis: str | None,
    location: str | None,
    placement: str | None = None,
) -> float:
    args = []# type: ignore
    kwargs = {'process_temperature': process_temperature, 'basis': basis, 'location': location, 'placement': placement}# type: ignore
    return _mutmut_trampoline(x_resolve_insulation_tm__mutmut_orig, x_resolve_insulation_tm__mutmut_mutants, args, kwargs, None)


def x_resolve_insulation_tm__mutmut_orig(
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


def x_resolve_insulation_tm__mutmut_1(
    *,
    process_temperature: float,
    basis: str | None,
    location: str | None,
    placement: str | None = None,
) -> float:
    resolved = None
    if resolved == "outdoor_winter":
        return process_temperature / 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_2(
    *,
    process_temperature: float,
    basis: str | None,
    location: str | None,
    placement: str | None = None,
) -> float:
    resolved = normalize_insulation_temperature_basis(
        basis=None,
        location=location,
        placement=placement,
    )
    if resolved == "outdoor_winter":
        return process_temperature / 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_3(
    *,
    process_temperature: float,
    basis: str | None,
    location: str | None,
    placement: str | None = None,
) -> float:
    resolved = normalize_insulation_temperature_basis(
        basis=basis,
        location=None,
        placement=placement,
    )
    if resolved == "outdoor_winter":
        return process_temperature / 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_4(
    *,
    process_temperature: float,
    basis: str | None,
    location: str | None,
    placement: str | None = None,
) -> float:
    resolved = normalize_insulation_temperature_basis(
        basis=basis,
        location=location,
        placement=None,
    )
    if resolved == "outdoor_winter":
        return process_temperature / 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_5(
    *,
    process_temperature: float,
    basis: str | None,
    location: str | None,
    placement: str | None = None,
) -> float:
    resolved = normalize_insulation_temperature_basis(
        location=location,
        placement=placement,
    )
    if resolved == "outdoor_winter":
        return process_temperature / 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_6(
    *,
    process_temperature: float,
    basis: str | None,
    location: str | None,
    placement: str | None = None,
) -> float:
    resolved = normalize_insulation_temperature_basis(
        basis=basis,
        placement=placement,
    )
    if resolved == "outdoor_winter":
        return process_temperature / 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_7(
    *,
    process_temperature: float,
    basis: str | None,
    location: str | None,
    placement: str | None = None,
) -> float:
    resolved = normalize_insulation_temperature_basis(
        basis=basis,
        location=location,
        )
    if resolved == "outdoor_winter":
        return process_temperature / 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_8(
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
    if resolved != "outdoor_winter":
        return process_temperature / 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_9(
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
    if resolved == "XXoutdoor_winterXX":
        return process_temperature / 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_10(
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
    if resolved == "OUTDOOR_WINTER":
        return process_temperature / 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_11(
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
        return process_temperature * 2.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_12(
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
        return process_temperature / 3.0
    if resolved in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_13(
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
    if resolved not in WARM_40_BASES:
        return (process_temperature + 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_14(
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
        return (process_temperature + 40.0) * 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_15(
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
        return (process_temperature - 40.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_16(
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
        return (process_temperature + 41.0) / 2.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_17(
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
        return (process_temperature + 40.0) / 3.0
    raise ValueError(f"Неизвестный режим температуры изоляции: {resolved}")


def x_resolve_insulation_tm__mutmut_18(
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
    raise ValueError(None)

x_resolve_insulation_tm__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_resolve_insulation_tm__mutmut_1': x_resolve_insulation_tm__mutmut_1, 
    'x_resolve_insulation_tm__mutmut_2': x_resolve_insulation_tm__mutmut_2, 
    'x_resolve_insulation_tm__mutmut_3': x_resolve_insulation_tm__mutmut_3, 
    'x_resolve_insulation_tm__mutmut_4': x_resolve_insulation_tm__mutmut_4, 
    'x_resolve_insulation_tm__mutmut_5': x_resolve_insulation_tm__mutmut_5, 
    'x_resolve_insulation_tm__mutmut_6': x_resolve_insulation_tm__mutmut_6, 
    'x_resolve_insulation_tm__mutmut_7': x_resolve_insulation_tm__mutmut_7, 
    'x_resolve_insulation_tm__mutmut_8': x_resolve_insulation_tm__mutmut_8, 
    'x_resolve_insulation_tm__mutmut_9': x_resolve_insulation_tm__mutmut_9, 
    'x_resolve_insulation_tm__mutmut_10': x_resolve_insulation_tm__mutmut_10, 
    'x_resolve_insulation_tm__mutmut_11': x_resolve_insulation_tm__mutmut_11, 
    'x_resolve_insulation_tm__mutmut_12': x_resolve_insulation_tm__mutmut_12, 
    'x_resolve_insulation_tm__mutmut_13': x_resolve_insulation_tm__mutmut_13, 
    'x_resolve_insulation_tm__mutmut_14': x_resolve_insulation_tm__mutmut_14, 
    'x_resolve_insulation_tm__mutmut_15': x_resolve_insulation_tm__mutmut_15, 
    'x_resolve_insulation_tm__mutmut_16': x_resolve_insulation_tm__mutmut_16, 
    'x_resolve_insulation_tm__mutmut_17': x_resolve_insulation_tm__mutmut_17, 
    'x_resolve_insulation_tm__mutmut_18': x_resolve_insulation_tm__mutmut_18
}
x_resolve_insulation_tm__mutmut_orig.__name__ = 'x_resolve_insulation_tm'
