"""Result[T, E] — явный тип для операций, которые могут успешно завершиться или упасть.

Альтернатива `try/except` как control flow: вместо того чтобы прятать факт ошибки
внутри мутации объекта, возвращаем явный успех/ошибку. Вызывающий код вынужден
обработать оба случая — mypy ловит забытый `else`.

Пример:
    from app.result import Result, Ok, Err

    def parse(s: str) -> Result[int, str]:
        try:
            return Ok(int(s))
        except ValueError as e:
            return Err(f"Невалидное число: {e}")

    r = parse("42")
    if r.is_ok:
        value = r.unwrap()     # mypy: value: int
    else:
        print(r.error)         # mypy: error: str
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, NoReturn, TypeVar

T = TypeVar("T")
E = TypeVar("E")


@dataclass(frozen=True)
class Ok(Generic[T]):
    """Успешный результат."""

    value: T

    @property
    def is_ok(self) -> bool:
        return True

    @property
    def is_err(self) -> bool:
        return False

    def unwrap(self) -> T:
        return self.value

    def unwrap_or(self, default: T) -> T:
        return self.value


@dataclass(frozen=True)
class Err(Generic[E]):
    """Ошибочный результат с описанием."""

    error: E

    @property
    def is_ok(self) -> bool:
        return False

    @property
    def is_err(self) -> bool:
        return True

    def unwrap(self) -> NoReturn:
        raise RuntimeError(f"Called unwrap() on Err: {self.error}")

    def unwrap_or(self, default: T) -> T:
        return default


# Тип-алиас для удобства сигнатур
Result = Ok[T] | Err[E]
