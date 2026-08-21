# Backend strict-mypy migration baseline

- HEAD at measurement start: `07210adf12a7051e9c2714c5a910ab9ef4af8fd7`
- Measured at: `2026-08-21T17:58:23Z`
- Environment: development backend Docker image, Python 3.11, strict mypy
- Command: `mypy app --exclude app/tests/ --no-pretty`

Initial measurement before Wave 1 was 389 production errors. The staged
migration (core, services/infrastructure, API, reports/specification, then the
remaining production modules) has reduced the strict result to zero. The
active shrink-only baseline is now also the global zero-error gate:

| Zone | Maximum errors |
|---|---:|
| core | 0 |
| services_infrastructure | 0 |
| api | 0 |
| reports_specification | 0 |
| other | 0 |

<!-- mypy-ratchet-baseline: {"core": 0, "services_infrastructure": 0, "api": 0, "reports_specification": 0, "other": 0} -->

The executable gate reads the marker above. Every production zone must remain
at zero; raising a zone limit is not an accepted way to make the gate green.
