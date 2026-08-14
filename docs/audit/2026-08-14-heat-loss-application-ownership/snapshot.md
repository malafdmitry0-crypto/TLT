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

---

# BF final regression attempt — FAIL

**Slice:** `HL-OWN-BF`

**Final parent HEAD:** `7cf5ec459ff1335b73d9716fb57e6d99df855b57`
(`refactor(heat-loss): drop formula reexports from calculation`)

**Evidence captured through UTC:** `2026-08-14T12:10:54Z`

**Environment:** Darwin 23.6.0 arm64 · `heatcalc_backend` running/healthy ·
Python 3.11.16

BF started from a clean worktree on the committed B8 HEAD. The container
`/proc` audit found no pytest before focused validation and again immediately
before the only final full backend run.

## Architecture closing proof

The final focused suite ran the repository's AST ratchets, and a separate
read-only AST audit inspected the final function/import trees. A narrow eleven-
test architecture command then passed in 5.33 s. The combined proof establishes:

1. No production import of application climate/payload/K helpers from
   `calculation_service`; production imports the owner module at
   `backend/app/services/calculation_service.py:65`, and the production-wide
   AST ratchet is at
   `backend/app/tests/unit/services/test_heat_loss_ownership_characterization.py:262`.
2. `try_recalculate` at
   `backend/app/services/calculation_service.py:908-950` calls only
   `heat_loss_application.evaluate_project_object_heat` before assigning ORM
   fields. Its AST call inventory contains no normalize, climate, payload, or
   formula call.
3. HTTP envelopes are owned by `backend/app/schemas/heat_loss.py:73-99`.
   Production imports them from that module at
   `backend/app/api/v1/calculations.py:41`,
   `backend/app/api/v1/calc_jobs.py:17`,
   `backend/app/api/v1/objects.py:403`, and
   `backend/app/services/task_service.py:35`.
4. Admin imports the application at `backend/app/api/v1/admin.py:46`; its heat
   calls are at 715-718, and its AST has no `app.formulas.heat_loss` import.
5. The typed loader error lives at
   `backend/app/reference_data/loader.py:39-45`, with typed resolution at
   427-449 and typed consumption at
   `backend/app/formulas/heat_loss/catalog_preparation.py:45-52`.
   `_catalog_error_code` is absent.
6. `build_heat_loss_error_payload` at
   `backend/app/services/heat_loss_application.py:71-173` has typed branches
   followed by a generic formula outcome. Its AST has no lower/casefold or
   membership comparison against message text.
7. `backend/app/schemas/calculation.py:15-18` binds only the four HTTP
   compatibility envelopes; the eight formula names are absent. The dedicated
   module-scope AST ratchet at
   `backend/app/tests/unit/formulas/test_heat_loss_schema_import_ratchet.py:221-228`
   passed.
8. The import block at
   `backend/app/services/heat_loss_application.py:3-34` contains no ORM,
   `CalculationService`, or SQLAlchemy dependency; the AST forbidden set is
   empty.
9. The package declares `dependencies = []` at
   `backend/packages/heat-loss-core/pyproject.toml:10`; package import and shim
   AST ratchets passed, and `app/formulas/heat_loss/core` is absent.
10. Public calculation facades remain params-only at
    `backend/app/formulas/heat_loss/pipe.py:51`,
    `backend/app/formulas/heat_loss/tank.py:30`, and
    `backend/app/formulas/heat_loss/evaluator.py:18-20`; runtime signature tests
    confirm no `coefficients` argument.

The exact AST inventory, ratchet context, and file citations are retained in
`evidence/bf-blocked-gates.md`.

## Package gate and isolated wheel

The exact `plan.md` commands ran in `/app/packages/heat-loss-core`:

- pytest: **315 passed** in 0.41 s;
- Ruff: **PASS**;
- mypy: **PASS**, 43 source files;
- fresh `heatcalc_heat_loss_core-0.2.0-py3-none-any.whl`: built only in
  `/tmp/hl-own-wheel` (35,876 bytes);
- clean `/tmp/hl-own-venv` install and isolated `python -I`: **PASS**;
- `core.__all__ == api.__all__`, all 29 public names present, all four removed
  internals absent.

## Focused heat suite and protected contracts

The canonical B0 heat suite plus the final ownership/schema/package/shim/
loader/persist/facade-input ratchets completed with exit 0. Matching
collect-only reported **456 tests**, so the result is **456 passed**.

An additional **12-case protected-contract proof passed**:

- invalid pipe create remains HTTP **201** and persists invalid state;
- invalid pipe update remains HTTP **200** and persists invalid state;
- invalid admin pipe and pipe/tank hot-side previews remain HTTP **422**;
- hot-side field/message literals remain exact;
- all six selected K-matrix cases pass (user/admin/profile precedence,
  unrelated-key invariance, tank policy, and climate K precedence).

No payload `field`/`fields` contract changed in BF. Frontend validation is
therefore correctly **NOT TOUCHED / NOT RUN**.

## The one final full backend run

Immediately before this run, HEAD/worktree were clean and the container had no
pytest process. BF started exactly one full run with the two live-worker files
ignored. It completed normally; it was not interrupted and was not repeated.

```text
docker exec \
  -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  -w /app heatcalc_backend \
  pytest app/tests --no-cov -q --tb=no --override-ini='addopts=' \
    --ignore=app/tests/integration/worker/test_worker_redis_live.py \
    --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
```

Run window: `2026-08-14T11:48:02Z`–`2026-08-14T12:05:28Z`.
Pytest result in **1041.05 s**:

- **11 failed**;
- **2362 passed**;
- **1 skipped**;
- **265 warnings**;
- **0 errors**;
- **0 setup errors**;
- **0 collection errors**.

Ten failed nodeids match all ten B0 debt IDs. There is one new nodeid, so the
required subset relation is false:

```text
app/tests/unit/services/test_calculation_service_unit.py::TestBatchRecalculate::test_mixed_success_and_failure
```

A targeted confirmation, not another full, reproduces the exact assertion at
`app/tests/unit/services/test_calculation_service_unit.py:857`:

```text
assert 'heat_loss_formula_error' == 'invalid_object_params'
```

The test injects the untyped message-only
`ValueError("process temperature ниже ambient")` but still expects the pre-B7
`invalid_object_params` / `validation` payload. The approved B7 contract maps
that input to `heat_loss_formula_error` / `formula`. BF does not change the
stale test.

The single skip was confirmed as
`test_import_100_csv_under_15s` because `sample_import.csv` is unavailable.
Machine record: `evidence/bf-blocked-backend-suite.json`; full raw output:
`evidence/bf-blocked-backend-suite.log`.

## Facade oracle and benchmark blocker

Before either attempt, host and container SHA-256 values exactly matched B0:

| Oracle | SHA-256 | Static gate |
|---|---|---|
| `facade_behavior_probe.py` | `daff97959029c91989bf46fb8492d712fbe1b5ef88d2b185d0d1b0bc85b158ec` | Ruff + format PASS |
| `facade_benchmark.py` | `2d708edd5cd7a48c060222877937a99aa1012d64e0ad44d7b03303881555952e` | Ruff + format PASS |

The locked behavior oracle itself imports
`PipeHeatLossParams` / `TankHeatLossParams` from
`app.schemas.calculation` at `evidence/facade_behavior_probe.py:40`.
B8 was required to remove precisely those formula re-exports. Therefore the
exact behavior command exits 1 with `ImportError` before creating
`/tmp/bf-facade-contract.json`.

The idle check before benchmark recorded backend CPU **0.23%**. The exact
9-round × 20-loop benchmark attempt exits 1 on the same import before creating
`/tmp/bf-facade-benchmark.json`. No runtime shim, monkeypatch, altered command,
or oracle edit was used.

Consequently all of the following are **NOT COMPLETED**, not PASS:

- BF contract size/SHA and byte comparison with B0's 563,849-byte contract;
- benchmark samples, median, BF/B0 ratio;
- comparison with the **0.19342597501963608 s** ceiling.

The exact tracebacks are in `evidence/bf-blocked-facade-attempts.log`.
Canonical `bf-facade-*.json` names remain free for the corrected BF rerun.

## Frontend, scope, and external WIP

Both final-parent diffs from B0 parent
`14bbb3fdaa09ba91c0e633be3e297f06a7aaad85` are empty:

```text
git diff --name-only 14bbb3fdaa09ba91c0e633be3e297f06a7aaad85..7cf5ec459ff1335b73d9716fb57e6d99df855b57 -- frontend
git diff --name-only 14bbb3fdaa09ba91c0e633be3e297f06a7aaad85..7cf5ec459ff1335b73d9716fb57e6d99df855b57 -- docs/frontend/refactor-backlog.md
```

Frontend: **NOT TOUCHED / NOT RUN**. The frontend backlog is unchanged.

The BF preflight was clean. After the full run, an unrelated staged file
`docs/tnp/cases/case1-client-feedback-heat-decisions.md` appeared. It was not
read, modified, unstaged, or included in the BF commit; only explicit BF audit
paths are committed.

## BF verdict

**FAIL.** The new full-suite failed nodeid and the locked-oracle/B8 import
incompatibility are independent blockers. This attempt cannot be called PASS or
PASS WITH BASELINE DEBT. A separate corrective slice is required before a new
BF run; this failed attempt does not repeat the full backend suite.

---

# HL-OWN-BC corrective proof

**Slice:** `HL-OWN-BC`

**Parent HEAD:** `2ec3bd12048a8b23ef450e717bf9a280fa549b36`
(`docs(heat-loss): record application-ownership regression proof`)

**Captured UTC:** `2026-08-14T12:22:57Z`

**State:** corrective gates PASS; BF retry is next and was not started

The blocked BF section above is historical evidence and remains unchanged.
The unrelated staged file
`docs/tnp/cases/case1-client-feedback-heat-decisions.md` remained outside the
slice: it was not read, modified, unstaged, or included in any scoped check.

## The two corrections

1. `TestBatchRecalculate.test_mixed_success_and_failure` still injects the same
   untyped message-only
   `ValueError("process temperature ниже ambient")`. Its assertions now match
   the approved B7 generic payload:
   `heat_loss_formula_error` / `formula`, `field=None`, and the current formula
   hint. No production code changed.
2. `facade_behavior_probe.py` now imports `PipeHeatLossParams` and
   `TankHeatLossParams` from their B8 owner, `app.schemas.heat_loss`. The complete
   diff from the committed B0 oracle is **one deletion and one addition on that
   import line**. `facade_benchmark.py` is byte-identical to B0. No shim,
   monkeypatch, or probe-semantic change was used.

## Focused and collection gates

All Docker pytest commands used the explicit test secret, ran sequentially,
and started after a `/proc` argv audit found no live pytest process:

- exact blocked nodeid: **1 passed** in 0.35 s;
- complete B7 focused suite: **113 passed** in 20.64 s;
- complete `TestBatchRecalculate` class plus ownership characterization:
  **70 passed** in 13.80 s;
- canonical backend collect-only with both live-worker files ignored:
  **2374 tests collected** in 4.29 s, exit 0, no collection error.

Ruff check and `ruff format --check` passed for the changed batch test and both
oracle scripts; all three files were already formatted.

## Corrected behavior oracle and contract

Host and container hashes matched exactly:

| Oracle | B0 SHA-256 | HL-OWN-BC SHA-256 | Result |
|---|---|---|---|
| `facade_behavior_probe.py` | `daff97959029c91989bf46fb8492d712fbe1b5ef88d2b185d0d1b0bc85b158ec` | `9ab1a858a53663cd41adeb87b86382ed4b2b95b36e2cbe829b26515678b12e1e` | controlled owner-import-only change |
| `facade_benchmark.py` | `2d708edd5cd7a48c060222877937a99aa1012d64e0ad44d7b03303881555952e` | `2d708edd5cd7a48c060222877937a99aa1012d64e0ad44d7b03303881555952e` | byte-identical |

The corrected behavior probe completed with 186 insulation probes, 9 invalid
cases, 81 pipe cases, and 90 tank cases. Its temporary JSON parsed successfully
as the same eight-key object as B0 and produced:

- size: **563849 bytes**, exactly B0;
- SHA-256:
  `e5d41eb04ea25d398d952fa93d789895115fb41f5945a037ce59f8d4b8465947`,
  exactly B0;
- binary `cmp` with the copied B0 contract: **PASS**, exit 0;
- parsed JSON equality with B0: **PASS**.

The corrected contract and B0 comparison copy existed only under container
`/tmp`; no new large contract artifact was added to the repository.

## Benchmark import smoke

Immediately before the smoke, `docker stats --no-stream` reported backend CPU
at **0.17%**. The unchanged benchmark oracle then completed 9 rounds × 20
loops (3420 operations per round) through the corrected transitive import:

```text
0.19833391599240713
0.19061079202219844
0.15087379200849682
0.19350875000236556
0.20442470902344212
0.16935749998083338
0.582354749989463
0.17856595900957473
0.19178891699993983
```

- median: **0.19178891699993983 s**;
- minimum: **0.15087379200849682 s**;
- median: **56.07863070173679 µs/operation**;
- B0 median: **0.16819650001707487 s**;
- BC/B0 ratio: **1.1402669911708623** (**+14.026699117086228%**).

This is a transitive-import smoke only. It does not replace the benchmark in
the next BF attempt and does not overwrite either B0 benchmark evidence or the
blocked BF history. Its JSON remained only under container `/tmp`.

## Scope and next gate

Full backend: **NOT RUN**. Frontend: **NOT TOUCHED / NOT RUN**. Backend
production, package code, package metadata, and `facade_benchmark.py`:
**NOT TOUCHED**. Only the one backend test, the one behavior-oracle import, and
the ownership plan/prompts/snapshot belong to this corrective commit.

**NEXT:** commit HL-OWN-BC with
`test(heat-loss): align final proofs with ownership contracts`, then start a
fresh BF retry. That retry has exactly one full backend run; the completed
blocked-BF full above remains preserved and is not rerun inside BC.

---

# BF retry final regression — PASS WITH BASELINE DEBT

**Slice:** `HL-OWN-BF`

**Final parent HEAD:** `b51448d3b5e55b3fe232fcba99da8c878f795dda`
(`test(heat-loss): align final proofs with ownership contracts`)

**Evidence captured through UTC:** `2026-08-14T12:58:59Z`

**Environment:** Darwin 23.6.0 arm64 · `heatcalc_backend` running/healthy ·
Python 3.11.16

The retry started with no ownership/backend/frontend WIP on the committed BC
HEAD. The unrelated staged
`docs/tnp/cases/case1-client-feedback-heat-decisions.md` remained outside the
slice and was not read, modified, unstaged, checked, or included.

## Closing gates

The final read-only AST audit and repository ratchets found:

- no production climate/payload/K import from `calculation_service`;
- no direct normalize/climate/payload/formula call in `try_recalculate`;
- all production heat HTTP envelope imports owned by `app.schemas.heat_loss`;
- no heat-formula import in admin;
- no `_catalog_error_code`;
- no message substring classifier in the payload builder;
- no formula-model binding in `app.schemas.calculation`;
- no ORM/service/SQLAlchemy import in the application owner;
- no backend `app.*` import or shim in the core package;
- params-only pipe/tank/evaluator facades, with no `coefficients` argument.

Current file/line citations and the exact AST inventory are in
`evidence/bf-gates.md`.

The package gate is green: **315 passed**, Ruff PASS, mypy PASS for 43 source
files, fresh 35,876-byte wheel, clean venv install, and isolated `python -I`
with 29 public names and all four removed internals absent.

The final focused heat/ownership/ratchet set, explicitly including corrected
`TestBatchRecalculate::test_mixed_success_and_failure`, completed with
**457 outcomes** and exit 0. The protected 201/200/admin-422/hot-side/K command
reported **12 passed** in 5.23 s. Canonical collect-only reported
**2374 tests collected** in 3.85 s with no collection error.

## Final facade proof

Before probes:

- behavior oracle SHA-256 was the exact BC value
  `9ab1a858a53663cd41adeb87b86382ed4b2b95b36e2cbe829b26515678b12e1e`;
- its complete diff from B0 was exactly the one
  `app.schemas.calculation` → `app.schemas.heat_loss` owner-import line;
- benchmark oracle SHA-256 remained the exact B0 value
  `2d708edd5cd7a48c060222877937a99aa1012d64e0ad44d7b03303881555952e`;
- host/container hashes matched and both scripts passed Ruff and format check.

`evidence/bf-facade-contract.json` is **563849 bytes**, SHA-256
`e5d41eb04ea25d398d952fa93d789895115fb41f5945a037ce59f8d4b8465947`,
and binary-identical to the B0 contract.

Immediately before the one final benchmark, no pytest was running and backend
CPU was **0.24%**. The exact 9 × 20 run completed once:

```text
0.1521360829938203
0.17367220800952055
0.20342574999085627
0.16501120800967328
0.16455624997615814
0.1565013329964131
0.16284379200078547
0.1634420830232557
0.1568126670026686
```

- BF median: **0.1634420830232557 s**;
- B0 median: **0.16819650001707487 s**;
- BF/B0: **0.971732961189225** (**−2.8267038810775%**);
- allowed ceiling: **0.19342597501963607 s**;
- result: PASS.

Artifact: `evidence/bf-facade-benchmark.json`, 462 bytes, SHA-256
`96201c5424fb55e8962e538cfa6c34b163f19c86b144a440cf435589254c676c`.

## The one retry full backend

Immediately before the full run, the container `/proc` audit reported no
pytest. Exactly one full backend command ran with both live-worker ignores. It
completed normally and was not repeated.

Run window: `2026-08-14T12:40:19Z`–`2026-08-14T12:58:03Z`.
Result in **1059.00 s**:

- **10 failed**;
- **2363 passed**;
- **1 skipped**;
- **266 warnings**;
- **0 errors**;
- **0 setup errors**;
- **0 collection errors**.

The failed set is exactly equal to the ten-nodeid B0 debt set: no new failed
nodeid and no missing B0 nodeid. Machine comparison:
`evidence/bf-backend-suite.json`. Complete raw log:
`evidence/bf-backend-suite.log`, 6792 bytes, 84 lines, SHA-256
`87eb9469251dd810e92397ef634731d1dba0eb2f9d193f872a1ff3e9c5b664d8`.
The post-run `/proc` audit again found no pytest.

## Scope and verdict

The committed diffs from B0 parent through final parent are empty for both
`frontend/` and `docs/frontend/refactor-backlog.md`. Frontend:
**NOT TOUCHED / NOT RUN**. BF retry changed no production backend, test,
package, frontend, plan, or prompts file; only this snapshot and new canonical
`bf-*` evidence belong to the slice.

**PASS WITH BASELINE DEBT.** All ownership closing gates pass. The only full
suite failures are exactly the ten assertion failures captured in B0, with no
new regression and no setup/collection error.
