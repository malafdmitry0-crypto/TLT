"""Общие правила электротехнических формул."""

CABLE_LENGTH_FACTOR = 1.1


def cable_order_length(installed_cable_length: float) -> float:
    """Длина для заказа: расчётная длина с монтажным запасом."""
    return installed_cable_length * CABLE_LENGTH_FACTOR
