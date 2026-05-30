# Business Logic Coverage

Этот файл показывает, какие формулы, алгоритмы и справочники уже заведены в
контракт приложения и чем они проверяются. Источник правды по правилам:
`docs/business-logic-contract.md`.

## Source Chain

| Уровень | Назначение |
|---|---|
| `docs/business-logic-contract.md` | Главный человекочитаемый контракт текущей реализации |
| `docs/tnp/` | Markdown-источники из ТНП, VSDX-алгоритмов и пользовательских скринов |
| `docs/tnp/correctness-review.md` | Инженерная сверка спорных мест и решений |
| `docs/tnp/project-reconciliation-audit.md` | Сверка ТНП-алгоритмов и справочников с текущим backend |
| `docs/tnp/algorithm-parsing-coverage-audit.md` | Оценка качества парсинга VSDX/PDF-алгоритмов и их отражения в основном контракте |
| `qa-agent/examples/tlt-formulas.registry.yaml` | Machine-readable registry для deterministic oracle |
| `backend/app/formulas/**`, `backend/app/reference_data/*.json` | Реализация формул и справочников |
| `codex-docs/business-formula-contracts.json` | Проверяемая матрица `документ -> backend -> API -> UI -> tests` |

## Full Version Rule

Для бизнес-логики проекта не используется статус принятой частичной поставки.
Любая частичная реализация формулы, алгоритма, справочника, backend policy или
UI/API workflow считается gap до полного соответствия ТНП-контракту.

## Coverage Matrix

| Contract ID | Документ | Registry/Oracle | Backend | API/UI | Tests | Статус |
|---|---|---|---|---|---|---|
| `tlt_pipe_total_heat_loss` | Да | Да | Да | Да | Да | Covered |
| `tlt_pipe_heat_loss_no_double_k` | Да | Да | Да | Да | Да | Covered |
| `tlt_tank_external_resistance` | Да | Да | Да | Да | Да | Covered |
| `tlt_tank_total_heat_loss` | Да | Нет отдельного registry primitive | Да, `Q = base*K*location_factor + Qдоп` и подземная ветка | Да | Да | Covered |
| `tlt_rectangular_tank_perimeter` | Да | Да | Да | Да | Да | Covered |
| `tlt_tank_heat_loss_no_double_k` | Да | Да | Да | Да | Да | Covered |
| `tlt_climate_safety_factor` | Да | Да | Да, backend resolver нормализует K и расчетную T; lookup использует `climate_key`/регион для городов-дубликатов | Частично через поля климата | Да | Covered |
| `tlt_max_winding_coefficient` | Да | Да | Да, hard-limit для explicit/geometric Kn | Частично: UI manual max `1.5` | Да | Covered |
| `tlt_self_regulating_tlt_selection` | Да | Частично | Да, auto подбор ТЛТ по мощности и температурам | Да, таблица электрорасчёта и ручной/авто выбор марки | Да | Covered |
| `tlt_self_regulating_thread_source_policy` | Да | Нет | Да, auto `N=1..3`, manual override и source metadata | Да, колонка ниток показывает источник | Да | Covered |
| `tlt_tt_series_limits_inclusive` | Да | Да | Да | Да | Да | Covered |
| `tlt_tt_t3_power_curve` | Да | Да | Да | Да | Да | Covered |
| `tlt_tt_r1_catalog` | Да | Нет формулы, справочник | Да | Да через резистивный подбор | Да | Covered |
| `tlt_tt_r3_catalog` | Да | Нет формулы, справочник | Да | Да через резистивный подбор | Да | Covered |
| `tlt_resistive_selection_algorithm_full` | Да | Да | Да, auto `U/N/M`, `p2/p3`, `L1/L2`, type-specific `p3` cap `Р1=40`/`Р3=50` из справочника и DB-policy coefficients | Да, основной flow auto; manual scheme остается override | Да | Covered with fallback policy |
| `tlt_tt_r1_resistance_based_power` | Да | Да | Да | Да через резистивный подбор | Да | Covered |
| `tlt_tt_t3_temperature_policy` | Да | Да | Да, T3 опционален с fallback на `process_temperature` | Да | Да | Covered |
| `tlt_tt_thread_count_policy` | Да | Частично | Да, auto `N=ceil(Pоб/Pi)` без лимита 3 для ТТ | Нет отдельного policy control | Да | Covered |
| `tlt_tt_mark_suffix_policy` | Да | Нет | Да, принято `aggressive_product -> СТ`, иначе `СР` | Да через поле агрессивности | Да | Covered |
| `tlt_insulation_lambda_tm` | Да | Да | Да, `lambda(tm)` + конкретный материал/плотность + `insulation_temperature_basis` | Да, отдельное поле режима `tm` | Да | Covered |
| `tlt_heat_loss_location_factor_source_gap` | Частично: задокументировано как app policy, не найдено в первичных ТНП DOCX/XLSX | Нет | Да, `location_indoor/location_outdoor` умножают итоговое `Q`; для трубы electrical input берет `q*location_factor` без `K` | Да, отображается в деталях расчёта как `Kразм примен.` | Да | Needs business decision |

## Audit Notes

2026-05-19: backend unit/integration formula fixtures for `tlt_insulation_lambda_tm`
use selectable concrete insulation codes (for example
`mineral_wool_boards_120`) plus `insulation_temperature_basis`. Generic family
codes (`mineral_wool`, `foam_glass`, `polyurethane`) remain only in reference
data / import-reselection checks and are not accepted as calculation materials.

2026-05-30: primary-source audit confirmed `L_eff=L+Lдоп`, `Qдоп` after `K`,
and `lambda(tm)` from the insulation reference. `location_indoor=0.9` /
`location_outdoor=1.0` are current application policy and are covered by
backend tests, but the separate placement multiplier was not found in inspected
primary TNP DOCX/XLSX sources.

## Gates

```bash
scripts/codex-functional-audit.sh docs
scripts/codex-functional-audit.sh contracts
scripts/formula-qa.sh quick
scripts/codex-functional-audit.sh calc
scripts/codex-functional-audit.sh user-flows
```

## Правило для нового функционала

Если меняется расчет, алгоритм подбора или справочник, изменение считается
готовым только после обновления:

1. `docs/business-logic-contract.md`;
2. `docs/qa/business-logic-coverage.md`;
3. `codex-docs/business-formula-contracts.json`;
4. `qa-agent/examples/tlt-formulas.registry.yaml`, если есть формула/алгоритм;
5. backend implementation и deterministic tests;
6. API/UI/e2e evidence, если правило влияет на пользовательский сценарий.

LLM может помогать извлекать требования и объяснять расхождения, но численная
корректность должна подтверждаться deterministic oracle и тестами.
