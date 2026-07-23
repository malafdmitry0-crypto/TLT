# Frontend refactor backlog

**Статус:** единственная активная очередь  
**Актуально на:** 2026-07-23  
**Режим:** optional long-term maintenance; обязательный hardening завершён.

Этот файл отвечает только на вопрос «какой refactoring slice следующий».
Правила выполнения находятся в
[agent-development-standard.md](./agent-development-standard.md).

Допустим максимум один `in_progress`. Агент берёт первый `pending`, если
пользователь не передал явный slice. Метрики обязательно пересчитываются перед
работой.

## Проверенный baseline

| Метрика | Текущее значение |
|---|---:|
| `src/styles.css` | freeze-stub |
| `!important` baseline | 67 (≤75 long-term ✅) |
| `useElecCalcWorkspaceModel.tsx` | 545 LOC |
| `useHeatCalcPageModel.ts` | 484 LOC |
| Shared `NormalGlideGrid` | ~330 LOC |
| Layer→pages allowlist | **0** |
| Cross-feature allowlist | **0** |
| Feature-pages outsider allowlist | **0** |

## Queue

| ID | Status | Domain | Goal | Allowed scope | Invariants | Focused proof | Depends |
|---|---|---|---|---|---|---|---|
| — | — | — | Queue empty. Ask user for next goal or promote a new pending. | — | — | — | — |

## Completed

| ID | Result | Before → after | Production commit |
|---|---|---|---|
| **FDEP-01** | ReportPage public hook bridge | outsider 6→5 | `2df9bc4` |
| **FDEP-02** | ReportWizardPage public hook bridge | outsider 5→4 | `2df9bc4` |
| **FDEP-03** | WorkspacePage public hook bridge | outsider 4→3 | `2df9bc4` |
| **FDEP-04** | Specification model public hook bridge | outsider 3→2; cross 4→3 | `2df9bc4` |
| **FDEP-05** | ObjectTypeIcons → `components/shared` | outsider −UIKit edge | `11f4f80` |
| **FDEP-06** | ResizableColumnTitle → `components/shared` | cross −1 | `11f4f80` |
| **FDEP-07** | NormalGlideGrid + types → shared | cross **0** | `11f4f80` |
| **FDEP-08** | ER selection + commands → `hooks/` | layer/outsider **0** | `3ab4ead` |

G3 dependency allowlists are empty. Optional next themes (not queued): further
`!important` family burn-down, raw-color burn-down, app-header→app-shell migration.

## Promotion rules

Новый pending добавляется только когда:

- owner и пользовательская ценность понятны;
- scope помещается в budget;
- invariants и focused proof определены;
- задача не дублирует уже завершённый slice;
- текущие метрики подтверждены кодом, а не архивным документом.

Если очередь пуста, агент не придумывает работу и просит пользователя задать
цель.
