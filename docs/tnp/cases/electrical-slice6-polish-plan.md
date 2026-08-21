# План фиксов: Slice 6 — электрика «полный polish» (TT-only cutover)

**Дата:** 2026-08-03  
**Статус:** рабочий план реализации, не ACTIVE-очередь.  
**Маршрутизация:** BE — из `backend/`; FE-хвосты — через [`docs/frontend/refactor-backlog.md`](../../frontend/refactor-backlog.md) / Slice 5.  
**Контракт:** [`guest-electrical-calculation-tz.md`](./guest-electrical-calculation-tz.md) (§5.2, §9.15, §10, §17.3).  
**Снимки:** [`case1-backend-status.md`](./case1-backend-status.md) §6; [`case1-closure-slice-plan.md`](./case1-closure-slice-plan.md) Slice 6.  
**Решение владельца:** legacy ТЛТ выпилить целиком; расчётный MVP — только **ТТН/ТТВ/ТТХ** (`self_regulating_tt`).  
**Системы `mineral` / `skin`:** остаются как `unsupported` (назначение/UI), без формул и без расчётного входа.

---

## 1. Цель и критерий «~100% P1 elec polish»

Сейчас ядро калькуляции TT + Iдоп + sections ≈ **~90%**. Не хватает cutover-полировки:

| ID | Пробел | Цель |
|---|---|---|
| **B1** | `GET /calc/cable-options` → `[]` | TT-модели active power-каталога: серия, P@T3, reason, scope ЭР |
| **№8** | Legacy-вход/дефолты/схемы/каталог ТЛТ | 422 `ELECTRICAL_LEGACY_*`; прод-путь только `self_regulating_tt` |
| **B4** | Residual `le=100` ниток в non-TT схемах | Жёстко `1..3` везде в публичном контракте; FE зеркало |
| **B2** | `stale` → `not_calculated` | Отдельный table status «Требуется перерасчёт» vs «Требуется корректировка» |
| **B6** | Нет `Idempotency-Key` + `expected_assignment_version` на sync calc | Race-safe single/batch; UUID-first на batch/page |
| **§9.15** | `status="ready"` литерал | Финальный гейт после секционирования |
| **FB** | Fallback 220 В / −20 °C | Fail-closed / удалить |
| **IO** | Import legacy `cable_type` | Явная политика: reject 422 **или** import-as-stale без ready |

**Definition of Done (BE-first, с минимальным FE-хвостом):**

1. Новый расчёт нельзя запустить с legacy `cable_type` / маркой `ТЛТ-*`.
2. Manual mark dropdown наполняется только с `GET /calc/cable-options` (или typed-эквивалент), без FE-копий q1/q2.
3. Table status различает `stale` / `error` / `calculated` / `not_calculated` / `unsupported`.
4. `POST /calc/electrical` (+ batch) — UUID ЭР, optimistic concurrency, идемпотентность double-click.
5. После section plan результат `ready` только при прохождении §9.15.
6. Интеграционные + unit-тесты зелёные; e2e, которые ещё шлют `self_regulating`, обновлены.

---

## 2. Текущее состояние (важно: часть cutover уже есть)

Не начинать «с нуля» — не ломать уже сделанное.

| Уже есть | Где | Осталось |
|---|---|---|
| API `ElectricalCableType` без `self_regulating` / `single_core` / `three_core` | `schemas/calculation.py` | `mineral`/`skin` ещё в Literal; resistive-схемы с `le=100` живы |
| Guard `ELECTRICAL_LEGACY_CABLE_TYPE_UNSUPPORTED` | `calculation_service._calculate_electrical_result` | Внутренние defaults `"self_regulating"`; batch/select-cable принимают `str` |
| Марка `ТЛТ-*` → `ELECTRICAL_LEGACY_CABLE_MARK_UNSUPPORTED` | `self_regulating.py` | Import/project file могут тащить legacy snapshot |
| TT pipeline 230 В, threads 1..3, Iдоп fail-closed | `electrical_tt_pipeline`, `sections.py` | Нет post-section §9.15 gate; `status="ready"` литерал |
| `cable-options` stub `return []` | `get_cable_options` | Реализация + query `electrical_variant_id` |
| Assignment already has `expected_version` + 409 | `electrical_assignment_service` | Calc POST не принимает `expected_assignment_version` |
| ER create/copy уже на `Idempotency-Key` | `electrical_variants` | Calc single/batch — нет |
| FE manual options из client catalogs | `useElecCalcCableMarkOptions` | Переключить на BE options (Slice 5/6 FE-хвост) |
| Формулы `resistive.py` / `mineral.py` удалены из source | `formulas/electrical/` | Остались схемы, seeds, `cables_tlt.json`, e2e defaults |

---

## 3. Принципы реализации

1. **Один расчётный тип:** `self_regulating_tt`. Всё остальное — 422 на calc boundary или `unsupported` на assignment.
2. **Backend-authoritative options:** FE не считает P@T3 и eligibility; только отображает ответ B1.
3. **Fail-closed:** нет silent 220 В, нет silent −20 °C, нет silent legacy import → ready.
4. **Маленькие вертикальные PR:** каждый PR зелёный и деплоябельный; сначала блокирующие контракты, потом UI.
5. **Не трогать чужой WIP** (spec canonical, display-settings docs) — только electrical slice.
6. **Тесты до «готово»:** unit на gate/status/options; HTTP integration на 422/409/idempotency; точечный e2e на manual mark + stale label.

---

## 4. Порядок работ (DAG)

```text
WP0  Quick cutover guards (№8 partial + B4 + FB defaults)
  │
  ├─► WP1  B1 cable-options (TT catalog)
  │
  ├─► WP2  §9.15 final gate
  │
  ├─► WP3  B2 table status (stale vs error)
  │
  ├─► WP4  B6 idempotency + expected_assignment_version + UUID batch/page
  │
  ├─► WP5  Import/IO policy (IO) + dead code / catalogs purge (№8 rest)
  │
  └─► WP6  FE polish tail (options consumer, status labels, threads 1..3, defaults)
         │
         └─► WP7  Tests seal + e2e defaults migration
```

Параллельно после WP0: WP1 ‖ WP2 ‖ WP3.  
WP4 зависит от стабильного UUID-контракта (частично уже есть).  
WP6 может стартовать после WP1+WP3 API; полный seal — после WP4.

**Рекомендуемые PR (4–6):**

| PR | Состав | Риск |
|---|---|---|
| **PR-A** | WP0 + WP2 + unit gates | Низкий |
| **PR-B** | WP1 cable-options + tests | Средний (контракт FE) |
| **PR-C** | WP3 status + query/SQL + FE label map | Средний |
| **PR-D** | WP4 concurrency/idempotency | Высокий (API surface) |
| **PR-E** | WP5 purge + IO policy | Средний (import/migrations seeds) |
| **PR-F** | WP6+WP7 FE/e2e | Средний |

---

## 5. Work packages

### WP0 — Cutover guards (№8 partial + B4 + FB)

**Проблема.**  
- Внутренние defaults `"self_regulating"` (`calculation_service` select/batch helpers, FE `electricalBatchCalc.ts`).  
- Resistive request-схемы: `number_of_threads: Field(..., le=100)` (`schemas/calculation.py` ~869, ~1004).  
- TT-схемы уже `le=3`, но публичный mixed surface и FE layout (`elecCalcLayoutModel`: legacy 3 / иначе 100) дают residual B4.  
- Object default `supply_voltage: 220` (`project_object_params.py:66`) расходится с TT 230.  
- Fallback cold-start/voltage в legacy helper-path (если ещё вызывается) — убрать.

**Сделать:**

1. Единый модуль констант / allowlist:
   - `CALCULABLE_CABLE_TYPES = frozenset({"self_regulating_tt"})`
   - `UNSUPPORTED_SYSTEM_TYPES = frozenset({"mineral", "skin"})`
   - `LEGACY_CABLE_TYPES` → только для чтения history + 422 на write.
2. На **всех** calc write endpoints (`POST /electrical`, batch, select-cable, select-cable/variants, candidates):
   - нормализовать default → `self_regulating_tt`;
   - `cable_type ∈ LEGACY` → 422 `ELECTRICAL_LEGACY_CABLE_TYPE_UNSUPPORTED`;
   - `mineral`/`skin` → 422 `ELECTRICAL_SYSTEM_UNSUPPORTED` (или существующий unsupported code — один код, не плодить).
3. `ElectricalCableType` Literal → только `"self_regulating_tt"` **или** оставить mineral/skin с явной пометкой «не calculable» + валидатор, запрещающий calc. Предпочтение: **только `self_regulating_tt`** на calc request; assignment system_type отдельно.
4. B4: любые публичные `number_of_threads` / `thread_count` → `ge=1, le=3`. Resistive-only схемы либо удалить (если мёртвые), либо пометить deprecated и тоже `le=3` до удаления в WP5.
5. `supply_voltage` default объекта: **220 → 230** (Slice 0 item; можно в PR-A).
6. Удалить/заменить silent fallbacks 220/−20 в calc path: если cold_start/voltage отсутствуют — `ElectricalInputResolutionError`, не default.

**Тесты:**

- unit: legacy type → 422 code; threads 4 → 422; mineral → unsupported.
- integration: POST `/calc/electrical` body `cable_type=self_regulating` → 422.
- regression: happy TT path 201/200 + `status` после WP2.

**Acceptance:** нельзя посчитать legacy; нельзя задать 4+ нитки на API; новый объект без U → 230.

---

### WP1 — B1: `GET /calc/cable-options` → TT options

**Контракт ТЗ §10 / §17.3.5:**

```
GET /calc/cable-options/{object_id}?electrical_variant_id=<uuid>
```

Ответ (предложение typed schema `CableOptionOut`):

```json
[
  {
    "model": "30ТТВ2",
    "series": "ТТВ",
    "base_model": "30ТТВ2",
    "full_mark_preview": "30ТТВ2-СР",
    "power_at_t3_w_per_m": 30.59,
    "eligible": true,
    "unavailable_reason": null,
    "temperature_group": "...",
    "q1": -0.141,
    "q2": 32.0,
    "nomenclature_code": null,
    "catalog": {
      "kind": "power",
      "version": "...",
      "source_checksum": "..."
    }
  }
]
```

**Правила eligibility (fail-closed, сервер):**

1. Active approved power-каталог (DB); static `cables_tt.json` — только dev fallback по существующим правилам production-boundary.
2. Серия vs T1/T2 (строгие границы ТТН/ТТВ/ТТХ) — как в `calc_self_regulating_tt`.
3. Мощность при T3 = `q1*T3+q2` (тот же helper, что pipeline).
4. Manual mark без суффикса `-СТ/-СР/-НР` (как сейчас в формуле); preview суффикса — из aggressive_product объекта/override.
5. Не eligible, если: серия не подходит; P@T3 не конечна; нет строки; provisional catalog → `eligible=false` + reason code (не 500).
6. Scope: object heat + project Iдоп **не** отфильтровывают список «всех моделей серии» для manual dropdown — ТЗ: показать модели допустимой серии + reason.  
   *Уточнение:* auto technical-minimum может отсечь слабые модели; **manual options** показывают серию-eligible, а полный recalc при выборе всё равно валидирует threads/sections.

**Реализация:**

| Слой | Действие |
|---|---|
| `calculation_service.get_cable_options` | Заменить stub: load object, resolve heat/T, load power catalog, build list |
| `electrical_tt_pipeline` / `self_regulating` | Вынести pure `evaluate_tt_cable_option(row, temps) -> Option` |
| `api/v1/calculations.cable_options` | Query `electrical_variant_id`; access via `get_object` + optional variant scope |
| `schemas/calculation.py` | `CableOption`, `CableOptionsResponse` |
| FE (WP6) | `getCableOptions(objectId, electricalVariantId)` → dropdown; убрать client q1/q2 path для TT |

**Не делать в B1:** коммерческий ranking, extended catalog UI, FE кэш как source of truth.

**Тесты:**

- unit: eligibility reasons (wrong series, bad q1/q2, T2 boundary).
- integration: guest A cannot read guest B object options (уже security test — расширить на non-empty).
- integration: empty heat → 422 `ELECTRICAL_HEAT_LOSS_REQUIRED` **или** options with all `eligible=false` + reason — **решить в PR-B:** предпочтение **422**, т.к. manual mark без heat бессмысленен (select-cable уже требует heat).

**Acceptance:** US-ELEC-08/11 — manual dropdown с provenance options; auto-assign P0 не блокируется (auto path уже не зависит от endpoint).

---

### WP2 — §9.15 final gate

**Контракт (§9.15):** `ready` только если:

- марка определена;
- серия ↔ T1/T2, исполнение DEC-18;
- `U = 230`;
- `Nнит ∈ 1..3`;
- `Nсек > 0`, `Lсек > 0`, `Lсек <= Lмакс`;
- `Iст.сек <= Iдоп`;
- `Lфакт >= Lтреб`;
- все секции равны;
- `Pуст.м >= Pтреб`;
- snapshots/версии каталогов сохранены.

**Где сейчас:** `electrical_tt_pipeline.py` ставит `"status": "ready"` без post-check (~line 340). Часть инвариантов уже enforced внутри `compute_section_plan` / selection; **дыры:** `Pуст≥Pтреб`, `Lфакт≥Lтреб` после plan, equality sections, voltage, threads.

**Сделать:**

1. Pure function `assert_electrical_tt_ready(result) -> None` в `formulas/electrical/tt_contract.py` или `sections.py`:
   - читает structured result (cable/layout/section_plan/electrical/catalogs);
   - сравнивает Decimal-safe через существующий `decimal_math`;
   - при нарушении → `ElectricalFormulaError("ELECTRICAL_FINAL_GATE_FAILED", ..., details={check, left, right})`.
2. Вызов **после** сборки result dict, **до** return из `calculate_electrical_tt`.
3. Не писать `status="ready"` до прохождения gate; при ошибке — failed upsert path (как formula error).
4. Golden boundary tests: `Pуст == Pтреб` (pass), `Pуст = Pтреб - eps` (fail), `Lфакт == Lтреб` (pass), unequal sections (fail).

**Acceptance:** невозможно сохранить success/ready snapshot, нарушающий §9.15.

---

### WP3 — B2: table status stale vs error

**Контракт UI (§5.2):**

| Backend / table status | UI |
|---|---|
| `ready` / `calculated` | Рассчитано |
| `stale` | **Требуется перерасчёт** |
| `error` | **Требуется корректировка** |
| `unsupported` | Тип не поддерживается |
| `not_calculated` / нет calc | Не рассчитан |

**Где ломается:**

```python
# electrical_query_service._electrical_status / _sql_electrical_status
if status == "stale":
    return "not_calculated"   # ← схлопывание
```

`electrical_result_status` уже умеет `"stale"`; table projection теряет различие.

**Сделать:**

1. `STATUS_OPTIONS` добавить `("stale", "Требуется перерасчёт")`; уточнить label `error` → «Требуется корректировка» (или оставить code=`error`, label по ТЗ).
2. Python + SQL branches: `stale` → `"stale"`, **не** `not_calculated`.
3. Filters/sort options обновить; snapshot consumers (export labels) — та же map.
4. FE: `elecCalcMainTableModel` / status renderer / filter chips — map `stale` → badge «Требуется перерасчёт»; row highlight + «Пересчитать» (Slice 5 P0 — связать).
5. Summary counts: `stale` отдельно от `not_calculated` (ТЗ §7.5).

**Не смешивать:** assignment_state `stale` vs calc table status — оба должны показывать «перерасчёт», но поля разные; не дублировать логику, переиспользовать `electrical_result_status` + lifecycle overlay.

**Тесты:**

- unit: fixture stale result → status `stale`.
- SQL/integration query: filter `status=stale` возвращает только stale rows.
- FE unit: label map.

**Acceptance:** после изменения Heat строка не выглядит как «не рассчитан», а как «требуется перерасчёт».

---

### WP4 — B6: Idempotency + expected_assignment_version + UUID scope

**Целевой request (§10.1):**

```json
{
  "project_id": "uuid",
  "object_id": "uuid",
  "electrical_variant_id": "uuid",
  "expected_assignment_version": 7,
  "selection_policy": "technical_minimum",
  "overrides": { "...": "..." }
}
```

**Header:** `Idempotency-Key` (как reports / ER create).

#### 4.1 Single `POST /calc/electrical`

1. Схема `ElectricalRequest`:
   - `electrical_variant_id: UUID` **required** (или required-unless legacy bridge — предпочтение **required** + deprecation `variant_number`);
   - `expected_assignment_version: int | None` — **required for write** (или optional only in test mock mode);
   - убрать опору на `variant_number` как primary key (оставить deprecated optional для 1 release).
2. Перед calc: load assignment `(variant_id, object_id)`; если `version != expected` → **409** `ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT` (тот же код, что assignment service).
3. Idempotency:
   - scope: `(principal/session, project_id, electrical_variant_id, object_id, key_hash)`;
   - payload fingerprint: cable_type + normalized overrides + selection_policy + expected_version;
   - same key + same fingerprint → replay previous response (200) without re-executing formula if result still current;
   - same key + different fingerprint → **409** idempotency reuse (как reports);
   - storage: reuse pattern from `BackgroundTask.idempotency_key` **или** lightweight table `electrical_calc_idempotency` (TTL 24h) — **предпочтение:** тот же approach, что ER create (hash on entity), но calc чаще → отдельная short-TTL store / Redis-less DB table.
4. Double-click: FE шлёт один key на gesture (WP6).

#### 4.2 Batch `POST /calc/electrical/batch`

1. Принимать `electrical_variant_id` (required) вместо/впереди `variant_number`.
2. Optional body JSON (миграция с query soup):
   - `object_ids`, overrides, `skip_manual`, `selection_policy`, `expected_assignment_versions: {object_id: version}` **или** items `[{object_id, expected_assignment_version}]`.
3. Atomic validation: любой version mismatch → **весь batch 409** (consistent with assignment patch) **или** per-object error map — **рекомендация:** per-object error + partial success уже есть для formula; для version — **fail that object** with 409-equivalent item error, не откатывать чужие success (batch semantics сегодня). Зафиксировать в тесте.
4. Batch-level `Idempotency-Key`: replay entire batch response.

#### 4.3 Page `GET/POST .../electrical/page` + list

1. Primary filter: `electrical_variant_id`.
2. `variant_number` deprecated alias → resolve via `prepare_legacy_variant` one release, затем remove.
3. Query path `/calc/electrical/query` уже UUID-scoped — выровнять page.

**Тесты:**

- integration: two POST same key → one formula execution (spy/counter) / same result id.
- integration: version mismatch → 409, DB unchanged.
- integration: batch UUID-only scope; wrong project variant → 404/403.
- concurrency: two writers different keys, second 409 on version.

**Acceptance:** double-click не плодит dual recalc races; multi-tab edit ловится 409 + FE reload version.

---

### WP5 — IO import policy + dead code purge (№8 rest)

#### 5.1 Import policy (нужно явное решение в коде)

**Рекомендация владельцу (зафиксировать в PR-E):**

| В файле | Поведение import |
|---|---|
| `cable_type=self_regulating_tt` + valid TT snapshot | Восстановить; lifecycle overlay может пометить stale |
| `cable_type ∈ {self_regulating, single_core, three_core}` | **Не ready:** сохранить raw в history diagnostics, assignment `stale` или `unassigned`, calc row с `category=stale`, `stale_reason=legacy_cable_type` — **без** 422 всего файла |
| `mineral`/`skin` | assignment `unsupported` (как сейчас) |
| марка `ТЛТ-*` | stale_reason `legacy_cable_mark` |
| 220 В snapshot | уже stale via lifecycle |

**Не** silently remap `self_regulating` → `self_regulating_tt` + ready.

Точки: `project_io_service._legacy_assignment_projection`, import electrical rows (~1307 default `"self_regulating"`).

#### 5.2 Purge

- Перестать отдавать/seed-ить `cables_tlt.json` в prod path; файл → archive или delete + tests.
- Defaults/seeds: electrical calcs только TT 230 В.
- Удалить мёртвые resistive request models / commercial ranking hooks, если нет consumers.
- `CABLE_TYPE_OPTIONS` в query service: убрать legacy из filter options **или** оставить только для history rows read-only.
- `__pycache__` resistive/mineral — не коммитить; source уже нет.
- E2E helpers: `cable_type: 'self_regulating'` → `self_regulating_tt` (`e2e/tests/helpers/phase5-api.ts`, cable-business-flows).

**Acceptance:** свежий import legacy файла не даёт ready-строк в summary/BOM; dev seed без ТЛТ-ошибок 220.

---

### WP6 — FE polish tail (связан с Slice 5)

Минимальный FE, чтобы BE-контракты были видимы:

| Тема | Действие | Файлы (ориентир) |
|---|---|---|
| Options | `getCableOptions(objectId, variantId)`; dropdown из ответа | `api/calculations.ts`, `useElecCalcCableMarkOptions.tsx` |
| Defaults | `CableType` default `self_regulating_tt`; убрать `self_regulating` sends | `electricalBatchCalc.ts`, `calculations.ts` |
| Threads | max 3 для TT (и глобально в MVP) | `elecCalcLayoutModel.ts` (Slice 0) |
| Status | map `stale` / `error` labels | table model, summary chips |
| Idempotency | header on calc/select-cable/batch | api client helpers (как ER create) |
| Version | читать `assignment.version`, слать `expected_assignment_version`; on 409 refetch | page model / mutations |
| Hide legacy systems | Slice 5: resistive/skin/mineral UI | tabs, summary, assign |

FE-only items остаются в Slice 5 backlog; WP6 — только consumer новых BE полей.

---

### WP7 — Tests seal

| Слой | Набор |
|---|---|
| Unit | final gate; status mapping; options eligibility; legacy 422 |
| Integration HTTP | cable-options non-empty; calc idempotency; version 409; batch UUID; import legacy → not ready |
| E2E | manual mark select from options; stale badge after heat edit; threads max 3 |
| Regression | existing `test_electrical_tt_*`, acceptance, security boundaries |

Не заявлять зелёным то, что не гонялось.

---

## 6. Матрица влияния на кейс / FE

| ID | BE | FE обязательно? | Блокирует auto-assign? |
|---|---|---|---|
| B1 | options API | Да для manual polish | Нет |
| №8 | 422 + purge | Да (defaults/e2e) | Нет (auto уже TT) |
| B4 | schema le=3 | Да (UI max) | Нет |
| B2 | status field | Да (labels) | Нет |
| B6 | headers/body | Да (key + version) | Нет |
| §9.15 | pipeline gate | Нет (ошибка как formula) | Косвенно (меньше false ready) |
| FB | fail-closed | Нет | Нет |
| IO | import | Нет (или toast stale) | Нет |

---

## 7. Риски и решения владельца

| # | Вопрос | Рекомендация плана |
|---|---|---|
| R1 | Import legacy: 422 файл целиком vs soft-stale | **Soft-stale** (не ломать bulk import проектов) |
| R2 | `mineral`/`skin` в calc Literal | Убрать из calc request; оставить system_type assignment |
| R3 | Обязательность `Idempotency-Key` на calc | **Required** на write (как copy ER); без ключа 400 |
| R4 | Обязательность `expected_assignment_version` | **Required** на single; batch per-item |
| R5 | `cable-options` без heat | **422** heat required |
| R6 | Удаление `cables_tlt.json` | После миграции e2e/seeds; один PR-E |
| R7 | Ломать ли `variant_number` сразу | Deprecate 1 PR, remove next — меньше FE thrash |

---

## 8. Оценка объёма (порядок)

| WP | Effort (ориентир) |
|---|---|
| WP0 | 0.5–1 d |
| WP1 | 1–1.5 d |
| WP2 | 0.5 d |
| WP3 | 0.5–1 d (BE+FE labels) |
| WP4 | 1.5–2.5 d |
| WP5 | 1 d |
| WP6 | 1–2 d |
| WP7 | 0.5–1 d |
| **Итого** | **~6–10 engineer-days** |

После закрытия: раздел 6 кейса с ~83% → **~95%+** (остаток — FE Slice 5 UX: Iдоп UI, DnD, provenance chrome, 500-obj virtualization).

---

## 9. Чек-лист закрытия Slice 6

- [ ] Legacy `cable_type` / `ТЛТ-*` → 422 на calc write
- [ ] `GET /calc/cable-options` non-empty TT + reasons + `electrical_variant_id`
- [ ] Threads `1..3` на всех публичных схемах + FE
- [ ] Table status `stale` ≠ `not_calculated`
- [ ] `POST /calc/electrical` (+ batch): UUID, `expected_assignment_version`, `Idempotency-Key`
- [ ] `/electrical/page` (и list) — UUID-first
- [ ] §9.15 gate перед `status=ready`
- [ ] Нет silent 220 / −20 fallbacks в TT path
- [ ] Import legacy → не ready (soft-stale)
- [ ] Purge ТЛТ catalog path / defaults / e2e
- [ ] Tests: unit + HTTP + точечный e2e
- [ ] Обновить [`case1-backend-status.md`](./case1-backend-status.md) §6 и Slice 6 в [`case1-closure-slice-plan.md`](./case1-closure-slice-plan.md) **после** реализации (не до)

---

## 10. Первый конкретный шаг

**PR-A (WP0+WP2):**  
1) defaults → `self_regulating_tt` + 422 legacy;  
2) `le=3` threads;  
3) `supply_voltage` 230;  
4) `assert_electrical_tt_ready` в pipeline;  
5) unit tests.  

Это уже поднимает «cutover hardness» без ломки FE manual dropdown (B1) и без concurrency redesign (B6).
