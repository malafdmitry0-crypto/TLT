"""Typed specification catalog contracts."""

from heatcalc_specification_core.catalog.contracts import CatalogParameters
from heatcalc_specification_core.catalog.validation import validate_catalog_content
from heatcalc_specification_core.catalog.validation_contracts import (
    CatalogCategory,
    CatalogContentItem,
    CatalogValidation,
    CatalogValidationIssue,
)

__all__ = [
    "CatalogCategory",
    "CatalogContentItem",
    "CatalogParameters",
    "CatalogValidation",
    "CatalogValidationIssue",
    "validate_catalog_content",
]
