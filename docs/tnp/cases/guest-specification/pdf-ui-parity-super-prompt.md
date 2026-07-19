# Супер-промпт: PDF UI parity (макеты 21 / 35 / 49 / 56)

> **Статус:** обязательный product scope (отмена waiver «mock ≠ acceptance»
> для перечисленных экранов).  
> **Решение:** PDL-ER-45 **пересмотрен** — эти UI-элементы **должны быть**.  
> **Единый реестр:** обновлять [`STATUS.md`](STATUS.md) (блок UI-PDF), не плодить
> новые отчёты.  
> **Не путать с сидами:** hierarchy секций **включается** после SEEDS-01; до
> сидов — UI shell + empty/partial states, **без** выдуманных Nсек.

---

## Текст для запуска агента

Работай как **Frontend UI Lead + Functional Accuracy** в репозитории Desktop TLT
(`/Users/dmalafey/Desktop/TLT` или корень workspace). Режим: implementation +
focused tests + `/ui-proof` для видимых экранов.

### 0. Цель

Довести UI guest/employee workspace до **семантики и структуры макетов PDF
«1 Кейс» ред. 4 (07.07.2026)**, страницы:

| PDF | Файл-референс | Суть |
|---|---|---|
| 21 | `docs/tnp/cases/guest-specification/assets/pdf/page-21-input-ui.png` | Исходные данные: 3 колонки формы + типы + Далее |
| 35 | `…/page-35-electrical-ui.png` | ЭР: 4 summary cards + system tabs + assign |
| 49 | `…/page-49-section-ui.png` | Иерархия объект → секции |
| 56 | `…/page-56-specification-ui.png` | Spec: разделы + колонки mark/code/supplier/unit |

**Не** «копипаст pixel-perfect watermark “пример”».  
**Да** — обязательные блоки, поля, действия и acceptance ниже.

Сохранить существующие PDL-ER-01…44 (UUID ЭР, full BOM, partial honesty,
commercial length, kit pick-one, guest TTL, fail-closed seeds).  
**Не** ломать UUID ER, assignments API, full_builder fail-closed.

### 1. Git / изоляция

1. `git status` / branch = local `main` (Desktop), без push.
2. Не трогать untracked `tmp/`, root ad-hoc png.
3. Commit только по явной команде пользователя.
4. После изменений — дельта в `STATUS.md` (UI-PDF checklist).

### 2. Обязательные deliverables (5 пакетов)

#### UI-PDF-01 — Heat: 3-колоночная форма (PDF §5.2, стр. 21)

**Сейчас:** плоская SC-03 / ObjectWizard-подобная форма на `HeatCalcPage`.  
**Нужно:**

1. Вкладка/режим типов объектов:
   - **Трубопровод** | **Ёмкость/Бочка** (синоним `tank`, PDL-ER-06) | **Пол**
     (disabled + подпись «будущее расширение», расчёт не входит).
2. Блок **«① Формы исходных данных»** с **тремя колонками**:
   - **A. Теплопотери** — длина, диаметр (мм), толщина изоляции, материал
     изоляции, T окр., T требуемая; placement/климат/ветер как сейчас в API.
   - **B. Подбор кабеля** — напряжение, тип кабеля (саморег default), способ
     прокладки, T вкл./выкл. (cold start / maintain где применимо).
   - **C. Спецификация** — класс взрывозащиты / Ex, IP, материал оболочки,
     тип монтажа, доп. требования (persist в `params`, даже если BOM
     fail-closed без matrix).
3. Кнопки **Сохранить** / **+ Добавить объект** внизу формы.
4. Primary CTA **«Далее → Электротехнический расчёт»**:
   - readiness gate (все объекты валидны + heat result);
   - при ошибках — остаться на heat, подсветить строки, список ошибок;
   - при успехе — init ЭР1 unassigned (PDL-ER-12) и переход на electrical.
5. Таблица **«② Список объектов»** с фильтрами по типу, Excel, «на
   основании», удалить, групповая корректировка (если уже есть — не регрессить;
   если нет — минимум placeholder/disabled с TODO, не ломать save).

**Контракт единиц:** UI мм где PDF мм; API метры — через
`objectWizardUtils` / существующие converters. Не ломать.

**Файлы (ориентир):**
- `frontend/src/pages/HeatCalcPage.tsx` + `pages/heatcalc/*`
- `frontend/src/components/wizard/ObjectWizard.tsx` (reuse/split, не
  дублировать всю валидацию)
- `frontend/src/utils/objectWizardUtils.ts`
- tests: vitest page/integration + e2e smoke «Далее» gate

**Acceptance UI-PDF-01:**
- [ ] 3 колонки видны на ≥1280 px (PDL-ER-30)
- [ ] Пол disabled
- [ ] Далее блокирует при invalid object
- [ ] После ready — ЭР1 + unassigned + URL electrical
- [ ] Round-trip edit: mm↔m без регрессии heat

---

#### UI-PDF-02 — Electrical: 4 summary cards (PDF §6.2, стр. 35)

**Сейчас:** одна строка «Кабель / Мощность / Ток».  
**Нужно:** 4 карточки:

| Card | Метрики (минимум) |
|---|---|
| **Саммари Самрег** | объектов, Σ длина кабеля м, **кол-во секций**, мощность кВт, стартовый ток А |
| **Саммари Резистив** | то же |
| **Саммари Скин** | то же (0 / unsupported, не смешивать success) |
| **Саммари Итого** | суммы **только successful** assigned; stale/error/unassigned **не** в success totals |

Источник: backend summary API / `useElectricalStats` / assignment aggregates.
Секции: пока SEEDS-01 пуст — показывать `0` или `—` + не врать «рассчитано»;
после SEEDS — real Nсек.

Сохранить: ER tabs, add/copy/delete/rename, system tabs Нераспределённые /
Самрег / Резистив / Скин(/Минеральный legacy).

**Файлы:**
- `frontend/src/pages/ElecCalcPage.tsx` (+ electrical components)
- `frontend/src/hooks/useElectricalStats.ts` (расширить, pure + unit tests)
- backend только если summary endpoint не отдаёт by-system breakdown

**Acceptance UI-PDF-02:**
- [ ] 4 cards на desktop
- [ ] success totals без stale/error/unassigned
- [ ] skin/unsupported не раздувают success
- [ ] vitest на агрегацию

---

#### UI-PDF-03 — Electrical: DnD assign (PDF §6.9–6.11, стр. 35–40)

**Сейчас:** кнопки «Назначить Самрег / Резистив».  
**Нужно:**

1. Drag-and-drop объекта из **Нераспределённые** → вкладка системы
   (Самрег / Резистив; Скин — drop forbidden + toast).
2. Кнопки **оставить** (accessibility + mobile).
3. Confirm при reassign/unassign (существующие API confirm rules).
4. Optimistic version / exact UUID scope (не ломать Phase 3).

**Библиотека:** antd DnD / `@dnd-kit` / HTML5 — выбрать то, что уже в
зависимостях; не тащить тяжёлый стек без нужды.

**Acceptance UI-PDF-03:**
- [ ] DnD unassigned → самрег создаёт assignment + calc path
- [ ] Drop на skin → rejected
- [ ] Keyboard/button path still works
- [ ] e2e или focused integration proof

---

#### UI-PDF-04 — Hierarchy object → sections (PDF §6.14–6.16, стр. 49)

**Зависимость:** SEEDS-01 + Phase 4 algorithm.  
**До сидов (обязательный shell):**

1. Expandable row объекта в таблице Самрег:
   - parent: mark, нитки, L, d, heat, P, Iст, Iраб, N секций (или `—`)
   - children: placeholder «Секции появятся после регистрации каталога»
     / empty state, **не** фейковые равные секции.
2. Статусы: Рассчитано / Требуется корректировка / stale — не смешивать.

**После SEEDS (полный PDF):**

1. Equal sections UI (read-only lengths; edit mark/pitch only — PDL-ER-03).
2. Per-section voltage/power/start/work current.
3. Validation strip: L≤Lмакс, Iст≤Iдоп, equal, P≥heat.

**Acceptance UI-PDF-04 (shell now):**
- [ ] Expand row exists without inventing sections
- [ ] Copy mentions catalog/sections not ready when SEEDS empty

**Acceptance UI-PDF-04 (full after SEEDS):**
- [ ] Real N rows equal length
- [ ] Golden 200/67 → 3×67 visible in UI

---

#### UI-PDF-05 — Specification table columns + sections (PDF §7.1, стр. 56)

**Сейчас:** Категория / Наименование / Марка / Код / Ед. / Кол-во.  
**Нужно колонки (порядок близок PDF):**

| # | Колонка | Источник |
|---|---|---|
| 1 | № | row index |
| 2 | Наименование | item.name |
| 3 | Марка | params.mark / article |
| 4 | Номенклатурный код | params.nomenclature_code |
| 5 | **Поставщик** | catalog supplier (seed field; empty → `—`, не выдумывать) |
| 6 | **Ед. поставки** | unit / supply_unit from catalog |
| 7 | Количество | quantity |

Разделы (PDL-ER-38): **Трубопроводы** / **Ёмкости** / **Общие материалы**
(accordion или group headers). Barrel wording = ёмкость.

Сохранить: partial banner, stale banner, multi-ER generate, settings Ex/K*/Rгр,
connector_kit_sections_per_kit.

**Файлы:**
- `frontend/src/components/specification/SpecTable.tsx`
- `frontend/src/types/specification.ts`
- catalog JSON: optional `supplier` / `supply_unit` fields (empty ok)
- backend emit params if missing

**Acceptance UI-PDF-05:**
- [ ] Columns visible in guest/employee
- [ ] Group headers pipe/tank/common
- [ ] Partial/stale still honest
- [ ] vitest SpecTable + snapshot optional

---

### 3. Порядок реализации (рекомендуемый)

```text
1. UI-PDF-05 Spec columns/groups     (низкий риск, видимый PDF parity)
2. UI-PDF-02 Electrical 4 summaries  (pure aggregate + UI)
3. UI-PDF-03 DnD assign              (API already exists)
4. UI-PDF-01 Heat 3-column + Далее   (самый большой layout)
5. UI-PDF-04 Section hierarchy shell (до SEEDS)
6. После SEEDS-01: UI-PDF-04 full + enable Nсек BOM already coded
```

Не блокировать 1–4 ожиданием сидов.

### 4. Запреты

- Не выдумывать Lмакс/Iст.уд/Nсек/коробки (SEEDS).
- Не возвращать fixed СО1…СО4.
- Не ломать guest full generate / partial 409 / stale 409.
- Не требовать mobile 390 как primary (PDL-ER-30: ≥1280).
- Не pixel-match watermark «пример» / чужие бренды HTL из mock.

### 5. Тесты (минимум)

| Пакет | Tests |
|---|---|
| UI-PDF-01 | vitest Heat layout + e2e «Далее» block/pass |
| UI-PDF-02 | unit useElectricalStats 4-bucket + no mixing |
| UI-PDF-03 | component DnD + assignment API mock |
| UI-PDF-04 | expand empty state |
| UI-PDF-05 | SpecTable columns + groups |
| Regression | `phase5-specification-proof`, `phase5-actionable-close` green |

### 6. Evidence / STATUS

После каждого пакета обновить `STATUS.md`:

```markdown
## H. PDF UI parity (обязательно)

| ID | Статус | Evidence |
| UI-PDF-01 | pending/done | ... |
| UI-PDF-02 | ... |
...
```

Скриншоты desktop 1440×1000 + optional 390 — в
`docs/audit/` или `docs/tnp/cases/guest-specification/assets/ui/`.

### 7. Definition of Done (весь промпт)

- [ ] Все 5 ID в STATUS = done **или** UI-PDF-04 = shell done + full blocked SEEDS
- [ ] phase5 e2e green
- [ ] Нет регрессии partial/stale/commercial
- [ ] Короткий итог в чате: только дельта STATUS, без нового full-report

### 8. Контекст для чтения (обязательно перед кодом)

1. `docs/tnp/cases/guest-specification/STATUS.md`
2. `docs/tnp/cases/guest-specification/product-decisions.md` (PDL-ER-06, 12, 30, 38, 42–44; **45 supersede UI list**)
3. `docs/tnp/cases/guest-specification/pdf-requirements.md` § Heat / ER / Spec
4. PNG: `assets/pdf/page-21|35|49|56-*.png`
5. `frontend/src/pages/{HeatCalc,ElecCalc,Specification}Page.tsx`
6. `Claude.md` / `Agents.md` unit conversion + ER rules

---

## Команда-запуск (короткая)

```text
Выполни docs/tnp/cases/guest-specification/pdf-ui-parity-super-prompt.md
на Desktop TLT main: UI-PDF-01…05. Сиды не выдумывать. STATUS §H обновлять.
Commit только по запросу. Phase5 e2e должны остаться green.
```
