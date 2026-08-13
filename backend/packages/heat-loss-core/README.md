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

The caller remains responsible for persistence, catalog record selection,
climate and project policy, Pydantic/API adaptation, localized messages,
rounding for presentation, and result serialization.

Public entry points are exported from `heatcalc_heat_loss_core`. The main
resolved calculation APIs are `evaluate_pipe`, `evaluate_resolved_air_tank`,
and `evaluate_resolved_buried_tank`. Inputs contain resolved numerical laws and
temperature intervals rather than database or catalog identifiers.

Run the standalone checks from this directory:

```bash
python -m pip install -e .
python -m pytest tests
ruff check src tests
mypy src tests
```
