# Heat-loss core

`heatcalc-heat-loss-core` is the dependency-free calculation and validation
library used by HeatCalc's backend. It is intended to be reusable by other
Python applications, including a desktop client.

The package owns:

- pipe and tank heat-loss equations;
- derived geometry and thermal primitives;
- numerical ranges and cross-field calculation contracts;
- insulation-temperature, external-heat-transfer, safety-factor, and
  conductivity laws;
- validation of finite calculation results.

The package does not know about the HeatCalc app, insulation catalog, or
database. The caller supplies resolved `ConductivityLaw` values, temperature
intervals, and an optional `HeatLossFormulaProfile`. The standard Case 1
profile is used only when a custom profile is not passed.

## Recommended API

Use preparation input plus `validate_*_contract` / `run_*_formula`:

```python
from heatcalc_heat_loss_core import (
    PipePreparationInput,
    PipePreparationLayer,
    PipeFormulaOutcome,
    run_pipe_formula,
    TankPreparationInput,
    TankPreparationLayer,
    TankFormulaOutcome,
    run_tank_formula,
)

outcome = run_pipe_formula(prepared_input)
if outcome.result is None:
    report = outcome.report
else:
    result = outcome.result
```

`run_*_formula` validates the catalog-free contract, assembles a prepared
calculation, and returns `FormulaOutcome`: a result XOR a validation report.

Prepared assembly types (`PreparedPipeCalculation`, `evaluate_prepared_pipe`,
and the tank equivalents) remain available as advanced module-level APIs. They
are not the recommended root entrypoint.

## Compatibility API

The previous resolved evaluators stay public:

- `evaluate_pipe`
- `evaluate_resolved_air_tank`
- `evaluate_resolved_buried_tank`

They accept already-resolved numerical laws and intervals. `evaluate_pipe`
keeps its historical `resolve_safety_factor` semantics, including treating
primary `0` as missing. Prefer the recommended preparation path for new
callers.

## Advanced API

Low-level `calculate_*` functions, contract validators, conductivity laws, and
thermal primitives remain exported for specialized use. They are not a second
application entrypoint.

Run the standalone checks from this directory:

```bash
python -m pip install -e .
python -m pytest tests
ruff check src tests
mypy src tests
```
