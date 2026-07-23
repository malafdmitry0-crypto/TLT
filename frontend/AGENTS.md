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
- Не создавай новые Heat ↔ Electrical ↔ Specification deep imports.
- UI-kit не знает о feature/domain; feature UI импортирует kit только через
  `@/components/ui-kit`.
- Видимое UI-изменение без browser proof не завершено.

## Базовые проверки

```bash
cd frontend
npm run test:agent-gates
npm run test:unit
npm run test:integration
npm run build
```

Дополнительно запускай focused-тесты и релевантный Playwright-сценарий. Полная
матрица и stop conditions описаны в стандарте.

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
