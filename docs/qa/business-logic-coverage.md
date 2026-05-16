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
| `qa-agent/examples/tlt-formulas.registry.yaml` | Machine-readable registry для deterministic oracle |
| `backend/app/formulas/**`, `backend/app/reference_data/*.json` | Реализация формул и справочников |
| `codex-docs/business-formula-contracts.json` | Проверяемая матрица `документ -> backend -> API -> UI -> tests` |

## Coverage Matrix

| Contract ID | Документ | Registry/Oracle | Backend | API/UI | Tests | Статус |
|---|---|---|---|---|---|---|
| `tlt_pipe_total_heat_loss` | Да | Да | Да | Да | Да | Covered |
| `tlt_pipe_heat_loss_no_double_k` | Да | Да | Да | Да | Да | Covered |
| `tlt_tank_external_resistance` | Да | Да | Да | Да | Да | Covered |
| `tlt_rectangular_tank_perimeter` | Да | Да | Да | Да | Да | Covered |
| `tlt_tank_heat_loss_no_double_k` | Да | Да | Да | Да | Да | Covered |
| `tlt_climate_safety_factor` | Да | Да | Частично через параметры расчета | Нет отдельного UI | Да | Covered for oracle |
| `tlt_max_winding_coefficient` | Да | Да | Требует явного backend clamp при вводе нового потока | Нет отдельного UI | Да | Covered for oracle |
| `tlt_tt_series_limits_inclusive` | Да | Да | Да | Да | Да | Covered |
| `tlt_tt_r1_catalog` | Да | Нет формулы, справочник | Да | Да через резистивный подбор | Да | Covered |
| `tlt_tt_r3_catalog` | Да | Нет формулы, справочник | Да | Да через резистивный подбор | Да | Covered |

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
