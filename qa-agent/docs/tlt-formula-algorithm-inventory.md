# TLT Formula And Algorithm Inventory

This inventory links the current backend implementation to QA-agent registry
entries. It is intentionally stricter than a source-code summary: backend code
is the app under test, not the final numeric oracle.

## Heat Loss: Pipe

Implementation: `backend/app/formulas/heat_loss/pipe.py`

Core formulas:

- Outdoor alpha: `alpha = clamp(11.6 + 7 * sqrt(v), 11.6, 52)`.
- Cylindrical layer resistance: `R = ln(r_out / r_in) / (2 * pi * lambda)`.
- External resistance: `R_ext = 1 / (2 * pi * r_outer * alpha)`.
- Ground resistance: `R_ground = arccosh(H / r_outer) / (2 * pi * lambda_ground)`.
- Linear heat loss: `q_linear = deltaT / R_total`.
- Effective length: `L_eff = L + n_i * L_ekv`.
- Total heat loss: `Q = q_linear * L_eff * K`.
- Electrical handoff: `required_power_per_meter = q_linear`, without applying
  heat-loss `K` a second time.

QA status:

- Independent primitives are implemented in `FormulaOracle`.
- The no-double-K electrical handoff is registered as
  `tlt_pipe_electrical_required_power_per_meter`.
- Full multilayer formula is registered as `external_reference_required`.
- Backend mappings exist for `/api/v1/admin/formula-check` with `formula_type=pipe`
  and `/api/v1/calc/heat-loss`.

Engineering review:

- The model is physically coherent for cylindrical steady-state conduction.
- Highest risk areas are safety-factor double application, material conductivity
  table lookup, `H / r_outer` close to 1, and local element length.
- A full deterministic oracle should use certified examples from standards or
  project documentation, not a Python import from `backend/app/formulas`.

## Heat Loss: Tank

Implementation: `backend/app/formulas/heat_loss/tank.py`

Core formulas:

- Cylindrical area: `S = pi * d * h + 2 * pi * (d / 2)^2`.
- Rectangular area: `S = 2 * (L * W + L * H + W * H)`.
- Spherical area: `S = 4 * pi * (d / 2)^2`.
- Flat-wall heat flux: `q = deltaT / (R_wall + R_ins + R_ext)`.
- External resistance: `R_ext = 1 / alpha`.
- Underground split: air and ground heat fluxes are area-weighted separately.
- Total heat loss: `Q = q * S * K + q_additional` for above-ground mode.
- Electrical handoff: `required_power_per_meter = (total_heat_loss / K) / cable_length`.

QA status:

- Surface areas, flat heat-flux primitive and total multiplication primitive are
  implemented in `FormulaOracle`.
- Flat-wall external resistance and no-double-K electrical handoff are
  implemented as `tlt_tank_external_resistance` and
  `tlt_tank_electrical_required_power_per_meter`.
- Full tank formula is registered as `external_reference_required`.
- Backend mappings exist for `/api/v1/admin/formula-check` with `formula_type=tank`.

Engineering review:

- Flat-wall approximation is common for large tanks, but small diameter with
  thick insulation should be checked against cylindrical shell references.
- `q_additional` is added after safety factor in backend; tests should lock this
  ordering explicitly.
- Underground split needs edge cases for `burial_depth == height`,
  `burial_depth > height`, and mixed air/ground areas.

## Electrical: Tank Cable Geometry

Implementation: `backend/app/formulas/electrical/cable_geometry.py`

Algorithm:

- Cylindrical perimeter: `pi * diameter`.
- Rectangular perimeter: `2 * (length + width)`.
- Cable length: `(perimeter / 2) * (heating_height / laying_step)`.
- Laying step range: `0.05..0.5 m`.

QA status:

- Implemented in `AlgorithmOracle` as `tlt_tank_cable_length`.
- Backend mapping exists for `/api/v1/admin/formula-check` with
  `formula_type=tank_cable_geometry`.

Engineering review:

- The `perimeter / 2` factor is a business/domain rule, not obvious geometry.
  It must stay tied to documentation and regression tests.

## TNP Climate Rule

Source: `docs/tnp/algorithms/climate.md`

Algorithm:

- Pipe with `D >= 100 mm`: `K = 1.1`, design temperature `T1`.
- Pipe with `D < 100 mm`: `K = 1.12`, design temperature `T0`.
- Non-pipe/tank: `K = 1.1`, design temperature from cold five-day `0.92`.

QA status:

- Implemented in `AlgorithmOracle` as `tlt_climate_safety_factor`.
- Registry examples cover `D = 99`, `D = 100` and non-pipe/tank flow.

Engineering review:

- The backend currently obtains climate values through reference data and form
  parameters rather than one centralized oracle. QA-agent should use this
  deterministic rule to verify API/UI payloads preserve the same contract.

## TNP Max Winding Coefficient

Source: `docs/tnp/algorithms/winding.md`

Algorithm:

- `D < 57 -> Kn = 1.0`.
- `D = 57 -> Kn = 1.1`.
- `57 < D <= 75 -> Kn = 1.2`.
- `75 < D <= 89 -> Kn = 1.3`.
- `89 < D <= 108 -> Kn = 1.4`.
- `D > 108 -> Kn = 1.5`.

QA status:

- Implemented in `AlgorithmOracle` as `tlt_max_winding_coefficient`.
- Registry examples cover `D = 57`, `75`, `89`, `108` and values around the
  end bands.

Engineering review:

- The source flowchart left `75`, `89` and `108` open. QA-agent uses the upper
  inclusive lower band because this is the conservative interpretation for a
  maximum allowed winding coefficient.

## Electrical: Self-Regulating TLT

Implementation: `backend/app/formulas/electrical/self_regulating.py`

Algorithm:

- `required_effective = required_power_per_meter * safety_factor`.
- Auto-select the minimum-power catalog cable satisfying power, min ambient
  temperature and max process temperature.
- If `number_of_threads` is absent in auto mode, try `N=1..3`; if it is
  explicit, keep the requested value and do not increase it silently.
- Candidate ordering is deterministic: lower `N`, then lower catalog
  `power_per_meter`, then lower installed `power_per_meter * N`.
- `layout_factor = winding_coefficient * applied_number_of_threads`.
- `cable_length = pipe_length * 1.1 * layout_factor`.
- `total_power = cable_power_per_meter * cable_length`.
- Result metadata separates user input from calculated state:
  `requested_number_of_threads`, `applied_number_of_threads` and
  `number_of_threads_source`.

QA status:

- Cable length primitive is implemented in `FormulaOracle`.
- Minimum sufficient cable selection is implemented in `AlgorithmOracle` with an
  explicit catalog fixture.
- Backend mapping exists for `/api/v1/admin/formula-check` with
  `formula_type=electrical`.

Engineering review:

- The main historical risk is applying the heat-loss safety factor once in heat
  loss and again in electrical selection. The contract says electrical receives
  `q_linear` without heat-loss `K`.
- A second historical risk is treating calculated `num_circuits` as if the user
  had manually requested that thread count. Current contract keeps requested and
  applied thread counts separate.
- Catalog fixtures should test temperature rejection, power rejection and ties.

## Electrical: TTН / TTВ / TTХ

Implementation: `backend/app/formulas/electrical/self_regulating.py`

Algorithm:

- Select minimal series by product/vapor temperature limits.
- Power curve: `q_b = q1 * T3 + q2`; `maintain_temperature` is `T3` from
  the parsed VSDX. If it is absent, current backend/registry uses
  `process_temperature` as a compatibility fallback.
- If threads are not fixed and the selected series cannot cover `Pоб` in one
  thread, choose the max nominal in that temperature series and compute
  `N = ceil(Pоб / Pi.ном(T3))`; do not escalate series only to keep `N <= 3`.
- Tank geometry can use `compute_tank_cable_length` as base length.
- Cable mark suffix is `-СТ` for aggressive product, otherwise `-СР`.

QA status:

- Series selection is implemented in `AlgorithmOracle`.
- Power curve is implemented in `FormulaOracle`.
- Backend mapping exists for `/api/v1/admin/formula-check` with
  `formula_type=electrical_tt`.

Engineering review:

- Temperature limits are inclusive rated maximums; boundary values at 65/85,
  120/210 and 150/250 are mandatory.
- The parsed VSDX distinguishes `T1` product, `T2` vapor and `T3` maintain
  temperature. Backend now preserves that split: `process_temperature` selects
  series as `T1`, `vapor_temperature` is `T2`, and `maintain_temperature`
  drives `q_b(T3)`.
- Parsed VSDX counts `N = ceil(Pоб / Pi.ном(T3))` after max nominal selection;
  backend now follows this full-version rule for TTН/TTВ/TTХ auto-selection.
- Parsed `R=1 -> СР` conflicts with the accepted domain interpretation.
  Current contract explicitly fixes `aggressive_product -> СТ`, otherwise `СР`.
- Negative or zero `q_b` must be treated as invalid, not as a selectable cable.

## Electrical: Resistive TT R1 / TT R3

Implementation: `backend/app/formulas/electrical/resistive.py`

Core formulas:

- `rho_T = 0.0175 * (1 + 0.0042 * (T - 20))`.
- Single-core line: `S_k = (Q / U^2) * rho_T * N`.
- Single-core loop: `S_k = (Q / U^2) * rho_T * 2N`.
- Single-core star: `S_k = (Q / (U / sqrt(3))^2) * rho_T * 3N`.
- Three-core schemes add `/3`, `2N/3`, `3N`, `3N/3` or `3N` depending on connection.
- Catalog selection picks the smallest conductor cross-section not below `S_k`.

QA status:

- `rho_T` and single-core cross-section primitives are implemented in
  `FormulaOracle`.
- Cross-section picking is implemented in `AlgorithmOracle`.
- Full R1/R3 calculations are mapped to `/api/v1/admin/formula-check` with
  `formula_type=resistive_single` and `resistive_three`.
- `ТТ Р1` connection/order metadata and visible resistance/section/diameter/
  section-length rows are regression-tested against the latest user-provided
  TNP screenshots.
- `ТТ Р3` common properties and visible size/mass/bend-radius rows are
  regression-tested against the latest user-provided TNP screenshots.

Engineering review:

- Connection-type multipliers are the highest risk: every supported branch needs
  at least one fixed case and one near-threshold catalog case.
- Constants `0.0175` and `0.0042` are mutation-testing targets.
- For catalog rows with passport `resistance_ohm_km`, backend now computes
  `R = resistance_ohm_km / 1000 * L`, `P = U^2/R`, `I = P/U` and rejects
  passport candidates above `65 A`.
- The parsed TNP resistive algorithm is broader than this base oracle: it sorts
  `Q(i,1)`, computes `p2/p3`, applies the `65 A` current limit and iterates
  `U/N/M`. Full `U/N/M`, `L1/L2` auto-selection still needs formalization.
- `ТТ Р3` legacy fields `standard_supply_voltage_v` and `max_linear_power_w_m`
  still need source-page confirmation if they are used as hard business limits.

## Electrical: Mineral Cable

Implementation: `backend/app/formulas/electrical/mineral.py`

Status:

- Backend raises `NotImplementedError`.
- Registry status is `not_implemented`.

Engineering review:

- UI/API should classify this as unsupported until formula documentation and a
  deterministic oracle exist.

## Specification Builder

Implementation: `backend/app/formulas/specification/builder.py`

Algorithm:

- Sum cable lengths by `cable_mark` or `selected_cable`.
- Add basic accessories per total object count, not only successful calculations.
- Sort items by category and name.

QA status:

- Registered as `external_reference_required`; it needs an explicit accessory
  catalog fixture before becoming a deterministic oracle.

Engineering review:

- The accessory count rule is business-critical. DB invariants after batch
  flows should check that failed electrical objects do not silently remove
  required accessories.
