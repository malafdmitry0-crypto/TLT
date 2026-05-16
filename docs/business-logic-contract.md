# Business Logic Contract

Этот документ фиксирует действующий контракт приложения для формул,
алгоритмов и справочников. При расхождении старой документации с этим файлом
приоритет у этого контракта, `docs/tnp/correctness-review.md` и
machine-readable registry QA-agent.

## Source Priority

1. Этот файл — главный контракт текущей реализации.
2. `docs/tnp/` — ТНП Markdown, VSDX-алгоритмы и пользовательские скрины.
3. `docs/tnp/correctness-review.md` — инженерные решения по спорным местам.
4. `qa-agent/examples/tlt-formulas.registry.yaml` — deterministic registry.
5. `backend/app/reference_data/*.json` и `backend/app/formulas/**` —
   реализация, проверяемая против контракта.
6. Tests/e2e/QA-agent reports — evidence, что контракт соблюдается.

## Heat Loss

| ID | Правило | Источник | Реализация | Evidence |
|---|---|---|---|---|
| `tlt_pipe_total_heat_loss` | `Q = q_linear * (L + ΣLдоп) * K` | `docs/tnp/block-heat-loss-and-cable-selection/pipe-heat-loss-and-cable-selection.md` | `backend/app/formulas/heat_loss/pipe.py` | `backend/app/tests/unit/formulas/test_pipe_heat_loss.py` |
| `tlt_pipe_heat_loss_no_double_k` | В электрический подбор трубы передается `heat_loss_per_meter` без уже примененного `K` | `docs/tnp/correctness-review.md` | `backend/app/services/calculation_service.py` | `backend/app/tests/unit/services/test_no_double_safety.py` |
| `tlt_tank_external_resistance` | Для резервуара flat-wall `Rвнеш = 1 / alpha`, не трубная формула | `docs/tnp/block-heat-loss-and-cable-selection/tank-heat-loss-and-cable-selection.md` | `backend/app/formulas/heat_loss/tank.py` | `backend/app/tests/unit/formulas/test_tank_heat_loss.py` |
| `tlt_rectangular_tank_perimeter` | Периметр прямоугольного резервуара `P = 2 * (L + B)` | `docs/tnp/block-heat-loss-and-cable-selection/tank-heat-loss-and-cable-selection.md` | `backend/app/formulas/electrical/cable_geometry.py` | `backend/app/tests/unit/formulas/test_cable_geometry.py` |
| `tlt_tank_heat_loss_no_double_k` | Для резервуара в электрический подбор идет `(total_heat_loss / K) / cable_length` | `docs/tnp/correctness-review.md` | `backend/app/services/calculation_service.py` | `backend/app/tests/unit/services/test_no_double_safety.py` |

## TNP Algorithms

| ID | Правило | Источник | Реализация | Evidence |
|---|---|---|---|---|
| `tlt_climate_safety_factor` | Труба `D >= 100`: `K=1.1`, `T=T1`; труба `D < 100`: `K=1.12`, `T=T0`; не-трубы: `K=1.1`, холодная пятидневка `0.92` | `docs/tnp/algorithms/climate.md` | QA-agent oracle, параметры расчета backend | `qa-agent/tests/AlgorithmOracle.test.ts` |
| `tlt_max_winding_coefficient` | `D < 57 -> 1.0`; `D=57 -> 1.1`; `57<D<=75 -> 1.2`; `75<D<=89 -> 1.3`; `89<D<=108 -> 1.4`; `D>108 -> 1.5` | `docs/tnp/algorithms/winding.md` | QA-agent oracle; UI/backend должны не превышать этот максимум | `qa-agent/tests/AlgorithmOracle.test.ts` |
| `tlt_tt_series_limits_inclusive` | Температурные пределы ТТН/ТТВ/ТТХ включительные: `65/85`, `120/210`, `150/250` | `docs/tnp/algorithms/self-regulating-pipe-selection.md` | `backend/app/formulas/electrical/self_regulating.py` | `qa-agent/tests/AlgorithmOracle.test.ts`, `backend/app/tests/unit/formulas/test_self_regulating_tt.py` |

## Resistive Catalogs

| ID | Правило | Источник | Реализация | Evidence |
|---|---|---|---|---|
| `tlt_tt_r1_catalog` | Одножильный ТТ Р1: питание до `~600 В`, `50 Гц`, схемы линия/петля/звезда, формат заказа, таблица сопротивлений/сечений/диаметров/длин секций | `docs/tnp/internal-references/resistive-cable-r1.md` | `backend/app/reference_data/resistive_cables.json` | `backend/app/tests/unit/reference_data/test_loader.py` |
| `tlt_tt_r3_catalog` | Трехжильный ТТ Р3: температуры, сечения жил, строительная длина `200 м`, маркировка, таблица габаритов/массы/радиуса изгиба | `docs/tnp/internal-references/resistive-cable-r3.md` | `backend/app/reference_data/resistive_cables.json` | `backend/app/tests/unit/reference_data/test_loader.py` |

`standard_supply_voltage_v = 380` и `max_linear_power_w_m = 50` для `ТТ Р3`
остаются legacy fields из прежнего справочника. Если они станут hard business
limit, нужен отдельный источник/скрин и отдельный тест на эти поля.

## Change Rule

Любой новый функционал, затрагивающий расчеты, должен сначала обновить:

1. этот контракт;
2. `docs/qa/business-logic-coverage.md`;
3. `codex-docs/business-formula-contracts.json`;
4. `qa-agent/examples/tlt-formulas.registry.yaml`, если есть формула/алгоритм;
5. backend/reference implementation;
6. deterministic tests;
7. API/UI/e2e evidence, если меняется пользовательский поток.
