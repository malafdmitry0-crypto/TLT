"""Shared calculation exceptions.

Heat-loss and electrical calculation use cases raise this type.
Keeping it here avoids a module cycle between those two owners.
"""


class CalculationError(Exception):
    pass
