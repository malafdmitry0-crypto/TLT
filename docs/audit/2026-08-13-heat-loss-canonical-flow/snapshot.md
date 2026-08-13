# Heat-loss canonical flow — baseline snapshot

**UTC:** 2026-08-13T06:21:03Z  
**HEAD:** `03f6ef388e411fe8558873bb5e1ae66f13d76c1a`  
`refactor(heat-loss): extract standalone calculation core`  
**Host:** darwin arm64 · backend container `heatcalc_backend` · Python 3.11  
**Worktree at collection:** plan + slice-1 characterization tests uncommitted

This snapshot holds dynamic evidence only. Rules live in `plan.md`.

## Slice 1 characterization

Command:

```bash
docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars -w /app heatcalc_backend \
  pytest \
    app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
    app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
    app/tests/unit/formulas/test_heat_loss_validation_entrypoint_characterization.py \
    app/tests/unit/schemas/test_heat_loss_range_characterization.py \
    app/tests/unit/formulas/test_heat_loss_formula_ownership.py \
    packages/heat-loss-core/tests \
    -q --tb=line --no-cov
```

Result: **PASS** · 505 tests · ruff on the new file **PASS**.

Frozen now, among other things:

- `InsulationLayer.model_validate()` is a public contract;
- unknown material and missing manual λ keep `loc=()`;
- reference layer + manual λ is accepted by the layer model and rejected by the parent;
- process temperature outside material range fails before the facade;
- air-pipe domain-check gets `()` thicknesses; underground gets the real tuple;
- one reference pipe layer: 2 temperature-range lookups, 1 insulation law, 1 wall law;
- pipe K matrix and tank-ignores-coefficients;
- climate/user K wins over admin on recalculate;
- invalid recalculate stores `is_valid=false`, `results=null`.

## Full backend suite baseline

Command:

```bash
docker exec \
  -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  -w /app heatcalc_backend \
  pytest app/tests --no-cov -q --tb=no --override-ini='addopts='
```

Result: **13 failed**, **2254 passed**, **1 skipped**, **6 errors**, 266 warnings, **719.59 s**.

Compare later slices to this **set of nodeids**, not to the count.

### Failed

```
app/tests/integration/api/test_idempotency.py::TestSpecGenerateIdempotency::test_blocked_generate_repeats_without_duplicate_rows
app/tests/integration/db/test_query_counts.py::test_electrical_query_search_uses_sql_page_not_python_project_fallback
app/tests/integration/db/test_query_counts.py::test_electrical_query_assignment_projection_is_one_bounded_query
app/tests/integration/db/test_query_counts.py::test_electrical_query_sorted_next_page_uses_keyset_without_offset
app/tests/unit/api/test_reports_helpers.py::test_preview_maps_project_errors
app/tests/unit/api/test_reports_helpers.py::test_preview_maps_report_errors
app/tests/unit/api/test_reports_helpers.py::test_preview_records_audit_on_success
app/tests/unit/api/test_reports_helpers.py::test_preview_requires_variant_after_project_access
app/tests/unit/services/test_task_service_unit.py::TestTaskCreation::test_enqueue_guards_then_locks_project_before_variant_resolution
app/tests/unit/services/test_task_service_unit.py::TestTaskCreation::test_create_electrical_batch_task_enqueues_and_persists_payload
app/tests/unit/test_pipe_slice2_contract.py::test_pipe_heat_replacement_preserves_non_heat_and_volume_and_removes_legacy
app/tests/unit/test_pipe_slice2_contract.py::test_invalid_pipe_formula_rolls_back_api_transaction[create]
app/tests/unit/test_pipe_slice2_contract.py::test_invalid_pipe_formula_rolls_back_api_transaction[update]
```

### Errors

```
app/tests/integration/worker/test_worker_redis_live.py::test_real_xautoclaim_moves_pending_entry_to_second_worker
app/tests/integration/worker/test_worker_redis_live.py::test_real_dlq_write_is_idempotent_after_finalize_crash
app/tests/integration/worker/test_worker_redis_live.py::test_real_readiness_tracks_late_and_multiple_workers
app/tests/integration/worker/test_worker_redis_live.py::test_real_readiness_expires_after_worker_disappears
app/tests/integration/worker/test_worker_sigkill_live.py::test_sigkill_after_claim_is_recovered_from_postgres
app/tests/integration/worker/test_worker_sigkill_live.py::test_sigkill_after_success_commit_before_ack_is_safe_on_redelivery
```

These heat-adjacent pipe slice-2 contract failures were already present on this HEAD. Slice 1 added tests only and did not change production.

## InsulationLayer decision (slice 4)

`InsulationLayer.model_validate()` is a supported public contract. Slice 4
does **not** remove `check_contract` or its catalog existence check. Lookup
count for validation stays on the layer/parent path. The pipe facade now
builds `PipePreparationInput` and calls `run_pipe_formula`.

## NEXT

Slice 6 leftover: unused tank helpers `_resolved_layers` / `_tank_geometry`
can wait; `_calc_alpha` is still imported by tests. Do not delete `common.py`,
`__all__` or shims in this pass.

Slice 7: profile trace JSON only after an explicit contract change.
