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
| `tlt_pipe_total_heat_loss` | `Q = q_linear * (L + ΣLдоп) * K`; `Lдоп=Σ(l_i*n_i)`. `location_*` и `wind_factor` не применяются. | `ТНП/Блок теплопотери и выбор кабеля/теплопротери в трубопроводах 30.04.docx`; `docs/tnp/block-heat-loss-and-cable-selection/pipe-heat-loss-and-cable-selection.md` | `backend/app/formulas/heat_loss/pipe.py` | `backend/app/tests/unit/formulas/test_pipe_heat_loss.py`, `backend/app/tests/unit/formulas/test_pipe_properties.py` |
| `tlt_pipe_heat_loss_no_double_k` | В электрический подбор трубы передается `heat_loss_per_meter` без уже примененного `K` | `docs/tnp/correctness-review.md` | `backend/app/services/calculation_service.py` | `backend/app/tests/unit/services/test_no_double_safety.py` |
| `tlt_tank_external_resistance` | Для резервуара flat-wall `Rвнеш = 1 / alpha`, не трубная формула | `docs/tnp/block-heat-loss-and-cable-selection/tank-heat-loss-and-cable-selection.md` | `backend/app/formulas/heat_loss/tank.py` | `backend/app/tests/unit/formulas/test_tank_heat_loss.py` |
| `tlt_tank_total_heat_loss` | Для резервуара `Q = q * S * K + Qдоп`; для подземного резервуара `Q=(q_возд*S_возд + q_гр*S_гр)*K + Qдоп`; `Qдоп` прибавляется после K. | `ТНП/Блок теплопотери и выбор кабеля/теплопротери в резервуарах 30.04.docx`; `docs/tnp/block-heat-loss-and-cable-selection/tank-heat-loss-and-cable-selection.md` | `backend/app/formulas/heat_loss/tank.py` | `backend/app/tests/unit/formulas/test_tank_heat_loss.py`, `backend/app/tests/unit/formulas/test_tank_properties.py` |
| `tlt_rectangular_tank_perimeter` | Периметр прямоугольного резервуара `P = 2 * (L + B)` | `docs/tnp/block-heat-loss-and-cable-selection/tank-heat-loss-and-cable-selection.md` | `backend/app/formulas/electrical/cable_geometry.py` | `backend/app/tests/unit/formulas/test_cable_geometry.py` |
| `tlt_tank_heat_loss_no_double_k` | Для резервуара в электрический подбор идет `(total_heat_loss / K) / cable_length` | `docs/tnp/correctness-review.md` | `backend/app/services/calculation_service.py` | `backend/app/tests/unit/services/test_no_double_safety.py` |
| `tlt_insulation_lambda_tm` | Для справочных материалов изоляции используется `lambda(tm)`: теплые режимы `tm=(Tж+40)/2`, `outdoor_winter -> tm=Tж/2`; generic семейства не являются расчетными материалами | `Внутренние справочники/Теплоизоляция.docx`; `backend/app/reference_data/insulation.json` | `backend/app/formulas/heat_loss/insulation.py`, `backend/app/reference_data/loader.py` | `backend/app/tests/unit/reference_data/test_loader.py`, `backend/app/tests/unit/formulas/test_pipe_properties.py` |
| `tlt_heat_loss_location_factor_removed` | `location_indoor`, `location_outdoor` и `wind_factor` исключены из действующей формулы и applied trace. Результаты прежней версии помечаются stale и требуют пересчёта. | `docs/analysis/heat-loss-tz-deviations.md`; первичные ТНП DOCX/XLSX | `backend/alembic/versions/0032_tnp_heat_loss_formula_v2.py`, `backend/app/services/calculation_service.py` | `backend/app/tests/unit/formulas/test_pipe_heat_loss.py`, `backend/app/tests/unit/formulas/test_tank_heat_loss.py` |

## TNP Algorithms

| ID | Правило | Источник | Реализация | Evidence |
|---|---|---|---|---|
| `tlt_climate_safety_factor` | Труба `D >= 100`: `K=1.1`, `T=T1`; труба `D < 100`: `K=1.12`, `T=T0`; не-трубы: `K=1.1`, холодная пятидневка `0.92`. Климатическая строка выбирается по `climate_key=region|||city`, затем по паре `climate_region + climate_city`; fallback по одному городу допустим только для однозначных городов. | `docs/tnp/algorithms/climate.md` | QA-agent oracle, backend resolver in `CalculationService` | `qa-agent/tests/AlgorithmOracle.test.ts`, `backend/app/tests/unit/services/test_calculation_service_unit.py`, `backend/app/tests/unit/reference_data/test_loader.py` |
| `tlt_max_winding_coefficient` | `D < 57 -> 1.0`; `D=57 -> 1.1`; `57<D<=75 -> 1.2`; `75<D<=89 -> 1.3`; `89<D<=108 -> 1.4`; `D>108 -> 1.5` | `docs/tnp/algorithms/winding.md` | QA-agent oracle; backend hard-limit for explicit/geometric winding coefficient | `qa-agent/tests/AlgorithmOracle.test.ts`, `backend/app/tests/unit/services/test_calculation_service_unit.py` |
| `tlt_self_regulating_tlt_selection` | Для `self_regulating` требуемая мощность `P_треб = required_power_per_meter * safety_factor`; `process_temperature` обязателен для проверки `T_max >= T_прод`; автоподбор ТЛТ проверяет `P`, `T_min <= T_ср`, `T_max >= T_прод` и выбирает минимальный подходящий вариант; ток считается по паспортному `voltage` выбранного кабеля, не по общему `supply_voltage` ЭР | `docs/context/formulas-summary.md` | `backend/app/formulas/electrical/self_regulating.py`, `backend/app/services/calculation_service.py` | `backend/app/tests/unit/formulas/test_self_regulating.py`, `backend/app/tests/unit/formulas/test_self_regulating_properties.py` |
| `tlt_self_regulating_thread_source_policy` | Для ТЛТ auto без ручных ниток перебирает `N=1..3`; ручное `number_of_threads` не изменяется алгоритмом; результат хранит `requested_number_of_threads`, `applied_number_of_threads` и `number_of_threads_source` | `docs/context/formulas-summary.md` | `backend/app/formulas/electrical/self_regulating.py`, `backend/app/schemas/calculation.py`, `frontend/src/pages/ElecCalcPage.tsx` | `backend/app/tests/unit/formulas/test_self_regulating.py`, `backend/app/tests/unit/services/test_calculation_service_unit.py` |
| `tlt_tt_series_limits_inclusive` | Температурные пределы ТТН/ТТВ/ТТХ включительные: `65/85`, `120/210`, `150/250` | `docs/tnp/algorithms/self-regulating-pipe-selection.md` | `backend/app/formulas/electrical/self_regulating.py` | `qa-agent/tests/AlgorithmOracle.test.ts`, `backend/app/tests/unit/formulas/test_self_regulating_tt.py` |
| `tlt_tt_t3_power_curve` | Для ТТН/ТТВ/ТТХ `T1=process_temperature` и `T2=vapor_temperature` выбирают серию, а паспортная мощность считается отдельно: `q_b(T3)=q1*T3+q2`; `maintain_temperature` опционален, при отсутствии используется `T1` для совместимости старых запросов; ток считается по паспортному `voltage` выбранной строки кабеля, `supply_voltage` — только fallback при отсутствии `voltage` | `docs/tnp/algorithms/self-regulating-pipe-selection.md` | `backend/app/schemas/calculation.py`, `backend/app/formulas/electrical/self_regulating.py`, `frontend/src/pages/ElecCalcPage.tsx`, `qa-agent/src/oracle/FormulaOracle.ts` | `backend/app/tests/unit/formulas/test_self_regulating_tt.py`, `backend/app/tests/unit/services/test_calculation_service_unit.py`, `qa-agent/tests/FormulaOracle.test.ts` |
| `tlt_tt_thread_count_policy` | Серия выбирается по температурам; проверка покрытия использует `Pi.ном(T3) × k_навива × N`; если мощности линейки не хватает, используется максимальный номинал серии и `N = ceil(Pоб / (Pi.ном(T3) × k_навива))`, без эскалации серии только из-за ограничения ниток | `docs/tnp/algorithms/self-regulating-pipe-selection.md`, `docs/context/formulas-summary.md` | `backend/app/formulas/electrical/self_regulating.py`, `backend/app/schemas/calculation.py` | `backend/app/tests/unit/formulas/test_self_regulating_tt.py` |
| `tlt_tt_mark_suffix_policy` | По первоисточнику `Расчет_спецификации_трубы_самрег29_05_26.xlsx`: `aggressive_product -> СР`, иначе `СТ` (фикс 2026-06-07, см. `docs/audit/2026-06-07-primary-sources-vs-code.md`); parsed `R=1 -> СР` подтверждён первоисточником | `docs/tnp/algorithms/self-regulating-pipe-selection.md`, `docs/tnp/correctness-review.md`, `docs/audit/2026-06-07-primary-sources-vs-code.md` | `backend/app/formulas/electrical/self_regulating.py`, `frontend/src/pages/electrical/useElecCalcCableMarkOptions.tsx` | `backend/app/tests/unit/formulas/test_self_regulating_tt.py`, `frontend/src/__tests__/unit/pages/electrical/useElecCalcCableMarkOptions.test.tsx` |

Подробная оценка качества парсинга VSDX/PDF-алгоритмов:
`docs/tnp/algorithm-parsing-coverage-audit.md`.

| Parsed algorithm | Статус отражения | Комментарий |
|---|---|---|
| Климат | Отражен | Правило закреплено в deterministic oracle и backend resolver. |
| Навив | Отражен с инженерной нормализацией | Границы `75/89/108` заполнены как верхне-включительные; backend валидирует explicit/geometric `Kn` как hard-limit. |
| ТЛТ self-regulating | Отражен | Подбор по мощности/температурам, auto `N=1..3`, ручной override ниток и source metadata закреплены в backend tests. |
| ТТН/ТТВ/ТТХ | Отражен | Series limits, T1/T2/T3, full-version `N=ceil(Pоб/Pi)` и принятое правило суффикса покрыты backend tests. |
| Резистивный подбор | Отражен для текущей full-version формализации | Backend и QA-agent реализуют перебор `M -> петля 220 -> петля 380 -> звезда 380`, `p2/p3`, `L1/L2`, лимит `65 А` и type-specific default cap `Р1=40`/`Р3=50` Вт/м; лимиты могут уточняться через `correction_coefficients`. |

## Resistive Catalogs

| ID | Правило | Источник | Реализация | Evidence |
|---|---|---|---|---|
| `tlt_tt_r1_catalog` | Одножильный ТТ Р1: питание до `~600 В`, `50 Гц`, линейная мощность до `40 Вт/м`, схемы линия/петля/звезда, формат заказа, таблица сопротивлений/сечений/диаметров/длин секций | `docs/tnp/internal-references/resistive-cable-r1.md` | `backend/app/reference_data/resistive_cables.json` | `backend/app/tests/unit/reference_data/test_loader.py` |
| `tlt_tt_r3_catalog` | Трехжильный ТТ Р3: температуры, сечения жил, линейное тепловыделение до `50 Вт/м`, строительная длина `200 м`, маркировка, таблица габаритов/массы/радиуса изгиба | `docs/tnp/internal-references/resistive-cable-r3.md` | `backend/app/reference_data/resistive_cables.json` | `backend/app/tests/unit/reference_data/test_loader.py` |
| `tlt_tt_r1_resistance_based_power` | Для паспортных резистивных кабелей: `R = resistance_ohm_km / 1000 * L`, `P = U²/R`, `I = P/U`, ток не выше `65 А` | `docs/tnp/internal-references/resistive-cable-r1.md`, `docs/tnp/algorithms/resistive-selection.md` | `backend/app/formulas/electrical/resistive.py`, `qa-agent/src/oracle/AlgorithmOracle.ts` | `backend/app/tests/unit/formulas/test_resistive.py`, `qa-agent/tests/AlgorithmOracle.test.ts` |
| `tlt_resistive_temperature_correction_gap` | Known issue: первичные DOCX формулы мощности резистивных ТТ Р1/ТТ Р3 используют сопротивление при `Tж` через `[1+alpha*(Tж-20)]`, но текущие `P/I`, `p2/p3` и QA-oracle считают по холодному `resistance_ohm_km` без температурной поправки. `required_cross_section` уже использует горячую `rho_T`, поэтому результат внутренне неоднороден. | `docs/analysis/resistive-temperature-tz-deviation.md`, `docs/tnp/block-heat-loss-and-cable-selection/pipe-heat-loss-and-cable-selection.md`, `docs/tnp/block-heat-loss-and-cable-selection/tank-heat-loss-and-cable-selection.md` | `backend/app/formulas/electrical/resistive.py`, `qa-agent/src/oracle/AlgorithmOracle.ts` | Current tests pass but закрепляют cold model; needs focused golden fix |
| `tlt_resistive_selection_algorithm_full` | Full-version auto mode: каталог сортируется по `Q(i,1)` по убыванию; для `M=1..max` проверяются петля `U=start`, петля `U=high`, звезда `U=high`; `p2` считается как W/m единицы схемы VSDX (`p=p2*N*M`; для Р3 — со схемными множителями трехжильного кабеля), `p3=min(Imax²*Rм, max_linear_power_w_m)`, где default cap берется из `resistive_cables.json/common` (`ТТ Р1=40 Вт/м`, `ТТ Р3=50 Вт/м`) и может быть явно переопределен; выбранный вариант должен покрыть `p1=Q/L` и иметь ток не выше `max_current_a`; результат возвращает `U`, `N`, `M`, `L1/L2`, `p2/p3`; fallback для шагового снижения напряжения — `min=40 В`, `step=5 В`, если коэффициенты политики не заданы | `docs/tnp/algorithms/resistive-selection.md`, `docs/tnp/internal-references/resistive-cable-r1.md`, `docs/tnp/internal-references/resistive-cable-r3.md` | `backend/app/formulas/electrical/resistive.py`, `backend/app/services/calculation_service.py`, `qa-agent/src/oracle/AlgorithmOracle.ts` | `backend/app/tests/unit/formulas/test_resistive.py`, `backend/app/tests/unit/services/test_calculation_service_unit.py`, `qa-agent/tests/AlgorithmOracle.test.ts` |

Для `three_core` auto-ветка VSDX использует схемные множители ТТ Р3 из
паспортной модели, а не универсальное `per_thread_power * N`: `loop_2x3`
считает `P = U² / (r * L * 2) * 3`, `star_3x3` считает
`P = (U / √3)² / (r * L * 3) * 3`, где `r = resistance_ohm_km / 1000`.
Это сохраняет согласованность auto с ручной проверкой схемы и справочником
трех параллельных нагревательных жил.

`standard_supply_voltage_v = 380` для `ТТ Р3` остается legacy field из прежнего
справочника. `max_linear_power_w_m = 50` подтвержден как hard default cap
линейного тепловыделения для `ТТ Р3`.

## Specification BOM

| ID | Правило | Источник | Реализация | Evidence |
|---|---|---|---|---|
| `tlt_spec_full_bom_rules` | Полный условный BOM аксессуаров самрега (`mode="full"`): кабель `Σ L,секц×N,секц×R,гр`; КСН-1/КСВ-1 `Σ N×R`; КСН-2/КСВ-2 `Σ N×R×2` только для секций с `L,секц >= L,К2i` при `К2i=да`; КСР `ceil(ΣL/150)`; коробки СКВ `Σ ceil(N/3)` в 12 корзин по `dтр≷57 / К1i / К2i / Кiu / N≥3`; этикетка `Σ ceil(Lтр/3.5)` | `ТНП/Расчет_спецификации_трубы_самрег29_05_26.xlsx` («Список материалов Самрег»), `docs/audit/spec-bom-oracle.md` | `backend/app/formulas/specification/full_builder.py`, `backend/app/reference_data/spec_accessories.json` | `backend/app/tests/unit/formulas/test_spec_full_builder.py` |
| `tlt_spec_bom_package_factor` | Количество штучных позиций с упаковочным коэффициентом (колонка I источника) = `ceil(формула × package_factor)`: ХК30/ЛКС/ЛКВ `×0.0333334` (рулон 30 м), ЛА `×0.02`, клей NEO `×0.14`, герметик ГС `×0.25`, Z-профиль `×0.5` | `ТНП/Расчет_спецификации_трубы_самрег29_05_26.xlsx`, ячейка I2 и строки 48–57 | `backend/app/reference_data/spec_accessories.json`, `backend/app/formulas/specification/full_builder.py` | `backend/app/tests/unit/formulas/test_spec_full_builder.py::TestFullSpecificationDerived::test_package_factor_converts_to_packages` |
| `tlt_spec_full_bom_scope` | Полный BOM применяется только к саморегулирующимся типам (`self_regulating`, `self_regulating_tt`); позиции других типов кабеля пропускаются и учитываются в `skipped_objects`. Гостю режим `full` недоступен (403). Режим и опции последней генерации персистятся (`generation_mode`/`generation_options`) и переиспользуются фоновым пересчётом | app policy (2026-06-09) | `backend/app/formulas/specification/full_builder.py`, `backend/app/services/specification_service.py`, `backend/app/api/v1/specifications.py` | `backend/app/tests/unit/formulas/test_spec_full_builder.py`, `backend/app/tests/integration/api/test_specifications.py` |

Открытые вопросы полного BOM (секционирование `N,секц` vs нитки, темп-класс
ТЛТ, граница `dтр=57`, приоритет К2i/К1i, BOM для резервуаров, базы длины
кабеля basic vs full): `docs/analysis/spec-bom-open-issues-2026-06-09.md`.

## Known Algorithm Gaps

Подробная сверка алгоритмов с проектом: `docs/tnp/project-reconciliation-audit.md`.

| ID | Статус | Что важно |
|---|---|---|
| `tlt_resistive_selection_algorithm_full` | Covered with formalized fallback policy | Реализован deterministic backend/QA-agent oracle по `U/N/M`, `p2/p3`, `L1/L2`; default `p3` cap для `ТТ Р1/ТТ Р3` берется из справочника (`40/50 Вт/м`). |
| `tlt_resistive_temperature_correction_gap` | Needs correction or signed product decision | Текущая холодная модель `R20` для `P/I` расходится с первичными DOCX-формулами мощности через `[1+alpha*(Tж-20)]`; риск завышения мощности при высокой `Tж` зафиксирован в `docs/analysis/resistive-temperature-tz-deviation.md`. |
| `tlt_tt_t3_temperature_policy` | Covered | `maintain_temperature` является отдельным T3; если он отсутствует, backend использует `process_temperature` как совместимый fallback. |
| `tlt_insulation_lambda_tm` | Covered | Backend/QA-agent считают `lambda(tm)` по ТНП. Generic семьи (`mineral_wool`, `foam_glass`, `polyurethane` и т.п.) не являются расчётными материалами; нужен конкретный код с плотностью и `insulation_temperature_basis`. JSON-справочник сидируется в `insulation_materials`, `/references/insulation` читает DB projection. |
| `tlt_indoor_alpha_9_source_gap` | Needs business/source confirmation | Отдельный первичный нормативный источник для `alpha=9` в помещении не найден. Внешняя ветка `11,6+7√v` не зависит от этого finding. |

## Change Rule

Любой новый функционал, затрагивающий расчеты, должен сначала обновить:

1. этот контракт;
2. `docs/qa/business-logic-coverage.md`;
3. `codex-docs/business-formula-contracts.json`;
4. `qa-agent/examples/tlt-formulas.registry.yaml`, если есть формула/алгоритм;
5. backend/reference implementation;
6. deterministic tests;
7. API/UI/e2e evidence, если меняется пользовательский поток.
