# Heat-loss application ownership — B0 baseline snapshot

**Slice:** `HL-OWN-B0`

**Captured UTC:** `2026-08-14T02:57:06Z`

**B0 parent HEAD:** `14bbb3fdaa09ba91c0e633be3e297f06a7aaad85`
(`docs(heat-loss): record application-boundary regression proof`)

**Environment:** Darwin arm64 · `heatcalc_backend` healthy · Python 3.11.16

**State:** baseline captured; this is not a regression verdict

Worktree before B0 contained only the authorized slice:

```text
 M .gitignore
 M docs/audit/2026-08-14-heat-loss-application-boundary/plan.md
?? docs/audit/2026-08-14-heat-loss-application-ownership/
```

There was no package, production backend, test, or frontend WIP. B0 did
not change those areas. The new ownership documents, the allowlist, and
the previous queue's `SUPERSEDED` pointer are part of this slice.

## Remaining guest inventory

### `app/services/calculation_service.py`

The implementation already lives in `heat_loss_application`, but the
large service still exposes and orchestrates heat behavior:

| Location | Symbol / step | Current role |
|---|---|---|
| 95–108 | `apply_climate_policy`, `build_heat_loss_error_payload`, `effective_pipe_safety_factor`, `pipe_params_with_effective_safety_factor` | identity re-exports from the application module |
| 190, 304 | `_apply_climate_policy` | module alias and `CalculationService` staticmethod alias |
| 798–805 | `CalculationService.calc_heat_loss` | loads admin coefficients, then calls its private wrapper |
| 807–822 | `_calc_heat_loss_with_coefficients` | thin wrapper over `heat_loss_application.calc_heat_loss` |
| 931–993 | `try_recalculate` | owns normalize, climate, canonical validation, coefficient loading, formula call, payload creation, and ORM field mutation |
| 1103–1105 | heat batch loop | calls `try_recalculate` with already loaded coefficients |

Exact `try_recalculate` order on B0:

1. `normalize_project_object_params` (953);
2. `apply_climate_policy` (954);
3. `validate_and_canonicalize_project_object_params` (955–958);
4. assign canonical `obj.params` (959);
5. report-invalid branch writes `results=None`, `is_valid=False`, and
   application payload (960–968);
6. only after valid canonical input, use injected coefficients or await
   `get_coefficients` (971–973);
7. call the private wrapper with climate disabled and validated params
   (974–980);
8. write success state (981–984), or catch any exception and write the
   application payload as invalid state (985–993).

`POST /heat-loss` is still routed through
`CalculationService.calc_heat_loss` in
`app/api/v1/calculations.py:141–166`.

No production module imports the four heat aliases directly from
`calculation_service`; production imports the service class. Direct alias
consumers remain in tests:

- `test_heat_loss_canonical_flow_characterization.py`;
- `test_heat_loss_structured_error_channel.py`;
- `test_heat_loss_application_housing_characterization.py`;
- `test_pipe_heat_loss.py`;
- `test_heat_loss_catalog_preparation.py`;
- `test_heat_loss_error_payload_characterization.py`;
- `test_calculation_service_unit.py`.

Additionally, 12 calls to
`CalculationService._apply_climate_policy` remain in
`test_calculation_service_unit.py:393–549`, and one in
`test_pipe_slice2_contract.py:282`.

### Heat schemas still housed in `calculation.py`

`app/schemas/calculation.py` still defines the HTTP envelopes:

| Symbol | Line |
|---|---:|
| `HeatLossRequest` | 41 |
| `HeatLossResponse` | 49 |
| `BatchCalcResponse` | 54 |
| `HeatLossBatchJobRequest` | 966 |

It also identity-re-exports the eight formula models from
`app.schemas.heat_loss` at lines 15–22. Production consumers of the HTTP
envelopes remain in `api/v1/calculations.py`, `api/v1/calc_jobs.py`, the
local import in `api/v1/objects.py:403`, and `services/task_service.py`.

### Admin preview, catalog code, and payload parsing

- `app/api/v1/admin.py:25–26` imports
  `HeatLossPreparationError` and `evaluate_validated_heat_loss` directly
  from `app.formulas.heat_loss`; pipe/tank branches call the evaluator at
  719/722. They pass neither climate nor coefficients/admin K. This is the
  characterized preview contract, not a defect.
- `app/formulas/heat_loss/catalog_preparation.py:45–52` catches loader
  `ValueError` and reconstructs a code through `_catalog_error_code`,
  defined at 90–97 from message prefixes/substrings.
- `app/services/heat_loss_application.py:76–86` first handles
  `HeatLossPreparationError` structurally. Leftover branches still parse
  process-temperature strings (88–95), Russian text inside
  `ProjectObjectParamsError` (121/126), generic unsupported type/shape
  text (143–149), and the marker list at 150–165:
  `требует`, `требуются`, `требуется`, `долж`, `диапазон`,
  `положитель`, `выше`, `ниже`, `превыш`, `не может`.

## Package gate and isolated wheel

Executed in `/app/packages/heat-loss-core`:

```text
python -m pytest tests -q --no-cov
ruff check src tests
mypy src tests
```

Results:

- pytest: **315 passed** in 0.46 s;
- ruff: **PASS**;
- mypy: **PASS**, 43 source files.

The exact wheel/venv commands from `plan.md` were then run. Both were
created only under `/tmp/hl-own-wheel` and `/tmp/hl-own-venv`.
`heatcalc_heat_loss_core-0.2.0-py3-none-any.whl` built and installed;
the isolated `python -I` proof passed:

- `core.__all__ == api.__all__`;
- all 29 public names exist on `core`;
- removed internals `evaluate_pipe`, `evaluate_resolved_air_tank`,
  `evaluate_resolved_buried_tank`, and `resolve_safety_factor` are absent.

## Focused heat suite

Command used the canonical Docker prefix and these files:

```text
app/tests/unit/formulas/test_heat_loss_canonical_flow_characterization.py
app/tests/unit/formulas/test_heat_loss_facade_characterization.py
app/tests/unit/formulas/test_heat_loss_validation_entrypoint_characterization.py
app/tests/unit/schemas/test_heat_loss_range_characterization.py
app/tests/unit/formulas/test_heat_loss_formula_ownership.py
app/tests/unit/formulas/test_heat_loss_catalog_preparation.py
app/tests/unit/services/test_heat_loss_single_validation_boundary.py
app/tests/unit/formulas/test_heat_loss_schema_import_ratchet.py
app/tests/unit/formulas/test_heat_loss_application_housing_characterization.py
app/tests/unit/schemas/test_heat_loss_schema_housing_characterization.py
app/tests/unit/formulas/test_heat_loss_structured_error_channel.py
app/tests/unit/services/test_heat_loss_error_payload_characterization.py
```

Result: **PASS**, exit 0. A matching collect-only command confirmed
**293 tests collected**.

## Full backend suite

Executed exactly with explicit test environment and both live-worker
files ignored:

```text
docker exec \
  -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  -w /app heatcalc_backend \
  pytest app/tests --no-cov -q --tb=no --override-ini='addopts=' \
    --ignore=app/tests/integration/worker/test_worker_redis_live.py \
    --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
```

Result: completed in **981.44 s**:

- **10 failed** assertions;
- **2289 passed**;
- **1 skipped**;
- **266 warnings**;
- **0 errors**;
- **0 collection errors**.

Machine record: `evidence/b0-backend-suite.json`. Raw output:
`evidence/b0-backend-suite.log`.

### B0 failed comparison set

```text
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

All ten are outside heat-loss. This list, and only this list, is the
assertion-failed comparison set for later ownership slices.

The electrical concurrency nodeid
`test_concurrent_enqueue_and_delete_never_orphans_task` did **not** fail
in B0 and therefore is not baseline debt here. If it fails later, it is
a new failed ID under this queue's rules.

Errors:

```text
(none)
```

Collection errors:

```text
(none)
```

The single skip was independently confirmed as
`test_import_100_csv_under_15s`; reason: `sample_import.csv` is absent in
the test environment. It is not in the comparison set.

## Facade oracle and behavior contract

The two scripts are byte-for-byte copies from the previous application
boundary evidence. Host and container SHA-256 values match:

| Oracle | SHA-256 |
|---|---|
| `facade_behavior_probe.py` | `daff97959029c91989bf46fb8492d712fbe1b5ef88d2b185d0d1b0bc85b158ec` |
| `facade_benchmark.py` | `2d708edd5cd7a48c060222877937a99aa1012d64e0ad44d7b03303881555952e` |

Both scripts passed `ruff check` and `ruff format --check` inside the
container.

`evidence/b0-facade-contract.json`:

- size: **563849 bytes**;
- SHA-256:
  `e5d41eb04ea25d398d952fa93d789895115fb41f5945a037ce59f8d4b8465947`;
- probe inventory: 186 insulation probes, 9 invalid cases, 81 pipe
  cases, 90 tank cases;
- `cmp` against the previous queue's `af-facade-contract.json`:
  **byte-identical**.

## Facade benchmark

Protocol: 9 rounds × 20 loops, 3420 operations per round.

The first run, taken before the full suite without an idle CPU check,
was anomalously high:

- samples: `0.1715724580`, `0.1763135840`, `0.2121316250`,
  `0.2209178330`, `0.1862857500`, `0.1606856250`, `0.1995290000`,
  `0.2008256250`, `0.2015024170` s;
- median: **0.1995290000049863 s**;
- minimum: **0.16068562498549 s**;
- versus previous AF median `0.16564841699437238`: **+20.45%**.

Per the updated B0 gate, the exact benchmark was repeated after the full
suite. `docker stats --no-stream` showed backend CPU at **0.29%** before
the repeat. The final B0 artifact is this idle run:

- samples: `0.1844837920`, `0.1593117920`, `0.1748630840`,
  `0.1707958750`, `0.1661251250`, `0.1812090830`, `0.1596162080`,
  `0.1574781250`, `0.1681965000` s;
- median: **0.16819650001707487 s**;
- minimum: **0.1574781250092201 s**;
- median microseconds/operation: **49.180263162887385**;
- versus AF: **+1.54%**, below the 15% sanity threshold;
- future BF limit (`1.15 × B0`): **0.193426 s**.

Final artifact: `evidence/b0-facade-benchmark.json`, SHA-256
`a217bd0b6b4832ec6f3f56093d5d0e9d715e82850e736ab8a6107b83cd49a17f`.

## Frontend and scope proof

Before commit, both commands were empty:

```text
git diff --name-only 14bbb3fdaa09ba91c0e633be3e297f06a7aaad85 -- frontend
git status --short -- frontend backend
```

Frontend: **NOT TOUCHED / NOT RUN**. Production backend and package:
**NOT TOUCHED**. No frontend validation was required because B0 changed
no payload `field`/`fields` and no frontend file.

## B0 outcome

**CAPTURED.** This slice records the current comparison set and evidence;
it does not claim `PASS WITH BASELINE DEBT`. The next allowed slice is B1
after this B0 commit.
