import json
import logging
import sys
from datetime import UTC, datetime

from app.core.logging_config import JsonLogFormatter, RequestContextFilter
from app.core.request_context import reset_request_id, set_request_id


class CustomLogValue:
    def __str__(self) -> str:
        return "custom-value"


def test_json_log_formatter_includes_request_id():
    token = set_request_id("req-test-1")
    try:
        record = logging.LogRecord(
            name="heatcalc.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="business event",
            args=(),
            exc_info=None,
        )
        record.project_id = "project-1"
        assert RequestContextFilter().filter(record) is True

        payload = json.loads(JsonLogFormatter().format(record))

        assert payload["message"] == "business event"
        assert payload["request_id"] == "req-test-1"
        assert payload["project_id"] == "project-1"
        assert payload["logger"] == "heatcalc.test"
    finally:
        reset_request_id(token)


def test_json_log_formatter_includes_exception_stack_and_extra_datetime():
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        record = logging.LogRecord(
            name="heatcalc.test",
            level=logging.ERROR,
            pathname=__file__,
            lineno=30,
            msg="failed event",
            args=(),
            exc_info=sys.exc_info(),
        )
    record.stack_info = "stack line"
    record.processed_at = datetime(2026, 5, 18, tzinfo=UTC)
    record.custom_value = CustomLogValue()

    payload = json.loads(JsonLogFormatter().format(record))

    assert "RuntimeError: boom" in payload["exception"]
    assert payload["stack"] == "stack line"
    assert payload["processed_at"] == "2026-05-18T00:00:00+00:00"
    assert payload["custom_value"] == "custom-value"
