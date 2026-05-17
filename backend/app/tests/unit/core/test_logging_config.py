import json
import logging

from app.core.logging_config import JsonLogFormatter, RequestContextFilter
from app.core.request_context import reset_request_id, set_request_id


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
