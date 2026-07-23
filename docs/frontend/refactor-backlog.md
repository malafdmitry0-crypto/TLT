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
| `!important` baseline | **44** (≤75 ✅) |
| Global layers | tokens → base → **app-shell** (incl. header) → vendor |
| G3 allowlists | all **0** |
| `useElecCalcWorkspaceModel.tsx` | 545 LOC |
| `useHeatCalcPageModel.ts` | 484 LOC |
| Shared `NormalGlideGrid` | ~330 LOC |

## Queue

| ID | Status | Domain | Goal | Allowed scope | Invariants | Focused proof | Depends |
|---|---|---|---|---|---|---|---|
| — | — | — | Queue empty. Optional next: ui-kit.css showcase locks, heatcalc-field-chrome, raw-color burn-down. | — | — | — | — |

## Completed

| ID | Result | Before → after | Production commit |
|---|---|---|---|
| **FDEP-01…04** | public hook bridge for Report/Workspace/Spec | outsider 6→2 | `2df9bc4` |
| **FDEP-05…07** | shared icons / ResizableColumnTitle / NormalGlide | cross **0** | `11f4f80` |
| **FDEP-08** | ER selection hooks leave pages | layer/outsider **0** | `3ab4ead` |
| **CSS-SHELL-01** | app-header folded into app-shell layer | main import −1 file | `cfa1bf7` |
| **CSS-IMP-01** | safe !important burn-down (radius/padding/borders) | **67→55** | `cfa1bf7` |
| **CSS-IMP-02** | Tlt vs Ant split in compact-fields | **55→52**; compact 18→15 | `cccc6c4` |
| **CSS-IMP-03** | cable/heat-object !important shrink | **52→50** | `c2e68f1` |
| **CSS-IMP-04** | insulation-layers-table !important burn-down | **50→44**; ins 10→4 | `777f1d7` |

## Promotion rules

Новый pending добавляется только когда:

- owner и пользовательская ценность понятны;
- scope помещается в budget;
- invariants и focused proof определены;
- задача не дублирует уже завершённый slice;
- текущие метрики подтверждены кодом, а не архивным документом.

Если очередь пуста, агент не придумывает работу и просит пользователя задать
цель.
