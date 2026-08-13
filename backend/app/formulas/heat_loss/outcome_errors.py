"""Map formula outcome reports to the established facade ValueError texts."""

from __future__ import annotations

from heatcalc_heat_loss_core.validation import FormulaValidationIssue, FormulaValidationReport


def raise_heat_formula_report(report: FormulaValidationReport) -> None:
    """Raise a user-facing ValueError for a blocking formula outcome."""

    if report.is_valid:
        return
    raise ValueError(_issue_message(report.issues[0]))


def _issue_message(issue: FormulaValidationIssue) -> str:
    details = issue.details_dict()
    field = ".".join(str(part) for part in issue.path) or "значение"
    if issue.code == "below_min_inclusive":
        return (
            f"{field} должно быть не меньше {details['minimum']:g} "
            f"(получено {details['value']:g})"
        )
    if issue.code == "below_min_exclusive":
        return (
            f"{field} должно быть больше {details['minimum']:g} "
            f"(получено {details['value']:g})"
        )
    if issue.code == "above_max_inclusive":
        return (
            f"{field} должно быть не больше {details['maximum']:g} "
            f"(получено {details['value']:g})"
        )
    if issue.code == "above_max_exclusive":
        return (
            f"{field} должно быть меньше {details['maximum']:g} "
            f"(получено {details['value']:g})"
        )
    if issue.code == "conductivity_law_required":
        return "Не задана расчётная теплопроводность слоя или стенки"
    if issue.code == "not_finite":
        return f"{field} должно быть конечным числом"
    return f"Некорректное значение поля {field}"
