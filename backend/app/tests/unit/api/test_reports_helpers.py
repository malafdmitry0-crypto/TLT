"""Unit-тесты helpers API отчётов."""

import pytest
from fastapi import HTTPException

from app.api.v1.reports import _raise_task_error
from app.services.task_service import TaskAccessError, TaskNotFoundError


@pytest.mark.parametrize(
    ("exc", "status_code"),
    [
        (TaskNotFoundError("missing"), 404),
        (TaskAccessError("denied"), 403),
        (ValueError("bad request"), 400),
    ],
)
def test_raise_task_error_maps_known_errors(exc: Exception, status_code: int):
    with pytest.raises(HTTPException) as err:
        _raise_task_error(exc)

    assert err.value.status_code == status_code
    assert err.value.detail == str(exc)


def test_raise_task_error_reraises_unknown_errors():
    exc = RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        _raise_task_error(exc)
