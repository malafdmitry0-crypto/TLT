"""Shared validation for electrical calculation inputs."""

from __future__ import annotations

from typing import Any, Final

PROCESS_TEMPERATURE_REQUIRED_MESSAGE: Final = "Для электрорасчёта требуется температура продукта"
PROCESS_TEMPERATURE_NUMBER_MESSAGE: Final = "Температура продукта должна быть числом"
PROCESS_TEMPERATURE_REQUIRED_CABLE_TYPES: Final = frozenset(
    {
        "self_regulating",
        "self_regulating_tt",
        "single_core",
        "three_core",
    }
)
PROCESS_TEMPERATURE_REQUIRED_FORMULA_TYPES: Final = frozenset(
    {
        "electrical",
        "electrical_tt",
        "resistive_single",
        "resistive_three",
    }
)


class ProcessTemperatureInputError(ValueError):
    """Raised when an electrical formula cannot get product temperature."""


def _coerce_process_temperature(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ProcessTemperatureInputError(PROCESS_TEMPERATURE_NUMBER_MESSAGE) from exc


def required_process_temperature(
    data: dict[str, Any] | None,
    fallback: dict[str, Any] | None = None,
) -> float:
    """Return explicit product temperature or fallback from object params.

    An explicitly invalid value in `data` is not hidden by the fallback because
    it means the caller sent a broken electrical payload.
    """

    if data is not None and "process_temperature" in data:
        value = _coerce_process_temperature(data.get("process_temperature"))
        if value is not None:
            return value

    if fallback is not None and "process_temperature" in fallback:
        value = _coerce_process_temperature(fallback.get("process_temperature"))
        if value is not None:
            return value

    raise ProcessTemperatureInputError(PROCESS_TEMPERATURE_REQUIRED_MESSAGE)


def ensure_process_temperature(
    data: dict[str, Any],
    fallback: dict[str, Any] | None = None,
) -> float:
    """Set `data.process_temperature` from itself or fallback and return it."""

    value = required_process_temperature(data, fallback)
    data["process_temperature"] = value
    return value
