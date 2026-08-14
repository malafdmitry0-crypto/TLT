"""Shared calculation exceptions.

Heat-loss application and CalculationService both raise this type.
Keeping it here avoids a module cycle between those two owners.
"""


class CalculationError(Exception):
    pass
