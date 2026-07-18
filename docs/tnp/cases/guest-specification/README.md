# Аудит «1 Кейс — гостевая спецификация»

Статус исходного PDF-аудита: **FAIL — Needs correction + Needs business
decision**.

Статус backend/DB Phase 1: **PASS — backend/DB Phase 1 checkpoint complete**.
Frontend остаётся на `СО1…СО4`; Phase 2/3/5, общий PDF/DoD и product release не
завершены, Phase 4 заблокирована PDL-ER-15.
Full frontend gate: `925 passed, 1 failed, 1 skipped`; неизменённый
`HeatCalcPage.settings.test.tsx:321` не находит accessible separator. Это
pre-existing дефект вне backend/DB Phase 1 и blocker общего release.
Dependency security gate и общий Alembic metadata drift также остаются
не-green вне dynamic-ER diff и блокируют общий release.

Читать в таком порядке:

1. [Подробный воспроизводимый промпт](audit-prompt.md).
2. [Супер-промпт реализации динамических ЭР1…ЭР5](dynamic-er-implementation-super-prompt.md).
3. [Утверждённый Product Decision Log](product-decisions.md).
4. [Checkpoint запуска: Phase 0](phase-0-checkpoint.md).
5. [Checkpoint реализации: Phase 1](phase-1-checkpoint.md).
6. [ADR динамических ЭР](../../../architecture/dynamic-electrical-variants.md).
7. [Impact matrix integer/СО path](../../../architecture/dynamic-electrical-variants-impact-matrix.md).
8. [Постраничный индекс 81 страницы](pdf-page-index.md).
9. [Нормализованные требования PDF](pdf-requirements.md).
10. [Матрица PDF → backend → frontend → tests](traceability-matrix.md).
11. [Итоговый Functional Accuracy Report](functional-accuracy-report.md).
12. [Журнал команд и UI/API evidence](verification-log.md).
13. [Воспроизводимые BOM probes](formula-probes.md).

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
