# HL-OWN-BF retry gate evidence

Final parent HEAD: `b51448d3b5e55b3fe232fcba99da8c878f795dda`
(`test(heat-loss): align final proofs with ownership contracts`).

Preflight UTC: `2026-08-14T12:31:37Z`. Evidence captured through UTC:
`2026-08-14T12:58:59Z`.

Environment: Darwin `23.6.0` arm64; `heatcalc_backend` running/healthy;
Python `3.11.16`.

The exact ownership/backend/frontend path audit was clean at preflight. The
unrelated staged file
`docs/tnp/cases/case1-client-feedback-heat-decisions.md` remained outside the
slice: it was not read, modified, unstaged, checked, or included. Before the
full run, the only ownership worktree paths were the two newly copied canonical
`bf-facade-*.json` artifacts.

## Architecture closing proof

The final 457-case focused suite executed all ownership/schema/package AST
ratchets. A separate read-only AST audit on the same HEAD returned:

```json
{
  "admin_heat_formula_imports": [],
  "application_forbidden_imports": [],
  "calculation_formula_bindings": [],
  "catalog_error_code_defined": false,
  "facade_parameters": {
    "calc_pipe_heat_loss": ["params"],
    "calc_tank_heat_loss": ["params"],
    "evaluate_validated_heat_loss": ["params"]
  },
  "package_app_imports": [],
  "payload_lower_or_casefold_calls": [],
  "payload_message_membership_lines": [],
  "shim_directory_exists": false,
  "try_recalculate_calls": [
    "Err",
    "Ok",
    "RuntimeError",
    "heat_loss_application.evaluate_project_object_heat"
  ],
  "try_recalculate_forbidden_calls": []
}
```

The repository's production-wide AST helpers independently returned
`calculation_service_heat_import_violations=[]` and
`calculation_schema_owner_violations=[]`. Current source citations:

1. `calculation_service` imports the owner module at
   `backend/app/services/calculation_service.py:65`. The production-wide AST
   ratchet is
   `backend/app/tests/unit/services/test_heat_loss_ownership_characterization.py:262`;
   no climate/payload/K helper is imported from the large service.
2. `try_recalculate` is at
   `backend/app/services/calculation_service.py:908-950`. Its only application
   calls are `evaluate_project_object_heat` at 929-940, followed by assignments
   of the returned outcome at 941-945. Its AST contains no normalize, climate,
   payload-builder, canonical-validation, or heat-formula call.
3. Heat HTTP envelopes are defined at
   `backend/app/schemas/heat_loss.py:73-99`. Production owner imports are at
   `backend/app/api/v1/calculations.py:41`,
   `backend/app/api/v1/calc_jobs.py:17`,
   `backend/app/api/v1/objects.py:403`, and
   `backend/app/services/task_service.py:35`. The production AST ratchet is at
   `backend/app/tests/unit/formulas/test_heat_loss_schema_import_ratchet.py:217`.
4. Admin imports the application owner at
   `backend/app/api/v1/admin.py:46` and calls preview at 715-718. Its AST has no
   `app.formulas.heat_loss` import.
5. `ReferenceInsulationError(code, message)` is defined at
   `backend/app/reference_data/loader.py:39-45`; structured resolver branches
   are at 427-449 and typed consumption is at
   `backend/app/formulas/heat_loss/catalog_preparation.py:45-52`.
   `_catalog_error_code` is absent from production.
6. `build_heat_loss_error_payload` is at
   `backend/app/services/heat_loss_application.py:71-173`. Typed branches end
   in the generic formula outcome at 167-173. Its AST has no `lower`/`casefold`
   call or message-membership classifier; the source ratchet is at
   `backend/app/tests/unit/formulas/test_heat_loss_structured_error_channel.py:338`.
7. `backend/app/schemas/calculation.py:15-18` binds only the four HTTP
   compatibility envelopes. None of the eight formula model names is bound;
   the module-scope owner ratchet is at
   `backend/app/tests/unit/formulas/test_heat_loss_schema_import_ratchet.py:221`.
8. The application import block at
   `backend/app/services/heat_loss_application.py:3-34` has no `app.models`,
   `CalculationService`, or SQLAlchemy dependency. The dedicated ratchet is at
   `backend/app/tests/unit/services/test_heat_loss_ownership_characterization.py:1187`.
9. The core package declares `dependencies = []` at
   `backend/packages/heat-loss-core/pyproject.toml:10`; package source contains
   no `app.*` import. The executable shim and import-boundary gates are at
   `backend/app/tests/unit/formulas/test_heat_loss_core_package_imports.py:55`
   and
   `backend/app/tests/unit/formulas/test_heat_loss_core_import_boundary.py:63`.
   `backend/app/formulas/heat_loss/core` does not exist.
10. Public facades are params-only at
    `backend/app/formulas/heat_loss/pipe.py:51`,
    `backend/app/formulas/heat_loss/tank.py:30`, and
    `backend/app/formulas/heat_loss/evaluator.py:18-20`; their modules contain
    no `coefficients`. The runtime signature gate is at
    `backend/app/tests/unit/formulas/test_heat_loss_application_housing_characterization.py:90`.

## Package gate and isolated wheel

The exact `plan.md` commands ran in `/app/packages/heat-loss-core`:

- pytest: **315 passed** in 0.40 s;
- Ruff: **PASS**;
- mypy: **PASS**, 43 source files;
- fresh wheel, after clearing only `/tmp/hl-own-wheel` and
  `/tmp/hl-own-venv`: `heatcalc_heat_loss_core-0.2.0-py3-none-any.whl`,
  35,876 bytes, SHA-256
  `81ed77d179bc8e0d8b2c33ef5ccc07bbbf54601f03145081034503baa06dd7fd`;
- clean venv install and isolated `python -I`: **PASS**;
- `core.__all__ == api.__all__`, all 29 public names present, all four removed
  internals absent.

## Focused, protected, and collection gates

The B0 twelve-file heat suite plus final ownership/schema/package/shim/loader/
facade-input ratchets and the corrected blocked nodeid
`TestBatchRecalculate::test_mixed_success_and_failure` ran sequentially. The
captured progress contained **457 test outcomes**, reached 100%, and the wrapper
exited 0.

An independent protected-contract command completed with **12 passed** in
5.23 s:

- invalid pipe create remains HTTP **201** and persists invalid state;
- invalid pipe update remains HTTP **200** and persists invalid state;
- invalid admin pipe remains HTTP **422**;
- pipe and tank hot-side admin previews remain HTTP **422** with exact Russian
  details;
- the pipe hot-side `field`/`fields`/message literal remains exact;
- all six K-matrix cases pass: user K, admin fallback, profile fallback,
  unrelated-key invariance, tank policy, and climate K precedence.

Canonical collect-only used both live-worker ignores and reported
**2374 tests collected** in 3.85 s, exit 0, with no collection error.

## Oracle integrity and behavior contract

Before probes, the committed B0 behavior oracle and current BC oracle differed
by exactly one line:

```diff
-from app.schemas.calculation import PipeHeatLossParams, TankHeatLossParams
+from app.schemas.heat_loss import PipeHeatLossParams, TankHeatLossParams
```

Oracle hashes and host/container comparison:

| Oracle | Required SHA-256 | Result |
|---|---|---|
| behavior B0 | `daff97959029c91989bf46fb8492d712fbe1b5ef88d2b185d0d1b0bc85b158ec` | historical baseline |
| behavior BF/BC | `9ab1a858a53663cd41adeb87b86382ed4b2b95b36e2cbe829b26515678b12e1e` | exact BC; host = container |
| benchmark B0/BF | `2d708edd5cd7a48c060222877937a99aa1012d64e0ad44d7b03303881555952e` | byte-identical B0; host = container |

Both scripts passed Ruff and `ruff format --check` in the container.

The canonical behavior probe completed with 186 insulation probes, 9 invalid
cases, 81 pipe cases, and 90 tank cases. The resulting
`bf-facade-contract.json` parsed successfully and is:

- **563849 bytes**, exactly B0;
- SHA-256
  `e5d41eb04ea25d398d952fa93d789895115fb41f5945a037ce59f8d4b8465947`,
  exactly B0 on host and in the container;
- binary `cmp` with `b0-facade-contract.json`: **PASS**.

## Idle benchmark

Immediately before the only final benchmark, the `/proc` audit reported no
pytest and `docker stats --no-stream` reported backend CPU **0.24%**. The
unchanged oracle then completed exactly 9 rounds × 20 loops (3420 operations
per round), once:

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
- BF minimum: **0.1521360829938203 s**;
- BF median: **47.79008275533792 µs/operation**;
- B0 median: **0.16819650001707487 s**;
- BF/B0 ratio: **0.971732961189225** (**−2.8267038810775%**);
- limit `1.15 × B0`: **0.19342597501963607 s**;
- result: **PASS**.

Canonical artifact: `bf-facade-benchmark.json`, 462 bytes, SHA-256
`96201c5424fb55e8962e538cfa6c34b163f19c86b144a440cf435589254c676c`.

## The one full backend run

Immediately before the run, HEAD was still the exact parent, the container was
healthy, scoped worktree paths contained only the two BF facade artifacts, and
the `/proc` argv audit reported `NO_PYTEST_PROCESSES`. BF retry started exactly
one full backend command with both live-worker files ignored:

```text
docker exec \
  -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  -w /app heatcalc_backend \
  pytest app/tests --no-cov -q --tb=no --override-ini='addopts=' \
    --ignore=app/tests/integration/worker/test_worker_redis_live.py \
    --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
```

The container wrapper changed no pytest argument; it only redirected complete
stdout/stderr and recorded timestamps/exit status. The run completed, was not
interrupted, and was not repeated. Run window:
`2026-08-14T12:40:19Z`–`2026-08-14T12:58:03Z`.

Pytest result in **1059.00 s**:

- **10 failed**;
- **2363 passed**;
- **1 skipped**;
- **266 warnings**;
- **0 errors**;
- **0 setup errors**;
- **0 collection errors**.

The failed set equals the ten-nodeid B0 comparison set: all ten matched, no B0
nodeid disappeared, and no new nodeid appeared. The exact arrays and subset
proof are in `bf-backend-suite.json`.

Complete raw output: `bf-backend-suite.log`, **6792 bytes**, **84 lines**,
SHA-256
`87eb9469251dd810e92397ef634731d1dba0eb2f9d193f872a1ff3e9c5b664d8`.
After completion, the `/proc` audit again reported no pytest process.

## Frontend and scope

Both committed diffs are empty:

```text
git diff --name-only 14bbb3fdaa09ba91c0e633be3e297f06a7aaad85..b51448d3b5e55b3fe232fcba99da8c878f795dda -- frontend
git diff --name-only 14bbb3fdaa09ba91c0e633be3e297f06a7aaad85..b51448d3b5e55b3fe232fcba99da8c878f795dda -- docs/frontend/refactor-backlog.md
```

Frontend: **NOT TOUCHED / NOT RUN**. The frontend backlog is unchanged.
Production backend, tests, package code, package metadata, plan, and prompts
were not changed in BF retry. Only `snapshot.md` and new canonical `bf-*`
evidence belong to this slice.

## Verdict

**PASS WITH BASELINE DEBT.** Every closing gate passes. The completed full
suite has only the exact ten pre-existing B0 assertion failures, with no
error/setup/collection failure and no new failed nodeid.
