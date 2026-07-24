# PR budget — frontend vertical slice

**Актуально на:** 2026-07-24

**Статус:** единственный норматив числового размера frontend-slice

Workflow, invariants, proof, Git protocol и hard stops принадлежат
[стандарту](./agent-development-standard.md).

## Жёсткий budget

```text
max 1 page/shell file
max 2 production helper/CSS files
max 2 test/architecture-baseline files
1 owner
characterization first
src/styles.css: net LOC ≤ 0
```

Допустимые owners:

```text
heat
electrical
specification
reports
projects
admin
auth
ui
shared
css
architecture
tooling
qa
docs
```

Owner описывает ответственность, а не разрешает смешивать несколько зон.
Например, architecture gate не исправляет найденный feature debt в том же
slice, а docs audit не меняет runtime.

Если задача не помещается, раздели её и выполни только первую независимо
проверяемую часть. Нельзя расширять budget после начала реализации или считать
удалённые строки компенсацией лишнего owner.

## Границы

- Общие invariants и hard stops:
  [agent-development-standard.md](./agent-development-standard.md).
- CSS и layout mechanics: [css-strategy.md](./css-strategy.md).
- UI-kit и формы: [ui-kit.md](./ui-kit.md).
- Browser profiles: [viewport-policy.md](./viewport-policy.md).
- Текущая задача: [refactor-backlog.md](./refactor-backlog.md).

Budget не ослабляет ни один из этих контрактов.
