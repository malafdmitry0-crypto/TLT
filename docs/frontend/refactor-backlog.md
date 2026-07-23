# Frontend refactor backlog

**Статус:** CLOSED  
**Закрыт:** 2026-07-23  
**Режим:** обязательный hardening + residual полностью закрыты.

Правила новых slice (только по явной цели):  
[agent-development-standard.md](./agent-development-standard.md).

---

## Итоговый baseline (полное закрытие residual)

| Метрика | Значение |
|---|---:|
| `src/styles.css` | freeze-stub |
| `!important` | **0** (was 475 → 37 → **0**; `StyleProvider hashPriority="low"`) |
| Raw colors outside `tokens.css` | **0** |
| Raw colors in `tokens.css` (SoT) | **257** (allowlisted palette) |
| Global layers | tokens → base → app-shell → vendor |
| G3 allowlists | all **0** |

### Как закрыт residual

1. **Raw colors** — все hex/rgba feature CSS сведены в `styles/tokens.css` (`--c-*` / semantic / `--a-*`); снаружи только `var(--…)`.
2. **`!important`** — `StyleProvider hashPriority="low"` в `main.tsx` (Ant CSS-in-JS через `:where`, 0 specificity); owner CSS без `!important`.

Новые pending **не** добавляются по инерции.

## Queue

| ID | Status | Goal |
|---|---|---|
| — | — | **Empty. Backlog + residual closed.** |

## Completed (последние)

| ID | Result | Metric | Commit |
|---|---|---|---|
| **CSS-IMP-01…05** | !important burn-down | 475→37 | … → `c8cc942` |
| **CSS-RAW-01…03** | token map slices | 610→559 | `513c6cb`…`ecd12b0` |
| **CSS-RAW-CLOSE** | bulk known tokens | 559→449 | `1f4beb8` |
| **CSS-RESIDUAL-CLOSE** | all raw → tokens; !important → 0 | raw outside **0**; important **0** | `481ada9` |
| **CSS-OWN-01** | insulation dual-owner → host tokens only | page chrome stripped | `c867fa2` |
| **CSS-OWN-02** | density via form root `--tlt-field-*` | Tlt height/font de-duped | `b7083e2` |
| **CSS-OWN-03** | heat multi-file ownership banners + insulation out of workspace-table | multi-class 29→22; table **615→192** LOC | `8ec1e6d` |

## Promotion rules

Новый pending — только при явной цели пользователя, budget и proof по стандарту.
