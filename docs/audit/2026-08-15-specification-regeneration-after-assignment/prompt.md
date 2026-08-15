# SPEC-REG-01 — повторное формирование спецификации после изменения назначений

```text
Работай из /Users/dmalafey/Desktop/TLT.

SLICE_ID: SPEC-REG-01
OWNER: specification
GOAL: после формирования спецификации с неназначенными объектами пользователь
может изменить назначения в ЭР и повторно сформировать спецификацию. Шаг
«Подтверждение исключения неназначенных объектов» сохраняет исполняемый
контекст, а кнопка «Подтвердить и сформировать» отправляет запрос.

Перед изменениями прочитай полностью:
1. корневой AGENTS.md;
2. frontend/AGENTS.md;
3. docs/frontend/agent-development-standard.md;
4. docs/frontend/viewport-policy.md;
5. ближайший production-код и тесты specification workflow.

PRECONDITION:
- git status --short;
- не трогать и не добавлять в commit чужой WIP;
- из frontend выполнить:
  npm run agent:scope -- src/pages/specification/useSpecificationPageModel.ts

ALLOWED_SCOPE:
- frontend/src/pages/specification/useSpecificationPageModel.ts;
- один новый focused integration test в
  frontend/src/__tests__/integration/pages/;
- этот prompt.

NON-GOALS:
- backend preflight/generation/assignment services;
- API payload, response schema, query keys, routes и ER UUID semantics;
- catalog selection logic, copy, CSS и тексты интерфейса;
- восстановление команды из неполного server snapshot;
- полный npm run test:agent-dod:dual-safe без отдельного запроса пользователя.

CHARACTERIZATION FIRST:
1. Смоделируй сохранённую stale-спецификацию с generation_status=generated.
2. Открой настройки, явно выбери ЭР и запусти повторное формирование.
3. Первый generate возвращает confirmation_required для неназначенных объектов.
4. На исходном коде докажи дефект: после завершения mutation старый GET snapshot
   повторно гидратируется, confirmation dialog исчезает либо pending context
   очищается, поэтому confirm не вызывает второй generate.
5. Не ослабляй existing F5/new-tab fail-closed contracts.

IMPLEMENTATION:
- GET hydration должна выполняться только для нового server outcome/scope, а не
  повторно из-за одного перехода mutation isPending true -> false.
- Локальный selection_required/confirmation_required outcome сохраняет
  PendingGenerationContext до следующего шага.
- «Подтвердить и сформировать» отправляет тот же project/ER/options/selections с
  exclude_unassigned_confirmed=true.
- generated и blocked по-прежнему очищают terminal context.
- F5 с валидным session context продолжает workflow; без context остаётся
  fail-closed recovery через настройки.
- Не добавляй any, @ts-ignore, широкие casts или baseline increase.
- useSpecificationPageModel.ts должен уложиться в hard cap; устрани ближайшее
  дублирование вместо роста файла.

ACCEPTANCE:
- ready -> unassigned: confirmation -> generated;
- unassigned -> self_regulating -> успешный пересчёт: confirmation -> generated;
- до пересчёта назначение stale и формирование ожидаемо заблокировано;
- confirm выполняет ровно один новый POST, повторное нажатие во время pending
  невозможно;
- исходная спецификация остаётся только stale snapshot до успешного generated;
- нет новых console warnings/errors, кроме ожидаемого обработанного HTTP 409;
- нет page-level overflow на 1000×768, 1280×800 и 1440×900.

FOCUSED_PROOF, cwd=frontend:
  npx vitest run --project unit --project integration \
    src/__tests__/integration/pages/SpecificationPage.stale-regeneration.test.tsx \
    src/__tests__/integration/pages/SpecificationPage.er-scope-write.test.tsx \
    src/__tests__/unit/pages/specification/specGenerationHydrateModel.test.ts
  npm run lint
  npm run typecheck
  npm run build
  npm run agent:scope -- --changed --json
  npm run agent:proof-run -- --changed
  npm run agent:proof-check -- --changed
  git diff --check

BROWSER_PROOF:
- реальный локальный API, отдельный временный guest project;
- сначала generated с ready + unassigned;
- через видимые действия изменить assignment в обе стороны и дождаться
  электрического пересчёта после назначения в самрег;
- повторить confirmation -> generated на 1000×768, 1280×800, 1440×900;
- проверить focus, modal count, geometry, page overflow, console и network bodies;
- удалить временный проект после проверки.

COMMIT:
  fix(frontend): SPEC-REG-01 preserve stale regeneration context
```
