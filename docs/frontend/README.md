# Frontend: планы рефакторинга и LLM-friendly стиль

**Актуально на:** 2026-07-23  
**Контекст:** UI kit уже есть (`frontend/src/components/ui-kit/`), витрина `/ui-kit`, e2e parity kit↔Heat.  
**Цель:** маленький явный граф зависимостей, тонкие shell-страницы, единый form layer, управляемый CSS.

## S0-lite factory (done 2026-07-23)

| Gate | Command / file |
|---|---|
| Architecture + wizard | `cd frontend && npm run test:architecture` |
| S0 gates bundle | `cd frontend && npm run test:s0-gates` |
| UI kit unit+integration | `cd frontend && npm run test:ui-kit` |
| Parity e2e kit↔Heat | `cd e2e && E2E_BASE_URL=http://127.0.0.1:3003 npm run test:ui-kit-parity:chrome` |
| PR budget | [pr-budget.md](./pr-budget.md) |
| Metrics baseline | [metrics-baseline.md](./metrics-baseline.md) |

**styles.css freeze:** no new feature rules; net LOC ≤ 0 unless moving CSS out.  
**Next slice:** Heat geometry → CompactField ([agent-prompt-ui-kit-strangler.md](./agent-prompt-ui-kit-strangler.md)).

## Содержание

| Документ | О чём |
|---|---|
| [pr-budget.md](./pr-budget.md) | Budget PR + proof commands |
| [metrics-baseline.md](./metrics-baseline.md) | LOC / inverted deps baseline |
| [llm-friendly-style.md](./llm-friendly-style.md) | Как писать фронт, понятный людям и LLM |
| [rewrite-plan.md](./rewrite-plan.md) | План strangler-миграции всего фронта |
| [accelerated-rewrite-plan.md](./accelerated-rewrite-plan.md) | Ускоренный план, расчёт AI-команды и параллельные workstreams |
| [hotspots.md](./hotspots.md) | Самые проблемные места |
| [ui-kit.md](./ui-kit.md) | Что уже есть в UI kit; layout kit — нужен ли |
| [css-strategy.md](./css-strategy.md) | Глобально vs в компоненте; упрощение CSS |
| [refactoring-effectiveness.md](./refactoring-effectiveness.md) | Как сделать рефакторинг эффективным |
| [agent-prompt-ui-kit-strangler.md](./agent-prompt-ui-kit-strangler.md) | Промпт для агента (миграция на kit) |
| [ai-frontend-argument.md](./ai-frontend-argument.md) | Аргументы: ИИ и фронт при наличии системы |

## Быстрый старт для агента / разработчика

1. Прочитать `pr-budget.md`, `llm-friendly-style.md` и `rewrite-plan.md`.
2. Не big-bang: budget PR (1 shell + 2 extract + 2 tests).
3. UI полей — только `@/components/ui-kit`.
4. `styles.css` — freeze (только delete/move).
5. Proof: `npm run test:s0-gates` + e2e `test:ui-kit-parity` при касании форм.

## Ключевые пути в коде

```text
frontend/src/components/ui-kit/     # design system (fields + primitives)
frontend/src/components/form-controls/  # Tlt* implementation (re-export via ui-kit)
frontend/src/pages/UIKitPage.tsx   # витрина /ui-kit
frontend/src/pages/HeatCalcPage.tsx
frontend/src/pages/ElecCalcPage.tsx
frontend/src/pages/heatcalc/
frontend/src/pages/electrical/
frontend/src/styles.css            # legacy dump (~7k LOC) — ужимать
e2e/tests/ui-kit-heatcalc-parity.spec.ts
```

## Иерархия решений

1. **Поведение** — код + тесты (не этот docs-набор как SoT runtime).
2. **Этот каталог** — план и соглашения по рефакторингу фронта.
3. Исторические `docs/audit/*` — evidence срезов, не текущий план.
