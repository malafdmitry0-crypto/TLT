# PR budget — frontend vertical slice

**Актуально на:** 2026-07-23  
**Статус:** краткая памятка; полный норматив —
[agent-development-standard.md](./agent-development-standard.md).

## Жёсткий budget

```text
max 1 page/shell file
max 2 production helper/CSS files
max 2 test/architecture-baseline files
1 feature-owner
characterization first
src/styles.css: net LOC ≤ 0
```

Feature-owner: `heat`, `electrical`, `specification`, `reports`, `projects`,
`admin`, `auth`, `ui`, `shared` или `css`. Это ownership, а не разрешение
смешивать несколько зон в одном slice.

Если задача не помещается, раздели её и выполни только первую независимо
проверяемую часть. Нельзя расширять budget после начала реализации.

## Запреты

- новые Heat ↔ Electrical ↔ Specification deep imports;
- `components/hooks/utils → pages` за пределами существующего shrink-only
  allowlist;
- domain logic внутри UI-kit;
- feature CSS в `src/styles.css`;
- `!important`, bare `.ant-*` и статические JSX `style`/`styles`;
- новые feature-ссылки на legacy palette `--c-*`/`--a-*`;
- CSS без owner root, рост специфичности и неканонические breakpoints;
- рост architecture baseline/allowlist внутри feature-slice;
- изменение UX/API/query/routes/units/formulas/UUID semantics вне явного scope;
- ослабление тестов или типизации.

## Минимальный proof

| Изменение | Focused proof |
|---|---|
| Pure model | Unit: happy path + edge/failure |
| Workflow/hook | Unit + ближайший integration wiring test |
| Dependency edge | Focused integration + `npm run test:architecture` |
| UI-kit/form density | UI-kit tests + parity Playwright |
| Feature layout/CSS | Focused UI test + primary/edge proof по `viewport-policy.md` |
| Route/query wiring | Relevant integration + e2e user flow |

После focused proof всегда:

```bash
cd frontend
npm run test:agent-gates
npm run test:unit
npm run test:integration
npm run build
```

Для UI обязательны relevant Playwright, keyboard/focus, overflow,
console/network audit. Без browser proof slice получает `blocked`.

## Git

После полного DoD агент создаёт conventional production commit. Для backlog
slice затем создаётся отдельный docs-only commit со статусом, метриками и hash
production commit. Push — только по явному запросу пользователя.

## Следующая задача

Не хранится в этом документе. Единственный источник:
[refactor-backlog.md](./refactor-backlog.md).
