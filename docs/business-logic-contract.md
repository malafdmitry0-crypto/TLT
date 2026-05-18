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

## Full Version Rule

Целевое состояние проекта — полная версия ТНП-логики. Ранняя поставка,
частичная реализация или временное упрощение не являются приемлемым
бизнес-статусом для формул, алгоритмов и справочников. Если поведение не
покрывает ТНП-контракт полностью, оно маркируется как `Needs implementation`,
`Needs correction` или `Needs business decision`.

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
| `tlt_climate_safety_factor` | Труба `D >= 100`: `K=1.1`, `T=T1`; труба `D < 100`: `K=1.12`, `T=T0`; не-трубы: `K=1.1`, холодная пятидневка `0.92` | `docs/tnp/algorithms/climate.md` | QA-agent oracle, backend resolver in `CalculationService` | `qa-agent/tests/AlgorithmOracle.test.ts`, `backend/app/tests/unit/services/test_calculation_service_unit.py` |
| `tlt_max_winding_coefficient` | `D < 57 -> 1.0`; `D=57 -> 1.1`; `57<D<=75 -> 1.2`; `75<D<=89 -> 1.3`; `89<D<=108 -> 1.4`; `D>108 -> 1.5` | `docs/tnp/algorithms/winding.md` | QA-agent oracle; backend hard-limit for explicit/geometric winding coefficient | `qa-agent/tests/AlgorithmOracle.test.ts`, `backend/app/tests/unit/services/test_calculation_service_unit.py` |
| `tlt_self_regulating_tlt_selection` | Для `self_regulating` требуемая мощность `P_треб = required_power_per_meter * safety_factor`; автоподбор ТЛТ проверяет `P`, `T_min <= T_ср`, `T_max >= T_прод` и выбирает минимальный подходящий вариант | `docs/context/formulas-summary.md` | `backend/app/formulas/electrical/self_regulating.py`, `backend/app/services/calculation_service.py` | `backend/app/tests/unit/formulas/test_self_regulating.py`, `backend/app/tests/unit/formulas/test_self_regulating_properties.py` |
| `tlt_self_regulating_thread_source_policy` | Для ТЛТ auto без ручных ниток перебирает `N=1..3`; ручное `number_of_threads` не изменяется алгоритмом; результат хранит `requested_number_of_threads`, `applied_number_of_threads` и `number_of_threads_source` | `docs/context/formulas-summary.md` | `backend/app/formulas/electrical/self_regulating.py`, `backend/app/schemas/calculation.py`, `frontend/src/pages/ElecCalcPage.tsx` | `backend/app/tests/unit/formulas/test_self_regulating.py`, `backend/app/tests/unit/services/test_calculation_service_unit.py` |
| `tlt_tt_series_limits_inclusive` | Температурные пределы ТТН/ТТВ/ТТХ включительные: `65/85`, `120/210`, `150/250` | `docs/tnp/algorithms/self-regulating-pipe-selection.md` | `backend/app/formulas/electrical/self_regulating.py` | `qa-agent/tests/AlgorithmOracle.test.ts`, `backend/app/tests/unit/formulas/test_self_regulating_tt.py` |
| `tlt_tt_t3_power_curve` | Для ТТН/ТТВ/ТТХ `T1=process_temperature` и `T2=vapor_temperature` выбирают серию, а паспортная мощность считается отдельно: `q_b(T3)=q1*T3+q2`; `maintain_temperature` опционален, при отсутствии используется `T1` для совместимости старых запросов | `docs/tnp/algorithms/self-regulating-pipe-selection.md` | `backend/app/schemas/calculation.py`, `backend/app/formulas/electrical/self_regulating.py`, `frontend/src/pages/ElecCalcPage.tsx`, `qa-agent/src/oracle/FormulaOracle.ts` | `backend/app/tests/unit/formulas/test_self_regulating_tt.py`, `backend/app/tests/unit/services/test_calculation_service_unit.py`, `qa-agent/tests/FormulaOracle.test.ts` |
| `tlt_tt_thread_count_policy` | Серия выбирается по температурам; если мощности линейки не хватает, используется максимальный номинал серии и `N = ceil(Pоб / Pi.ном(T3))`, без эскалации серии только из-за ограничения ниток | `docs/tnp/algorithms/self-regulating-pipe-selection.md` | `backend/app/formulas/electrical/self_regulating.py`, `backend/app/schemas/calculation.py` | `backend/app/tests/unit/formulas/test_self_regulating_tt.py` |
| `tlt_tt_mark_suffix_policy` | Принятое инженерное решение: `aggressive_product -> СТ`, иначе `СР`; parsed `R=1 -> СР` считается неоднозначностью схемы/OCR | `docs/tnp/algorithms/self-regulating-pipe-selection.md`, `docs/tnp/correctness-review.md` | `backend/app/formulas/electrical/self_regulating.py`, `frontend/src/pages/ElecCalcPage.tsx` | `backend/app/tests/unit/formulas/test_self_regulating_tt.py` |

Подробная оценка качества парсинга VSDX/PDF-алгоритмов:
`docs/tnp/algorithm-parsing-coverage-audit.md`.

| Parsed algorithm | Статус отражения | Комментарий |
|---|---|---|
| Климат | Отражен | Правило закреплено в deterministic oracle и backend resolver. |
| Навив | Отражен с инженерной нормализацией | Границы `75/89/108` заполнены как верхне-включительные; backend валидирует explicit/geometric `Kn` как hard-limit. |
| ТЛТ self-regulating | Отражен | Подбор по мощности/температурам, auto `N=1..3`, ручной override ниток и source metadata закреплены в backend tests. |
| ТТН/ТТВ/ТТХ | Отражен | Series limits, T1/T2/T3, full-version `N=ceil(Pоб/Pi)` и принятое правило суффикса покрыты backend tests. |
| Резистивный подбор | Отражен для текущей full-version формализации | Backend и QA-agent реализуют перебор `M -> петля 220 -> петля 380 -> звезда 380`, `p2/p3`, `L1/L2` и лимит `65 А`; лимиты могут приходить из `correction_coefficients` с fallback. |

## Resistive Catalogs

| ID | Правило | Источник | Реализация | Evidence |
|---|---|---|---|---|
| `tlt_tt_r1_catalog` | Одножильный ТТ Р1: питание до `~600 В`, `50 Гц`, схемы линия/петля/звезда, формат заказа, таблица сопротивлений/сечений/диаметров/длин секций | `docs/tnp/internal-references/resistive-cable-r1.md` | `backend/app/reference_data/resistive_cables.json` | `backend/app/tests/unit/reference_data/test_loader.py` |
| `tlt_tt_r3_catalog` | Трехжильный ТТ Р3: температуры, сечения жил, строительная длина `200 м`, маркировка, таблица габаритов/массы/радиуса изгиба | `docs/tnp/internal-references/resistive-cable-r3.md` | `backend/app/reference_data/resistive_cables.json` | `backend/app/tests/unit/reference_data/test_loader.py` |
| `tlt_tt_r1_resistance_based_power` | Для паспортных резистивных кабелей: `R = resistance_ohm_km / 1000 * L`, `P = U²/R`, `I = P/U`, ток не выше `65 А` | `docs/tnp/internal-references/resistive-cable-r1.md`, `docs/tnp/algorithms/resistive-selection.md` | `backend/app/formulas/electrical/resistive.py`, `qa-agent/src/oracle/AlgorithmOracle.ts` | `backend/app/tests/unit/formulas/test_resistive.py`, `qa-agent/tests/AlgorithmOracle.test.ts` |
| `tlt_resistive_selection_algorithm_full` | Full-version auto mode: каталог сортируется по `Q(i,1)` по убыванию; для `M=1..max` проверяются петля `U=start`, петля `U=high`, звезда `U=high`; `p2` считается как per-thread W/m, `p3=min(Imax²*Rм, optional max_linear_power_w_m)`, выбранный вариант должен покрыть `p1=Q/L`; результат возвращает `U`, `N`, `M`, `L1/L2`, `p2/p3` | `docs/tnp/algorithms/resistive-selection.md` | `backend/app/formulas/electrical/resistive.py`, `backend/app/services/calculation_service.py`, `qa-agent/src/oracle/AlgorithmOracle.ts` | `backend/app/tests/unit/formulas/test_resistive.py`, `backend/app/tests/unit/services/test_calculation_service_unit.py`, `qa-agent/tests/AlgorithmOracle.test.ts` |

`standard_supply_voltage_v = 380` и `max_linear_power_w_m = 50` для `ТТ Р3`
остаются legacy fields из прежнего справочника. Если они станут hard business
limit, нужен отдельный источник/скрин и отдельный тест на эти поля.

## Known Algorithm Gaps

Подробная сверка алгоритмов с проектом: `docs/tnp/project-reconciliation-audit.md`.

| ID | Статус | Что важно |
|---|---|---|
| `tlt_resistive_selection_algorithm_full` | Covered with formalized fallback policy | Реализован deterministic backend/QA-agent oracle по `U/N/M`, `p2/p3`, `L1/L2`. Оставшийся риск: точные заводские thermal `p3`-лимиты должны быть заполнены в БД; до этого работает fallback по `65 А`. |
| `tlt_tt_t3_temperature_policy` | Covered | `maintain_temperature` является отдельным T3; если он отсутствует, backend использует `process_temperature` как совместимый fallback. |
| `tlt_insulation_lambda_tm` | Covered | Backend/QA-agent считают `lambda(tm)` по ТНП. Generic семьи (`mineral_wool`, `foam_glass`, `polyurethane` и т.п.) не являются расчётными материалами; нужен конкретный код с плотностью и `insulation_temperature_basis`. JSON-справочник сидируется в `insulation_materials`, `/references/insulation` читает DB projection. |

## Change Rule

Любой новый функционал, затрагивающий расчеты, должен сначала обновить:

1. этот контракт;
2. `docs/qa/business-logic-coverage.md`;
3. `codex-docs/business-formula-contracts.json`;
4. `qa-agent/examples/tlt-formulas.registry.yaml`, если есть формула/алгоритм;
5. backend/reference implementation;
6. deterministic tests;
7. API/UI/e2e evidence, если меняется пользовательский поток.
