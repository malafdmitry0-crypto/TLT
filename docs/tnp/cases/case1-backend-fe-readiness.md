# Аудит: готов ли бэкенд под фронт кейса 1 (макеты → FE)

**Дата:** 2026-08-03  
**HEAD ориентир:** `33079ef` (+ seeds/spec catalog debt, catalog-selections API)  
**Вход:** [`case1-design-agent-handoff.md`](./case1-design-agent-handoff.md), [`case1-frontend-user-stories.md`](./case1-frontend-user-stories.md), [`case1-designer-brief.md`](./case1-designer-brief.md)  
**Метод:** сверка API/схем/сервисов с P0–P1 FE stories. Runtime e2e в этой сессии не гонялся.

---

## Вердикт

| Вопрос | Ответ |
|---|---|
| Можно ли **рисовать макеты** без доработки BE? | **Да** — контракты для P0 UI в основном есть |
| Можно ли **сразу закрыть P0 FE** end-to-end на чистом стенде? | **Почти** — при `seed` (вкл. TECH-DEBT spec catalog) happy path generate реален |
| Блокирует ли BE дизайн? | **Нет** |
| Блокирует ли BE приёмку FE? | **Частично** — 4–5 BE-хвостов (см. blockers) |

### Сводка готовности по зонам

| Зона | BE ready | Для FE | Блокер макетов? |
|---|---|---|---|
| Guest auth / project / IO v3 | **~95%** | подключить labels + recovery | нет |
| Heat / objects / group-update | **~90%** | UI group + 230 default | нет |
| ЭР lifecycle (variants, assign, unassign, rename) | **~95%** | hide legacy UI | нет |
| ЭР calc TT + sections + Iдоп APIs | **~90%** | UI Iдоп + threads FE cap | нет |
| ЭР table status stale vs error | **~70%** | map assignment_state + results | нет* |
| cable-options (manual marks list) | **~10%** | empty `[]` | **да для US-ELEC-08/11 partial** |
| Spec generate + diagnostics.kind | **~95%** | wire kind UI | нет |
| Spec catalog seed | **~80%** tech-debt | seed must run | нет (dev) / да (prod authority) |
| Spec selections persist API | **~95%** | hydrate FE | нет |
| Spec item `object_type_section` | **~95%** | **FE bug** bomSectionOf | нет |
| Report guest preview | **~90%** | print UX | нет |

\*stale **assignment_state** и mark-on-object-change на BE есть; table `electrical_status` **схлопывает stale → not_calculated** — FE/контракт partial.

**Интегрально: BE ~85–90% ready for FE P0 implementation; ~70% for full P1 elec polish.**

---

## 1. Матрица: FE story → BE API → статус

Легенда: **READY** · **PARTIAL** · **MISSING** · **FE-ONLY**

### EP-AUTH

| Story | BE | Статус | Комментарий |
|---|---|---|---|
| US-AUTH-01 guest start | `POST /auth/guest` + auto project | **READY** | |
| US-AUTH-02 help copy | — | **FE-ONLY** | |
| US-AUTH-03 session recovery | guest TTL + new session | **PARTIAL** | BE OK; FE query cleanup |

### EP-HEAT

| Story | BE | Статус | Комментарий |
|---|---|---|---|
| US-HEAT-01 add/edit pipe/tank | objects CRUD + calc | **READY** | tank invalid-commit gate residual |
| US-HEAT-02 group update | `POST .../objects/group-update` | **READY** | FE UI missing |
| US-HEAT-04 → ER gate | electrical-variants readiness | **READY** | |
| US-HEAT-05 230 V default | settings `nominal_voltage_v=230`; object default **220** | **PARTIAL** | сменить `project_object_params.supply_voltage` 220→230 (1 line + tests) |

### EP-ELEC

| Story | BE | Статус | Комментарий |
|---|---|---|---|
| US-ELEC-01 only Samreg | TT-only calc; mineral/skin unsupported | **READY** (calc) | FE still shows Resistive/Skin |
| US-ELEC-02 variants ≤5 | variants CRUD, copy w/o spec, rename, delete | **READY** | |
| US-ELEC-03 assign | `PATCH .../assignments` | **READY** | |
| US-ELEC-04 DnD | same assign API | **READY** | FE DnD only |
| US-ELEC-05 summary | page/query summary Lфакт, sections, I | **READY** | |
| US-ELEC-06 threads 1..3 | TT request schema **le=3**; some legacy schemas le=100 | **PARTIAL** | FE maxThreads TT=100; align leftovers le=100 |
| US-ELEC-07 Iдоп UI | GET/PATCH project electrical-settings; formula fail-closed | **READY** | Единственный источник — настройка проекта |
| US-ELEC-08 manual mark/winding | candidates + apply + layout fields | **PARTIAL** | **GET cable-options → `[]`** techdebt |
| US-ELEC-09 unassign | `POST .../unassign` + confirm | **READY** | |
| US-ELEC-10 stale after heat | mark assignments stale on object change | **PARTIAL** | query maps stale→`not_calculated`; no distinct «Требуется перерасчёт» string for FE table |
| US-ELEC-11 provenance / L* | query fields Lтреб/Lфакт/…, provenance | **PARTIAL** | enough for tooltip; cable-options empty |
| US-ELEC-12 CTA to spec | — | **FE-ONLY** | generate API ready |

### EP-SPEC

| Story | BE | Статус | Комментарий |
|---|---|---|---|
| US-SPEC-01 generate selected | `POST .../generate` V2 + per-ER status | **READY** | needs active catalog |
| US-SPEC-02 unassigned Fix/Proceed | `confirmation_required` + `exclude_unassigned_confirmed` | **READY** | Fix navigation = FE |
| US-SPEC-03 sections pipe/tank/common | items.params.`object_type_section` | **READY** | **FE bomSectionOf bug** |
| US-SPEC-04 diagnostics.kind | blocking / confirmable / selection_required | **READY** | FE ignore kind |
| US-SPEC-05 selection + hydrate | generate candidates; GET/PUT catalog-selections | **READY** | FE hydrate incomplete |
| US-SPEC-06 row columns | name/mark/article/unit/qty + params | **READY** | |
| US-SPEC-07 stale | `is_stale` + mark on ER change | **READY** | |
| US-SPEC-08 settings | GET/PUT specification settings project-scoped | **READY** | |

### EP-IO

| Story | BE | Статус | Комментарий |
|---|---|---|---|
| US-IO-01 file | export/import-csv schema **v3** multi-section | **READY** | FE labels/proof |
| US-IO-02 guest report | preview `require_any`; export `require_employee` | **READY** | |

---

## 2. Контракты, на которые FE может опираться (стабильные)

### 2.1 Iдоп (US-ELEC-07) — BE **готов**

```
GET  /projects/{id}/electrical-settings
PATCH /projects/{id}/electrical-settings
  body: { max_section_start_current_a, expected_version? }
  nominal_voltage_v = 230 (model check)
```

Секционирование: `SECTION_CURRENT_LIMIT_REQUIRED` если проектный Iдоп отсутствует.
Object/request override не поддерживается; старый assignment endpoint удалён.

**FE задача:** форма + empty state из макета; не ждать backend feature.

### 2.2 Спецификация generate (US-SPEC-01…08) — BE **готов**

```
POST /projects/{id}/generate
  variant_ids, options{…}, exclude_unassigned_confirmed, catalog_selections

→ results[]: status generated|blocked|confirmation_required|selection_required
→ diagnostics[]: kind, code, message

GET  /projects/{id}/variants/{er}
  items[], is_stale, …

GET/PUT /projects/{id}/variants/{er}/catalog-selections
  persisted multi-candidate choices (hydrate без React-only state)
```

HTTP: 201 / 422 / 409 / 503 по precedence.

### 2.3 Секции BOM — BE **отдаёт поле, FE не читает**

Canonical builder пишет в item:

```json
"params": { "object_type_section": "pipe" | "tank" | "common", ... }
```

(`specification_bom_builder.py`).  
Макет «Трубы/Бочки/Общие» **не требует** BE-фикса; FE `bomSectionOf` должен читать `object_type_section`.

### 2.4 ЭР lifecycle — BE **готов**

create first / list / assign / unassign+confirm / empty create / deep copy / rename / activate / delete / max 5 (service-level).

### 2.5 Group update / duplicate-batch — BE **готов**

`POST .../objects/group-update`, `duplicate-batch`, `require_any()` (гость OK).

### 2.6 Project file — BE **готов**

Schema v3 sectional CSV: objects, electrical graph, specifications, settings. Guest export/import path exists.

### 2.7 Spec catalog — **dev ready, prod authority debt**

```
python -m app.seeds
python -m app.seeds --specification-catalog-only
```

TECH-DEBT payload `builtin-specification` / `seed-debt-v1` — local generate works; **не** owner-approved matrix.  
Admin import/activate endpoints: `specification_catalogs.py`.

---

## 3. BE blockers / techdebt (по влиянию на FE)

| Pri | Gap | Влияет на | Нужно для FE? |
|---|---|---|---|
| **B1** | `GET /calc/cable-options/{id}` → **всегда `[]`** | Manual mark dropdown, provenance options | P1 US-ELEC-08/11; P0 auto-assign **не** блокирует |
| **B2** | Table `electrical_status` stale→`not_calculated` | Distinct «Требуется перерасчёт» | P0 US-ELEC-10 partial: FE can use `assignment_state` / results.stale if exposed in query row |
| **B3** | `supply_voltage: 220` object default | Align UI 230 | 1-line BE + FE; not hard blocker for mockups |
| **B4** | Residual schema `number_of_threads le=100` (non-TT paths) | Hard enforce 1..3 everywhere | FE already must cap; BE cleanup |
| **B5** | Spec catalog seed = TECH-DEBT | Production acceptance / box matrix truth | Mockups OK; prod needs owner import |
| **B6** | Idempotency on sync `POST /calc/electrical` (not only jobs) | Double-click race | calc_jobs has Idempotency-Key; sync path weaker |
| **B7** | Employee «Мои проекты» all employees | Out of guest case 1 | ignore for guest FE |

**Не blockers для макетов:** B1–B7.  
**Blockers для «FE P0 green на стенде»:** seed spec catalog (B5 path must run); FE bugs; optional B1 for manual cable UI.

---

## 4. Что FE **не** должен ждать от BE

| UI из макета | Кто чинит |
|---|---|
| Hide Резистив/Скин tabs | FE only |
| 230 read-only display | FE (+ tiny BE default) |
| Threads stepper 1..3 | FE (`maxThreadsForCableType` bug) |
| bomSection pipe/tank | FE read `object_type_section` |
| «Исправить» navigate + highlight | FE |
| Diagnostics by kind | FE (kind already in response) |
| Help 3 days / 500 | FE only |
| Selection panel hydrate | FE + already PUT/GET selections |
| DnD assign | FE (API ready) |
| Group update modal | FE (API ready) |
| Iдоп form | FE (API ready) |

---

## 5. Рекомендуемый порядок работ (BE vs FE)

```
Дизайн макеты          ──►  независимо (BE ready)
FE Slice 0 (sections, threads, help, kind)  ──►  BE не нужен
FE Iдоп settings + unassign copy            ──►  BE ready
FE Spec hydrate selections                  ──►  BE ready
FE Stale row UX                             ──►  BE PARTIAL (use assignment_state)
── optional ──
BE B1 cable-options TT                      ──►  unlocks manual options UX
BE B2 expose electrical_status=stale        ──►  cleaner table mapping
BE B3 default 220→230                       ──►  one PR with FE
BE B5 owner catalog                         ──►  prod, not mockups
```

---

## 6. Smoke checklist «BE supports guest P0 path»

На засеянном стенде (`python -m app.seeds`):

1. [ ] `POST /auth/guest` → project id  
2. [ ] `POST .../objects` pipe + tank → heat OK  
3. [ ] `POST .../electrical-variants` first ER  
4. [ ] `PATCH .../assignments` → Samreg  
5. [ ] `PATCH .../electrical-settings` set Iдоп  
6. [ ] electrical calc / auto on assign → ready sections  
7. [ ] `POST .../generate` variant_ids → 201 generated (debt catalog)  
8. [ ] GET variant items contain `params.object_type_section`  
9. [ ] selection_required path: GET/PUT catalog-selections  
10. [ ] export-csv → import-csv round-trip  

Если 1–8 зелёные — **FE может закрывать P0 против текущего BE**.

---

## 7. Ответ на вопрос «готов ли бэк под этот фронт?»

| Уровень | Оценка |
|---|---|
| Под **макеты** | **100%** — ничего не блокирует |
| Под **FE P0** (sections, MVP elec UI, generate, diagnostics, Iдоп form, unassigned, file labels) | **~90%** BE; остальное FE + seed |
| Под **FE P1** (cable-options, distinct stale label, DnD polish, provenance drawer) | **~70%** BE; B1/B2 желательны |
| Под **production authority** (owner catalog, box matrix) | **TECH-DEBT** — не путать с FE readiness |

**Вывод:** бэкенд **в целом готов** к фронту из handoff/stories. Дизайн-агенту ждать BE **не нужно**. FE-агенту для P0 достаточно текущего API; параллельно (не блокер макетов) — `cable-options` TT и явный `electrical_status=stale`.

---

## 8. Связанные доки

- **Электрорасчёт deep-dive:** [`case1-electrical-be-fe-audit.md`](./case1-electrical-be-fe-audit.md)  
- FE stories: [`case1-frontend-user-stories.md`](./case1-frontend-user-stories.md)  
- Design handoff: [`case1-design-agent-handoff.md`](./case1-design-agent-handoff.md)  
- Verification errata: [`case1-docs-verification.md`](./case1-docs-verification.md)  
- Historical BE status (частично superseded): [`case1-backend-status.md`](./case1-backend-status.md)
