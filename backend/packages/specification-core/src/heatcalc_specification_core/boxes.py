"""Public junction-box calculation API split into focused slices."""

from heatcalc_specification_core.box_conditions import (
    row_conditions_match,
    validate_box_matrix_ex_r_gr,
    validate_box_row_ex_r_gr,
)
from heatcalc_specification_core.box_matrix import (
    box_row_from_catalog_parts,
    evaluate_box_matrix,
    evaluate_box_matrix_from_input,
)
from heatcalc_specification_core.box_quantity import (
    SPEC_BOX_EX_RGR_MATRIX_MISSING,
    calculate_box_quantity,
    compute_d_ge_57,
    normalize_box_rounding_mode,
)

__all__ = [
    "SPEC_BOX_EX_RGR_MATRIX_MISSING",
    "box_row_from_catalog_parts",
    "calculate_box_quantity",
    "compute_d_ge_57",
    "evaluate_box_matrix",
    "evaluate_box_matrix_from_input",
    "normalize_box_rounding_mode",
    "row_conditions_match",
    "validate_box_matrix_ex_r_gr",
    "validate_box_row_ex_r_gr",
]
