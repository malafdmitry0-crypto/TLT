# Активный аудит: электрорасчёт (BE + FE)

**Дата:** 2026-08-04  
**Scope:** Кейс 1 §6 + guest-electrical TZ MVP (TT-only, 230 В, Iдоп, 5 ЭР)  
**Метод:** чтение API/сервисов/схем, FE pages/api/models, unit-тесты (vitest), сверка контрактов.  
**Не гонялось:** live HTTP e2e, pytest (в окружении нет pytest-модуля).

**Связано:** [`case1-backend-fe-readiness.md`](./case1-backend-fe-readiness.md), [`case1-frontend-user-stories.md`](./case1-frontend-user-stories.md) (EP-ELEC), [`guest-electrical-calculation-tz.md`](./guest-electrical-calculation-tz.md).

---

## Вердикт

| Слой | Оценка | Смысл |
|---|---:|---|
| **BE ядро (TT calc, ER lifecycle, assign, Iдоп API, summary, stale mark)** | **~88–92%** | Production-path сильный; techdebt точечный |
| **FE workspace (variants, table, batch jobs, candidates, summary UI)** | **~55–65%** | Каркас мощный, **MVP-конформность слабая** |
| **Стык FE↔BE happy path** | **~70%** | Работает с оговорками (normalize маскирует баги) |
| **Готовность к приёмке §6 / макетам P0** | **BE да / FE нет** | Макеты не ждут BE; FE P0 = большой UI cutover |

### Одной фразой

**Бэкенд электрорасчёта готов тащить фронт. Фронт электрорасчёта ещё в «мульти-системном / legacy-наследии» и не совпадает с TT-only MVP, хотя дефолтный calc type уже TT.**

---

## 1. Карта поверхности

### Backend

| Модуль | LOC (порядок) | Роль |
|---|---:|---|
| `api/v1/electrical_variants.py` | ~330 | ER CRUD, assign/unassign, Iдоп per object |
| `api/v1/electrical_settings.py` | ~70 | project Iдоп + voltage 230 |
| `api/v1/calculations.py` | ~1200 | calc, batch, query, page, candidates, cable-options |
| `api/v1/calc_jobs.py` | — | async batch + Idempotency-Key |
| `services/calculation_service.py` | ~4700 | TT pipeline orchestration |
| `services/electrical_assignment_service.py` | ~1500 | assignments, stale, unassign |
| `services/electrical_query_service.py` | ~2000 | table projection |
| `services/electrical_tt_pipeline.py` | — | canonical TT |
| `formulas/electrical/sections.py` | — | Lогр / N / fail-closed Iдоп |

**Acceptance tests exist:**  
`test_electrical_backend_acceptance.py`, `test_electrical_assignments.py`, `test_electrical_variants.py`, `test_project_electrical_settings.py`, `test_electrical_catalogs.py`.

### Frontend

| Зона | Объём | Роль |
|---|---|---|
| `pages/electrical/*` | 60+ files | workspace shell |
| `api/electricalVariants.ts` | — | ER + assign (хорошо) |
| `api/electricalBatchCalc.ts` | — | batch/jobs (defaults legacy-ish) |
| `api/electricalCandidates.ts` | — | candidates/folders |
| `api/calculations.ts` | — | query/page/cable-options |
| **`api/*electrical-settings*`** | **НЕТ** | **Iдоп API не подключён** |
| `domain/electrical/*` | models | status, metrics, filters |
| e2e `elec-*`, `electrical-*`, `cable-*` | multi | UI regression heavy |

---

## 2. Матрица §6 / MVP → BE / FE

| Требование | BE | FE | Gap |
|---|---|---|---|
| §6.3–6.7 ER lifecycle ≤5 | READY `MAX_ELECTRICAL_VARIANTS=5` | READY tabs/copy/rename/delete | — |
| §6.8 summary Lфакт, sections, I | READY page summary | READY cards (но **3 лишние** Резистив/Скин) | FE hide |
| §6.9 unassigned tab | READY counts/state | READY | — |
| §6.10 assign Samreg | READY `system_type=self_regulating` | READY + auto-calc | auto cable type messy |
| §6.10 only Samreg MVP | BE still allows **resistive** assign | UI **активно** предлагает Резистив/Скин | product cutover |
| §6.11 DnD | API same as assign | Drop zones yes; drag only AntD; **default glide** | FE DnD |
| §6.12 auto after assign | BE batch TT | `buildAssignAutoCalcBatchPayload` → `self_regulating` then **normalize→TT** | fragile |
| §6.13 TT cable, N=1..3 | schema TT `le=3`; batch default TT | layout maxThreads **TT=100**; legacy type still in code | FE + residual schema |
| §6.13 voltage 230 | settings fixed 230; TT contract | **UI state default 220** editable | FE + object default 220 |
| §6.14 Iдоп Lток | fail-closed + project/object APIs | **no API client, no settings form** | **FE P0 blocker** |
| §6.15–17 unassign confirm | READY 409 without confirm | READY confirm flow | — |
| §6.16 manual mark/winding | candidates apply; layout fields | modals/glide edit exist | cable-options `[]` |
| §6.18 → spec | generate separate | CTA exists | — |
| §6.19 stale after heat | mark assignment/calc stale | badge «Требуется пересчёт» if `category=stale` | query status collapse risk; no per-row only button |
| §6.20 rename | READY | READY | — |
| `/cable-options` TT models | **returns `[]`** | client exists, useless | BE techdebt №8 |
| UUID ER scope | variants UUID + jobs UUID-first | workspace UUID-first | legacy `variant_number` still in some APIs |

---

## 3. Backend — детальный статус

### 3.1 READY (можно опираться)

1. **ER lifecycle** — initialize, list, create empty, copy (без spec), rename, activate, delete, max 5.  
2. **Assignments** — atomic assign, version optimistic concurrency, unassign+confirm, cleanup legacy, RBAC guest/owner.  
3. **Iдоп**  
   - `GET/PATCH /projects/{id}/electrical-settings` (`max_section_start_current_a`, `nominal_voltage_v=230`)  
   - `PATCH .../assignments/{oid}/section-current-limit`  
   - sections formula: `SECTION_CURRENT_LIMIT_REQUIRED` if missing  
4. **TT calc path** — `self_regulating_tt` only for real formulas; legacy types → `ELECTRICAL_LEGACY_CABLE_TYPE_UNSUPPORTED`.  
5. **Batch** — UUID job path `/calc/electrical/batch/jobs` + Idempotency-Key; catalogs seeded active.  
6. **Query/page** — L metrics, provenance hooks, assignment projection, summary aggregates.  
7. **Stale cascade** — object change / Iдоп change marks assignments + specs stale.  
8. **Tests** — dedicated acceptance/assignment/settings suites (goldens for guest/employee parity).

### 3.2 PARTIAL / techdebt

| ID | Issue | Impact |
|---|---|---|
| BE-E1 | `GET /calc/cable-options/{id}` → always `[]` | Manual options empty |
| BE-E2 | `electrical_status` in query can map stale → `not_calculated` | FE may rely on results.category instead |
| BE-E3 | System type **resistive** still assignable | Contradicts UI MVP hide story |
| BE-E4 | Residual schemas `number_of_threads le=100` on non-TT models | Cleanup |
| BE-E5 | Object default `supply_voltage: 220` | Diverges from 230 TT |
| BE-E6 | Sync batch still has `variant_number` surface | Prefer jobs UUID |
| BE-E7 | Summary still buckets resistive/skin | Fine if empty; FE shows cards |

### 3.3 NOT a BE blocker for FE P0

Iдоп formula, ER max 5, assign/unassign, TT batch, summary numbers, stale marking — all present.

---

## 4. Frontend — детальный статус

### 4.1 READY (каркас)

1. Dynamic ER tabs + initialize readiness gate.  
2. Unified table (Glide default) + filters/columns/settings.  
3. Assignment panel + counts + conflict handling.  
4. Batch job orchestration + cancel + progress.  
5. Candidates / folders / apply-unapply flows (heavy).  
6. Status renderer: success / unsupported / **stale ↻** / error / empty.  
7. Summary model consumes `system_summaries` + totals.  
8. Large unit/integration suite under `__tests__/…/electrical`.

### 4.2 CRITICAL gaps (P0 product)

| ID | Issue | Evidence | Severity |
|---|---|---|---|
| **FE-E1** | **Нет API-клиента electrical-settings** | нет файла/вызовов `electrical-settings` в `frontend/src` | **P0** — Iдоп UI невозможен |
| **FE-E2** | Voltage UI default **220**, editable | `useElecCalcRecalculationParams.ts:7` | **P0** vs ТЗ 230 |
| **FE-E3** | Assign auto-calc builds **`cableType: 'self_regulating'`** | `elecCalcAssignAutoCalcModel.ts` + **test locks it in** | **P0 risk** (masked by normalize) |
| **FE-E4** | Active UI: Резистив tab, assign, drop zone, Скин tab | `ElectricalAssignmentPanel.tsx` | **P0** vs MVP |
| **FE-E5** | Threads: `maxThreadsForCableType('self_regulating_tt') === 100` | `elecCalcLayoutModel.ts:151` + unit test | **P0** |
| **FE-E6** | Summary shows Resistive/Skin cards always | `elecCalcSummaryModel` + UI | **P0** UX |
| **FE-E7** | DnD: default engine **glide**, drag only on AntD branch | `electricalTableEngine.ts`, `ElectricalUnifiedTableCard` | **P1** |
| **FE-E8** | Batch API defaults still `'self_regulating'` | `electricalBatchCalc.ts` defaults | **P1** latent |
| **FE-E9** | listCables / resistive reference plumbing remains | `useElecCalcCableReferenceData.ts` | **P1** dead/legacy |
| **FE-E10** | «Применить правило к группе» = hardcode Samreg | AssignmentPanel | **P1** copy/semantics |
| **FE-E11** | No project Iдоп settings entry in workspace chrome | grep empty | **P0** with FE-E1 |
| **FE-E12** | Per-row «Пересчитать» only via batch bar, not stale-row CTA | BatchActionBar | **P1** vs §6.19 |

### 4.3 Masked happy path (важно)

После assign:

```
buildAssignAutoCalcBatchPayload → cableType: 'self_regulating'
  → normalizeAvailableCableType → self_regulating_tt (если legacy нет в available)
  → forceCableType: true
  → BE берёт top-level cable_type (TT), overrides игнорируются
```

То есть **сейчас может работать**, но:

- unit-тест **закрепляет неправильный** intermediate type;  
- если `self_regulating` снова попадёт в available types — batch уйдёт в **422 LEGACY**;  
- intent «TT only» не выражен в assign model.

---

## 5. Стык контрактов FE↔BE

| Контракт | Совместимость | Заметка |
|---|---|---|
| ER UUID API | **OK** | FE `electricalVariants.ts` mirrors BE |
| Assign system `self_regulating` | **OK** | system ≠ cable_type; BE maps TT calc → system self_regulating |
| Assign `resistive` | **OK technically / bad product** | BE allows; calc formula removed → error/unsupported path |
| Batch jobs UUID | **OK** | `enqueueElectricalVariantBatchJob` |
| Query L-metrics | **OK** | FE result value model paths match |
| Summary fields | **OK** | totals + system_summaries |
| Iдоп project settings | **BE only** | FE missing client |
| cable-options | **BE empty** | FE dead call |
| Stale display | **PARTIAL** | FE uses results.category; query status may collapse |
| Default voltage | **MISMATCH** | BE 230 settings / FE 220 UI |

---

## 6. Тесты: что кодируют баги

| Test | Assertion | Вердикт |
|---|---|---|
| `elecCalcAssignAutoCalcModel.test.ts` | Samreg → `cableType: 'self_regulating'` | **Encodes FE-E3** |
| `elecCalcLayoutModel.test.ts` | TT max threads **100** | **Encodes FE-E5** |
| BE acceptance TT batch | `self_regulating_tt` + Iдоп set | **Good golden** |
| BE settings tests | 230 fixed, Iдоп patch/clear | **Good** |
| e2e `elec-calculation.spec.ts` | columns/layout/recalc chrome | Weak on TT/Iдоп product rules |

**Вывод:** FE unit suite **зелёный на неверном MVP**. Менять product behavior = **менять тесты осознанно**.

---

## 7. Критический пользовательский путь (гость)

```
Heat ready objects
  → initialize ER1
  → assign Samreg
  → auto batch (TT via normalize?)
  → need Iдоп?  → BE fail-closed if missing; FE cannot set easily
  → sections + mark
  → summary
  → form spec
```

| Step | BE | FE | Risk |
|---|---|---|---|
| Init ER | OK | OK | low |
| Assign | OK | OK | low |
| Auto calc | OK TT | fragile type chain | **medium** |
| Without Iдоп | error typed | no settings UI | **high UX** |
| With Iдоп set via API | OK | manual/API only | high for pure UI |
| Manual mark list | empty options | broken | medium |
| Stale after heat edit | marked | badge if category stale | medium |
| Resistive click | assign OK | dead-end calc | **confusing** |

---

## 8. Приоритетный backlog (только электрорасчёт)

### P0 — FE (разблокирует приёмку/макеты→код)

1. **Electrical settings client + UI** (project Iдоп, read-only 230).  
2. **Assign auto-calc → always `self_regulating_tt`**; fix unit test.  
3. **Hide resistive/skin** tabs, buttons, drop zones, summary cards.  
4. **Threads max 3 for TT**; fix unit test.  
5. **Voltage UI 230 read-only** (remove 220 state default).  

### P0 — BE (маленькие, желательно с FE)

6. Default object `supply_voltage` 220→230.  
7. (Optional) reject assign `resistive` in MVP or mark unsupported immediately with clear code.

### P1 — BE

8. Implement `GET cable-options` TT models (series, P@T3, reasons, ER param).  
9. Expose distinct `electrical_status=stale` in query (no collapse).  
10. Clean residual le=100 thread schemas / legacy defaults in FE batch helpers.

### P1 — FE

11. DnD on glide + keyboard assign.  
12. Per-row Пересчитать for stale.  
13. Remove dead resistive catalog queries.  
14. «Применить правило к группе» rename/semantics.

---

## 9. Что делать дизайнеру vs FE vs BE

| Actor | Action |
|---|---|
| **Designer** | Макеты D-ELEC: only Samreg, 230 RO, Iдоп empty, stale row, max 5 — **BE не блокирует** |
| **FE** | Cutover MVP UI + settings client — **основной объём** |
| **BE** | cable-options + tiny defaults; optional block resistive assign |

---

## 10. Оценка готовности «под фронт из handoff»

| Handoff / story | BE ready? | FE ready? |
|---|---|---|
| US-ELEC-01 MVP only Samreg | calc yes / assign resistive still open | **no** |
| US-ELEC-02 variants ≤5 | **yes** | **yes** |
| US-ELEC-03 assign button | **yes** | **yes** (auto type fragile) |
| US-ELEC-04 DnD | **yes** | **no** default path |
| US-ELEC-05 summary | **yes** | partial (extra cards) |
| US-ELEC-06 threads 1..3 | schema TT yes | **no** |
| US-ELEC-07 Iдоп | **yes** | **no client/UI** |
| US-ELEC-08 manual mark | cable-options **no** | partial modals |
| US-ELEC-09 unassign | **yes** | **yes** |
| US-ELEC-10 stale rows | mark **yes** | partial UX |
| US-ELEC-11 provenance | partial fields | partial display |
| US-ELEC-12 → spec | n/a | CTA yes |

**BE readiness for electrical FE work: ~90%.**  
**FE readiness for case-1 electrical MVP: ~60%.**  
**Joint path reliability: ~70% (works with landmines).**

---

## 11. Рекомендуемый порядок работ (2–3 спринта)

```
Sprint A (FE P0 cutover)
  FE-E1 settings API+UI
  FE-E2/E5 voltage+threads
  FE-E3 assign→TT + tests
  FE-E4/E6 hide resistive/skin/summary

Sprint B (path polish)
  FE-E7 DnD glide
  FE-E12 stale row CTA
  BE-E5 supply_voltage 230
  BE optional: reject resistive assign

Sprint C (depth)
  BE-E1 cable-options TT
  BE-E2 status=stale
  provenance drawer
```

---

## 12. Smoke checklist (когда есть стенд + pytest)

### BE

1. guest + pipe → init ER → set Iдоп → assign self_regulating → batch TT → ready  
2. batch without Iдоп → SECTION_CURRENT_LIMIT_REQUIRED  
3. legacy cable_type → 422 LEGACY  
4. 5th ER create blocked  
5. unassign without confirm → 409; with confirm → heat preserved  
6. heat edit → assignment stale  

### FE

1. Assign Samreg → network `cable_type=self_regulating_tt` (not legacy)  
2. Iдоп form saves via PATCH electrical-settings  
3. No resistive/skin controls visible  
4. Threads >3 rejected in UI  
5. U shows 230 read-only  
6. Glide DnD or keyboard assign works  

---

*Конец аудита. Обновлять при закрытии FE-E1…E6 или BE-E1.*

**Исполнение:** единый agent prompt со слайсами E0–E9 —  
[`electrical-mvp-cutover-agent-prompt.md`](./electrical-mvp-cutover-agent-prompt.md).
