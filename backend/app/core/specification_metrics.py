"""Low-cardinality process metrics for specification generation."""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from threading import Lock


@dataclass(frozen=True, slots=True)
class DiagnosticMetric:
    phase: str
    code: str
    kind: str


class SpecificationMetrics:
    """Small dependency-free Prometheus text collector.

    Labels are controlled enums/codes. Project, variant, catalog and exception
    identifiers are deliberately excluded to prevent cardinality growth.
    """

    def __init__(self) -> None:
        self._lock = Lock()
        self._outcomes: Counter[str] = Counter()
        self._diagnostics: Counter[DiagnosticMetric] = Counter()
        self._conflicts: Counter[str] = Counter()
        self._rollbacks: Counter[tuple[str, str]] = Counter()
        self._duration_count: Counter[str] = Counter()
        self._duration_sum: dict[str, float] = defaultdict(float)

    def observe_outcome(self, status: str, diagnostics: Iterable[DiagnosticMetric]) -> None:
        with self._lock:
            self._outcomes[status] += 1
            self._diagnostics.update(diagnostics)

    def observe_conflict(self, reason: str) -> None:
        with self._lock:
            self._conflicts[reason] += 1

    def observe_rollback(self, *, scope: str, reason: str) -> None:
        with self._lock:
            self._rollbacks[(scope, reason)] += 1

    def observe_duration(self, *, outcome: str, seconds: float) -> None:
        with self._lock:
            self._duration_count[outcome] += 1
            self._duration_sum[outcome] += seconds

    def render(self) -> str:
        with self._lock:
            lines = [
                "# TYPE specification_generation_outcomes_total counter",
                *(
                    f'specification_generation_outcomes_total{{status="{status}"}} {count}'
                    for status, count in sorted(self._outcomes.items())
                ),
                "# TYPE specification_diagnostics_total counter",
                *(
                    "specification_diagnostics_total"
                    f'{{phase="{key.phase}",code="{key.code}",kind="{key.kind}"}} {count}'
                    for key, count in sorted(
                        self._diagnostics.items(),
                        key=lambda item: (item[0].phase, item[0].code, item[0].kind),
                    )
                ),
                "# TYPE specification_generation_conflicts_total counter",
                *(
                    f'specification_generation_conflicts_total{{reason="{reason}"}} {count}'
                    for reason, count in sorted(self._conflicts.items())
                ),
                "# TYPE specification_generation_rollbacks_total counter",
                *(
                    "specification_generation_rollbacks_total"
                    f'{{scope="{scope}",reason="{reason}"}} {count}'
                    for (scope, reason), count in sorted(self._rollbacks.items())
                ),
                "# TYPE specification_generation_duration_seconds summary",
                *(
                    "specification_generation_duration_seconds_count"
                    f'{{outcome="{outcome}"}} {count}'
                    for outcome, count in sorted(self._duration_count.items())
                ),
                *(
                    "specification_generation_duration_seconds_sum"
                    f'{{outcome="{outcome}"}} {value:.9f}'
                    for outcome, value in sorted(self._duration_sum.items())
                ),
            ]
        return "\n".join(lines) + "\n"


specification_metrics = SpecificationMetrics()
