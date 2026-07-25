# Frontend TLT: разработка с coding agents

**Актуально на:** 2026-07-26

**Статус:** навигатор; общий норматив находится в стандарте, детали — у
тематических владельцев.

Frontend имеет thin page shells, UI-kit, CSS freeze, architecture ratchets и
agent gates. Residual work и точный следующий контракт находятся **только** в
backlog. Одновременно допускается только одна ACTIVE frontend-очередь. Сейчас
backlog: **ACTIVE** (Track A: production 400-band extracts; Track B: heavy
test contexts). Next: `P-BAND-21`.

## Начать здесь

| Документ | Назначение |
|---|---|
| [`frontend/AGENTS.md`](../../frontend/AGENTS.md) | Короткий обязательный вход для агента |
| [Стандарт разработки](./agent-development-standard.md) | Постоянные правила, DoD и hard stops |
| [Мастер-промпт](./agent-refactor-prompt.md) | Заполняемый контракт одного refactoring slice |
| [Актуальный backlog](./refactor-backlog.md) | Единственный ACTIVE источник `pending` |
| [PR budget](./pr-budget.md) | Нормативный размер одного slice |
| [AF9 historical pointer](./agent-friendly-9-plan.md) | Не очередь; ссылка на archive + audit |

Если пользователь задаёт конкретную цель, она определяет slice. Если цель не
задана, агент берёт первый `pending` из backlog. Пустая очередь не разрешает
придумывать рефакторинг — нужно запросить цель.

## Иерархия

```text
запрос пользователя и системные инструкции
→ runtime-код, типы и тестовые контракты
→ frontend/AGENTS.md
→ agent-development-standard.md
→ refactor-backlog.md
→ тематические справочники
→ archive/
```

Архивные документы и initiative plans не задают очередь, текущие метрики или
обязательные команды. Динамические счётчики — только в датированных
`docs/audit/…` snapshot.

## Тематические справочники

| Документ | О чём |
|---|---|
| [UI-kit](./ui-kit.md) | Design system + **MUST** CompactFieldGrid for new/touched forms |
| [Ant UI Kit — стратегия](./ant-ui-kit-strategy.md) | Ant как внутренняя основа Tlt-фасада |
| [CSS-стратегия](./css-strategy.md) | Ownership, cascade, selectors и CSS-механика layout |
| [Desktop viewport policy](./viewport-policy.md) | `1000` functional, `1280` full workspace, `1440` primary QA |
| [Browser state matrix](./browser-state-matrix.md) | State × viewport × evidence contract (не очередь) |
| [`components/ui-kit/README`](../../frontend/src/components/ui-kit/README.md) | Runtime-контракт UI-компонентов |
| [Архив](./archive/README.md) | Closed initiatives; не маршрутизирует work |
| [Docs cleanup audit](../audit/2026-07-25-frontend-docs-cleanup/snapshot.md) | Inventory after pruning closed plans |

Тематический документ может потребовать дополнительный proof, но не может
ослабить стандарт.

## Runbooks / prompts

| Документ | Назначение |
|---|---|
| [Split large tests by scenario](./prompts/split-large-tests-by-scenario.md) | Template for backlog Track B (`P-TEST-*`) |

Closed AF10–AF12 / meaningful-css / Ant rollout prompt dumps live only under
[archive/](./archive/README.md) and git history.

## Проверенные команды

```bash
cd frontend

# Fast gate: typecheck + lint + architecture/CSS
npm run test:agent-gates

# Full DoD (канон готовности frontend): fast gate + unit + integration + build
npm run test:agent-dod

# Узкие наборы
npm run test:architecture
npm run css:architecture
npm run test:ui-kit
npm run test:unit
npm run test:integration
npm run build
```

Для видимого UI используй релевантный Playwright spec из `e2e/tests/`. Например:

```bash
cd e2e
E2E_BASE_URL=http://127.0.0.1:3003 npm run test:ui-kit-parity:chrome
```

Недоступный обязательный browser proof означает `blocked`, а не `pass`.

## Карта кода

```text
frontend/src/pages/heatcalc/          # Heat feature
frontend/src/pages/electrical/        # Electrical feature
frontend/src/pages/specification/     # Specification feature
frontend/src/components/ui-kit/       # Feature-agnostic public UI
frontend/src/domain/                  # Pure domain models
frontend/src/api/                     # HTTP/query boundaries
frontend/src/store/                   # Cross-screen client state
frontend/src/theme/appTheme.ts         # Ant ConfigProvider theme SoT
frontend/src/styles/tokens.css         # CSS custom properties only
frontend/src/styles/base.css           # Document root + shared utilities
frontend/src/styles/app-shell.css      # Application shell layout
frontend/src/styles/vendor-overrides.css # App-wide third-party overrides
frontend/src/styles.css               # Freeze-stub; новый feature CSS запрещён
frontend/src/__tests__/unit/architecture/
e2e/tests/
```

Массовый переход в новый `features/` namespace не запланирован. Улучшения идут
strangler-подходом внутри текущих owner-зон.
