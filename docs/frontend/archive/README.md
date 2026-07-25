# История frontend hardening

**Статус:** историческая сводка; не маршрутизирует работу

**Период:** 2026-07-23 — 2026-07-25

Полные initiative plans, executed prompts и live scorecards удалены из
рабочего дерева, чтобы старые метрики и команды не попадали в поиск агента.
Они остаются в Git history. Текущая очередь — только
[refactor-backlog.md](../refactor-backlog.md); постоянные правила —
[agent-development-standard.md](../agent-development-standard.md).

## Summaries in this folder

| Summary | Initiative |
|---|---|
| [agent-friendly-9-plan-historical.md](./agent-friendly-9-plan-historical.md) | AF9 |
| [af10-historical.md](./af10-historical.md) | AF10 + friendliness fix runbook |
| [af11-historical.md](./af11-historical.md) | AF11 practical hardening |
| [af12-historical.md](./af12-historical.md) | AF12 residual + UI Kit desktop |
| [meaningful-css-historical.md](./meaningful-css-historical.md) | Meaningful CSS plan |
| [ant-ui-kit-rollout-historical.md](./ant-ui-kit-rollout-historical.md) | Ant UI Kit rollout A–D |
| [risk-recovery-and-p-series-historical.md](./risk-recovery-and-p-series-historical.md) | RISK + P0–P9 |

## Что было достигнуто (high level)

- Heat, Electrical и Specification page shells по owner-зонам.
- `src/styles.css` freeze-stub; feature CSS у владельцев; ratchets в agent gates.
- `!important` / raw colors вне tokens сведены к нулю (gates).
- Публичный UI-kit, parity tests; Ant-backed Tlt facade (rollout A–D).
- Canonical `npm run test:agent-dod`.
- Doc-truth: одна ACTIVE очередь; dynamic metrics только в dated audit.
- UI Kit desktop ≥1000 px; owner CSS split; 768 media retired in UI Kit.

## Как читать историю

Исторические числа не являются текущим baseline. Для расследования: runtime,
architecture fixtures, HEAD и последний dated audit (`docs/audit/…`).
Удалённый документ восстанавливается через `git log` / `git show`; его нельзя
возвращать как активную очередь, норматив или вторую «текущую» оценку.
