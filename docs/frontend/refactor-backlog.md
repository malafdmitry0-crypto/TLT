# Frontend refactor backlog

**Статус:** CLOSED  
**Закрыт:** 2026-07-23  
**Режим:** обязательный hardening и residual queue закрыты.

Правила выполнения новых slice (если появятся):  
[agent-development-standard.md](./agent-development-standard.md).

---

## Итоговый baseline (закрытие)

| Метрика | Значение |
|---|---:|
| `src/styles.css` | freeze-stub |
| `!important` | **37** (≤75 ✅; was 475) — accepted Ant CSS-in-JS floor |
| Raw colors | **449** (was 610 at start of RAW track; was ~559 before CLOSE) |
| Global layers | tokens → base → app-shell → vendor |
| G3 allowlists | all **0** |
| Hotspots | Elec 545 · Heat 484 · Glide shared ~330 · Wizard 415 |

### Accepted residual (не backlog)

| Остаток | Почему не queue |
|---|---|
| **37 `!important`** в compact-fields / heat-object / cable / insulation / ui-kit / field-chrome | Ant Design CSS-in-JS; снятие без browser proof ломает density SC-03. Ratchet держит floor. |
| **~449 raw colors** (в т.ч. unique hex в ui-kit / elec / primitives / table-chrome) | Не маппятся 1:1 на shared tokens; дальнейший burn-down только по новой product-задаче на палитру. |
| Hotspot LOC | Отдельный scope; не CSS residual. |

Новые pending **не** добавляются «по инерции». Только при явной цели пользователя или product decision, с budget и proof по стандарту.

## Queue

| ID | Status | Domain | Goal |
|---|---|---|---|
| — | — | — | **Empty. Backlog closed.** |

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
| **CSS-RAW-02** | tlt-form-controls hex → tokens | raw **583→570**; tlt-form **36→23** | `2d6efe3` |
| **CSS-RAW-03** | table-chrome hex → tokens | raw **570→559**; table-chrome **66→55** | `ecd12b0` |
| **CSS-RAW-CLOSE** | bulk map known token hex across residual CSS | raw **559→449** | `1f4beb8` |

## Promotion rules (если backlog откроют снова)

Новый pending добавляется только когда:

- owner и пользовательская ценность понятны;
- scope помещается в budget;
- invariants и focused proof определены;
- задача не дублирует уже завершённый slice;
- текущие метрики подтверждены кодом, а не архивным документом.

Без явной цели пользователя агент **не** продолжает residual burn-down.
