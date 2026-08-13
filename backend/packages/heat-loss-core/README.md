# Heat-loss core

`heatcalc-heat-loss-core` is the dependency-free calculation and validation
library used by HeatCalc's backend and reusable Python clients.

The package owns heat-loss formulas, mathematical validation, physical
profiles, conductivity laws, and finite-result checks. It does not know about
the HeatCalc application, catalogs, database, API, or UI. The caller resolves
catalog records into conductivity laws and temperature intervals before the
call.

## Public API

There is one recommended entrypoint per calculation domain:

```python
from heatcalc_heat_loss_core import (
    PipePreparationInput,
    PipePreparationLayer,
    TankPreparationInput,
    TankPreparationLayer,
    run_pipe_formula,
    run_tank_formula,
)

pipe_outcome = run_pipe_formula(pipe_input)
tank_outcome = run_tank_formula(tank_input)

if pipe_outcome.result is None:
    report = pipe_outcome.report
else:
    result = pipe_outcome.result
```

Each `run_*_formula` validates its catalog-free input, prepares the resolved
calculation, executes exactly one numerical kernel, and returns either a result
or a non-empty validation report. A successful outcome never contains blocking
errors.

Pipe has one `safety_factor: float | None`: `None` selects the profile default,
while every number—including `0.0`—is treated as explicitly supplied and then
validated against the pipe range. Tank requires an explicit safety factor.

`heatcalc_heat_loss_core.api.__all__` and the package-root `__all__` are the
same stable high-level interface. Low-level `calculate_*`, contract validators,
and prepared execution kernels remain available from their owning submodules
for advanced use, but are not alternative public application entrypoints.

## Development

Run the standalone checks from this directory:

```bash
python -m pip install -e .
python -m pytest tests
ruff check src tests
mypy src tests
```
