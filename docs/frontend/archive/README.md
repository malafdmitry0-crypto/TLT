# История frontend hardening

**Статус:** историческая сводка; не маршрутизирует работу

**Период:** 2026-07-23 — 2026-07-24

Полные планы, prompts, snapshots и inventories удалены из рабочего дерева,
чтобы старые метрики и команды не попадали в поиск агента. Они остаются
доступны через Git history. Текущая очередь находится только в
[refactor-backlog.md](../refactor-backlog.md), постоянные правила — в
[agent-development-standard.md](../agent-development-standard.md).

Сохранённые historical summaries в этой папке:

- [agent-friendly-9-plan-historical.md](./agent-friendly-9-plan-historical.md) —
  AF9 initiative evidence without live scores or queue authority.

## Что было достигнуто

- Heat, Electrical и Specification page shells разделены по owner-зонам.
- `src/styles.css` превращён в freeze-stub; feature CSS перемещён к владельцам.
- Dependency/cycle, complexity и CSS ratchets подключены к agent gates.
- `!important` и raw colors вне `tokens.css` сведены к нулю.
- Публичный UI-kit, parity tests и Storybook catalog получили runtime owners.
- Появилась каноническая полная команда `npm run test:agent-dod`.
- Electrical regression после крупного extraction восстановлен типизированными
  presentation contracts; CI получил full DoD и repository user flows.
- Doc-truth residual (`P0-DOC-TRUTH-01`) убрал ACTIVE/COMPLETE contradiction и
  вынес dynamic metrics в dated audit.

## Representative evidence

| Этап | Commit |
|---|---|
| Refactor factory и UI-kit foundation | `c87a7e6` |
| Heat / Electrical / Specification thin shells | `524461a`, `5150ab5`, `b29e176` |
| `styles.css` freeze milestone | `3f71845` |
| Agent, dependency и CSS gates | `1170198`, `1111481`, `f72e7c6` |
| CSS residual и ownership close | `481ada9`, `8ec1e6d` |
| Full frontend DoD command | `5352636` |
| Electrical recovery и CI hardening | `93144a6`, `82a3de9` |
| Electrical test split | `9dfa4b1`, `46c24ca`, `7a50a4b` |
| Explicit shell/presentation contracts | `9c3e179`, `8d3c2dd`, `644ef13` |
| Inline/layout/UI/viewport executable policy | `42ae0b2` |
| UI-kit Storybook catalog | `66feccf` |
| AF9 plan marked complete (later corrected by doc-truth) | `2f6754d` |

## Как читать историю

Исторические числа не являются текущим baseline. Для расследования используй
runtime-код, architecture fixtures, текущий HEAD и последний dated audit
(`docs/audit/…`). Удалённый документ при необходимости восстанавливается только
для анализа через `git log` / `git show`; его нельзя возвращать как активную
очередь, норматив или вторую «текущую» оценку.
