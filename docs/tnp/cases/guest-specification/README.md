# Аудит «1 Кейс — гостевая спецификация»

Статус исходного PDF-аудита: **FAIL — Needs correction + Needs business
decision**.

Статус backend/DB Phase 1: **PASS — backend/DB Phase 1 checkpoint complete**.
Статус frontend/consumer Phase 2:
**PASS — dynamic named ER frontend bridge complete**. Пользовательский поток
использует именованные UUID ЭР1…ЭР5; legacy graph `1…4` остаётся переходным и
проверяется строгой парой `UUID ↔ slot`, а пятый ЭР fail-closed для ещё не
переведённых расчётов. Phase 3/5, общий PDF/DoD и product release не завершены,
Phase 4 заблокирована PDL-ER-15/18.
Full frontend gate: `1033 passed, 1 failed`; неизменённый
`HeatCalcPage.settings.test.tsx:321` не находит accessible separator. Это
pre-existing дефект вне dynamic-ER Phase 2 и blocker общего release.
Dependency security gate и общий Alembic metadata drift также остаются
не-green вне dynamic-ER diff и блокируют общий release.

Читать в таком порядке:

1. [Подробный воспроизводимый промпт](audit-prompt.md).
2. [Супер-промпт реализации динамических ЭР1…ЭР5](dynamic-er-implementation-super-prompt.md).
3. [Утверждённый Product Decision Log](product-decisions.md).
4. [Checkpoint запуска: Phase 0](phase-0-checkpoint.md).
5. [Checkpoint реализации: Phase 1](phase-1-checkpoint.md).
6. [Checkpoint реализации: Phase 2](phase-2-checkpoint.md).
7. [ADR динамических ЭР](../../../architecture/dynamic-electrical-variants.md).
8. [Impact matrix integer/СО path](../../../architecture/dynamic-electrical-variants-impact-matrix.md).
9. [Постраничный индекс 81 страницы](pdf-page-index.md).
10. [Нормализованные требования PDF](pdf-requirements.md).
11. [Матрица PDF → backend → frontend → tests](traceability-matrix.md).
12. [Итоговый Functional Accuracy Report](functional-accuracy-report.md).
13. [Журнал команд и UI/API evidence](verification-log.md).
14. [Воспроизводимые BOM probes](formula-probes.md).

Главное историческое baseline finding: при одном объекте и нуле электрических
расчётов живой guest flow сформировал 6 закупочных позиций и вернул
`skipped_objects=0`. Это противоречит текущему guest SRS, независимо от того,
будет ли новый PDF принят как source-of-truth.

Финальный Phase 1 audit отдельно закрыл UUID-инварианты normal legacy writes,
project duplicate flow, task idempotency и object/ER concurrency. Objectless
specification теперь
атомарно получает 409 без rows; это не закрывает baseline finding для проекта,
где объект уже есть, и не означает готовность PDF partial/BOM flow.
Post-fix re-audit также доказал heat terminal-transition serialization,
truthful idempotency replay audit, selector-null 422 без ER side effect и оба
порядка candidate apply/delete race со stable 404/409.
MEDIUM residual оставлен Phase 3: legacy calculation может иметь корректный
UUID при assignment `unassigned/system_type=null`; assignment state пока не
authoritative для consumers.
