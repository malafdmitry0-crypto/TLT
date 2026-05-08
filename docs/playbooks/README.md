# Playbooks

Сценарные инструкции для частых задач. Разгрузка `CLAUDE.MD` —
держим в корне **архитектуру**, в playbooks кладём **как что сделать**.

## Когда пользоваться

Если нужна пошаговая инструкция к задаче, которая уже встречалась в проекте —
сначала загляните сюда. Не дублируйте эти процедуры в CLAUDE.MD.

## Индекс

| Playbook | Когда нужен |
|---|---|
| [demo-release.md](demo-release.md) | Собрать демо-поставку для заказчика |
| [add-formula.md](add-formula.md) | Добавить новую расчётную формулу (тепло/электрика) |
| [add-role-or-permission.md](add-role-or-permission.md) | Расширить RBAC-матрицу |
| [debug-pdf-export.md](debug-pdf-export.md) | Отладить экспорт отчёта в PDF/DOCX/XLSX |
| [object-type-switch-prompt.md](object-type-switch-prompt.md) | Разделить таблицу HeatCalc по типам объектов без изменения БД |
| [heatcalc-ui-improvement-prompt.md](heatcalc-ui-improvement-prompt.md) | Улучшить рабочий UI HeatCalc: actionbar, icon-only actions, accessibility |
| [font-size-harmonization-prompt.md](font-size-harmonization-prompt.md) | Согласовать типографическую шкалу и размеры шрифта в рабочем UI |
| [heatcalc-command-bar-consolidation-proposals.md](heatcalc-command-bar-consolidation-proposals.md) | Совместить глобальную навигацию HeatCalc и локальную панель действий в одну строку |

Для крошечных стандартных операций (версия, сиды, smoke) используйте
соответствующие `.claude/commands/*.md` — Клод подхватит их как slash-команды.
