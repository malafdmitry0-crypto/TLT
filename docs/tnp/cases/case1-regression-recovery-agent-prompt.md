# Задача: устранить регрессии case 1 после conformance reverify

**Версия:** 1.0
**Дата:** 2026-08-04
**Статус:** EXECUTED, desktop-only scope
**Источник фактических результатов:** [`../../audit/2026-08-04-case1-conformance-reverify/snapshot.md`](../../audit/2026-08-04-case1-conformance-reverify/snapshot.md)

> Execution scope override, 2026-08-04: пользователь подтвердил, что мобильной
> версии нет. Mobile/tablet проверки и найденные там отклонения имеют статус
> `N/A` и не участвуют в финальном gate. Фактический результат записан в
> [`../../audit/2026-08-04-case1-regression-recovery/snapshot.md`](../../audit/2026-08-04-case1-regression-recovery/snapshot.md).

## Роль и результат

Ты implementation/recovery agent. Исправь воспроизводимые регрессии, найденные
после перепроверки кейса 1, и верни красные focused/repository gates в зелёное
состояние. Не маскируй product bug ослаблением теста и не лечи stale test или
harness изменением правильного production-контракта.

Итоговый результат:

1. backend generation/import/idempotency contracts проходят;
2. frontend lint, typecheck, focused tests и production build проходят;
3. stale frontend expectations согласованы с действующим нормативом;
4. desktop auth/guest states не имеют layout-регрессий;
5. shared E2E pipe fixture использует текущую schema;
6. browser/E2E critical paths повторены с честным списком NOT RUN.

## Обязательные входы

Перед изменениями прочитай:

- корневой `AGENTS.md`;
- `frontend/AGENTS.md` и `docs/frontend/agent-development-standard.md`;
- `docs/frontend/css-strategy.md` и `docs/frontend/viewport-policy.md`;
- dated audit snapshot по ссылке выше и `browser-e2e/report.md` рядом с ним;
- ближайший production-код и тесты каждого изменяемого owner.

Выполни `git status --short` и не трогай чужие untracked/WIP-файлы. Не
коммить и не пушь без отдельной просьбы пользователя.

## Правила классификации

Для каждого красного теста сначала зафиксируй один из классов:

| Класс | Действие |
| --- | --- |
| Product regression | Исправить production-код и сохранить/усилить assertion. |
| Contract drift | Сверить с нормативом; исправить сторону, нарушающую текущий контракт. |
| Stale test | Обновить только устаревшее ожидание, доказав действующий production-контракт другим тестом/кодом. |
| Harness drift | Исправить fixture/helper, не менять production API ради legacy payload. |
| Architecture debt | Уменьшить долг; baseline/allowlist не повышать. |

Запрещено использовать `any`, `@ts-ignore`, широкие casts, ослабление
assertions, повышение architecture baseline, новый `!important`, bare Ant
selectors и статический inline-style.

## Recovery slices

### R0 — frontend compile/static gate

Allowed scope:

- `frontend/src/pages/electrical/elecCalcCableOptionsModel.ts`;
- `frontend/src/pages/electrical/useElecCalcCableMarkOptions.tsx`;
- прямые callers и focused tests, только если contract действительно изменён.

Acceptance:

- nullable option mapping имеет корректный TypeScript type guard;
- legacy unused arguments удалены из API hook/callers либо реально участвуют в
  текущем object-scoped contract;
- lint и typecheck зелёные;
- production build достигает и завершает Vite phase.

### R1 — Specification write isolation и F5 outcome persistence

Действующий F5-контракт намеренно сохраняет по каждому attempted ЭР status-row
со статусом `blocked`, `selection_required` или `confirmation_required`, даже
когда BOM не сформирован. Поэтому исправь или обнови tests так, чтобы:

- READY+BLOCKED сохранял READY BOM и отдельный BLOCKED status-row без items;
- exception внутри одного ЭР не оставляла его частичный BOM/snapshot, но
  сохраняла диагностический BLOCKED outcome;
- fingerprint conflict не оставлял BOM items/snapshot, но сохранял
  `SPEC_GENERATION_CONFLICT` для восстановления после F5;
- успешный sibling ЭР не откатывался из-за blocked/failed sibling;
- outcome/status persistence происходила после rollback из rollback-only
  savepoint.

Не удаляй корректную production persistence ради pre-F5 assertions и не
заменяй rollback semantics ручным удалением после commit. Сохрани focused tests
на каждый boundary и явно проверяй отсутствие частичных items.

### R2 — backend project IO и idempotency

Перепроверь три контракта и классифицируй известный drift:

- legacy `self_regulating` / `ТЛТ-*` import по E9 обязан быть soft-stale, а не
  `ready`;
- manual select-cable fixture обязан передать обязательные
  `maintain_temperature`, `aggressive_product` и проектный `Iдоп` до проверки
  source normalization;
- canonical Specification generation обязан передавать JSON body с явным
  `variant_ids` и использовать инициализированный ЭР.

Если тест ожидает pre-E9 состояние, обнови stale test и явно докажи текущий
soft-stale норматив. Если setup не передаёт обязательный heat input, исправь
fixture/setup, а не ослабляй production validation. Если первый idempotent POST
получает 422 из-за некорректного setup, почини setup; если из-за production
flow — production-код.

### R3 — frontend functional contracts

Разбери и исправь:

- TT manual sizing options после перехода на object-scoped cable-options;
- устаревшие ожидания 220 В при нормативном 230 В;
- default Object Wizard dependency layout и блок «Подбор спецификации»;
- architecture ratchets, относящиеся к изменённому cutover-коду.

Не возвращай synthetic/local cable options вместо authoritative backend
options. Не меняй нормативные 230 В ради старого теста.

### R4 — guest/auth desktop recovery; mobile N/A

Финальное уточнение пользователя исключило mobile/tablet из продукта и
приёмки. Ранее собранные mobile artifacts остаются только исторической
диагностикой и не создают release blocker или backlog.

Acceptance:

- Guest Help показывает актуальные guest semantics: 3 дня, до 500 объектов,
  один временный проект и project-file workflow;
- desktop profiles `1000×768`, `1280×800`, `1440×900` не регрессируют;
- console warning/error и failed-network checks чистые на достигнутых states.

Используй owner CSS, canonical breakpoints и semantic tokens. Не добавляй
feature CSS в `src/styles.css`.

### R5 — E2E harness

Обнови shared `createCalculatedPipe` и связанные fixtures на текущий pipe heat
payload (`insulation_layers` вместо удалённых flat insulation keys). Не
разрешай legacy keys обратно в production API.

После этого повтори Electrical critical path до успешного cable selection либо
зафиксируй новый конкретный product blocker.

## Proof contract

### Backend inner loop

Запускай точные failing tests, затем owner packs:

```bash
pytest app/tests/unit/services/test_project_io_helpers.py -v --no-cov
pytest app/tests/integration/api/test_idempotency.py \
  app/tests/integration/api/test_project_io.py \
  app/tests/integration/db/test_specification_generation_service.py \
  -v --no-cov
```

Используй принятый в репозитории Docker/test DB workflow. Не считай unit-only
proof достаточным для transaction fix.

### Frontend inner loop и acceptance

Из `frontend/`:

```bash
npm run agent:scope -- --changed --json
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

Для inner loop запускай точные failing files. Полный local dual-safe DoD не
запускай без отдельного явного запроса; обычный repository Vitest здесь нужен
для перепроверки уже найденных failures.

Перед browser acceptance выполни обязательный static UI script:

```bash
/Users/dmalafey/.codex/plugins/cache/personal/kontur-ui-quality/0.1.0+codex.20260719195723/scripts/run-static-ui-checks.sh \
  /Users/dmalafey/Desktop/TLT
```

### Browser/E2E

Обязателен `kontur_playwright` preflight и state-driven proof. Проверить
затронутые states на `1440×1000`. Для engineering desktop дополнительно
использовать `1000×768` и `1280×800` согласно viewport policy. Mobile/tablet
не запускать и не учитывать в gate.

Из `e2e/` повторить focused layout и critical-path scenarios, перечисленные в
dated browser report. Сохранить screenshots/traces в датированном audit
подкаталоге или `/private/tmp`, не в корне репозитория.

## Документация результатов

Динамические totals, timings, HEAD и before/after metrics записывай только в
новый или существующий датированный `docs/audit/YYYY-MM-DD-*/snapshot.md`.
Этот prompt хранит правила и не обновляется ежедневными числами.

Финальный отчёт должен содержать:

1. classification каждого исходного failure;
2. production/test/harness files changed;
3. точные команды и результаты;
4. browser states, viewports, geometry, console/network и screenshot paths;
5. остаточные NOT RUN и residual risk;
6. итоговый release gate: GREEN либо конкретный blocker.
