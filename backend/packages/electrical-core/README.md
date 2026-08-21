# Electrical core

`heatcalc-electrical-core` is the dependency-free electrical heat-tracing
calculation and validation library used by HeatCalc's backend and reusable
Python clients.

The package owns electrical formula contracts, mathematical validation, and
finite-result checks. It accepts caller-supplied, typed immutable catalog data
when a formula needs it, but it does not know about catalog databases,
activation rules, loaders, I/O, HTTP, or UI. Callers translate domain outcomes
into transport and localized presentation at the application boundary.

Formula calls return `TTFormulaOutcome`: either a result or a non-empty
`TTFormulaReport`, never both. Validation issues and domain errors carry stable
machine-readable codes, paths, and immutable details.

## Public API

`run_tt_formula` is the single high-level calculation entrypoint. It validates
the complete `TTPreparationInput`, executes the TT calculation once, and
returns a result or a non-empty report:

```python
from heatcalc_electrical_core import TTPreparationInput, run_tt_formula

outcome = run_tt_formula(preparation)
if outcome.result is None:
    report = outcome.report
else:
    result = outcome.result
```

`list_tt_cable_options` is the high-level, catalog-backed candidate-listing
entrypoint. `catalog_bundle_from_payload` translates already-resolved catalog
payloads into immutable `CatalogBundle` data; loading, aliases, activation
policy, and catalog provenance remain application concerns.

`compute_tank_cable_length` is the canonical Decimal geometry helper for the
TT tank layout. Low-level selectors, section planning, validation helpers, and
prepared execution internals remain available from their owning submodules for
advanced use, but are not alternative application calculation entrypoints.

The package-root `__all__` and `heatcalc_electrical_core.api.__all__` are the
same stable high-level interface.

## Development

Run standalone checks from this directory:

```bash
python -m pip install -e .
python -m pytest tests
ruff check src tests
mypy src tests
```
