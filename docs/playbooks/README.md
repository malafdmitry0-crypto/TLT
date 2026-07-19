# Playbooks

Повторяемые процедуры и agent prompts. Архитектурные и продуктовые контракты
остаются в профильных `docs/`; здесь хранится способ выполнения задачи.

**Индекс обновлён:** 2026-07-19

## Функциональная точность и эксплуатация

| Playbook | Когда нужен |
|---|---|
| [add-formula.md](add-formula.md) | Добавить расчётную формулу |
| [formula-validation-agent.md](formula-validation-agent.md) | Доказать формулу через source/oracle/boundaries |
| [agent-proof-modes.md](agent-proof-modes.md) | Выбрать audit/fix/UI/release режим |
| [deep-business-logic-qa.md](deep-business-logic-qa.md) | Глубокий функциональный QA |
| [add-role-or-permission.md](add-role-or-permission.md) | Изменить RBAC |
| [debug-pdf-export.md](debug-pdf-export.md) | Отладить PDF/DOCX/XLSX |
| [demo-release.md](demo-release.md) | Собрать демо-поставку из текущих источников |
| [deploy-reg-ru.md](deploy-reg-ru.md) | Развернуть российский production-контур |
| [cpu-bound-worker-system-prompt.md](cpu-bound-worker-system-prompt.md) | Внедрить worker-систему для batch-расчётов |

## Безопасная декомпозиция React

| Playbook | Scope |
|---|---|
| [god-components-safe-split-nightly-prompt.md](god-components-safe-split-nightly-prompt.md) | Общий nightly flow для god components |
| [eleccalc-safe-split-nightly-prompt.md](eleccalc-safe-split-nightly-prompt.md) | Один безопасный slice ElecCalcPage |
| [eleccalc-page-decomposition-prompts.md](eleccalc-page-decomposition-prompts.md) | Roadmap ElecCalcPage |
| [heatcalc-page-decomposition-prompts.md](heatcalc-page-decomposition-prompts.md) | Roadmap HeatCalcPage |
| [heatcalc-object-editor-safe-split-runner-prompt.md](heatcalc-object-editor-safe-split-runner-prompt.md) | Object editor slice |
| [heatcalc-preferences-safe-split-runner-prompt.md](heatcalc-preferences-safe-split-runner-prompt.md) | Preferences slice |
| [react-aria-form-controls-migration-prompt.md](react-aria-form-controls-migration-prompt.md) | Миграция form controls/accessibility |
| [electrical-auto-recalculation-scope-prompt.md](electrical-auto-recalculation-scope-prompt.md) | Scope авторекалькуляции электрорасчёта |

## HeatCalc UI и таблица

| Playbook | Scope |
|---|---|
| [object-type-switch-prompt.md](object-type-switch-prompt.md) | Переключение типа объекта |
| [heatcalc-ui-improvement-prompt.md](heatcalc-ui-improvement-prompt.md) | Общие UI/accessibility улучшения |
| [font-size-harmonization-prompt.md](font-size-harmonization-prompt.md) | Типографическая шкала |
| [heatcalc-command-bar-consolidation-proposals.md](heatcalc-command-bar-consolidation-proposals.md) | Варианты command bar |
| [heatcalc-table-columns-settings-prompt.md](heatcalc-table-columns-settings-prompt.md) | Видимость колонок |
| [heatcalc-table-column-layout-prompt.md](heatcalc-table-column-layout-prompt.md) | Порядок и ширина колонок |
| [heatcalc-table-font-size-preference-prompt.md](heatcalc-table-font-size-preference-prompt.md) | Размер шрифта таблицы |
| [heatcalc-table-findability-prompt.md](heatcalc-table-findability-prompt.md) | Поиск/фильтры/сортировка |
| [heatcalc-backend-table-query-prompt.md](heatcalc-backend-table-query-prompt.md) | Backend pagination/query |
| [inline-form-density-prompt.md](inline-form-density-prompt.md) | Плотность inline-формы |
| [heatcalc-calculation-details-prompt.md](heatcalc-calculation-details-prompt.md) | Детали результата расчёта |

Для крошечных стандартных операций используйте существующие repo scripts и
commands. После изменения UI playbook не отменяет обязательный browser proof из
`AGENTS.md`.
