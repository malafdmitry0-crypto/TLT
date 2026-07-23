# Frontend TLT: разработка с coding agents

**Актуально на:** 2026-07-23  
**Статус:** навигатор; нормативные правила находятся в стандарте.

Frontend уже прошёл основной hardening: thin page shells, UI-kit, CSS freeze,
architecture ratchets и agent gates существуют. Следующая цель — сохранять это
состояние и выполнять изменения маленькими доказуемыми slices.

## Начать здесь

| Документ | Назначение |
|---|---|
| [`frontend/AGENTS.md`](../../frontend/AGENTS.md) | Короткий обязательный вход для агента |
| [Стандарт разработки](./agent-development-standard.md) | Постоянные правила, DoD и hard stops |
| [Мастер-промпт](./agent-refactor-prompt.md) | Полный исполняемый prompt одного refactoring slice |
| [Актуальный backlog](./refactor-backlog.md) | Единственный источник `pending` |
| [Цель agent-friendly 9/10](./agent-friendly-9-plan.md) | Явная инициатива: чеклист, exit criteria и task prompts |
| [PR budget](./pr-budget.md) | Краткая памятка по размеру slice |

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

Архивные документы не задают очередь, текущие метрики или обязательные команды.

## Тематические справочники

| Документ | О чём |
|---|---|
| [LLM-friendly стиль](./llm-friendly-style.md) | Колокация, pure models, явные зависимости |
| [UI-kit](./ui-kit.md) | Публичный UI API и границы design system |
| [CSS-стратегия](./css-strategy.md) | Ownership, tokens, feature roots и freeze `styles.css` |
| [`components/ui-kit/README`](../../frontend/src/components/ui-kit/README.md) | Runtime-контракт UI-компонентов |
| [Архив](./archive/README.md) | Завершённые планы, prompts и snapshots |

Тематический документ может потребовать дополнительный proof, но не может
ослабить стандарт.

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
