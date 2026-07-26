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
- Видимое UI-изменение без browser proof не завершено.

## Базовые проверки

```bash
cd frontend

# 0) Path → owner / proof (run first on the file you touch)
npm run agent:scope -- <path>

# 1) Fast gate: typecheck + lint (--max-warnings 0 + Arch:* rules) + architecture/CSS ratchets (~10–15 s)
npm run test:agent-gates

# 2) Full DoD — единственное имя полного proof (то же в CI). ~145 s, quiet host n=3
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
| Docs-only, audit, comments | nothing / optional gates |
| Tooling scripts, AGENTS, scope rules | `test:agent-gates` |
| UI-kit story / prop docs only | `storybook:coverage:strict` + gates |
| Production runtime/types/hooks/pages | **focused tests** + `test:agent-gates` |
| `agent:scope` → `full_dod_required: true` | + **`test:agent-dod:dual-safe`** before commit |
| Changed test harness shared by many suites | dual-safe DoD |
| Browser-visible layout/CSS | focused + browser profiles from viewport policy |

**Default agent loop:** `agent:scope` → run `recommended_commands` /
`focused_proof.argv` (exact paths — never invent globs) →
`test:agent-gates`. Escalate to dual-safe DoD only when scope says
`full_dod_required: true` or when you changed cross-cutting runtime/tests.
Coverage gate: `node scripts/agent-scope.mjs --coverage` must report
unowned=0 **and** multi-owner=0.

`test:agent-gates` может быть зелёным при красном полном DoD — перед commit
используй dual-safe DoD, если slice затрагивает runtime/tests per table above.

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
