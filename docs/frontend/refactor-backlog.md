# Frontend refactor backlog

**Статус:** EMPTY QUEUE — residual P0–P4 закрыты; новый pending только по цели

**Актуально на:** 2026-07-24

**Следующий незакрытый контракт:** — (не придумывать работу)

Это **единственный** источник текущего `pending` для frontend. Одновременно
может существовать только одна ACTIVE frontend-очередь (когда pending есть).
Completed initiative plans не имеют права объявлять `COMPLETE`, пока backlog
содержит pending acceptance.

Постоянные правила: [стандарт](./agent-development-standard.md).
Размер slice: [PR budget](./pr-budget.md).
Исполняемый шаблон: [мастер-промпт](./agent-refactor-prompt.md).
Point-in-time метрики: [audit snapshot](../audit/2026-07-24-p0-doc-truth/snapshot.md).
История AF9: [archive summary](./archive/agent-friendly-9-plan-historical.md).

## Правила очереди

- Один запуск выполняет один `pending` slice и одного owner.
- Пункт становится `done` только после focused proof (и DoD, если slice
  затрагивает runtime/tests/guardrails).
- Наличие patch или untracked baseline не меняет статус автоматически.
- Before-метрики пересчитываются из текущего дерева; audit snapshot и старые
  таблицы не являются разрешением повысить baseline.
- Новый пункт добавляется только по явной цели пользователя.
- Нормативные документы хранят правила; быстро устаревающие счётчики живут
  только в датированных `docs/audit/…`.
- Не объявляй инициативу завершённой, пока в этом файле есть pending.

## Residual queue (honest agent-friendly 9/10)

```text
P0-DOC-TRUTH-01
  → P1-GUARDRAIL-TRUTH-01
  → P2-ELEC-FEEDBACK-01
  → P3-ELEC-TYPE-BOUNDARY-01
  → P4-CONTEXT-REDUCTION-01
```

### Done

- [x] **P0-DOC-TRUTH-01 — единый достоверный источник состояния.**

  Один ACTIVE queue (`refactor-backlog.md`). AF9 plan сведён к historical
  pointer; dynamic metrics вынесены в
  [audit snapshot](../audit/2026-07-24-p0-doc-truth/snapshot.md). Убраны
  противоречие ACTIVE/COMPLETE и двойные «текущие» оценки. Stale completed
  checklist с таблицами «Сейчас» больше не живёт в нормативном пути.

- [x] **P1-GUARDRAIL-TRUTH-01 — guardrails должны измерять заявленное.**

  Ant bidirectional + stale fail; inline JSX AST + per-class counts;
  coordinate declaration matching (`grid-row`/`grid-column`/`order` only);
  fixtures for old bug → fix. Ant 112→90; coordinate 117→88.
  Inline total 517→520 is attribute-level remeasure (same-line multi-attr),
  not production growth; per-class gates prevent static↔runtime swaps.

- [x] **P2-ELEC-FEEDBACK-01 — стабильный Electrical feedback loop.**

  `elec-integration` `maxWorkers: 2`; shared reset; split slow
  results-settings into three owners. Proof: 57/57 ×3 (~69s), focused ≤21s,
  dual concurrent both green, full integration 168/168.

- [x] **P3-ELEC-TYPE-BOUNDARY-01 — убрать casts на presentation boundary.**

  16 `as never` removed from workspace boundary; real props contracts;
  type-escape baseline 27→11. Runtime behavior unchanged.

- [x] **P4-CONTEXT-REDUCTION-01 — уменьшить один высокорисковый контекст.**

  Owner `useElecCalcWorkspaceModel.tsx`: extract
  `useElecCalcWorkspaceColumnSettingsController` (column preferences / view /
  draft / params panel). Imports 32→27; LOC 463→422; import-context baseline
  shrink-only. Characterization + architecture green.

### Pending

— empty. New pending only by explicit user goal.

## AF9 — ранее выполненные slices (evidence only)

Эти пункты закрыты commit-ами ниже. Они **не** являются второй очередью и
**не** доказывают финальную приёмку 9/10, пока residual queue не пуста.

| Slice | Результат | Evidence |
|---|---|---|
| `AF9-ELEC-REG-01` | Electrical presentation contracts восстановлены | `93144a6` |
| `AF9-CI-01` / `AF9-CI-02` | DoD CI + demo user-flows | `82a3de9` |
| `AF9-TEST-HARNESS-01` | Electrical integration harness | `9dfa4b1` |
| `AF9-TEST-SPLIT-01` | Electrical integration по use cases | `46c24ca` |
| `AF9-TEST-NOISE-01` | ErrorBoundary console silence локализован | `7a50a4b` |
| `AF9-TYPE-*` / `AF9-ELEC-CONTRACT-01` | Explicit shell/presentation contracts | `9c3e179`, `8d3c2dd` |
| `AF9-CONTEXT-GATE-01` / `AF9-TYPE-GATE-01` | Import/type-escape ratchets | `644ef13` |
| `AF9-ARTIFACT-01` | `tsconfig.tsbuildinfo` untracked | `0439f35` |
| `AF9-INLINE-*` / `AF9-LAYOUT-*` / `AF9-UI-*` / `AF9-VIEWPORT-01` | Policy baselines + first migrations | `42ae0b2` |

## Closure rule

После закрытия последнего pending:

1. backlog получает статус без ACTIVE residual (empty queue);
2. AF9 historical summary остаётся в archive;
3. новый point-in-time audit фиксирует HEAD, команды, среду и пересчитанные
   факты;
4. только тогда допустимо говорить о завершении residual-инициативы — не раньше.
