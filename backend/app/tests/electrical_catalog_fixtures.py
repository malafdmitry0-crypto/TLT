"""Test-only DB catalog snapshots built from the bundled seed documents."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.services.electrical_catalog_service import (
    _canonical_checksum,
    bundled_electrical_catalog_documents,
)


def active_electrical_catalogs() -> dict[str, dict[str, Any]]:
    """Return complete calculation-shaped fixtures without a runtime fallback."""
    documents = bundled_electrical_catalog_documents()
    return {
        kind: {
            "id": f"test-{kind}",
            "kind": kind,
            "version": document.version,
            "status": "active",
            "source": document.source,
            "source_checksum": document.source_checksum,
            "import_checksum": document.import_checksum,
            "payload_checksum": _canonical_checksum(document.payload),
            "schema_version": document.schema_version,
            "production_approved": True,
            "authority": "database",
            "payload": deepcopy(document.payload),
        }
        for kind, document in documents.items()
    }
