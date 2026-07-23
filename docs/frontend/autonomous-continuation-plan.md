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

| Метрика | Значение (2026-07-23) | Цель milestone M2 | Цель M3 (DoD shell) |
|---|---:|---:|---:|
| `ElecCalcPage.tsx` | **30** (entry) | — | ≤ 80 |
| `ElecCalcWorkspace.tsx` | **~1459** | ≤ 1200 | ≤ 500 |
| `HeatCalcPage.tsx` | **280** | ≤ 700 ✅ | ≤ 500 |
| `SpecificationPage.tsx` | **1005** | namespace + ≤ 800 | ≤ 500 |
| `styles.css` | **6777** | ≤ 6777 freeze → ≤ 5500 | ≤ 3000 |
| inverted `components→pages` | **0** | 0 | 0 |

Уже сделано (не повторять):

- S0 gates, UI kit, parity scripts;
- domain pure elec models + invert → 0;
- Heat: reorder, continue→elec, toolbar save, table counts;
- Elec: assignment selection, object action modals, Glide layout commit.

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
| **E17** | `pending` | residual → M3 | until workspace ≤500 | unit | after H track |

**Метрика shell:** `ElecCalcPage` = **30**. `ElecCalcWorkspace` = **1194** (M1 workspace ✅).  
**Текущий пункт:** **S1** (Specification namespace)

### Track H — Heat

Цель: 993 → ≤ 700 → ≤ 500. Брать **после** E16 (Elec ≤ 1200), если пользователь не сказал иначе.

| ID | Статус | Scope | Что вынести | Proof | LOC target |
|---|---|---|---|---|---|
| **H8** | `done` | layout presentation pure | side form placement | unit | `85d93b1` |
| **H9** | `done` | (merged into H10) | type/actions stay thin wrappers | — | — |
| **H10** | `done` | `HeatCalcWorkspaceLayout.tsx` | placement shell slots | basics tests | `4a3b929` Heat **969** |
| **H11** | `done` | draft invalidation + overlays | residual thin | unit | `c755d3d` + overlays |
| **H12** | `done` | `useHeatCalcPageModel` orchestration | page thin shell | unit 23 | **Heat 280 ≤700** |

**Анти-паттерн Heat:** extract, который **увеличивает** shell LOC (named-args pure call без выгоды) — `skipped`, не делать.

### Track S — Specification + Report

После H8 **или** параллельно только если Elec ≤ 1200 и Heat ≤ 800.

| ID | Статус | Scope | Что | Proof |
|---|---|---|---|---|
| **S1** | `pending` | namespace `pages/specification/` | `git mv` Spec modules, re-export stubs | architecture + existing tests |
| **S2** | `pending` | pure params / BOM presentation | extract thick logic from Spec page | unit |
| **S3** | `pending` | thin Spec shell ≤ 500 | layout views | unit |
| **S4** | `pending` | Report thin if >400 | preview/export wiring | unit |

### Track C — CSS strangler (параллельный, низкий риск)

Можно **1 CSS slice** после каждых **2** shell slices, если styles.css не растёт.

| ID | Статус | Scope | Что | Proof |
|---|---|---|---|---|
| **C1** | `pending` | move heat workspace chrome rules | `styles.css` → `pages/heatcalc/heatcalc-workspace.css` (import once) | visual smoke / parity if forms |
| **C2** | `pending` | move elec workspace chrome | `elec-*.css` | smoke |
| **C3** | `pending` | tokens already? consolidate `--tlt-*` | no new tokens without use | architecture |
| **C4+** | `pending` | repeat largest blocks | net LOC styles.css < 0 each time | until ≤3000 |

Budget CSS: **только** move/delete; `styles.css` net ≤ 0.

### Track U — UI kit (не блокирует shell)

| ID | Статус | Scope | Что | Proof |
|---|---|---|---|---|
| **U1** | `pending` | next Heat form section on CompactField | только если shell не горит | parity e2e + architecture |
| **U2** | `pending` | Spec params → kit | after S1 | parity/smoke |

---

## 4. Алгоритм выбора slice (псевдокод)

```text
function nextSlice():
  if ElecCalcPage.LOC > 1200:
    return first pending in Track E (E8…E17)
  if HeatCalcPage.LOC > 700:
    return first pending in Track H (H8…H12)
  if Specification not namespaced:
    return S1
  if styles.css > 5500 and (shellSlicesSinceLastCss >= 2):
    return first pending Track C
  if any pending Track E with Elec > 500:
    return that
  if any pending Track H with Heat > 500:
    return that
  return first pending S* then C* then U*
```

**Исключения (только явная команда пользователя):**

- «делай CSS» → Track C;
- «делай Heat» → Track H;
- «делай Spec» → Track S;
- «kit» → Track U.

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
