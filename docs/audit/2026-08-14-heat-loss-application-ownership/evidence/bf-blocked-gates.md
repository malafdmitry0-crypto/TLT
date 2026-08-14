# HL-OWN-BF blocked gate evidence

Final parent HEAD: `7cf5ec459ff1335b73d9716fb57e6d99df855b57`.

BF preflight UTC: `2026-08-14T11:40:47Z`.

Environment: Darwin `23.6.0` arm64; `heatcalc_backend` running/healthy;
Python `3.11.16`.

The worktree and HEAD were clean at preflight. A foreign staged file,
`docs/tnp/cases/case1-client-feedback-heat-decisions.md`, appeared only after
the full suite. It is outside BF scope and is excluded from the BF commit.

## Architecture proof

The focused suite includes the repository's AST ratchets, not only text
searches. An explicit read-only AST audit also inspected the final source and
reported:

```json
{
  "admin_heat_formula_imports": [],
  "application_forbidden_imports": [],
  "calculation_formula_bindings": [],
  "catalog_error_code_defined": false,
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

The narrow architecture command then ran eleven named ratchets and returned
`11 passed in 5.33s`. Those ratchets include alias/dotted/relative import
coverage rather than only direct `from ... import ...` matching.

Final source citations:

1. Production imports the owner module at
   `backend/app/services/calculation_service.py:65`; the production-wide AST
   ratchet is
   `backend/app/tests/unit/services/test_heat_loss_ownership_characterization.py:262`.
   It found no production import of climate/payload/K helpers from
   `calculation_service`.
2. `try_recalculate` is
   `backend/app/services/calculation_service.py:908-950`: its only application
   call is `evaluate_project_object_heat` at 929-940, followed by ORM-field
   assignment at 941-945. The AST call inventory above contains no normalize,
   climate, payload-builder, or formula call.
3. Heat HTTP envelopes are defined at
   `backend/app/schemas/heat_loss.py:73-99`. Production owner imports are
   `backend/app/api/v1/calculations.py:41`,
   `backend/app/api/v1/calc_jobs.py:17`,
   `backend/app/api/v1/objects.py:403`, and
   `backend/app/services/task_service.py:35`. The production-wide schema AST
   ratchet at
   `backend/app/tests/unit/formulas/test_heat_loss_schema_import_ratchet.py:217`
   passed.
4. Admin imports the application owner at `backend/app/api/v1/admin.py:46` and
   pipe/tank branches call it at 715-718. Its AST contains no
   `app.formulas.heat_loss` import.
5. `ReferenceInsulationError(code, message)` is defined at
   `backend/app/reference_data/loader.py:39-45`; structured loader branches are
   at 427-449. `resolve_reference_layer` catches only that typed error at
   `backend/app/formulas/heat_loss/catalog_preparation.py:45-52`.
   `_catalog_error_code` is absent from the final AST.
6. `build_heat_loss_error_payload` is
   `backend/app/services/heat_loss_application.py:71-173`: typed preparation,
   typed object-param, and structured Pydantic branches end in the generic
   formula payload at 167-173. Its AST has neither lower/casefold calls nor
   message-membership classifiers; the dedicated source ratchet passed.
7. `backend/app/schemas/calculation.py:15-18` contains only the four HTTP
   compatibility imports. The AST owner gate at
   `backend/app/tests/unit/formulas/test_heat_loss_schema_import_ratchet.py:221-228`
   found none of the eight formula bindings.
8. Application imports are visible at
   `backend/app/services/heat_loss_application.py:3-34`; the AST has no
   `app.models`, `app.services.calculation_service`, or `sqlalchemy` import.
9. The package declares `dependencies = []` at
   `backend/packages/heat-loss-core/pyproject.toml:10`. The package import AST
   ratchet and executable-tree shim ratchet passed; the directory
   `backend/app/formulas/heat_loss/core` does not exist.
10. The public facades accept only `params` at
    `backend/app/formulas/heat_loss/pipe.py:51`,
    `backend/app/formulas/heat_loss/tank.py:30`, and
    `backend/app/formulas/heat_loss/evaluator.py:18-20`. The runtime signature
    ratchet passed; none exposes `coefficients`.

Supporting zero-result searches also found no production helper import from
`calculation_service`, no `_catalog_error_code`, no `app.*` import in package
source, and no `coefficients` in the three facade modules.

## Package gate

Commands were the exact package commands from `plan.md`:

```text
python -m pytest tests -q --no-cov
ruff check src tests
mypy src tests
python -m pip wheel --no-deps --no-build-isolation --wheel-dir /tmp/hl-own-wheel .
python -m venv --clear /tmp/hl-own-venv
/tmp/hl-own-venv/bin/pip install --force-reinstall --no-deps /tmp/hl-own-wheel/heatcalc_heat_loss_core-0.2.0-py3-none-any.whl
/tmp/hl-own-venv/bin/python -I -c <__all__ proof>
```

Results: `315 passed in 0.41s`; Ruff PASS; mypy PASS for 43 source
files; fresh wheel built (35,876 bytes); isolated import PASS with 29 public
names and all four removed internals absent.

## Focused heat and protected contracts

The canonical Docker prefix ran the B0 twelve-file heat suite plus final
ownership, package/shim, loader, persist, and facade-input ratchets:

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
app/tests/unit/services/test_heat_loss_ownership_characterization.py
app/tests/unit/formulas/test_heat_loss_core_package_imports.py
app/tests/unit/formulas/test_heat_loss_core_import_boundary.py
app/tests/unit/test_pipe_slice2_contract.py
app/tests/unit/reference_data/test_loader.py
app/tests/unit/formulas/test_heat_loss_facade_input_boundary.py
```

Result: exit 0 and all progress reached 100%; matching collect-only reported
`456 tests collected`. Therefore the focused result is **456 passed**.

A separate 12-case protected-contract command passed (exit 0):

- invalid pipe create persists with HTTP 201;
- invalid pipe update persists with HTTP 200;
- invalid admin pipe returns HTTP 422;
- pipe/tank admin hot-side failures return 422 with the exact Russian detail;
- pipe hot-side path/message literal remains exact;
- the six K-matrix cases (user K, admin fallback, profile fallback, ignored
  unrelated admin key, tank policy, climate K precedence) pass.

Frontend fields were unchanged, so frontend is **NOT TOUCHED / NOT RUN**.

## Full backend blocker

Immediately before the full run the worktree/HEAD check was clean and the
container `/proc` audit found no pytest. Exactly one full command was started
with both live-worker ignores. It completed, rather than being interrupted.

Result: `11 failed, 2362 passed, 1 skipped, 265 warnings in 1041.05s`;
zero setup errors and zero collection errors. Ten failed nodeids exactly match
B0. One new nodeid makes `failed_ids ⊆ B0` false:

```text
app/tests/unit/services/test_calculation_service_unit.py::TestBatchRecalculate::test_mixed_success_and_failure
```

A targeted confirmation (not another full) records the exact assertion:

```text
app/tests/unit/services/test_calculation_service_unit.py:857
assert 'heat_loss_formula_error' == 'invalid_object_params'
```

The test injects untyped `ValueError("process temperature ниже ambient")` but
still expects the pre-B7 `invalid_object_params`/`validation` payload. The
approved B7 contract maps every untyped message-only exception to
`heat_loss_formula_error`/`formula`. BF does not repair the stale test.

Machine record: `bf-blocked-backend-suite.json`; complete raw output:
`bf-blocked-backend-suite.log`.

## Locked-oracle blocker

Both oracle SHA-256 values match B0 on host and in the container. Ruff and
format checks pass. Nevertheless both exact commands are **NOT COMPLETED**:
the locked `facade_behavior_probe.py:40` imports formula models from
`app.schemas.calculation`, while B8 was required to remove those re-exports.
Behavior and benchmark attempts both raise the same `ImportError`; neither BF
JSON was created. No shim, monkeypatch, altered command, or oracle edit was
used. The idle check before benchmark showed backend CPU `0.23%`.

Consequently contract size/SHA/cmp, benchmark samples/median, BF/B0 ratio, and
the `0.19342597501963608`-second threshold are **NOT COMPLETED**, never PASS.
Exact attempts are in `bf-blocked-facade-attempts.log`.

## Frontend and verdict

Both diffs are empty:

```text
git diff --name-only 14bbb3fdaa09ba91c0e633be3e297f06a7aaad85..7cf5ec459ff1335b73d9716fb57e6d99df855b57 -- frontend
git diff --name-only 14bbb3fdaa09ba91c0e633be3e297f06a7aaad85..7cf5ec459ff1335b73d9716fb57e6d99df855b57 -- docs/frontend/refactor-backlog.md
```

Frontend: **NOT TOUCHED / NOT RUN**. Backlog: unchanged.

Final BF verdict: **FAIL**. The new full-suite failed nodeid and the locked
oracle/B8 incompatibility independently forbid PASS or PASS WITH BASELINE DEBT.
