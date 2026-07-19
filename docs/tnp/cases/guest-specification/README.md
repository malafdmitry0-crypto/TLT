# Аудит «1 Кейс — гостевая спецификация»

Статус исходного PDF-аудита: **FAIL — Needs correction + Needs business
decision**.

Статус backend/DB Phase 1: **PASS — backend/DB Phase 1 checkpoint complete**.
Статус frontend/consumer Phase 2:
**PASS — dynamic named ER frontend bridge complete**. Пользовательский поток
использует именованные UUID ЭР1…ЭР5; legacy graph `1…4` остаётся переходным и
проверяется строгой парой `UUID ↔ slot`, а пятый ЭР fail-closed для ещё не
переведённых расчётов. Статус Phase 3:
**PASS — root backend/frontend/browser/DB gate complete**. Authoritative
assignments работают по exact UUID, имеют
optimistic version, assignment-aware calculation scope и confirmed cleanup.
Skin/mineral tabs остаются browsable для migrated unsupported rows/unassign,
но недоступны как target; dirty unassigned graph требует отдельный
`CLEANUP_REQUIRED` handshake с сохранением heat. Copy оставляет target
specification `not_generated` по PDL-ER-13. Row/batch/inline compatibility
остаётся строгой, но fresh supported resistive assignment открывает
`Выбор`/`Подбор` с безопасным `single_core`, а не наследует self-reg default.
Phase 5 checkpoint (`phase-5-checkpoint.md`): guest full BOM, multi-ЭР generate,
d≥57, guest TTL 3d defaults, CSV v3, report UUID-first, settings snapshots,
catalog identity, PDF mapping, ER5 slots 1…5, actionable A evidence pack —
**partial PASS**. Product contract утверждён до PDL-ER-41. Phase 4 blocked
PDL-ER-15/18/28. Остаются: PDL-ER-27 full 500 wall-clock gate, PDL-ER-35
matrix **data**, Phase 6 UUID-only cutover execute, corporate template (40).
Full frontend gate Phase 3: `1052 passed, 1 failed`; неизменённый
`HeatCalcPage.settings.test.tsx:321` не находит accessible separator. Это
pre-existing дефект вне dynamic-ER Phase 3 и blocker общего release.
Dependency security gate и общий Alembic metadata drift также остаются
не-green вне dynamic-ER diff и блокируют общий release.

Читать в таком порядке:

1. [Подробный воспроизводимый промпт](audit-prompt.md).
2. [Супер-промпт реализации динамических ЭР1…ЭР5](dynamic-er-implementation-super-prompt.md).
3. [Утверждённый Product Decision Log](product-decisions.md).
4. [Checkpoint запуска: Phase 0](phase-0-checkpoint.md).
5. [Checkpoint реализации: Phase 1](phase-1-checkpoint.md).
6. [Checkpoint реализации: Phase 2](phase-2-checkpoint.md).
7. [Checkpoint реализации: Phase 3](phase-3-checkpoint.md).
8. [ADR динамических ЭР](../../../architecture/dynamic-electrical-variants.md).
9. [Impact matrix integer/СО path](../../../architecture/dynamic-electrical-variants-impact-matrix.md).
10. [Постраничный индекс 81 страницы](pdf-page-index.md).
11. [Нормализованные требования PDF](pdf-requirements.md).
12. [Матрица PDF → backend → frontend → tests](traceability-matrix.md).
13. [Итоговый Functional Accuracy Report](functional-accuracy-report.md).
14. [Журнал команд и UI/API evidence](verification-log.md).
15. [Воспроизводимые BOM probes](formula-probes.md).

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
Прежний MEDIUM residual Phase 3 закрыт migration 0029 и runtime guards:
deployed exact-UUID calculations reconciled, а новые calculation/candidate/task
writes не могут молча auto-assign объект. Root final Phase 3 evidence завершён
в отдельном checkpoint и каталоге `evidence/phase-3-assignments/`;
sections/BOM и UUID-only downstream остаются дальше.
