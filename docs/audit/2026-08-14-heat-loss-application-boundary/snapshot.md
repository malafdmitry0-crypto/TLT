# Heat-loss application boundary — A0 baseline snapshot

**Slice:** HL-APP-A0
**UTC:** 2026-08-14T00:26:17Z
**HEAD:** `c98bfda033abf495c872ea788e059ed76c206b88`
`docs(heat-loss): open application-boundary queue`
**Host:** darwin arm64 · backend container `heatcalc_backend` · Python 3.11.16
**Worktree at collection:** clean except untracked A0 JSON already produced

This snapshot holds dynamic evidence only. Rules live in `plan.md`.
Compare later slices to the failed/error **nodeid sets** below, not to
counts from `docs/audit/2026-08-13-heat-loss-canonical-flow/`.

Frontend: **NOT TOUCHED / NOT RUN**.
Production formula code: **NOT TOUCHED**.

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
    app/tests/unit/formulas/test_heat_loss_catalog_preparation.py \
    app/tests/unit/services/test_heat_loss_single_validation_boundary.py \
    -q --tb=line --no-cov
```

Result: **PASS** · 250 tests collected and passed in ~41.5 s.

Collected by file:

- `test_heat_loss_canonical_flow_characterization.py`: 20
- `test_heat_loss_facade_characterization.py`: 7
- `test_heat_loss_validation_entrypoint_characterization.py`: 3
- `test_heat_loss_range_characterization.py`: 203
- `test_heat_loss_formula_ownership.py`: 5
- `test_heat_loss_catalog_preparation.py`: 4
- `test_heat_loss_single_validation_boundary.py`: 8

## Package gate

cwd=`/app/packages/heat-loss-core` in `heatcalc_backend`:

```bash
python -m pytest tests -q --no-cov
ruff check src tests
mypy src tests
```

Result:

- pytest: **315 passed** in 0.50 s
- ruff: All checks passed
- mypy: Success, 43 source files

## Full backend suite

Command (live-worker files ignored — they are a separate chaos gate):

```bash
docker exec \
  -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  -w /app heatcalc_backend \
  pytest app/tests --no-cov -q --tb=no --override-ini='addopts=' \
    --ignore=app/tests/integration/worker/test_worker_redis_live.py \
    --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
```

Result: **completed** · **10 failed**, **2241 passed**, **1 skipped**,
**0 errors**, **0 collection errors**, 266 warnings, **913.54 s**.
Machine copy: `evidence/a0-backend-suite.json`.

Live-worker tests were **not collected**. Their historical C0 ERROR IDs
are **not** in this A0 comparison set. Missing `WORKER_LIVE_REDIS_URL`
is a NOT RUN of that chaos gate, not baseline debt.

### Failed (A0 comparison set)

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
```

None of these IDs are heat-loss facade / catalog / persist-invalid tests.

### Errors

```
(none)
```

### Collection errors

```
(none)
```

### Skipped

Count: **1**.

`-q --tb=no` did not print the skip nodeid. The only skip in this
environment (REDIS_URL is set; `sample_import.csv` is not in the
container) is:

```
app/tests/integration/api/test_performance_nfr.py::TestImportPerformance::test_import_100_csv_under_15s
```

Reason: `sample_import.csv недоступен в test-окружении`. Progress-bar
position (~12%, integration/api) matches. This ID is **not** part of
the A0 failed comparison set.

### Versus historical C0 (informational only)

C0 on `d07ae8f` recorded 14 failed + 6 live-worker errors. Four of those
failed IDs are **absent** from this A0 set (they passed here):

```
app/tests/unit/formulas/test_mutation_resilience.py::TestMutationCoverage::test_pipe_safety_factor_multiplied_not_divided
app/tests/unit/test_pipe_slice2_contract.py::test_pipe_heat_replacement_preserves_non_heat_and_volume_and_removes_legacy
app/tests/unit/test_pipe_slice2_contract.py::test_invalid_pipe_formula_rolls_back_api_transaction[create]
app/tests/unit/test_pipe_slice2_contract.py::test_invalid_pipe_formula_rolls_back_api_transaction[update]
```

The rollback pair no longer exists under those names. Current persist
contract is `test_invalid_pipe_formula_persists_api_validation_state`
(`create` / `update`) and it **passed**. Later slices compare only to
the A0 failed list above.

## Executable housing inventory

Search used `--glob '!**/mutants/**'` / executable code, not historical
docs. Heat formula models still live in `app/schemas/calculation.py`
beside electrical API types. There is no `app/schemas/heat_loss.py` and
no `app/services/heat_loss_application.py` on this HEAD.

### `app/schemas/calculation.py` — heat cluster

Range aliases used only by heat models (before `InsulationLayer`):
`InsulationThickness`, `InsulationConductivity`, `PipeOuterDiameter`,
`PipeWallThickness`, `PipeConductivity`, `PipeAmbientTemperature`,
`PipeProcessTemperature`, `PipeLength`, `PipeCenterlineDepth`,
`PipeLocalElementsCount`, `PipeLocalElementEquivalentLength`,
`PipeWindSpeed`, `PipeGroundConductivity`, `PipeGroundTemperature`,
`PipeSafetyFactor`, `TankDiameter`, `TankHeight`, `TankSide`,
`TankAmbientTemperature`, `TankGroundTemperature`,
`TankProcessTemperature`, `TankWallThickness`, `TankWallConductivity`,
`TankBuriedHeight`, `TankGroundConductivity`, `TankWindSpeed`,
`TankSafetyFactor`, `TankAdditionalHeatLoss`.

Heat classes, in file order:

| Class | line |
|---|---|
| `InsulationLayer` | 426 |
| `InsulationLayerApplied` | 470 |
| `PipeHeatLossParams` | 485 |
| `StoredPipeHeatParams` | 602 |
| `PipeHeatLossResult` | 639 |
| `TankHeatLossParams` | 693 |
| `StoredTankHeatParams` | 808 |
| `TankHeatLossResult` | 835 |
| `HeatLossRequest` | 871 |
| `HeatLossResponse` | 879 |
| `BatchCalcResponse` | 884 |

Heat formula/HTTP envelope ends at `BatchCalcResponse`. Electrical
types occupy 905–1792. Heat returns once more as
`HeatLossBatchJobRequest` (1794), after `ElectricalBatchJobRequest`.

### `app/schemas/json_shapes.py` — heat symbols

- `InsulationLayerAppliedDict` (35)
- `HeatResultTraceDict` (48)
- `PipeHeatLossResultDict` (64)
- `TankHeatLossResultDict` (84)
- `HeatLossResultDict` alias = pipe | tank (117)
- `PipeParamsDict` (160)
- `TankParamsDict` (205)

### `calculation_service.py` — heat functions

| Symbol | line | Role |
|---|---|---|
| `build_heat_loss_error_payload` | 212 | module-level; structured `validation_errors` |
| `CalculationService.calc_heat_loss` | 935 | loads admin coefficients, delegates |
| `CalculationService._calc_heat_loss_with_coefficients` | 944 | climate (optional) → stored params → evaluator |
| `CalculationService._apply_climate_policy` | 1175 | VSDX K / ambient by D≥100 / D<100 |

Callers of `build_heat_loss_error_payload`:

- `CalculationService.try_recalculate` (1126 report-invalid, 1151 except)
- `excel_import_service.py` (1215, invalid import row)
- tests: `test_heat_loss_catalog_preparation.py`,
  `test_calculation_service_unit.py`

Callers of `calc_heat_loss`:

- API `POST /heat-loss` — `app/api/v1/calculations.py:141`
- tests: `test_calculation_service.py`, `test_calculation_service_unit.py`,
  `test_no_double_safety.py`

Callers of `_calc_heat_loss_with_coefficients`:

- `calc_heat_loss`
- `try_recalculate` (`apply_climate_policy=False`, already-normalized params)
- test `test_calculation_service_projects_shared_object_params_to_formula_only`

Callers of `_apply_climate_policy`:

- `_calc_heat_loss_with_coefficients` when `apply_climate_policy=True`
- `try_recalculate` before `validate_and_canonicalize_project_object_params`
- tests: `test_calculation_service_unit.py`,
  `test_underground_climate_policy_never_injects_ambient_temperature`

Admin preview does **not** go through `calc_heat_loss`. It builds
`PipeHeatLossParams` / `TankHeatLossParams` and calls
`evaluate_validated_heat_loss(...)` with **no** `coefficients=`
(`app/api/v1/admin.py:719–723`).

### Production `coefficients=` path

Live production (not tests):

```text
evaluator.evaluate_validated_heat_loss(..., coefficients=)
  └─ calc_pipe_heat_loss / calc_tank_heat_loss(..., coefficients=)

CalculationService._calc_heat_loss_with_coefficients
  └─ evaluate_validated_heat_loss(..., coefficients=)
```

Facade still accepts `coefficients: dict`. Pipe reads
`coefficients["safety_factor"]`; tank accepts the dict and ignores it.
Admin formula-check never passes the dict.

### `calc_alpha_vnesh` / `tank._calc_alpha`

| Symbol | defined | production callers | test callers |
|---|---|---|---|
| `calc_alpha_vnesh` | `pipe.py:44` | **none** | `test_pipe_properties.py`, `test_pipe_heat_loss.py` |
| `_calc_alpha` | `tank.py:32` | **none** | `test_tank_heat_loss.py` |

Both wrap `heatcalc_heat_loss_core.profile.resolve_external_alpha`.
A0 probe scripts already call `resolve_external_alpha` via adapters and
do not import these wrappers.

### `build_heat_loss_error_payload` text markers

Order in `calculation_service.py:212–329`:

1. `HeatLossPreparationError` — structured return; **no** message parse
   (`code`, `category`, `message`, `field=path`, `fields={path: message}`).
2. Substrings `"process_temperature_not_above_ambient"` /
   `"process_temperature_not_above_ground"` in the exception message.
3. `ProjectObjectParamsError` branches (`reason`, `code`, then Russian
   `"неподдерживаемый тип объекта"` / `"режим tm"`).
4. `ValidationError` → `schema_validation_error` unless the process-T
   substrings already matched.
5. `"неподдерживаемый тип объекта"` / `"неизвестная форма"`.
6. Marker list (any in `lower_message`):
   `требует`, `требуются`, `требуется`, `долж`, `диапазон`,
   `положитель`, `выше`, `ниже`, `превыш`, `не может`
   → `invalid_object_params`.
7. else → `category=formula`, `error_code=heat_loss_formula_error`.

### Import graph: `PipeHeatLossParams` / `PipeHeatLossResult`

From `app.schemas.calculation` (production, excluding tests):

| Module | names |
|---|---|
| `app/formulas/heat_loss/pipe.py` | `InsulationLayer`, `PipeHeatLossParams`, `PipeHeatLossResult` |
| `app/formulas/heat_loss/pipe_preparation.py` | `InsulationLayer`, `PipeHeatLossParams` |
| `app/formulas/heat_loss/evaluator.py` | `PipeHeatLossParams`, `PipeHeatLossResult`, tank pair |
| `app/api/v1/admin.py` | `PipeHeatLossParams`, `TankHeatLossParams` |
| `app/services/project_object_params.py` | `StoredPipeHeatParams`, `StoredTankHeatParams` |
| `app/services/calculation_service.py` | `StoredPipeHeatParams`, `StoredTankHeatParams` (result types from `json_shapes`) |
| `app/api/v1/calculations.py` | `HeatLossRequest`, `HeatLossResponse`, `BatchCalcResponse` |
| `app/api/v1/objects.py` | `HeatLossBatchJobRequest` |

`seeds.py` imports only `ElectricalRequest` from `calculation`.
Test files still import formula models from `calculation` widely
(`test_pipe_heat_loss.py`, `test_heat_loss_*`, `test_mutation_resilience.py`,
`test_pipe_slice2_contract.py`, …).

## Existing tests that already freeze the contracts

- Facade JSON and pipe/tank rounding:
  `test_heat_loss_facade_characterization.py`,
  `test_heat_loss_canonical_flow_characterization.py::test_pipe_rounds_facade_json_tank_does_not`
- K matrix (user > admin > profile; admin `0`; tank ignores coefficients):
  `test_pipe_user_safety_factor_wins_over_admin_coefficient`,
  `test_pipe_admin_safety_factor_applies_only_when_user_value_is_absent`,
  `test_pipe_profile_default_applies_when_user_and_admin_are_absent`,
  `test_pipe_admin_zero_safety_factor_raises_user_facing_range_error`,
  `test_tank_ignores_admin_coefficients`,
  `test_tank_requires_safety_factor`
- `HeatLossPreparationError.code` / `path`:
  `test_unknown_second_layer_has_structured_path`,
  `test_heat_loss_catalog_preparation.py`
- Hot-side literal:
  `test_public_facade_layer_temperature_errors_are_frozen`
- Process-T pre-check before formula:
  `test_process_temperature_outside_material_range_fails_before_formula`
- Import / recalculate invalid → `is_valid=false`, `results=null`:
  `test_invalid_recalculate_clears_results_and_keeps_object`
- Admin formula-check 422 (Pydantic before evaluation):
  `test_admin_formula_check_constructs_pydantic_model_before_evaluation`
- Persist create 201 / update 200 with invalid formula
  (`is_valid=false`, `results=null`, commit, no rollback):
  `test_pipe_slice2_contract.py::test_invalid_pipe_formula_persists_api_validation_state`
  (`create` / `update`). Historical C0 names
  `test_invalid_pipe_formula_rolls_back_api_transaction[*]` expected
  rollback and **failed**; on this HEAD the persist tests **passed**.

## Facade contract and benchmark

Local scripts of this queue (immutable after A0; AF must match SHA):

| File | SHA-256 |
|---|---|
| `evidence/facade_behavior_probe.py` | `daff97959029c91989bf46fb8492d712fbe1b5ef88d2b185d0d1b0bc85b158ec` |
| `evidence/facade_benchmark.py` | `2d708edd5cd7a48c060222877937a99aa1012d64e0ad44d7b03303881555952e` |

`ruff check` and `ruff format --check` on both: **passed**.

`2026-08-12` `heat_loss_differential_probe.py` / `heat_loss_benchmark.py`
were **not** run.

### Contract

`evidence/a0-facade-contract.json`

- size: **563849** bytes
- SHA-256: `e5d41eb04ea25d398d952fa93d789895115fb41f5945a037ce59f8d4b8465947`
- `pipe_results`: 81
- `tank_results`: 90
- `invalid`: 9
- `insulation_conductivity`: 186
- also present (not in the A0 summary counts above): `alpha` 24,
  `tm` 52, `pipe_material_lambda` 35
- `versions.pipe`: `sha256:1557453bd6e76661cc4b1dbca36fbe6628b67e61ddf0386520ce9ae15f559c22`
- `versions.tank`: `sha256:12b7830566b26b854c1a27f74ca7135d2351154d03d41d9d717a47f29baba820`

JSON contains successful results / `tm` / `alpha` / lambdas / versions
and, for errors, `status`, `message`, and pydantic `errors` only.
No signatures, JSON Schema, or `exception_type`.

### Benchmark

`evidence/a0-facade-benchmark.json` · SHA-256
`6b04af688fb7d1c71a1eca1ca8823474cebb2ab8cd73a57792be6a87f256ca10`

Protocol: 9 rounds × 20 loops, 3420 ops/round.

| Round | seconds |
|---|---|
| 1 | 0.22961954199126922 |
| 2 | 0.1698808340006508 |
| 3 | 0.16687245899811387 |
| 4 | 0.16487708399654366 |
| 5 | 0.16814633400645107 |
| 6 | 0.16760862499359064 |
| 7 | 0.18294587501441129 |
| 8 | 0.16937287501059473 |
| 9 | 0.1650535420048982 |

- median: **0.16814633400645107 s**
- minimum: 0.16487708399654366 s
- median µs / operation: 49.16559473872838

AF speed gate on the same environment: fail if
`AF.median_seconds > 1.15 × 0.16814633400645107` (= 0.19336828410741873).
