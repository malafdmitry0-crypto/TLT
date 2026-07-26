# Frontend agent entrypoint

Эти инструкции действуют для всего каталога `frontend/`.

## Перед любой задачей

1. Прочитай [стандарт разработки](../docs/frontend/agent-development-standard.md).
2. Если задача является рефакторингом, используй
   [мастер-промпт](../docs/frontend/agent-refactor-prompt.md).
3. Если пользователь не задал конкретный slice, возьми первый `pending` из
   [актуального backlog](../docs/frontend/refactor-backlog.md). Если очередь
   пуста, не придумывай работу — запроси цель.
4. Прочитай ближайший production-код, тесты и релевантный тематический документ.
5. Выполни `git status --short`; не трогай и не добавляй чужой WIP.

## Непереговорные правила

- Один запуск — один vertical slice и один feature-owner.
- Characterization first: сначала зафиксируй существующее поведение тестом.
- Не меняй UX, формулы, units, API payload, query keys, invalidation, routes или
  ER UUID semantics, если это явно не входит в задачу.
- Не обходи ограничения через `any`, `@ts-ignore`, широкие casts, ослабление
  assertions или повышение architecture baseline.
- Не добавляй feature CSS в `src/styles.css`.
- Не добавляй `!important`, bare `.ant-*`, статические JSX `style`/`styles` или
  прямые feature-ссылки на legacy palette `--c-*`/`--a-*`.
- Новый CSS имеет один owner root, минимальную специфичность и использует только
  canonical breakpoints из [CSS-стратегии](../docs/frontend/css-strategy.md).
- Видимый desktop UI проверяется по
  [viewport policy](../docs/frontend/viewport-policy.md): `1000` functional,
  `1280` full workspace, `1440×900` primary QA.
- Не создавай новые Heat ↔ Electrical ↔ Specification deep imports.
- UI-kit не знает о feature/domain; feature UI импортирует kit только через
  `@/components/ui-kit`.
- При работе с UI-kit / stories: если MCP `storybook` доступен (dev server
  `npm run storybook` → `http://127.0.0.1:6006/mcp`), сначала читай docs/stories
  через MCP tools; не выдумывай props kit-компонентов.
- Toast/confirm: только `appMessage` / `appModal` из `@/feedback/appFeedback`
  (не static `message` / `Modal.confirm` из `antd` — иначе console seal ломается).
- Маршрут файла → owner/gates/proof: `npm run agent:scope -- <path>`.
- Совокупный diff → minimum proof:
  `npm run agent:scope -- --changed --json`.
- Видимое UI-изменение без browser proof не завершено.

## Приоритет proof-контракта

Если пользователь явно задал в задаче команды или попросил не запускать часть
проверок, следуй этому контракту. Полный DoD (`test:agent-dod:dual-safe`)
локально запускается **только по явному запросу пользователя**. Незапущенное
честно отмечай как `NOT RUN`, а не как green.

Если разработчик не задал proof-контракт, действует risk-based default:

1. **Inner loop:** только точные focused tests / `vitest related --run` для
   статических импортов; не запускай полный контур после каждой правки.
2. **Перед завершением:** агент сам выбирает проверки, но не ниже
   diff-wide minimum из `agent:scope -- --changed`:
   - `local` — точные focused/related tests;
   - `owner` — focused owner pack и при необходимости fast gates.
   - `cross-owner` — дедуплицированный proof владельцев и consumers.
   Дополнительные проверки агент выбирает по риску.
3. **Merge/release:** полный DoD остаётся обязанностью CI. Локально агент его
   не дублирует без явного запроса пользователя.

Не кэшируй proof по времени. Повторный запуск можно пропустить только для того
же content signature изменённых файлов, lockfile, test config и команды.

## Базовые проверки

```bash
cd frontend

# 0) Path → owner / proof (run first on the file you touch)
npm run agent:scope -- <path>

# 1) Whole diff → required/optional proof
npm run agent:scope -- --changed --json

# 2) Run required proof through argv-safe wrapper; receipt is content-bound
npm run agent:proof-run -- --changed
npm run agent:proof-check -- --changed

# 3) Full DoD — только по явному запросу пользователя
npm run test:agent-dod:dual-safe
```

E2E живёт **только** в `e2e/` — там единственный Playwright config и свой
`node_modules`. Из `frontend/` runner не запускается (две копии
`@playwright/test` роняют discovery), пакет `playwright` здесь остаётся лишь
как библиотека для browser-скриптов:

```bash
cd ../e2e
npx playwright test --list          # 125 сценариев / 34 файла
E2E_BASE_URL=http://127.0.0.1:3003 npm run <script из e2e/package.json>
```

### Когда gates достаточно vs обязателен full DoD

| Ситуация | Минимум proof |
|---|---|
| Явный proof-контракт разработчика | ровно заданные проверки; остальное `NOT RUN` |
| Docs-only, audit, comments | nothing / optional gates |
| `proof_level: local` | рассчитанные focused/related tests |
| `proof_level: owner` | выбранный агентом owner pack; gates по риску |
| Shared test harness/config/deps/CI | расширенный owner proof по риску, но не полный DoD |
| Явный запрос полного прогона | `test:agent-dod:dual-safe` |
| Browser-visible layout/CSS | focused + browser profiles from viewport policy |

**Default agent loop:** per-file `agent:scope` для навигации →
`agent:scope -- --changed` для обязательного минимума → `agent:proof-run` /
`agent:proof-check` для content-bound receipt → дополнительные проверки по
риску. Required proof нельзя уменьшить без явного пользовательского контракта;
в этом случае пропуски остаются `NOT RUN`. Не запускай dual-safe DoD из
эвристики, `proof_level` или merge/release boundary: для локального полного
прогона нужен явный запрос пользователя.
Coverage gate: `node scripts/agent-scope.mjs --coverage` must report
unowned=0 **and** multi-owner=0.

В финальном отчёте перечисли фактически выполненные команды. Не выбранные
агентом и не запрошенные проверки имеют статус `NOT RUN`, а не green.

Дополнительно: focused-тесты и релевантный Playwright-сценарий. Полная
матрица — в стандарте.

## Приоритет инструкций

```text
запрос пользователя и системные инструкции
→ runtime-код, типы и тестовые контракты
→ этот AGENTS.md
→ agent-development-standard.md
→ refactor-backlog.md
→ тематические справочники
→ docs/frontend/archive/
```

Тематический документ может сузить scope или потребовать дополнительные
проверки, но не может ослабить этот контракт.
