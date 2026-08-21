"""Immutable, adapter-friendly report types for expected TT failures."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Self, TypeAlias, cast

TTFormulaIssueCode: TypeAlias = str
TTFormulaPath: TypeAlias = tuple[str | int, ...]


def _freeze(value: Any) -> Any:
    if isinstance(value, Mapping):
        return MappingProxyType({str(key): _freeze(item) for key, item in value.items()})
    if isinstance(value, tuple | list):
        return tuple(_freeze(item) for item in value)
    if isinstance(value, set | frozenset):
        return frozenset(_freeze(item) for item in value)
    return value


def _thaw(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: _thaw(item) for key, item in value.items()}
    if isinstance(value, tuple | frozenset):
        return [_thaw(item) for item in value]
    return value


@dataclass(frozen=True, slots=True)
class TTFormulaIssue:
    code: TTFormulaIssueCode
    path: TTFormulaPath = ()
    details: Mapping[str, Any] = field(default_factory=lambda: MappingProxyType({}))

    def __post_init__(self) -> None:
        if not isinstance(self.path, tuple) or not all(
            isinstance(item, str | int) for item in self.path
        ):
            raise TypeError("path must be a tuple of string or integer segments")
        if not isinstance(self.details, Mapping):
            raise TypeError("details must be a mapping")
        object.__setattr__(self, "details", _freeze(self.details))

    @classmethod
    def with_details(
        cls, code: TTFormulaIssueCode, /, path: TTFormulaPath = (), **details: Any
    ) -> Self:
        return cls(code=code, path=path, details=details)

    def details_dict(self) -> dict[str, Any]:
        return cast(dict[str, Any], _thaw(self.details))


@dataclass(frozen=True, slots=True)
class TTFormulaReport:
    issues: tuple[TTFormulaIssue, ...] = ()

    def __post_init__(self) -> None:
        if not isinstance(self.issues, tuple) or not all(
            isinstance(issue, TTFormulaIssue) for issue in self.issues
        ):
            raise TypeError("issues must be a tuple of TTFormulaIssue instances")

    @property
    def is_valid(self) -> bool:
        return not self.issues


VALID_TT_FORMULA_REPORT = TTFormulaReport()
