# Автономный план продолжения frontend-рефакторинга

**Актуально на:** 2026-07-23  
**Статус:** **исполняемый backlog** — единственный источник «что делать дальше» для агента.  
**Язык команд пользователя:** «продолжай», «дальше», «next slice», «выполни план» = **взять первый `pending` slice и выполнить до DoD**, без вопроса «что дальше?».

---

## 0. Режим работы агента (обязательно)

### Не спрашивать

Агент **не** спрашивает «что дальше?», «Elec или Heat?», «CSS или shell?» пока:

1. в таблице [§3 Очередь](#3-очередь-sliceов) есть slice со статусом `pending`;
2. нет hard stop из [§5](#5-stop--эскалация-к-человеку).

При «продолжай» / «continue» / «дальше»:

```text
1. Прочитать этот файл + pr-budget.md
2. Взять первый pending slice (минимальный ID)
3. Выполнить ровно один slice
4. Characterization tests → commit
5. Обновить статусы: этот файл §3, s0-lite-status.md, metrics-baseline.md, hotspots.md
6. Если пользователь сказал «продолжай» без лимита — сразу брать следующий pending
7. Спросить человека ТОЛЬКО при hard stop (§5)
```

### Ограничение «сколько slice за один ответ»

| Команда пользователя | Сколько slice |
|---|---|
| «продолжай» / «continue» / «дальше» | **до 3** pending подряд, пока не упрёшься в stop |
| «один slice» / «только один» | **1** |
| «выполни план» / «до milestone X» | пока не закрыт milestone или stop |
| «стой» / «stop» | немедленно остановиться, зафиксировать WIP |

Если пользователь **не** указал лимит — по умолчанию **до 3 slice** за ход, затем короткий status-report (не вопрос «что дальше», а «сделано N; следующий pending = …»).

### Budget одного slice (жёстко)

См. [pr-budget.md](./pr-budget.md):

```text
max 1 page/shell file edited
max 2 production helper/CSS files
max 2 test files
1 domain only: heat | electrical | specification | ui | shared | css
characterization first
styles.css: net LOC ≤ 0 (prefer delete/move only)
```

Нарушение budget → **split** на два slice, не раздувать один.

### Characterization first

1. Найти поведение (строки shell / существующие тесты).
2. Вынести pure model или hook **без** смены UX/API.
3. Unit-тест на extract (happy + 1–2 edge).
4. Подключить shell; удалить дубль.
5. Commit с `refactor(frontend): …`.

### Запрещено в этом плане

- rewrite frontend / Next / Tailwind / monorepo packages;
- менять расчётные формулы и goldens;
- heat ↔ electrical imports;
- `components/*` → `pages/*` (allowlist пустой — **не расширять**);
- Glide rewrite «для красоты»;
- трогать `InsulationLayersTable` без явного запроса;
- ослаблять assertions;
- mass rename в `domains/*` до milestone M3 (thin shells).

---

## 1. Baseline (где мы сейчас)

| Метрика | Значение (после shell+CSS) | Цель |
|---|---:|---:|
| `ElecCalcPage.tsx` | **30** | ≤500 ✅ |
| `ElecCalcWorkspace.tsx` | **192** | ≤500 ✅ |
| `HeatCalcPage.tsx` | **280** | ≤500 ✅ |
| `specification/SpecificationPage.tsx` | **398** | ≤500 ✅ |
| `styles.css` | **14** | ≤3000 (M4) ✅ · freeze stub only |
| inverted `components→pages` | **0** | 0 ✅ |
| thick models (Heat/Elec/Spec) | 830 / 1086 / 511 | optional deeper thin (E18–E19 / H13) |

**Shell DoD (view) — закрыт.** Следующий фокус: **Track C CSS strangler**.

История slices: [s0-lite-status.md](./s0-lite-status.md).

---

## 2. Milestones

| ID | Имя | Критерий готовности | Зависит |
|---|---|---|---|
| **M1** | Elec under 1200 | `ElecCalcPage` ≤ 1200 LOC, unit coverage на extracts | — |
| **M2** | Heat under 700 + Spec namespace | Heat ≤ 700; Spec files under `pages/specification/` | M1 предпочтителен, не блокер |
| **M3** | Shell DoD | Heat/Elec/Spec ≤ 500; shell ≈ wiring only | M1+M2 |
| **M4** | CSS strangler | `styles.css` ≤ 3000; feature CSS у владельцев | параллельно с M1–M3 |
| **M5** | domains/* rename | optional `git mv` без смены поведения | M3 + green s0-gates |

Агент **не** перескакивает к M5, пока M3 не закрыт.

---

## 3. Очередь slice’ов

Статусы: `pending` | `in_progress` | `done` | `blocked` | `skipped`.

После выполнения: поставить `done`, дописать commit hash в «Note», обновить LOC.

### Track E — Electrical (приоритет #1)

Цель: ElecCalcPage 1787 → ≤ 1200 → ≤ 500.

| ID | Статус | Scope (≤2 prod files) | Что вынести | Proof | Note |
|---|---|---|---|---|---|
| **E8** | `done` | cable type options model+hook | options / change handler | unit | `fbff7d1` |
| **E9** | `done` | params panel state | storage toggle | unit | `fbff7d1` |
| **E10** | `done` | cable mark presentation | mark/row resolve | unit | `fbff7d1` |
| **E11** | `done` | ManualOverwriteControl | batch bar checkbox | unit | `fbff7d1` |
| **E12** | `skipped` | workspace query | already thin enough via existing models | — | skip |
| **E13** | `done` | Project + Workspace split | page → 30 LOC | unit+smoke | `fbff7d1` |
| **E14** | `done` | assign auto-calc model | PDF-ER-08 payload | unit | `fbff7d1` |
| **E15** | `done` | error summary + section hierarchy | expandable sections | unit | `31acebc` |
| **E16** | `done` | table/modals/chrome/ui helpers | workspace ≤1200 | unit+smoke | `4a125cf` **1194** |
| **E17** | `done` | useElecCalcWorkspaceModel | workspace view 191 ≤500 | smoke | model ~1112 |
| **E18** | `done` | modal presentation pure | scrollX + assignment reasons + modal presentation | unit 7 | candidate scroll + workspace modal models |
| **E19** | `done` | summary/batch chrome hook | `useElecCalcWorkspaceSummaryChrome` + pure job/total helpers | unit 6 + BatchActionBar | model **1116→1086** |

**Метрика shell:** `ElecCalcPage` = **30**. `ElecCalcWorkspace` = **192** (M1/M3 ✅).  
**Текущий пункт:** model-thin residual (Elec ~1086 / Heat ~830).

Also fix baseline thick models line if present.

### Track H — Heat

Цель: 993 → ≤ 700 → ≤ 500. Брать **после** E16 (Elec ≤ 1200), если пользователь не сказал иначе.

| ID | Статус | Scope | Что вынести | Proof | LOC target |
|---|---|---|---|---|---|
| **H8** | `done` | layout presentation pure | side form placement | unit | `85d93b1` |
| **H9** | `done` | (merged into H10) | type/actions stay thin wrappers | — | — |
| **H10** | `done` | `HeatCalcWorkspaceLayout.tsx` | placement shell slots | basics tests | `4a3b929` Heat **969** |
| **H11** | `done` | draft invalidation + overlays | residual thin | unit | `c755d3d` + overlays |
| **H12** | `done` | `useHeatCalcPageModel` orchestration | page thin shell | unit 23 | **Heat 280 ≤700** |
| **H13** | `done` | visible selection pure | `filterVisibleRowsBySelectedKeys` | unit 2 | model still ~830 |

**Анти-паттерн Heat:** extract, который **увеличивает** shell LOC (named-args pure call без выгоды) — `skipped`, не делать.

### Track S — Specification + Report

После H8 **или** параллельно только если Elec ≤ 1200 и Heat ≤ 800.

| ID | Статус | Scope | Что | Proof |
|---|---|---|---|---|
| **S1** | `done` | namespace `pages/specification/` | page + format/params extracts | unit+integration 14 | re-export stub |
| **S2** | `done` | generate options pure | buildSpecGenerateOptions + partial | unit | 06704b6 |
| **S3** | `done` | model + SpecPageChrome | page 398 ≤500 | unit+integration 17 |
| **S4** | `skipped` | Report thin if >400 | `ReportPage.tsx` **330 ≤400** | — | no shell work needed |

### Track C — CSS strangler (первый класс после thin shells)

**Полный промпт/регламент slice:** [agent-prompt-css-strangler.md](./agent-prompt-css-strangler.md)  
**Стратегия ownership:** [css-strategy.md](./css-strategy.md)

#### Правила Track C (из agent-prompt)

1. **Один CSS-slice за раз** — только `styles.css` (delete/split), island/feature CSS только как SoT для сравнения.
2. Удалять legacy **только** при **доказанном дубле** (все 6 пунктов из agent-prompt §«Что считается доказанным дублем»).
3. **Mixed selector lists** (Cable + Heat): удалить **только** cable-часть, heat оставить.
4. Конфликт declarations island vs legacy → **residual**, не трогать.
5. **Не** redesign; не добавлять `!important` / colors / breakpoints; `styles.css` net LOC **&lt; 0**.
6. Proof: `test:architecture` + wizard isolation + (желательно) ObjectWizard / UIKit / Heat basics.
7. Browser proof (kontur/playwright) — по agent-prompt, когда stack доступен; иначе unit/arch + residual note.

#### Очередь CSS slices

| ID | Статус | Scope | Что | Proof | Note |
|---|---|---|---|---|---|
| **C1** | `done` | heat workspace move | → `heatcalc-workspace.css` | heat basics | f5e860f |
| **C2** | `done` | elec table footer move | → `elec-workspace.css` | smoke | 635034c |
| **C3** | `done` | **CableAlgorithmPanel exact duplicates** | удалить pure + strip mixed cable selectors; residual: hint + @media 720 | architecture + wizard isolation + ObjectWizard | **▶ styles 6559→6351 (−208)** |
| **C4** | `done` | heat control-fill → island | move SoT to heat-object-fields.css; styles −82 | arch+wizard+heat 59 | residual: page-scoped insulation-settings-row |
| **C5** | `skipped` | Insulation layers island overlap | exact dups for `insulation-layers-table.css` | arch + wizard | **0 exact dups**; page-scoped residuals only; InsulationLayersTable kill-list |
| **C6** | `done` | residual cable (hint / media) | delete dead unscoped residual; island already SoT single-col grid + hint | arch + wizard isolation | no behavior change |
| **C7** | `done` | Spec page + elec summary/ER tabs → owners | `specification-page.css` + `elec-workspace.css`; styles −340 | arch+wizard+Spec int 27 + elec hierarchy | styles **6263→5923**; print banners residual in styles |
| **C8** | `done` | elec chrome blocks → `elec-workspace.css` | summary-table, error-summary, system-scope, assignment zones, section-hierarchy + strip mixed @media | arch+wizard+assignment/summary/hierarchy 18 | styles **5923→5666** (−257) |
| **C9** | `done` | elec actionbar/dialogs/sizing/spreadsheet → island | + strip mixed @media actionbar; heatloss status left in styles | arch+wizard+elec 24 | styles **5666→5214** (−452); **0** `.electrical-*` left in styles |
| **C10** | `done` | projects page CSS → owner | `projects-page.css` + ProjectsPage import | arch+Projects int 9 | styles −46 |
| **C11** | `done` | workflow-params shared CSS | `pages/workflow-params.css`; import Spec+Elec panels | arch+Spec int | styles −58; shared Elec/Spec SoT |
| **C12** | `done` | calc-spreadsheet shared CSS | `styles/calc-spreadsheet.css` + main import; dirty/error cascade parity | arch+wizard+EditableTableCell+Glide 48 | styles **5110→4750** (−360); residual: excel-virtual/editor chrome |
| **C13** | `done` | actionbar-srs shared | `styles/actionbar-srs.css` + main | arch+BatchActionBar | styles −214 |
| **C14** | `done` | excel virtual + context menu | → `calc-spreadsheet.css` | EditableTableCell | styles −104 |
| **C15** | `done` | app header / primary nav / project-menu | `styles/app-header.css` + main | ProjectMenu+arch | styles −269; print `.heatcalc-header` residual |
| **C16** | `done` | table row/cell/editor residual | → `calc-spreadsheet.css` (cascade order fixed) | EditableTableCell | styles −115 |
| **C17** | `done` | table chrome (filters, column layout/settings, assumptions) | `styles/table-chrome.css` + main | arch | styles −349 |
| **C18** | `done` | form-grid shared + dual-forms heat shell | `form-grid-srs.css` + heatcalc-workspace | arch+glide | styles −188+; dual-forms structured residual |
| **C19** | `done` | heat-structured dual-form / SC-03 form pane | → heatcalc-workspace (+ @media 1500 split) | arch+wizard | — |
| **C20** | `done` | glide, form-col h4, print, cable-picker, select dropdown | calc-spreadsheet / form-grid / print / elec | arch+wizard+glide | — |
| **M4** | `done` | `styles.css` ≤3000 | **2788→1974** | arch suite | from 6777 peak / 6263 post-C4 |
| **C21** | `done` | tlt controls + side shell + misc chrome + field geom maps | `tlt-form-controls.css`, heatcalc-workspace, table-chrome | arch+wizard+FormControls | **styles 2788→1974 (−814)**; no geom into heat-object-fields island |
| **C22** | `done` | dual-form field chrome + app-base tokens | heatcalc-workspace + `app-base.css` | arch+wizard+FormControls 53 | **styles 1974→868 (−1106)**; residual mainly insulation page-scope |
| **C23** | `done` | insulation page-scope residual → heat workspace | whole residual block → `heatcalc-workspace.css`; styles freeze stub | arch+wizard 47 | **styles 868→14**; island SoT untouched; no InsulationLayersTable edit |

Budget CSS: **только** delete/move; `styles.css` net LOC ≤ 0.

### Track U — UI kit (не блокирует shell)

| ID | Статус | Scope | Что | Proof |
|---|---|---|---|---|
| **U1** | `done` | Heat form sections on CompactFieldGrid | geometry/climate/settings already on kit in `HeatCalcObjectFieldsPanel` | architecture | no further shell work; protected component |
| **U2** | `done` | Spec params → kit | CompactField + TltNumber/Select/Button in SpecPageChrome settings | unit kit + Spec integration 11 | multi ER Select remains Ant Design |

---

## 4. Алгоритм выбора slice (псевдокод)

```text
function nextSlice():
  // Shell targets already met (2026-07-23): Heat/Elec/Spec views ≤500.
  // Default priority after M3 shells: Track C CSS strangler.
  if styles.css > 3000 and any pending C3..C7:
    return first pending Track C  // agent-prompt-css-strangler.md
  if any pending model-thin (Elec model >600, Heat model >600, Spec model >400):
    return next model-thin slice (optional parallel track)
  if any pending S4/U*:
    return that
  return first pending Track C residual
```

**Исключения (только явная команда пользователя):**

- «делай CSS» / «css strangler» → Track C по [agent-prompt-css-strangler.md](./agent-prompt-css-strangler.md);
- «делай Heat» → Track H / heat models;
- «делай Spec» → Track S;
- «делай Elec» → elec models;
- «kit» → Track U.

**После thin shells (текущее состояние):** «продолжай» = **Track C** (C4…), до 3 slice/ход.

---

## 5. Stop — эскалация к человеку

Остановиться и **кратко** описать блокер (не «что дальше», а «нужно решение»):

| Ситуация | Действие |
|---|---|
| 3+ failed attempts same slice | `blocked`, next different slice if possible; иначе report |
| тест падает из‑за **неясной** business rule | stop + цитата кода/теста |
| нужен touch kill-list (формулы, InsulationLayers, ER UUID semantics) | stop |
| budget не вмещает без ломки | split plan, report |
| git dirty не из нашей работы | stop, не трогать чужое |
| user: «стой» | stop immediately |

**Не** stop:

- «LOC чуть вырос на pure named-args» → skip micro-extract, взять больший;
- flaky e2e env down → unit-only proof + note in status;
- pre-existing tsc noise outside touched files.

---

## 6. Definition of Done одного slice

- [ ] 1 domain, budget соблюдён  
- [ ] characterization unit(s) green  
- [ ] shell wired, duplicate removed  
- [ ] `wc -l` обновлён в metrics + hotspots + этот файл  
- [ ] commit conventional: `refactor(frontend): …` или `docs(frontend): …`  
- [ ] status `done` + short note  

Не требуется на каждый slice: full e2e suite, backend tests, PR open.

---

## 7. Proof commands (минимум)

```bash
# После pure/hook extract
cd frontend && npx vitest run src/__tests__/unit/pages/<domain>/<new-tests>

# После любого architecture-sensitive
cd frontend && npm run test:architecture

# После kit / form density
cd frontend && npm run test:s0-gates
# + parity если dev :3003 up:
# cd e2e && E2E_BASE_URL=http://127.0.0.1:3003 npm run test:ui-kit-parity:chrome
```

---

## 8. Шаблон status-report (после хода, не вопрос)

```markdown
## Refactor progress
- Done: E8, E9 (commits …)
- LOC: Elec 1787 → 1650; Heat 993
- Next pending (auto): E10 — …
- Stop? no
```

Если `Stop? no` — при команде «продолжай» агент **сам** берёт Next pending.

---

## 9. Карта файлов (куда класть)

| Domain | Pure / model | Hook | View |
|---|---|---|---|
| Heat | `pages/heatcalc/*Model.ts` | `pages/heatcalc/useHeatCalc*.ts` | `pages/heatcalc/*.tsx` |
| Elec | `pages/electrical/*Model.ts` or `domain/electrical/` | `pages/electrical/useElecCalc*.ts` | `pages/electrical/*.tsx` |
| Spec | `pages/specification/*` (after S1) | same | same |
| Shared UI | — | — | `components/ui-kit/` only |

Page shell (`*Page.tsx`) = compose hooks + layout views only.

---

## 10. Связанные документы

| Doc | Роль |
|---|---|
| **Этот файл** | **очередь и автономия** |
| [pr-budget.md](./pr-budget.md) | лимиты PR |
| [s0-lite-status.md](./s0-lite-status.md) | журнал выполненного |
| [metrics-baseline.md](./metrics-baseline.md) | цифры |
| [rewrite-plan.md](./rewrite-plan.md) | стратегический strangler |
| [accelerated-rewrite-plan.md](./accelerated-rewrite-plan.md) | multi-agent day plan |
| [llm-friendly-style.md](./llm-friendly-style.md) | стиль кода |
| [css-strategy.md](./css-strategy.md) | CSS rules |
| [hotspots.md](./hotspots.md) | где болит |

---

## 11. Первая команда для агента

Скопировать пользователю / себе:

```text
Прочитай docs/frontend/autonomous-continuation-plan.md и pr-budget.md.
Выполни следующий pending slice по §4 (сейчас: E8).
Не спрашивай что дальше. После DoD — commit, обнови статусы, status-report по §8.
Если я сказал «продолжай» — до 3 slice за ход.
```

---

## 12. Changelog плана

| Дата | Изменение |
|---|---|
| 2026-07-23 | Создан: baseline после E7/H5, очередь E8+, автономия «не спрашивать» |
