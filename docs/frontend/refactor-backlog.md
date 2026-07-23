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
| `HeatCalcNormalGlideGrid.tsx` | 330 LOC |
| Layer→pages allowlist | 1 edge |
| Cross-feature allowlist | 3 edges |
| Feature-pages outsider allowlist | 2 edges |

## Queue

| ID | Status | Domain | Goal | Allowed scope | Invariants | Focused proof | Depends |
|---|---|---|---|---|---|---|---|
| — | — | — | Queue empty. Ask user for next goal or promote a new pending. | — | — | — | — |

## Completed

| ID | Result | Before → after | Production commit |
|---|---|---|---|
| **FDEP-01** | ReportPage uses `@/hooks/useLegacyElectricalVariantContext` | outsider edges 6→5 | `2df9bc4` |
| **FDEP-02** | ReportWizardPage uses public hook bridge | outsider 5→4 | `2df9bc4` |
| **FDEP-03** | WorkspacePage uses public hook bridge | outsider 4→3 | `2df9bc4` |
| **FDEP-04** | Specification model uses public hook bridge; cross-feature re-export edge removed | outsider 3→2; cross 4→3 | `2df9bc4` |

Remaining outsider: hooks→pages selection core; UIKitPage→heatcalc icons.  
Remaining cross: elec→heatcalc Glide/ResizableColumnTitle (3 edges).

## Promotion rules

Новый pending добавляется только когда:

- owner и пользовательская ценность понятны;
- scope помещается в budget;
- invariants и focused proof определены;
- задача не дублирует уже завершённый slice;
- текущие метрики подтверждены кодом, а не архивным документом.

Если очередь пуста, агент не придумывает работу и просит пользователя задать
цель.
