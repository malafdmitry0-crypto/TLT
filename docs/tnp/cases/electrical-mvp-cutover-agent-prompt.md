# Промпт агенту: электрорасчёт MVP cutover (FE + BE) — со слайсами

**Дата:** 2026-08-04  
**Назначение:** целиком передать агенту (или разбить по слайсам).  
**Не ACTIVE-очередь** — маршрутизация FE через `docs/frontend/refactor-backlog.md` при выносе в sprint.

---

# Часть A — Анализ существующих промптов vs реальность

## A.1 Источники (что уже есть)

| Документ | Что фиксирует | Актуальность 2026-08-04 |
|---|---|---|
| [`guest-electrical-calculation-tz.md`](./guest-electrical-calculation-tz.md) | Норматив: DEC-05/06/11, FE-01…28, BE-01…, §17 migration | **Источник правды** |
| [`electrical-calculation-backend-implementation-prompt.md`](./electrical-calculation-backend-implementation-prompt.md) | BE-only TT cutover + mock inputs | **Большая часть BE сделана**; prompt **устарел** как «с нуля» |
| [`electrical-slice6-polish-plan.md`](./electrical-slice6-polish-plan.md) | BE polish WP0–WP7 (options, §9.15, stale status, idempotency) | **Актуален** для BE-хвостов |
| [`case1-closure-slice-plan.md`](./case1-closure-slice-plan.md) Slice 0/5/6 | FE quick + FE §17.3 + BE polish | **Актуален**; Slice 5 = FE gap |
| [`case1-electrical-be-fe-audit.md`](./case1-electrical-be-fe-audit.md) | Активный аудит FE-E1…E12 / BE-E1…E7 | **Самый свежий gap list** |
| [`electrical-summary-query-implementation-prompt.md`](./electrical-summary-query-implementation-prompt.md) | Summary query | **В основном закрыт** (Lфакт/sections) |
| Audit `2026-08-02-electrical-calculation` (48%) | Старый conformance | **Устарел** (Iдоп/TT/legacy на BE сильно ушли вперёд) |

## A.2 Что промпты уже «починили» на BE (не переделывать)

Не начинать backend TT/Iдоп/catalogs с нуля. Уже есть:

- `self_regulating_tt` pipeline, 230 В, threads 1..3 в TT schema, Iдоп fail-closed  
- Project `electrical-settings`; object section-current-limit удалён
- ER UUID lifecycle, assign/unassign, max 5  
- Summary Lфакт / sections / currents  
- Legacy calc type guard `ELECTRICAL_LEGACY_CABLE_TYPE_UNSUPPORTED`  
- Electrical catalogs seed active/approved  
- Jobs path UUID + Idempotency-Key (частично; sync calc — open)

## A.3 Что промпты описывали, но **ещё open**

### Backend (Slice 6 / WP)

| ID | Из slice6 plan | Статус |
|---|---|---|
| B1 | `cable-options` → TT list | **OPEN** (`return []`) |
| B2 | table status `stale` ≠ `not_calculated` | **OPEN** |
| B4 | residual `le=100` threads on dead schemas | **OPEN** residual |
| B6 | Idempotency + `expected_assignment_version` on calc | **OPEN** (jobs partial) |
| §9.15 | final gate before ready | **OPEN** |
| FB | no silent 220/−20 | **partial** |
| IO | import legacy soft-stale | **OPEN** |
| №8 rest | purge TLT catalog / defaults | **partial** |

### Frontend (Slice 5 + audit + TZ FE-*)

| ID | Требование | Статус |
|---|---|---|
| FE-E1 / FE-27 | Iдоп client + UI + blocking CTA | **OPEN** — **нет** `api` electrical-settings |
| FE-E2 / FE-28 | 230 V read-only | **OPEN** — state default 220 |
| FE-E3 / FE-13 | assign → auto `self_regulating_tt` | **OPEN** — payload `self_regulating`, mask normalize |
| FE-E4 / FE-28 | hide Resistive/Skin/Mineral UI | **OPEN** — tabs/buttons live |
| FE-E5 / DEC-06 | threads max 3 for TT | **OPEN** — max 100 + unit test encodes bug |
| FE-E6 | summary only Samreg+Итого | **OPEN** |
| FE-E7 / FE-12 | DnD on default glide + keyboard | **OPEN** |
| FE-E11 | Iдоп in params chrome | **OPEN** |
| FE-E12 / FE-21 | stale row + per-row Пересчитать | **OPEN** partial badge |
| FE-25 | manual marks only from BE options | **blocked by B1** |
| FE-26 | provenance L* / code | **PARTIAL** |

## A.4 Вывод анализа

| Слой | Действие |
|---|---|
| BE ядро | **Не** переписывать по старому backend-only prompt |
| BE polish | Исполнять **electrical-slice6-polish-plan** WP0→WP7 (ниже = E-BE slices) |
| FE | **Главный объём** — Slice 5 + FE-E* из audit; старых FE-only prompt не было → этот документ |
| Порядок | **FE MVP cutover можно параллельно BE polish**; Iдоп UI **не** ждёт B1; manual options **ждёт** B1 |

```
E0 (quick) ──► E1 (FE MVP chrome) ──► E2 (Iдоп UI) ──► E3 (stale UX)
                    │
                    └─ parallel ─► E4 (BE WP0+WP2) ─► E5 (B1 options) ─► E6 (B2 status)
                                                         │
                                                         └─► E7 (FE options consumer)
                    E8 (B6 concurrency) optional after E4
                    E9 (IO/purge) optional
```

---

# Часть B — Промпт агенту (копипаст)

```text
Ты работаешь в /Users/dmalafey/Desktop/TLT над MVP cutover электрорасчёта (кейс 1 §6 + guest-electrical TZ).

## Роль
Реализуй слайсы E0→E3 (FE-first) и/или E4→E7 (BE polish) по этому документу.
Не делай full rewrite. Не трогай чужой WIP (spec canonical, heat tank grid) вне своего slice.
Сначала `git status --short`; в commit только свой slice.

## Обязательные чтения (в этом порядке)
1. docs/tnp/cases/electrical-mvp-cutover-agent-prompt.md (этот файл: анализ + slices)
2. docs/tnp/cases/case1-electrical-be-fe-audit.md (FE-E*, BE-E*, masked assign path)
3. docs/tnp/cases/guest-electrical-calculation-tz.md (§3 DEC-05/06/11, §7 FE-13/21–28, §8 BE-15–17)
4. docs/tnp/cases/electrical-slice6-polish-plan.md (для BE slices E4–E9)
5. Код: frontend/src/pages/electrical/*, frontend/src/api/electrical*, backend electrical_* / calculations / sections

## Приоритет источников
1. guest-electrical-calculation-tz.md
2. case1-electrical-be-fe-audit.md (текущие gaps)
3. electrical-slice6-polish-plan.md (BE polish)
4. Существующие тесты — описание текущего поведения; **ошибочные unit-assertions (threads 100, assign→self_regulating) менять** вместе с фиксом

## Жёсткие product rules
- Расчётный cable_type нового calc: только self_regulating_tt (серии ТТН/ТТВ/ТТХ)
- system_type assignment: self_regulating (MVP); resistive/skin/mineral — hide в UI; BE assign resistive optional later reject
- U = 230 read-only (ТЗ DEC-11); не предлагать 220
- Нитки 1..3 (DEC-06)
- Iдоп: только project settings; без Iдоп — blocking UI + BE SECTION_CURRENT_LIMIT_REQUIRED (уже есть)
- Manual options: только backend cable-options (после E5); без FE q1/q2
- Auto после assign Самрег: cable_type self_regulating_tt (не self_regulating)

## Запрещено
- Возвращать legacy ТЛТ calc path
- Hardcode Iдоп / silent 220 в production path
- «Починить» owner q1/q2 inventing numbers
- Mobile redesign <1000px
- Spec/Heat slices вне electrical (bomSectionOf — только если E0 includes it as optional quick)

## Definition of Done (каждый slice)
- [ ] Код + unit/integration tests зелёные для зоны slice
- [ ] e2e/helpers defaults обновлены если менялся cable_type
- [ ] git diff ограничен scope slice
- [ ] Обновить чекбоксы в case1-closure-slice-plan (Slice 5/6) или этот файл status
- [ ] Не заявлять проверки, которые не гонялись
```

---

# Часть C — Слайсы (исполняемые)

Отметки: `[ ]` open · `[x]` done · `[~]` partial

## E0 — Quick wins (разблокировка) `[x]` (2026-08-04)

**Цель:** убрать закодированные unit-баги и дефолты, которые ломают MVP без большого UI.

| # | Работа | Owner | Файлы (ориентир) |
|---|---|---|---|
| E0.1 | `maxThreadsForCableType`: TT (и MVP) → **3**; fix unit test | FE | `elecCalcLayoutModel.ts`, `elecCalcLayoutModel.test.ts` |
| E0.2 | `buildAssignAutoCalcBatchPayload`: Samreg → **`self_regulating_tt`**; resistive path либо remove/disabled; fix unit test | FE | `elecCalcAssignAutoCalcModel.ts` + test |
| E0.3 | Defaults `electricalBatchCalc` / `enqueueElectricalVariantBatchJob` → `self_regulating_tt` | FE | `electricalBatchCalc.ts` |
| E0.4 | Object default `supply_voltage` **220→230** | BE | `project_object_params.py` + tests expecting 220 |
| E0.5 | (optional same PR) threads `le=3` residual schemas | BE | `schemas/calculation.py` dead resistive fields |

**Acceptance:**

- unit: TT max threads 3; assign payload cableType `self_regulating_tt`  
- network after assign: top-level `cable_type=self_regulating_tt` even without normalize luck  
- new object params supply_voltage 230  

**Связь:** case1 Slice 0 (threads + voltage) + audit FE-E3/E5 + BE-E5.

---

## E1 — FE MVP chrome (hide legacy, 230 RO) `[x]` (2026-08-04)

**Цель:** UI соответствует FE-28 / US-ELEC-01 — только Самрег + 230.

| # | Работа | Файлы |
|---|---|---|
| E1.1 | Скрыть tabs/buttons/drop-zones **Резистив, Скин, Минеральный**; оставить unassigned + Самрег | `ElectricalAssignmentPanel.tsx`, `elecCalcSystemViewModel.ts` |
| E1.2 | Summary: только Самрег + Итого (скрыть/не рендерить resistive/skin cards) | `ElectricalSummary.tsx`, `elecCalcSummaryModel.ts` |
| E1.3 | Voltage: read-only **230** + source label; убрать editable 220 state | `useElecCalcRecalculationParams.ts`, `ElecCalcParamsPanel.tsx` |
| E1.4 | Copy: «Применить правило к группе» → «Назначить Самрег выбранным» (или hide) | AssignmentPanel |
| E1.5 | Note: одна info-строка «В версии доступен только саморегулирующийся кабель» | AssignmentPanel |
| E1.6 | Tests: panel no resistive assign; params no 220 control | unit/integration |

**Acceptance:**

- guest electrical page: no assign resistive control  
- U shows 230 read-only  
- FE-28 smoke  

**Не в E1:** Iдоп form (E2), DnD (E3), cable-options (E5/E7).

---

## E2 — FE Iдоп settings UI `[x]` (2026-08-04)  ★ P0 product

**Цель:** FE-27 / US-ELEC-07 — задать Iдоп без API-хаков.

| # | Работа | Файлы |
|---|---|---|
| E2.1 | API client: `getProjectElectricalSettings`, `patchProjectElectricalSettings` | **new** `frontend/src/api/electricalSettings.ts` |
| E2.2 | Object-level `Iдоп` отсутствует | assignment API/type/UI не добавлять |
| E2.3 | UI: project Iдоп field in electrical settings / params chrome | new modal or `ElecCalcParamsPanel` / settings drawer |
| E2.4 | Blocking empty: если BE error `SECTION_CURRENT_LIMIT_REQUIRED` **или** settings Iдоп null → banner «Задать допустимый стартовый ток» + CTA | workspace chrome |
| E2.5 | Optimistic version on patch (409 conflict → refetch) | as BE returns |
| E2.6 | Unit + integration: load/save Iдоп; guest can PATCH own project | tests |

**BE dependency:** **none** — endpoints already:

- `GET/PATCH /projects/{id}/electrical-settings`  

**Acceptance:**

- UI sets Iдоп → calc succeeds where previously SECTION_CURRENT_LIMIT_REQUIRED  
- no client-side invent Iдоп  

---

## E3 — FE stale + DnD polish `[x]` (2026-08-04 local)

**Цель:** FE-12, FE-21…24.

| # | Работа | Notes |
|---|---|---|
| E3.1 | Stale row highlight + count banner «N требуют перерасчёта» | `elecCalcStaleModel` + `ElecCalcStaleBanner`; assignment_state / results.category / results.stale; CSS `row-stale` + Glide theme |
| E3.2 | Per-row or bulk «Пересчитать» for stale only | `onRecalculateObjectIds` + banner CTA; select-all-stale |
| E3.3 | DnD: drag source on **glide** default engine OR document keyboard-only if deferred | **Deferred:** AntD `onRow` DnD remains; default Glide uses keyboard/button assign path |
| E3.4 | Keyboard path equals assign button (FE-12) | Assignment panel copy: select + «Назначить: Самрег» / unassign |

**Depends:** better if E6 (B2 status) done; ships with results.category / results.stale / assignment_state interim.

---

## E4 — BE WP0 + WP2 (guards + §9.15) `[x]` (2026-08-04)

**Источник:** `electrical-slice6-polish-plan.md` WP0 + WP2.

| # | Работа |
|---|---|
| E4.1 | Public calc defaults → `self_regulating_tt`; 422 legacy type/mark |
| E4.2 | Threads le=3 all public schemas |
| E4.3 | Fail-closed missing voltage/cold-start (no silent 220/−20) |
| E4.4 | `assert_electrical_tt_ready` after section plan (Pуст≥Pтреб, Lфакт≥Lтреб, equal sections, U=230, N 1..3) |
| E4.5 | Unit/integration gates |

**Acceptance:** slice6 PR-A checklist.

---

## E5 — BE B1 cable-options TT `[x]` (2026-08-04 local)

**Источник:** slice6 WP1.

| # | Работа |
|---|---|
| E5.1 | Replace `get_cable_options` stub with TT list |
| E5.2 | Query `electrical_variant_id`; schema `CableOptionOut` |
| E5.3 | eligible + unavailable_reason; P@T3 via same formula helpers |
| E5.4 | 422 if heat missing (preferred) |
| E5.5 | Integration + security (cross-guest 403) |

**Acceptance:** non-empty options for ready pipe; US-ELEC-08 unblocked for FE E7.

**Notes:** pure builder `tt_cable_options.py`; T3 defaults to 10 °C when not on object (FE mock parity); provisional catalog blocks eligibility only in production.

---

## E6 — BE B2 table status stale `[x]` (2026-08-04 local)

**Источник:** slice6 WP3.

| # | Работа |
|---|---|
| E6.1 | Stop mapping stale → not_calculated in query Python/SQL |
| E6.2 | STATUS_OPTIONS label «Требуется перерасчёт» |
| E6.3 | Filters; FE label map if not already |

**Acceptance:** heat edit → table status `stale`, not empty dash.

---

## E7 — FE consumer cable-options + provenance `[x]` (2026-08-04 local)

**Depends on E5.**

| # | Работа |
|---|---|
| E7.1 | `getCableOptions(objectId, electricalVariantId)` |
| E7.2 | Manual mark dropdown only from BE; remove client q1/q2 for TT |
| E7.3 | Show P@T3, series, reason disabled options |
| E7.4 | Lтреб/Lфакт/Lток/Lдоп/Lзаказ in default columns (FE-26) |

**Notes:** mark modal fetches BE options per object for `self_regulating_tt`; select sends base model (no -СТ/-СР). Default table shows core L* columns.

---

## E8 — BE B6 concurrency `[x]` core (2026-08-04 local)

**Источник:** slice6 WP4.

- `Idempotency-Key` on sync POST electrical + batch (accepted; upsert is persistence guard)
- `expected_assignment_version` on `ElectricalRequest` → **409** on mismatch
- batch query `electrical_variant_id` UUID-first
- FE: `withIdempotencyKey` on calcElectrical / batchCalcElectrical

**Residual:** short-TTL idempotency store that skips formula re-run (not just upsert).

---

## E9 — BE IO/purge `[x]` core (2026-08-04 local)

**Источник:** slice6 WP5.

- Import legacy soft-stale (not whole-file 422): legacy types / ТЛТ → assignment `stale` + results overlay
- TLT catalog: documented archived; prod references already TT-only
- e2e phase5 helper default `self_regulating_tt`

---

# Часть D — Рекомендуемый порядок PR

| PR | Slices | Effort | Unlocks |
|---|---|---|---|
| **PR-1** | E0 | 0.5 d | safe auto-assign TT, threads |
| **PR-2** | E1 | 0.5–1 d | MVP UI look |
| **PR-3** | E2 | 1–1.5 d | **Iдоп end-to-end UX** |
| **PR-4** | E4 | 0.5–1 d | hard BE gates |
| **PR-5** | E5 | 1–1.5 d | options API |
| **PR-6** | E6 + E3.1–2 | 1 d | stale UX truth |
| **PR-7** | E7 | 1 d | manual marks |
| **PR-8** | E3.3–4 DnD | 1 d | FE-12 |
| later | E8, E9 | 2–3 d | polish |

**Кратчайший путь к «гость может посчитать ЭР по MVP UI»:** **PR-1 → PR-2 → PR-3**.

**Кратчайший путь к «manual + stale + gates»:** + PR-4…7.

---

# Часть E — Матрица трассировки

| User story / TZ | Slice |
|---|---|
| US-ELEC-01 hide legacy | E1 |
| US-ELEC-06 threads 1..3 | E0 |
| US-ELEC-07 Iдоп | E2 |
| US-ELEC-03/13 assign TT | E0 |
| US-ELEC-04 DnD | E3 |
| US-ELEC-08/11 options | E5+E7 |
| US-ELEC-10 stale | E3+E6 |
| FE-28 230 V | E1 (+ E0.4 BE) |
| BE-16 legacy 422 | E4 |
| BE-17 Iдоп | already BE; FE E2 |
| §9.15 | E4 |
| Slice 5 closure plan | E0+E1+E2+E3 |
| Slice 6 closure plan | E4…E9 |

---

# Часть F — Smoke после PR-1…3 (обязательный)

```bash
# FE unit (минимум)
cd frontend && npm test -- --run \
  src/__tests__/unit/pages/electrical/elecCalcAssignAutoCalcModel.test.ts \
  src/__tests__/unit/pages/electrical/elecCalcLayoutModel.test.ts

# BE (если pytest env)
cd backend && python -m pytest \
  app/tests/integration/api/test_project_electrical_settings.py \
  app/tests/integration/api/test_electrical_backend_acceptance.py -q
```

Ручной guest:

1. Start guest → heat pipe → ER  
2. Set Iдоп in new UI  
3. Assign Samreg → network cable_type=self_regulating_tt  
4. Success row; no resistive controls  
5. U shows 230; threads cannot be 4  

---

# Часть G — Статус закрытия (заполнять агентом)

| Slice | Status | PR / commit | Notes |
|---|---|---|---|
| E0 | [x] | 2026-08-04 local | threads 3, assign→TT, batch defaults TT, supply_voltage 230, residual le=3 |
| E1 | [x] | 2026-08-04 local | hide Resistive/Skin, summary MVP, U 230 RO |
| E2 | [x] | 2026-08-04 local | electrical-settings client + Iдоп form + empty banner |
| E3 | [x] | 2026-08-04 local | stale banner + row-stale + bulk recalc; Glide DnD deferred → keyboard/button |
| E4 | [x] | 2026-08-04 local | §9.15 assert_electrical_tt_ready + job default TT |
| E5 | [x] | 2026-08-04 local | GET cable-options TT list + schema + 422 heat + tests |
| E6 | [x] | 2026-08-04 local | status stale ≠ not_calculated + labels |
| E7 | [x] | 2026-08-04 local | BE options + L* default columns |
| E8 | [x] | 2026-08-04 local core | version 409 + Idempotency-Key header + UUID batch |
| E9 | [x] | 2026-08-04 local core | import soft-stale legacy; TLT archived note |

---

*Конец. При конфликте с audit 2026-08-02 (48%) — игнорировать устаревшие «нет Iдоп на BE»; опираться на case1-electrical-be-fe-audit + этот prompt.*
