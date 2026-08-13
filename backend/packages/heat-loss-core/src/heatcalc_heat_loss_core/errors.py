"""Technical errors for invalid mathematical domains."""


class FormulaDomainError(ValueError):
    """A numeric input cannot be evaluated by the selected formula."""

    def __init__(self, code: str, /, **details: float | int) -> None:
        self.code = code
        self.details = details
        super().__init__(code)
