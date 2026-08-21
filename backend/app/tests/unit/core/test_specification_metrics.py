from app.core.specification_metrics import DiagnosticMetric, SpecificationMetrics


def test_specification_metrics_render_low_cardinality_events() -> None:
    metrics = SpecificationMetrics()
    metrics.observe_outcome(
        "blocked",
        [
            DiagnosticMetric(
                phase="generation",
                code="SPEC_GENERATION_CONFLICT",
                kind="blocking",
            )
        ],
    )
    metrics.observe_conflict("preflight_fingerprint_mismatch")
    metrics.observe_rollback(scope="request", reason="unexpected_exception")
    metrics.observe_duration(outcome="blocked", seconds=0.125)

    rendered = metrics.render()

    assert 'specification_generation_outcomes_total{status="blocked"} 1' in rendered
    assert 'code="SPEC_GENERATION_CONFLICT"' in rendered
    assert 'reason="preflight_fingerprint_mismatch"' in rendered
    assert 'scope="request",reason="unexpected_exception"' in rendered
    assert (
        'specification_generation_duration_seconds_sum{outcome="blocked"} 0.125000000' in rendered
    )


def test_metrics_never_accept_request_identifiers_as_labels() -> None:
    metrics = SpecificationMetrics()
    rendered = metrics.render()

    assert "project_id" not in rendered
    assert "variant_id" not in rendered
    assert "catalog_id" not in rendered
