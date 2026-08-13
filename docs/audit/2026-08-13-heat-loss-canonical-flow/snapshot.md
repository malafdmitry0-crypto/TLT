# Heat-loss cleanup — C0 baseline snapshot

**Slice:** HL-CLEAN-C0
**UTC:** 2026-08-13T09:18:13Z
**HEAD:** `d07ae8ff972f1af82b6739519f08ec4a4a1e7b73`
`docs(heat-loss): tighten cleanup queue after C4/C5 review`
**Host:** darwin arm64 · backend container `heatcalc_backend` · Python 3.11.15
**Worktree at collection:** clean

This snapshot holds dynamic evidence only. Rules live in `cleanup-plan.md`.
Compare later slices to the failed/error **nodeid sets** below, not to counts
from older snapshots.

Frontend: **NOT TOUCHED / NOT RUN**.

## Focused contract suite

Command:

```bash
docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -w /app heatcalc_backend pytest \
    app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py \
    app/tests/unit/formulas/test_heat_loss_facade_characterization.py \
    app/tests/unit/formulas/test_heat_loss_validation_entrypoint_characterization.py \
    app/tests/unit/schemas/test_heat_loss_range_characterization.py \
    app/tests/unit/formulas/test_heat_loss_formula_ownership.py \
    -q --tb=line --no-cov
```

Result: **PASS** · 239 tests collected and passed in 30.93 s.

Collected by file:

- `test_heat_loss_canonical_flow_characterization.py`: 21
- `test_heat_loss_facade_characterization.py`: 7
- `test_heat_loss_formula_ownership.py`: 5
- `test_heat_loss_validation_entrypoint_characterization.py`: 3
- `test_heat_loss_range_characterization.py`: 203

## Package gate

cwd=`/app/packages/heat-loss-core` in `heatcalc_backend`:

```bash
python -m pytest tests -q --no-cov
ruff check src tests
mypy src tests
```

Result:

- pytest: **307 passed** in 0.43 s
- ruff: All checks passed
- mypy: Success, no issues found in 40 source files

## Full backend suite

Command:

```bash
docker exec \
  -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  -w /app heatcalc_backend \
  pytest app/tests --no-cov -q --tb=no --override-ini='addopts='
```

Result: **14 failed**, **2255 passed**, **1 skipped**, **6 errors**, 266 warnings,
**767.94 s**. Machine copy: `evidence/c0-backend-suite.json`.

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
app/tests/unit/formulas/test_mutation_resilience.py::TestMutationCoverage::test_pipe_safety_factor_multiplied_not_divided
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

Versus the historical snapshot on `03f6ef3`, one extra failed nodeid is present
on this HEAD and is now part of the cleanup baseline:

`test_mutation_resilience.py::TestMutationCoverage::test_pipe_safety_factor_multiplied_not_divided`

It calls `calc_pipe_heat_loss(..., coefficients={"safety_factor": 2.0})`. The
current pipe range is `1.0…1.7`, so K=2 is rejected before the multiply-versus-
divide check. C0 does not change that test or that range.

## Executable inventory

Search used `--glob '!**/mutants/**' --glob '!**/.git/**'`. Historical docs
mentions are not production consumers.

### `app.formulas.heat_loss.common`

Live executable consumers: **none**.

Only hit: `backend/app/tests/unit/formulas/test_heat_loss_common.py`.
`apply_coefficients` / `merge_coefficients` / `DEFAULT_COEFFICIENTS` exist in
`common.py` and that test. `pipe.py` mentions `DEFAULT_COEFFICIENTS` only in a
stale `calc_pipe_heat_loss` docstring.

### `app.formulas.heat_loss.core`

Production consumers:

- `backend/app/formulas/heat_loss/common.py`
- `backend/app/formulas/heat_loss/insulation.py`
- `backend/app/schemas/calculation.py`
- `backend/app/schemas/heat_loss_core_validation.py`

Test consumers:

- `test_heat_loss_material_validation_wiring.py`
- `test_heat_loss_pipe_range_core_wiring.py`
- `test_heat_loss_core_package_imports.py`
- `test_heat_loss_formula_ownership.py`
- `test_heat_loss_core_validation_adapter.py`
- `test_heat_loss_tank_range_core_wiring.py`

The shim directory is identity re-exports of `heatcalc_heat_loss_core`.

### `_COMPAT`

`pipe.py`:

```text
AirPipeEvaluationInput, ConstantConductivity, InsulationTemperatureBasis,
PipeEvaluationInput, PipeEvaluationLayer, UndergroundPipeEvaluationInput,
evaluate_pipe
```

`tank.py`:

```text
ConstantConductivity, InsulationTemperatureBasis, CylindricalTankGeometry,
RectangularTankGeometry, ResolvedAirTankEvaluationInput,
ResolvedBuriedTankEvaluationInput, ResolvedTankLayer, TankEvaluationResult,
evaluate_resolved_air_tank, evaluate_resolved_buried_tank,
get_insulation_conductivity_law, resolve_external_alpha
```

Facade implementation still uses some of those names for leftover helpers
(`calc_alpha_vnesh`, `_layer_temperature_range`, `_resolved_layers`,
`_tank_geometry`). External production imports of `_COMPAT` names were not
found. Test consumer: `test_heat_loss_canonical_flow_characterization.py`
uses `pipe_facade.evaluate_pipe` and the pipe evaluation DTO names.

### Call graph

```text
Pydantic PipeHeatLossParams / TankHeatLossParams
  └─ catalog lookup for each reference layer interval
                    ↓
calc_pipe_heat_loss / calc_tank_heat_loss
  └─ run_validated_*_formula
        ├─ build_*_preparation  (policy + resolve_reference_insulation)
        ├─ assemble_prepared_*  (no second full contract)
        └─ evaluate_prepared_*
              pipe → evaluate_pipe(_to_evaluation_input)
              tank → evaluate_resolved_air_tank | evaluate_resolved_buried_tank
                    ↓
              calculate_*  (one low-level branch)
```

Library `run_*_formula` still goes through `prepare_*_calculation`, which
re-runs `validate_*_contract`. Backend facades skip that and call
`assemble_prepared_*` after Pydantic.

Legacy `evaluate_pipe` / `evaluate_resolved_*_tank` remain the numeric
orchestration that prepared evaluation converts into.

### Catalog calls

| Site | Loader | When |
|---|---|---|
| `InsulationLayer.check_contract` | `get_insulation_temperature_range` | every non-`other` layer (existence) |
| `PipeHeatLossParams` / `TankHeatLossParams` | `get_insulation_temperature_range` | every reference layer (interval into contract) |
| `pipe_preparation._preparation_layer` | `resolve_reference_insulation` | every reference layer (law + interval) |
| `pipe_preparation.build_pipe_preparation` | `get_pipe_material_conductivity_law` | when `pipe_lambda` is absent |
| `tank_preparation._preparation_layer` | `resolve_reference_insulation` | every reference layer |
| `pipe.py._layer_temperature_range` | `get_insulation_temperature_range` | post-formula hot-side error text |
| leftover `tank.py` helpers | `get_insulation_conductivity_law` / range | unused by facade path |

## Existing tests that already freeze the contracts

- Facade JSON and pipe/tank rounding:
  `test_heat_loss_facade_characterization.py`,
  `test_heat_loss_canonical_flow_characterization.py::test_pipe_rounds_facade_json_tank_does_not`
- K matrix and tank ignores coefficients:
  `test_pipe_user_safety_factor_wins_over_admin_coefficient`,
  `test_pipe_admin_safety_factor_applies_only_when_user_value_is_absent`,
  `test_pipe_profile_default_applies_when_user_and_admin_are_absent`,
  `test_tank_ignores_admin_coefficients`,
  `test_tank_requires_safety_factor`,
  package `test_pipe_formula.py` / `test_tank_formula.py`
- `FormulaOutcome` result XOR report:
  package `test_run_pipe_formula_matches_old_evaluate_pipe_and_has_no_error_payload`,
  `test_layer_temperature_failure_is_not_a_successful_result`
- Typed environments and profile validation:
  `test_prepared_pipe_derives_environment_from_the_same_scalars`,
  `test_underground_preparation_uses_ground_environment`,
  `test_invalid_profile_default_is_a_structured_preparation_error`,
  `packages/heat-loss-core/tests/test_profile_and_conductivity.py`
- Process-T pre-check vs hot-side post-check:
  `test_process_temperature_outside_material_range_fails_before_formula`,
  `test_public_facade_layer_temperature_errors_are_frozen`
- Import/recalculate invalid → `is_valid=false`, `results=null`:
  `test_invalid_recalculate_clears_results_and_keeps_object`
- Lookup counts:
  `test_pipe_facade_catalog_lookup_count_for_one_reference_layer`

## Performance baseline

Protocol: copy
`docs/audit/2026-08-12-heat-loss-core-regression/evidence/{heat_loss_benchmark.py,heat_loss_differential_probe.py}`
into the container `/tmp`, then:

```bash
docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e PYTHONPATH=/app -w /tmp heatcalc_backend \
  python heat_loss_benchmark.py /tmp/c0-facade-benchmark.json --rounds 9 --loops 20
```

JSON: `evidence/c0-facade-benchmark.json`.

| Round | seconds |
|---|---|
| 1 | 0.16952412499813363 |
| 2 | 0.2099901250039693 |
| 3 | 0.20107141698827036 |
| 4 | 0.1778702909941785 |
| 5 | 0.16721179202431813 |
| 6 | 0.213542834011605 |
| 7 | 0.24161795899271965 |
| 8 | 0.17873079201672226 |
| 9 | 0.16106933300034143 |

- rounds × loops: 9 × 20
- operations per round: 3420
- median: **0.17873079201672226 s**
- minimum: 0.16106933300034143 s
- median µs / operation: 52.26046550196558

This is the C0 comparison point for C4/CF. The 2026-08-12 audit median
(0.058 s) is a different HEAD and is not the cleanup baseline.

## NEXT

C1 — delete unused `common.py` and its test; fix the stale pipe facade
docstring about `DEFAULT_COEFFICIENTS`.
