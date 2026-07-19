"""PDL-ER-07: versioned project settings snapshot helpers."""

from app.schemas.specification import SpecificationOptions
from app.services.specification_service import (
    _normalize_settings_payload,
    _settings_core,
)


def test_normalize_defaults_empty_payload():
    payload = _normalize_settings_payload(None)
    assert payload["reserve_coefficient"] == 1.0
    assert payload["ex_zone"] is False
    assert payload["merge_identical"] is False
    assert payload["group_by"] == "object_section"


def test_settings_core_ignores_snapshot_metadata():
    a = {
        **SpecificationOptions(reserve_coefficient=1.2, ex_zone=True).model_dump(),
        "settings_version": 3,
        "snapshot_at": "2026-07-19T00:00:00+00:00",
    }
    b = {
        **SpecificationOptions(reserve_coefficient=1.2, ex_zone=True).model_dump(),
        "settings_version": 9,
        "snapshot_at": "other",
    }
    assert _settings_core(a) == _settings_core(b)


def test_settings_core_detects_option_change():
    a = SpecificationOptions(reserve_coefficient=1.0).model_dump()
    b = SpecificationOptions(reserve_coefficient=1.5).model_dump()
    assert _settings_core(a) != _settings_core(b)
