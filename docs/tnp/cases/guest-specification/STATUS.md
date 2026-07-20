# STATUS — 1 Кейс (единый реестр)

> **Единственный актуальный статус** по guest-specification / PDF 1 кейс.  
> Не плодить новые «отчёты» в чате — **обновлять этот файл**.  
> Исторические: `traceability-matrix.md`, `functional-accuracy-report.md`, phase-*-checkpoint.md.

| Поле | Значение |
|---|---|
| Ветка | local `main` (Desktop TLT) |
| HEAD (на момент записи) | local WIP: PDF-SPEC/BOM alignment phases 1–6 |
| Обновлено | 2026-07-20 (PDF-BOM-07 data-driven matrix; packing goldens; bom_section; dual-length params) |

## Правила оценки

| Слой | Смысл |
|---|---|
| **PDF / спека** | Контракт. Не «ломается» из‑за пустых сидов. |
| **Код** | Flow, API, fail-closed, honesty. Не FAIL из‑за пустого каталога. |
| **Сиды** | Незаполненный registry/catalog — только сюда (`SEEDS`). |
| **Product** | Нужно решение человека, не «дописать формулу». |

---

## A. Сделано (код / продукт)

- Guest: 1 temp project, TTL **3 дня** (config 4320 + Home copy).
- Heat → ЭР → full generate (guest full BOM, manual items 403).
- ЭР lifecycle UUID, slots **1…5** (DB/copy/spec/report/CSV), multi-generate + «Выбрать все».
- Assignments: unassigned / самрег / resistive; skin unsupported targets.
- Spec: settings snapshots, preflight, partial honesty, stale → report exclude + PUT **409**.
- Commercial order length first; Rгр ≠ order reserve; dтр ≥ 57 inclusive.
- Fail-closed registry boxes/sections **без выдуманных defaults**.
- CSV schema v3; report UUID-first + browser print guest.
- Audit honesty P0/P1 (`38f6bb3`): glue/tape, diagnostics GET, partial banner.
- **2026-07-20 PDF-SPEC/BOM code alignment:**
  - PDF-BOM-07: `evaluate_box_matrix_for_object` — per-row conditions, divider/round/min_qty (12 provisional Nk rows).
  - PDF-BOM-02…06 goldens in `test_spec_full_builder.py::TestPdfBomGoldens`.
  - Packing: `kits_per_unit` / `reel_m` / `cable_length_per_kit` preferred over float `package_factor`.
  - PDF-SPEC-05 / PDL-ER-38: `bom_section` = `pipe`|`tank` on cable; accessories from pipe path → `pipe`.
  - PDF-BOM-01 / PDL-ER-02: cable params `order_qty` + `installed_qty` (procurement = commercial order).
  - Unit+integration gate green: `test_spec_full_builder` + `test_specifications` + service unit.

Evidence anchors: `phase-5-checkpoint.md`, `actionable-close-remaining.md`, commit `38f6bb3`, 2026-07-20 full_builder rewrite.

---

## B. Сиды (не код)

| ID | Что | Факт |
|---|---|---|
| SEEDS-01 | Каталог секционирования (Lmax, Iдоп, Iст.уд, …) | **provisional registered** `section_catalog.json` dev-1.0.0 (user-authorized synthetic; replace with official TLT table) |
| SEEDS-02 | `box_ex_rgr_matrix.json` | **provisional registered** **dev-1.0.1** (12 Nk data-driven rows; replace with official Ex/Rгр matrix) |

**Код поверх сидов:** `formulas/electrical/sections.py` (PDF §6.14), attach to self-reg results, BOM uses `section_count`, UI expand hierarchy + summary working/start current.

**Не трогать без новой официальной таблицы:** provisional Lmax/Iдоп/Iст.уд numbers.  
**ЭР flow:** assign→auto batch calc; heat «Далее»→initialize ER1 unassigned; TT marks map to ТЛТ power band for sections.

---

## C. Не сделано (код)

| ID | Что | Где |
|---|---|---|
| ~~CODE-ARCH-01~~ | ~~Два контура assign table + calc table~~ | **fixed**: shared `systemView`, one table |
| ~~CODE-ARCH-02~~ | ~~selected ≠ is_active «Сделать активным»~~ | **fixed**: tab = working ER |
| ~~CODE-01~~ | ~~ER5 candidate/folder 1…4~~ | **fixed**: `variant_number` 1…5 |
| ~~CODE-02~~ | ~~Import CSV: нет warn «заменят данные» + confirm~~ | **done 2026-07-20** `ProjectMenu` Modal.confirm + e2e |
| CODE-03 | Лимит объектов **50**, не 500; wall-clock gate 500 не закрыт | config + perf |
| CODE-04 | Phase 6 UUID-only **execute** (есть только prep) | architecture prep |
| CODE-05 | Firefox / full browser matrix | CI/playwright chromium-only |
| CODE-06 | Security residual deps (starlette/setuptools/weasyprint path) | deps |

---

## D. Product decision — **CLOSED + code**

Зафиксировано: `product-decisions.md` **PDL-ER-42…45**. Код:

| ID | PDL | Код |
|---|---|---|
| PROD-01 | 42 | Home: временный server project, 3 дня, не account |
| PROD-02 | 43 | Home admin card `data-testid=home-admin-entry` + copy system role |
| PROD-03 | 44 | `full_builder` pick-one `ceil(N/capacity)`; catalog `sections_per_kit`; options `connector_kit_sections_per_kit`; Spec UI select; PDF oracle 9/2→5 |
| PROD-04 | 45→**superseded for UI list** | mock watermark ≠ pixel; **но** блоки PDF 21/35/49/56 **обязательны** — см. §H + `pdf-ui-parity-super-prompt.md` |

Nсек-зависимый BOM по-прежнему **fail-closed** пока SEEDS пусты — это SEEDS, не gap D.

---

## E. Вне scope / не трогать без go

- Corporate report template (PDL-ER-40).
- Phase 6 cutover execute без явного go.
- «Догадаться» числами секций/коробок без официальных сидов.
- Pixel-perfect watermark «пример» / чужие бренды HTL из mock PNG.

---

## H. PDF UI parity — **обязательно** (не waiver)

Промпт (scope): [`pdf-ui-parity-super-prompt.md`](pdf-ui-parity-super-prompt.md)  
**Корректирующий (quality):** [`pdf-ui-quality-redemption-prompt.md`](pdf-ui-quality-redemption-prompt.md)

| ID | Что (PDF) | Статус |
|---|---|---|
| **UI-PDF-01** | Heat: 3 колонки (тепло / кабель / spec) + Пол disabled + **Далее** gate | **quality-fixed** — CSS grid heat/cable/spec + card columns |
| **UI-PDF-02** | Elec: 4 summary cards Самрег/Резистив/Скин/Итого | **done** — cards + working/start current + sections when catalog present |
| **UI-PDF-03** | Elec: DnD assign (+ кнопки) | **done** — one table + zones |
| **UI-PDF-04** | Hierarchy object→sections | **done** — expandable sections from calc results (after SEEDS-01) |
| **UI-PDF-05** | Spec: Поставщик + Ед. поставки + код; разделы pipe/tank/common | **quality-fixed** — columns + **2026-07-20** BOM params `supplier`/`supply_unit` filled from catalog |
| **PDF-HEAT-08** | Object row order DnD | **done 2026-07-20** — Glide `onRowMoved` → `PUT /objects/reorder` |
| **PDF-ER-14** | Manual mark + pitch | **e2e** `electrical-er14-manual-mark-pitch.spec.ts` + existing layout edit |

> 2026-07-19: первый shell (`686312b`) закрыл чеклист, но UX был непригоден (DnD на tab labels, summary в footer). Redemption — craft, не новый scope.

---

## F. Очередь (единственная)

1. ~~UI-PDF / SEEDS-01/02 provisional / CODE-01~~ done (заменить provisional numbers официальной таблицей).  
2. ~~PDF-BOM-07 data-driven engine + packing goldens + bom_section~~ **done 2026-07-20**.  
3. ~~Wave A CODE-02 / HEAT-08 DnD / supplier+unit / ER-14 e2e / Playwright path~~ **done 2026-07-20**.  
4. **CODE-03** — 500, если NFR обязателен.  
5. **CODE-04** Phase 6 — по go.  
6. Official section catalog / box matrix superseding provisional **dev-1.0.1**.

---

## G. Запрет на дрейф отчётов

- Этот файл = **STATUS**.  
- Чат: только дельта («обновил STATUS: CODE-01 done») + ссылка на `STATUS.md`.  
- Не писать заново full matrix/BOM/UI-эссе без правки этого файла.
