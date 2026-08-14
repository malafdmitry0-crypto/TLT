# HL-APP-AF architecture searches

HEAD: `0ecb39edc277a38cd2a3291b842cb5e8612e9d73`
Host search root: `backend/app` and `backend/packages/heat-loss-core`
Mutants / tests excluded from production claims.

## Formula models imported from `app.schemas.heat_loss`

Production `from app.schemas.heat_loss import` (non-test):

- `app/schemas/calculation.py` — re-export only (`InsulationLayer`, `InsulationLayerApplied`, pipe/tank params/results, stored params)
- `app/formulas/heat_loss/pipe.py`
- `app/formulas/heat_loss/tank.py`
- `app/formulas/heat_loss/pipe_preparation.py`
- `app/formulas/heat_loss/tank_preparation.py`
- `app/formulas/heat_loss/evaluator.py`
- `app/services/heat_loss_application.py`
- `app/services/project_object_params.py` — stored params
- `app/api/v1/admin.py` — `PipeHeatLossParams`, `TankHeatLossParams`

No production file outside `calculation.py` / `heat_loss.py` imports those formula names from `app.schemas.calculation`. API wrappers (`HeatLossRequest`, `HeatLossResponse`, `BatchCalcResponse`, `HeatLossBatchJobRequest`) stay on `calculation`. Tests may still import formula models via the re-export. `test_heat_loss_schema_import_ratchet.py` passed in the focused suite.

## `coefficients` absent on facade / evaluator

`rg coefficients backend/app/formulas/heat_loss` → no matches.

Signatures:

- `calc_pipe_heat_loss(params: PipeHeatLossParams) -> PipeHeatLossResult`
- `calc_tank_heat_loss(params: TankHeatLossParams) -> TankHeatLossResult`
- `evaluate_validated_heat_loss(params: PipeHeatLossParams | TankHeatLossParams) -> PipeHeatLossResult | TankHeatLossResult`

Admin K is applied in `heat_loss_application.pipe_params_with_effective_safety_factor` before the facade.

## `calc_alpha_vnesh` / `tank._calc_alpha`

`rg calc_alpha_vnesh|_calc_alpha backend/app` → no matches.

## Payload builder and climate live in application

Defined in `app/services/heat_loss_application.py`:

- `build_heat_loss_error_payload` (line 61)
- `apply_climate_policy` (line 232)

`calculation_service.py` re-exports both and aliases `_apply_climate_policy = apply_climate_policy`. Implementations are not duplicated in production `calculation_service`.

## `HeatLossPreparationError` first

`build_heat_loss_error_payload` returns immediately on `isinstance(exc, HeatLossPreparationError)` (uses `exc.code` / `exc.category` / `exc.message` / `exc.path`). No message parse on that branch. Missing path raises `RuntimeError`.

## Residual substring markers = existing A6 housing

After the structured catalog branch, `heat_loss_application.py` still classifies **non-facade** exceptions with:

- `process_temperature_not_above_ambient` / `process_temperature_not_above_ground` substrings
- `ProjectObjectParamsError` reason/code and Russian `"неподдерживаемый тип объекта"` / `"режим tm"`
- `ValidationError` → `schema_validation_error`
- `"неподдерживаемый тип объекта"` / `"неизвестная форма"`
- marker list (`требует`, `требуются`, `требуется`, `долж`, `диапазон`, `положитель`, `выше`, `ниже`, `превыш`, `не может`)
- else `heat_loss_formula_error`

AF did not change these.

## `_catalog_error_code` allowed

Present in `app/formulas/heat_loss/catalog_preparation.py` (maps catalog messages to `unknown_insulation_material` / `missing_insulation_interval` / `unselectable_insulation_material` / `insulation_catalog_error`). Not treated as a facade substring classifier.

## Application does not import `calculation_service`

`heat_loss_application.py` imports `CalculationError` from `app.services.calculation_errors`. No `calculation_service` import.

## Package has no `app.*` imports

`rg 'from app\.|import app' backend/packages/heat-loss-core/src` → no matches.

## No `app.formulas.heat_loss.core` shim

`backend/app/formulas/heat_loss/` has no `core.py` / `core/` directory. The only remaining `app.formulas.heat_loss.core` string is the forbidden-prefix check in `test_heat_loss_core_package_imports.py`.
