# Аналитическая документация HeatCalc

**Индекс обновлён:** 2026-07-19

Файлы в этом каталоге имеют разный жизненный цикл. Датированный аудит описывает
срез на дату проверки и не становится текущим контрактом. Иерархия источников
задана в `codex-docs/source-documents.md`.

## Текущий статус, требования и решения

| Документ | Назначение |
|---|---|
| [business-rules.md](business-rules.md) | Каталог бизнес-правил |
| [current-status-and-missing-info.md](current-status-and-missing-info.md) | Исторический срез 2026-05-20; не текущий status source |
| [full-version-status.md](full-version-status.md) | Исторические границы полной версии на 2026-05-20 |
| [not-implemented.md](not-implemented.md) | Нереализованные области |
| [open-business-decisions.md](open-business-decisions.md) | Решения, требующие подтверждения |
| [product-proposal-ledger.md](product-proposal-ledger.md) | Компактный реестр неутверждённых инженерных и продуктовых идей |
| [open-questions-user-mode.md](open-questions-user-mode.md) | Исторический реестр вопросов user mode; часть закрыта поздними PDL |
| [business-logic-strengths-weaknesses.md](business-logic-strengths-weaknesses.md) | Историческая оценка бизнес-логики от 2026-05-20 |
| [personas.md](personas.md) | Персоны пользователей |
| [user-stories.md](user-stories.md) | Пользовательские истории |
| [story-map.md](story-map.md) | Карта сценариев и roadmap |

## Формулы и инженерные аудиты

| Документ | Назначение |
|---|---|
| [FORMULA_AUDIT.md](FORMULA_AUDIT.md) | Аудит формул |
| [ELECTRICAL_AUDIT.md](ELECTRICAL_AUDIT.md) | Аудит электрорасчёта |
| [APPLY_LOGIC_AUDIT.md](APPLY_LOGIC_AUDIT.md) | Аудит применения выбранного расчёта |
| [heat-loss-algorithm.md](heat-loss-algorithm.md) | Разбор алгоритма теплопотерь |
| [commercial-cable-selection.md](commercial-cable-selection.md) | Коммерческое ранжирование кабелей |
| [global-software-comparison.md](global-software-comparison.md) | Консолидированное качественное сравнение с внешними engineering tools |
| [heat-loss-tz-deviations.md](heat-loss-tz-deviations.md) | Расхождения теплопотерь с ТЗ |
| [resistive-temperature-tz-deviation.md](resistive-temperature-tz-deviation.md) | Температурное правило резистивного расчёта |
| [self-reg-current-voltage-tz-deviation.md](self-reg-current-voltage-tz-deviation.md) | Ток/напряжение саморегулирующегося кабеля |
| [tt-winding-tz-deviation.md](tt-winding-tz-deviation.md) | Коэффициент навива ТТ |
| [spec-bom-open-issues-2026-06-09.md](spec-bom-open-issues-2026-06-09.md) | Датированный список пробелов BOM |

## ТНП и кейсы заказчика

| Документ | Назначение |
|---|---|
| [13-07-kp-vs-1-case-audit.md](13-07-kp-vs-1-case-audit.md) | Сверка КП 13.07 с первым кейсом |
| [tnp-1-case-gap-vs-implementation.md](tnp-1-case-gap-vs-implementation.md) | Исторический before gap-анализ до Phase 1–5 |
| [tnp-1-case-frontend-change-assessment.md](tnp-1-case-frontend-change-assessment.md) | Оценка frontend-изменений для кейса |

## Диаграммы

| Документ | Назначение |
|---|---|
| [diagrams-context.md](diagrams-context.md) | C4/use-case/frontend context |
| [diagrams-domain.md](diagrams-domain.md) | ER/UML/state diagrams |
| [diagrams-flows.md](diagrams-flows.md) | Sequence/activity diagrams |

## Исторические UI и quality-срезы

Следующие документы сохраняют причины прошлых решений. Их выводы нельзя считать
текущим статусом без повторной проверки:

- [STRENGTHS_AND_WEAKNESSES.md](STRENGTHS_AND_WEAKNESSES.md)
- [UI_ANALYSIS.md](UI_ANALYSIS.md)
- [sc03-heat-form-cleanup-2026-06-10.md](sc03-heat-form-cleanup-2026-06-10.md)
- [sc03-usewatch-perf-2026-06-01.md](sc03-usewatch-perf-2026-06-01.md)
