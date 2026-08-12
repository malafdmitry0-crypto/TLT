"""Unit-тесты канонизации проектных настроек отображения (кейс §5.9/§5.11)."""

import pytest
from pydantic import ValidationError

from app.schemas.project_display_settings import (
    DISPLAY_SETTINGS_MAX_BYTES,
    ProjectDisplaySettingsPayload,
    ProjectDisplaySettingsUpdateRequest,
)
from app.services.project_display_settings_service import (
    ProjectDisplaySettingsTooLargeError,
    canonicalize_display_settings,
    display_settings_canonical_size,
    ensure_display_settings_size,
    strip_retired_heatcalc_columns,
)


def test_canonical_payload_keeps_only_present_workspaces():
    payload = ProjectDisplaySettingsPayload(heatcalc={"tableColumns": {"pipe": ["name"]}})
    assert canonicalize_display_settings(payload) == {
        "heatcalc": {"tableColumns": {"pipe": ["name"]}}
    }


def test_canonical_payload_preserves_explicit_reset_empty_dict():
    # «По умолчанию» — канонический пустой payload, а не отсутствие ключа.
    payload = ProjectDisplaySettingsPayload(heatcalc={})
    assert canonicalize_display_settings(payload) == {"heatcalc": {}}


def test_canonical_payload_of_empty_request_is_empty_dict():
    assert canonicalize_display_settings(ProjectDisplaySettingsPayload()) == {}


def test_retired_pipe_dn_is_removed_without_losing_other_column_settings():
    source = {
        "heatcalc": {
            "tableColumns": {
                "types": {
                    "pipe": {
                        "visibleOrder": ["name", "pipe_dn", "pipe_outer_diameter"],
                        "columns": {
                            "name": {"widthPct": 24},
                            "pipe_dn": {"widthPct": 5.8},
                            "pipe_outer_diameter": {"widthPct": 7.6},
                        },
                    },
                    "all": {
                        "visibleOrder": ["type", "pipe_dn", "name"],
                        "columns": {"pipe_dn": {"widthPct": 5.8}},
                    },
                }
            },
            "tableView": {"fontSize": "compact"},
        },
        "electrical": {"columns": ["cable_mark"]},
    }

    cleaned = strip_retired_heatcalc_columns(source)

    assert cleaned["heatcalc"]["tableColumns"]["types"]["pipe"] == {
        "visibleOrder": ["name", "pipe_outer_diameter"],
        "columns": {
            "name": {"widthPct": 24},
            "pipe_outer_diameter": {"widthPct": 7.6},
        },
    }
    assert cleaned["heatcalc"]["tableColumns"]["types"]["all"] == {
        "visibleOrder": ["type", "name"],
        "columns": {},
    }
    assert cleaned["heatcalc"]["tableView"] == {"fontSize": "compact"}
    assert cleaned["electrical"] == {"columns": ["cable_mark"]}
    assert source["heatcalc"]["tableColumns"]["types"]["pipe"]["visibleOrder"] == [
        "name",
        "pipe_dn",
        "pipe_outer_diameter",
    ]


def test_workspace_whitelist_rejects_unknown_top_level_key():
    with pytest.raises(ValidationError):
        ProjectDisplaySettingsPayload.model_validate({"reports": {"x": 1}})


def test_workspace_value_must_be_object():
    with pytest.raises(ValidationError):
        ProjectDisplaySettingsPayload.model_validate({"heatcalc": [1, 2]})


def test_update_request_forbids_extra_and_negative_version():
    with pytest.raises(ValidationError):
        ProjectDisplaySettingsUpdateRequest.model_validate({"expected_version": -1, "settings": {}})
    with pytest.raises(ValidationError):
        ProjectDisplaySettingsUpdateRequest.model_validate(
            {"expected_version": 0, "settings": {}, "unexpected": True}
        )


def test_size_limit_allows_payload_within_budget():
    payload = ProjectDisplaySettingsPayload(heatcalc={"cols": ["a"] * 100})
    canonical = canonicalize_display_settings(payload)
    assert display_settings_canonical_size(canonical) <= DISPLAY_SETTINGS_MAX_BYTES
    ensure_display_settings_size(canonical)


def test_size_limit_rejects_payload_over_budget():
    oversized = {"heatcalc": {"blob": "x" * DISPLAY_SETTINGS_MAX_BYTES}}
    with pytest.raises(ProjectDisplaySettingsTooLargeError) as exc_info:
        ensure_display_settings_size(oversized)
    assert exc_info.value.limit_bytes == DISPLAY_SETTINGS_MAX_BYTES
    assert exc_info.value.size_bytes > DISPLAY_SETTINGS_MAX_BYTES


def test_canonical_size_is_measured_after_canonicalization():
    # None-области не входят в канонический payload и не тратят бюджет.
    payload = ProjectDisplaySettingsPayload(heatcalc=None, electrical=None)
    assert display_settings_canonical_size(canonicalize_display_settings(payload)) == 2
