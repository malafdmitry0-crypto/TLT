"""Minimal public use-case API for specification-core.

Typed contracts live in the owned ``preflight``, ``candidates``, ``catalog``
and ``bom`` namespaces. Leaf calculators are implementation details.
"""

from heatcalc_specification_core.bom import run_specification
from heatcalc_specification_core.candidates import build_candidate_groups
from heatcalc_specification_core.preflight import prepare_specification

__all__ = [
    "build_candidate_groups",
    "prepare_specification",
    "run_specification",
]
