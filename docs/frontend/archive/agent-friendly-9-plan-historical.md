# AF9 initiative — historical summary

**Статус:** HISTORICAL — не очередь и не норматив

**Период:** 2026-07-23 — 2026-07-24

**Последний commit инициативы в main history:** `2f6754d`

Этот файл сохраняет происхождение agent-friendly 9/10 initiative. Он **не**
маршрутизирует работу, **не** задаёт текущие оценки и **не** может быть
`COMPLETE`/`ACTIVE` одновременно с [актуальным backlog](../refactor-backlog.md).

Текущий `pending` — только в `docs/frontend/refactor-backlog.md`.
Point-in-time метрики — только в датированных audit snapshot, не здесь.

## Что инициатива закрыла (evidence по commit)

| Область | Результат | Evidence |
|---|---|---|
| Electrical regression | presentation contracts восстановлены | `93144a6` |
| CI DoD / user-flows | `frontend-dod` + demo `user-flows` | `82a3de9` |
| Electrical integration topology | harness + 7 use-case specs | `9dfa4b1`, `46c24ca`, `7a50a4b` |
| Shell / presentation types | explicit props; consumer-owned groups | `9c3e179`, `8d3c2dd` |
| Import / type-escape ratchets | shrink-only gates | `644ef13` |
| Inline / layout / UI / viewport policy | machine-readable baselines + migrations | `42ae0b2` |
| Artifact hygiene | `tsconfig.tsbuildinfo` untracked | `0439f35` |

Полный checklist и старые «Сейчас»-таблицы удалены из рабочего дерева, чтобы
устаревшие счётчики и ложный статус `COMPLETE` не попадали в поиск агента.
При необходимости восстанавливай текст через:

```bash
git show 2f6754d:docs/frontend/agent-friendly-9-plan.md
```

## Почему AF9 не объявлен завершённым

На момент `P0-DOC-TRUTH-01` одновременно существовали:

- план со статусом `COMPLETE` и числовыми оценками 8.6 / 9.1 / 9.2;
- backlog со статусом `ACTIVE` и pending acceptance;
- snapshot-таблицы, которые смешивали уже изменившиеся факты
  (монолитный Electrical test, `Record<string, any>`, «неклассифицированные»
  inline styles) с утверждением финальной приёмки.

Правило: **нельзя** объявлять инициативу `COMPLETE`, пока backlog или
acceptance содержат pending. Residual queue после doc-truth slice описана в
`refactor-backlog.md`.

## Связанные источники

- Очередь: [refactor-backlog.md](../refactor-backlog.md)
- Норматив: [agent-development-standard.md](../agent-development-standard.md)
- Snapshot doc-truth: [docs/audit/2026-07-24-p0-doc-truth/](../../audit/2026-07-24-p0-doc-truth/)
- Краткая история hardening: [archive/README.md](./README.md)
