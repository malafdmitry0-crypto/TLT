# AF10 parallel execution queue

**Статус:** HISTORICAL / CLOSED — завершён на HEAD `faa6aab`  
**Актуально на:** 2026-07-25 (закрыт)  
**Маршрутизация pending:** только [refactor-backlog.md](./refactor-backlog.md)  
**Исторические источники:**
- [af10-residual-close-plan.md](./af10-residual-close-plan.md)
- [meaningful-css-plan.md](./meaningful-css-plan.md)
- финальный audit: [../audit/2026-07-25-frontend-agent-friendliness/snapshot.md](../audit/2026-07-25-frontend-agent-friendliness/snapshot.md)

> Этот файл **не** является ACTIVE-очередью и **не** задаёт `pending`.
> Практический hardening: [af11-agent-friendliness-hardening-plan.md](./af11-agent-friendliness-hardening-plan.md)
> (PROPOSED runbook, без routing authority).

## Текущий scorecard (пересчитывать перед slice)

| Metric | Target | Status |
|---|---:|---|
| static debt | 0 | **0** ✅ |
| visual non-owner | 0 | **0** ✅ |
| legacy palette | 0 | **0** ✅ |
| bare Ant | 0 | **0** ✅ |
| noncanon media | 0 | **0** ✅ |
| Ant mapped primitives | 0 | **0** ✅ (core+ext empty) |
| runtime geometry | shrink OK | ~32 (allowed) |
| third-party adapters | document / shrink | ~24 (allowed) |
| MEANINGFUL-CSS-GATE (LOC observational) | active | ✅ |
| dual agent-dod | 2× green | ⏳ tests adapting to Tlt |
| final audit PASS | ≥9.0 | pending browser + dual DoD |

## Параллелизация: что можно / нельзя

### Можно параллелить (разные owners + разные baselines)

| Track | Owner set | Baseline touch | Blocks |
|---|---|---|---|
| **A. Ant primitives** | TSX pages/components | `antdPrimitive*Baseline` | capability gaps |
| **B. MEANINGFUL CSS GATE** | architecture tests + docs only | css ratchet logic (not feature CSS) | dirty worktree policy (soft) |
| **C. Runtime geometry cleanup** | one feature-owner at a time | `inlineStyleBaseline` only | must not mix with Ant on same file |
| **D. Third-party adapter isolation** | different owner from C | `inlineStyleBaseline` only | same as C — serialize if same file |
| **E. Dual DoD / audit** | read-only | docs/audit only | after A–D green preferred |

### Нельзя параллелить

- Два агента пишут **один** `*Baseline.json` одновременно.
- Ant migration + runtime/third-party cleanup **одного** файла.
- Palette/breakpoint/bare-ant CSS mass rewrite + другой CSS mass rewrite (уже закрыто).
- Final audit PASS while any tracked debt class still nonzero.

### Рекомендуемые 2–3 параллельных worker’а

```text
Worker 1: Track A — Ant → Tlt (весь residual)
Worker 2: Track B — AF10-MEANINGFUL-CSS-GATE-01
Worker 3 (после B, или осторожно с baseline merge): Track C/D — runtime/third-party per owner
Then serial: Track E — dual DoD + audit
```

## Queue order

### Q1 — DONE / in progress
- [x] residual R0 visual → 0
- [x] residual R2 palette / bare / noncanon → 0
- [ ] residual R1 Ant → 0
- [ ] meaningful-css Этап 1 gate (CSS LOC informational)

### Q2 — after static=0 (already true)
- [ ] meaningful-css Этап 4 runtime geometry (static parts out of mixed objects)
- [ ] meaningful-css Этап 4 third-party adapters (named isolation + reason)

### Q3 — close
- [ ] dual `npm run test:agent-dod`
- [ ] `npm run build-storybook`
- [ ] browser/Kontur matrix (Projects/Heat/Elec/Spec/Reports)
- [ ] audit snapshot PASS ≥9.0

## Slice templates

### Track B (now)
`AF10-MEANINGFUL-CSS-GATE-01` — see meaningful-css-plan Prompt 1

### Track A
One or batch of Ant files → Tlt; update only antd baselines

### Track C/D
One owner max static-in-runtime-object or adapter isolation; update only inlineStyleBaseline

## Merge protocol for parallel agents

1. Agent touches only its declared baseline files.
2. Parent re-runs full architecture suite after merge.
3. If baseline conflict: rescan AST and write truthful lower-or-equal counts.
4. Never raise any debt total.
