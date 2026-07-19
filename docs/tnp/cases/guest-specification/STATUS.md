# STATUS — 1 Кейс (единый реестр)

> **Единственный актуальный статус** по guest-specification / PDF 1 кейс.  
> Не плодить новые «отчёты» в чате — **обновлять этот файл**.  
> Исторические: `traceability-matrix.md`, `functional-accuracy-report.md`, phase-*-checkpoint.md.

| Поле | Значение |
|---|---|
| Ветка | local `main` (Desktop TLT) |
| HEAD (на момент записи) | local WIP UI-PDF quality redemption |
| Обновлено | 2026-07-19 (ER: selected tab = working ER; no ★ active UX) |

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

Evidence anchors: `phase-5-checkpoint.md`, `actionable-close-remaining.md`, commit `38f6bb3`.

---

## B. Сиды (не код)

| ID | Что | Факт |
|---|---|---|
| SEEDS-01 | Каталог секционирования (Lmax, Iдоп, Iст.уд, …) | **не заполнен / не зарегистрирован** |
| SEEDS-02 | `box_ex_rgr_matrix.json` | **`status=missing`, rows пустые** |

**Следствие runtime (ожидаемо):** partial BOM + diagnostics  
`SECTION_DATA_SOURCE_MISSING` / `BOX_EX_RGR_MATRIX_MISSING`.  
Это **не** «спека/код не сделаны».

После наполнения сидов: Phase 4 wiring (sections persist/UI, BOM Nсек/boxes) — см. `phase-4-checkpoint.md`.

---

## C. Не сделано (код)

| ID | Что | Где |
|---|---|---|
| ~~CODE-ARCH-01~~ | ~~Два контура assign table + calc table~~ | **fixed** (WIP tree): shared `systemView`, one table |
| ~~CODE-ARCH-02~~ | ~~selected ≠ is_active «Сделать активным»~~ | **fixed**: tab click / create / copy → select+activate; no ★ button |
| CODE-01 | ER5: candidate / candidate_folder create — guard `variant_number > 4` (только 1…4) | `calculation_service.py` |
| CODE-02 | Import CSV: нет warn «заменят данные» + confirm (PDF §5.11) | `ProjectMenu.tsx` |
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
| **UI-PDF-02** | Elec: 4 summary cards Самрег/Резистив/Скин/Итого | **quality-fixed** — cards над таблицей; yellow banner totals removed; params panel **default off** |
| **UI-PDF-03** | Elec: DnD assign (+ кнопки) | **arch-fixed** — shared system tabs + HTML5 row drag to zones; **one** object table |
| **UI-PDF-04** | Hierarchy object→sections (shell до SEEDS; full после) | **shell quality-fixed** — engineer copy, no SEEDS jargon; full after SEEDS-01 |
| **UI-PDF-05** | Spec: Поставщик + Ед. поставки + код; разделы pipe/tank/common | **quality-fixed** — PDF columns (no «Категория» in section group) |

> 2026-07-19: первый shell (`686312b`) закрыл чеклист, но UX был непригоден (DnD на tab labels, summary в footer). Redemption — craft, не новый scope.

---

## F. Очередь (единственная)

1. ~~**UI-PDF-01…05** quality redemption~~ — craft done (см. §H); visual browser proof optional.  
2. **SEEDS-01 / SEEDS-02** — наполнить (разблокирует full UI-PDF-04 + boxes).  
3. **CODE-01** — ER5 candidate/folder 1…5.  
4. **CODE-02** — import confirm.  
5. ~~PROD-01…03~~ done; PROD-04 UI list → §H.  
6. **CODE-03** — 500, если NFR обязателен.  
7. После сидов — Phase 4 full sections + BOM.  
8. **CODE-04** Phase 6 — по go.

---

## G. Запрет на дрейф отчётов

- Этот файл = **STATUS**.  
- Чат: только дельта («обновил STATUS: CODE-01 done») + ссылка на `STATUS.md`.  
- Не писать заново full matrix/BOM/UI-эссе без правки этого файла.
