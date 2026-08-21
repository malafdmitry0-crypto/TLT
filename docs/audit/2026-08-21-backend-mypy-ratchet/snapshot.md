# Backend strict-mypy migration baseline

- HEAD at measurement start: `07210adf12a7051e9c2714c5a910ab9ef4af8fd7`
- Measured at: `2026-08-21T17:58:23Z`
- Environment: development backend Docker image, Python 3.11, strict mypy
- Command: `mypy app --exclude app/tests/ --no-pretty`

Initial measurement before Wave 1 was 389 production errors. Typing the core
dependency guards removed 98 downstream API errors in addition to the 16 core
errors. The active shrink-only baseline after Wave 1 is:

| Zone | Maximum errors |
|---|---:|
| core | 0 |
| services_infrastructure | 0 |
| api | 92 |
| reports_specification | 36 |
| other | 39 |

<!-- mypy-ratchet-baseline: {"core": 0, "services_infrastructure": 0, "api": 92, "reports_specification": 36, "other": 39} -->

The executable gate reads the marker above. A wave may only reduce its value;
raising any zone limit is not an accepted way to make the gate green.
