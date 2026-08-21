# Верификация документов кейса 1 (перед внешним ревью)

**Дата:** 2026-08-03 (вечер)  
**HEAD при проверке:** `33079ef` (+ working tree: uncommitted `specification_catalog_*`)  
**Что проверялось:** `case1-section-checklists.md`, `case1-designer-brief.md`, `case1-frontend-user-stories.md`, плюс опорные `case1-backend-status.md` / `case1-frontend-checklist.md`  
**Метод:** сверка с PDF (текст `tmp/tnp-case1-full.txt`), кодом `frontend/src` + `backend/app`, UI-кодом ProjectMenu/Help/Spec/Elec. Браузерный E2E в этой верификации **не** гонялся.

## Вердикт для ревьюера

Документы **пригодны как бриф и backlog**, но содержат **фактические оговорки**. Ниже — что подтверждено, что ошибочно/устарело, что переоценено.  
**Не принимать проценты (~75%) как измерение** — это экспертная оценка по чек-листу, не score из теста.

| Документ | Оценка качества | Риск для ревью |
|---|---|---|
| Designer brief | Хороший scope P0 | Низкий — после errata |
| FE user stories | Хорошая декомпозиция | Средний — IO/Iдоп уточнить |
| Section checklists | Полезен, местами устарел | Средний — Iдоп/CSV/скриншоты |
| Backend status (a43d342) | Частично устарел относительно HEAD+1 | Средний |

---

## Подтверждено кодом (OK оставлять)

| Утверждение | Доказательство |
|---|---|
| Лимит объектов 500 | `config.py`: `GUEST_MAX_OBJECTS_PER_PROJECT = 500` |
| Guest TTL 3 дня | `GUEST_SESSION_TTL_MINUTES = 4320` |
| Help: «до 30 дней», «до 50 объектов», «Пользователь», ТЛТ | `GuestHelpPage.tsx:36–48, 108–115` |
| Home: «3 дня» (верно) | `HomePage.tsx` |
| `supply_voltage` default 220 | `project_object_params.py:66` |
| Нитки TT max 100, legacy self_reg max 3 | `elecCalcLayoutModel.ts:150-151`; unit test ожидает `self_regulating_tt → 100` |
| `bomSectionOf` не читает `object_type_section` | `SpecTable.tsx:34-38`; BE grouping пишет `object_type_section` |
| Нет кнопки «Исправить» unassigned | `SpecPageChrome` modal: только «Подтвердить и сформировать» / «Отмена» |
| Резистив/Скин в UI | `ElectricalAssignmentPanel.tsx` tabs + «Назначить: Резистив» |
| Default table engine = **glide** | `electricalTableEngine.ts:5` |
| DnD `draggable` только на AntD-ветке | `ElectricalUnifiedTableCard.tsx:199-201`; Glide-ветка без onDragStart |
| Selection panel существует (happy path) | `SpecCandidateSelectionPanel` + tests |
| Canonical generate V2 | `useSpecificationPageModel` `variant_ids`, `exclude_unassigned_confirmed`, `catalog_selections` |
| Spec catalog **не** сеется seeds | нет `seed_specification` / `SpecificationCatalog` в seeds |
| Cable BOM qty = order path (×1.1 priority) | `full_builder.py` `_order_cable_qty` |
| TT-only calc на BE (legacy cut) | commit `02cb910` + `DEFAULT_CABLE_TYPE = self_regulating_tt` |

---

## Исправления (было неверно / устарело)

### 1. Iдоп — **не** «опционален, считаем только Lмакс»

**Было в чек-листах/статусе:** Iдоп optional → Lток не гарантируется.  

**Факт сейчас:** `sections.py:207-209` при `max_start_current_per_section_a is None` →  
`ElectricalFormulaError("SECTION_CURRENT_LIMIT_REQUIRED", ...)`.  
Fail-closed на уровне формулы **есть**.

**Реальный пробел:**

- FE **почти нет UI** ввода project/object Iдоп (только display source в result model).
- Без заданного Iдоп пользователь получает error status, а не «тихий» Lмакс-only.
- Story US-ELEC-07 остаётся P0, но AC надо формулировать как «дать UI + default/seed», не «включить fail-closed на BE».

### 2. Файл проекта — **не** «CSV только объекты»

**Было:** «Скачать/Загрузить — CSV, по-видимому только объекты».  

**Факт:** UI зовёт `exportProjectCsv` / `importProjectCsv` (`.tlt.csv`), но BE `project_io_service` — **секционный CSV schema v3**: metadata, objects, electrical_variants, assignments, electrical, specifications, settings (в т.ч. после `33079ef`).  

**Остаётся проблемой для кейса:**

- UX-лейблы «CSV», accept `.csv` — не «файл проекта» языком PDF.
- Guest help не объясняет полный файл / TTL / формат.
- Нужна **приёмочная** проверка round-trip ЭР+spec (не только unit dump).

US-IO-01 P0 остаётся, но AC: «полный schema v3 + human labels», не «с нуля сделать full file».

### 3. Скриншоты `screenshots/01–03` — **не pure guest happy path**

На кадрах: «Новый проект», «Открыть», баннер **«Режим просмотра»** / «меняет только владелец».  

В коде `ProjectMenu`: «Новый проект»/«Открыть» только при `isEmployee`.  
Значит кадры = **сотрудник (или не-owner)**, не эталон гостевого сценария.  
Нельзя опираться на них как на proof guest UX.

### 4. «Исправить» copy в UI

Есть partial: confirmation modal + `confirmPartialGenerate`.  
**Нет** navigate-to-ER + highlight.  
Кнопка называется **«Подтвердить и сформировать»**, не «Всё равно сформировать» (семантика близка, copy ≠ PDF).

### 5. Проценты соответствия

| Было | Коррекция |
|---|---|
| Интегральные ~75–85% | **Оценка, не метрика.** Без AC-FE / browser matrix нельзя заявлять «72–78% release-ready». |
| §6 ~70% | BE TT/sections сильнее FE; Iдоп BE лучше, чем писали. FE legacy UI тянет вниз. |
| §4 ~85% | IO backend v3 лучше, чем «только объекты»; help/session сильно хуже. **~75–80%** realistic. |
| §7 ~72% | bomSection bug + no «Исправить» + catalog seed + selection hydrate — **не выше ~70%** без seeds. |

### 6. case1-backend-status.md (оценка №3)

Частично **опережает/отстаёт** от `33079ef`:

- Snapshot consumers / project_io spec section **сдвинулись** (commit после status doc).
- Uncommitted: `specification_catalog_conditions.py` — in-flight, не в status.
- Утверждение «Iдоп optional only Lмакс» — **устарело** (см. §1).
- «cable-options = [] techdebt» — не перепроверялось глубоко в этой сессии; оставить `[?]` до API smoke.

### 7. Designer brief — мелкие риски

- «Скрыть Резистив/Скин» — верно для MVP; PDF допускает disabled future — оба OK, product already prefers hide.
- 230 V read-only — из **ТЗ/DEC-11**, не буква PDF (PDF: user voltage). Бриф должен по-прежнему ссылаться на ТЗ, иначе ревьюер PDF-only забракует.
- D-HEAT group update — BE `group-update` есть; FE story верна.

### 8. User stories — зависимости

| Story | Коррекция AC |
|---|---|
| US-ELEC-07 | BE fail-closed есть; FE settings + empty/error UX |
| US-IO-01 | Round-trip v3 CSV; rename labels; not greenfield export |
| US-SPEC-02 | «Исправить» = navigate; existing confirm button rename optional |
| US-AUTH-01 | Guest **не** видит «Новый проект» — auto project; help ошибочно учит иначе |
| US-HEAT-05 / ELEC-01 | Согласовать: 230 — ТЗ; PDF нейтрален |

---

## Матрица: утверждение → статус верификации

| # | Утверждение в наших docs | V |
|---|---|---|
| 1 | 500 objects BE | **PASS** |
| 2 | Help 30d / 50 obj | **PASS (bug real)** |
| 3 | Session recovery 401 stale | **UNVERIFIED** (code smell known, no repro this run) |
| 4 | bomSection all → common | **PASS (bug real)** |
| 5 | Threads TT ≤100 not 3 | **PASS (bug real)** |
| 6 | Iдоп optional Lмакс-only | **FAIL claim** — BE fail-closed now |
| 7 | No FE Iдоп settings | **PASS (gap real)** |
| 8 | Resistive/Skin visible | **PASS** |
| 9 | DnD broken on default glide | **PASS** |
| 10 | No «Исправить» navigation | **PASS** |
| 11 | Spec catalog no seed | **PASS** |
| 12 | File = objects-only CSV | **FAIL claim** — v3 multi-section |
| 13 | Screenshots = guest | **FAIL claim** — employee/view |
| 14 | Selection happy path exists | **PASS** |
| 15 | supply_voltage 220 default | **PASS** |
| 16 | Overall ~75% | **ESTIMATE only** |

---

## Что ревьюеру проверять в первую очередь

1. **Не спорить о процентах** — смотреть P0 stories + designer P0 frames.  
2. **Iдоп:** разделить BE (done fail-closed) vs FE (missing settings).  
3. **IO:** schema v3 CSV vs PDF wording «файл проекта».  
4. **Evidence:** не использовать `screenshots/*` как guest golden без пересъёмки.  
5. **Help** — самый дешёвый P1 win, copy полностью врёт.  
6. **Scope кейса 1** = гость; employee §4.3–4.8 в PDF есть, но не ядро приёмки «неавторизованных».

---

## Рекомендуемые правки в артефактах (сделать до/после ревью)

- [x] Этот verification-файл  
- [ ] Errata в `case1-section-checklists.md` (§6.14 Iдоп, §5.11–12 IO, evidence note)  
- [ ] Errata в `case1-frontend-user-stories.md` (US-ELEC-07, US-IO-01, US-AUTH)  
- [ ] Errata в `case1-designer-brief.md` (Iдоп framing, 230=ТЗ, screenshot caveat)  
- [ ] Пометить `case1-backend-status.md` «superseded parts» re Iдоп / project_io  

---

## Итог одной фразой

**Бриф и user stories — направление верное (P0: spec sections, elec MVP UI, diagnostics, help);  
нельзя утверждать, что Iдоп «не реализован на BE» или что файл проекта «только объекты»,  
и нельзя считать скриншоты guest-proof.**
