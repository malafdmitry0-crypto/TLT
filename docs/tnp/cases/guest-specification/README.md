# Аудит «1 Кейс — гостевая спецификация»

Статус: **FAIL — Needs correction + Needs business decision**. Код приложения
и тестов не изменялся.

Читать в таком порядке:

1. [Подробный воспроизводимый промпт](audit-prompt.md).
2. [Супер-промпт реализации динамических ЭР1…ЭР5](dynamic-er-implementation-super-prompt.md).
3. [Утверждённый Product Decision Log](product-decisions.md).
4. [Checkpoint запуска: Phase 0](phase-0-checkpoint.md).
5. [ADR динамических ЭР](../../../architecture/dynamic-electrical-variants.md).
6. [Impact matrix integer/СО path](../../../architecture/dynamic-electrical-variants-impact-matrix.md).
7. [Постраничный индекс 81 страницы](pdf-page-index.md).
8. [Нормализованные требования PDF](pdf-requirements.md).
9. [Матрица PDF → backend → frontend → tests](traceability-matrix.md).
10. [Итоговый Functional Accuracy Report](functional-accuracy-report.md).
11. [Журнал команд и UI/API evidence](verification-log.md).
12. [Воспроизводимые BOM probes](formula-probes.md).

Главное фактическое finding: при одном объекте и нуле электрических расчётов
живой guest flow сформировал 6 закупочных позиций и вернул
`skipped_objects=0`. Это противоречит текущему guest SRS, независимо от того,
будет ли новый PDF принят как source-of-truth.
