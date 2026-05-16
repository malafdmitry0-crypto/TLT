# QA Agent Example Documentation

## Compound Interest

Requirement `compound_interest`: calculate compound interest:

`A = P * (1 + r / n) ** (n * t)`

Inputs:
- `P`: principal, `P >= 0`
- `r`: annual rate, `r >= 0`
- `n`: compounding periods, `n >= 1`
- `t`: years, `t >= 0`

The deterministic oracle is the source of truth for numeric correctness.

## Circle Area

Requirement `circle_area`: calculate `area = pi * r ** 2`.
For metamorphic checks, `area(2r)` should be approximately `4 * area(r)`.

## Linear Function

Requirement `linear_function`: calculate `y = m * x + b`, including zero and
negative values.
