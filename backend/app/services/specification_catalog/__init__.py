"""Application-owned specification catalog lifecycle."""

from app.services.specification_catalog.contracts import (
    ResolvedSpecificationCatalog,
    SpecificationCatalogActivationResult,
    SpecificationCatalogValidation,
)
from app.services.specification_catalog.errors import SpecificationCatalogServiceError
from app.services.specification_catalog.mapping import (
    canonical_catalog_checksum,
    validate_specification_catalog,
)
from app.services.specification_catalog.policy import (
    is_browser_qa_catalog_version,
    is_case1_demo_catalog_version,
)
from app.services.specification_catalog.service import SpecificationCatalogService

__all__ = [
    "ResolvedSpecificationCatalog",
    "SpecificationCatalogActivationResult",
    "SpecificationCatalogService",
    "SpecificationCatalogServiceError",
    "SpecificationCatalogValidation",
    "canonical_catalog_checksum",
    "is_browser_qa_catalog_version",
    "is_case1_demo_catalog_version",
    "validate_specification_catalog",
]
