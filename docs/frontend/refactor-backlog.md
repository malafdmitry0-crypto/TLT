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
| `!important` baseline | **37** (≤75 ✅; was 475) |
| Raw colors | **583** (was 610) |
| Global layers | tokens → base → app-shell (header) → vendor |
| G3 allowlists | all **0** |
| Hotspots | Elec 545 · Heat 484 · Glide shared ~330 · Wizard 415 |

## Queue

| ID | Status | Domain | Goal | Allowed scope | Invariants | Focused proof | Depends |
|---|---|---|---|---|---|---|---|
| — | — | — | Queue empty. Optional next: compact-fields Ant locks (15), heat-object Ant locks (6), continue raw-color burn-down (`tlt-form-controls` / `table-chrome` / `ui-kit`). | — | — | — | — |

## Completed

| ID | Result | Before → after | Production commit |
|---|---|---|---|
| **FDEP-01…04** | public hook bridge Report/Workspace/Spec | outsider 6→2 | `2df9bc4` |
| **FDEP-05…07** | shared icons / ResizableColumnTitle / NormalGlide | cross **0** | `11f4f80` |
| **FDEP-08** | ER selection hooks leave pages | layer/outsider **0** | `3ab4ead` |
| **CSS-SHELL-01** | app-header → app-shell | main import −1 | `cfa1bf7` |
| **CSS-IMP-01** | safe radius/padding/border burn-down | 67→55 | `cfa1bf7` |
| **CSS-IMP-02** | compact-fields Tlt vs Ant split | 55→52 | `cccc6c4` |
| **CSS-IMP-03** | cable/heat-object shrink | 52→50 | `c2e68f1` |
| **CSS-IMP-04** | insulation table BEM/Tlt burn-down | 50→44 | `777f1d7` |
| **CSS-IMP-05** | ui-kit + field-chrome + cable mirror | **44→37** | `c8cc942` |
| **CSS-RAW-01** | shared color tokens + calc-spreadsheet hex | raw **610→583**; calc **71→36** | `513c6cb` |

## Promotion rules

Новый pending добавляется только когда:

- owner и пользовательская ценность понятны;
- scope помещается в budget;
- invariants и focused proof определены;
- задача не дублирует уже завершённый slice;
- текущие метрики подтверждены кодом, а не архивным документом.

Если очередь пуста, агент не придумывает работу и просит пользователя задать
цель.
