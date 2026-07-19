# Корректирующий промпт: PDF UI quality redemption

> **Зачем:** первый проход `686312b` закрыл чеклист «есть в DOM», но **сломал UX**.  
> Этот документ — **почему провал** + **как исправить красиво**.  
> Единый реестр: [`STATUS.md`](STATUS.md) §H. Не плодить новые full-отчёты.

---

## 0. Что пошло не так (post-mortem)

| ID | Что сделали | Почему плохо для инженера |
|---|---|---|
| FAIL-01 | DnD на **лейблы Tabs** + HTML5 MIME | Невидимая цель 20×12 px, drop «не ловится», мобильный path мёртв |
| FAIL-02 | 4 summary cards **под** таблицей + дубль «Итого» в legend | PDF: cards **над** таблицей; UI выглядел как свалка Statistic |
| FAIL-03 | Heat: 3 колонки **inline style**, CSS grid-areas старые (`geometry/fittings…`) | Layout ломается, 4-колоночный CSS конфликтует, «три колонки» — неправда |
| FAIL-04 | Section expand: copy про SEEDS / UI-PDF-04 shell | Язык разработчика, не инженера |
| FAIL-05 | Spec: лишняя «Категория» при группировке pipe/tank/common | PDF: № · Наименование · Марка · Код · Поставщик · Ед. · Кол-во |
| FAIL-06 | STATUS §H = **done** после shell | Honesty broken: shell ≠ polished parity |

**Корневая ошибка:** чеклист acceptance подменили «наличием data-testid», вместо визуальной и операционной пригодности.

---

## 1. Текст для агента (запуск)

Работай в Desktop TLT (`/Users/dmalafey/Desktop/TLT`). Режим: **UI craft + focused vitest**, без выдуманных BOM/секций.

### Цель

Исправить UI-PDF-01…05 **как продукт для инженера**, опираясь на макеты:

| PDF | Файл |
|---|---|
| 21 | `assets/pdf/page-21-input-ui.png` |
| 35 | `assets/pdf/page-35-electrical-ui.png` |
| 49 | `assets/pdf/page-49-section-ui.png` |
| 56 | `assets/pdf/page-56-specification-ui.png` |

Не pixel-perfect watermark. Да — **структура, иерархия, плотность, понятные действия**.

### Запреты

- Не ломать UUID ER, assignments API, full_builder fail-closed, partial honesty.
- Не выдумывать Nсек / коробки при пустых SEEDS.
- Не drop на tab-label. Не оставлять double summary.
- Не помечать STATUS done без визуально честного UX.
- Не трогать untracked `tmp/`, root ad-hoc png.

---

## 2. Пакеты исправления

### P1 — ElectricalSummary (UI-PDF-02)

**Нужно:**
1. 4 карточки **над** расчётной таблицей (после banner/params, **до** table).
2. Компактный вид как PDF: строки «метка · значение», не 5 огромных `Statistic` в сетке 2×3.
3. Убрать дубль totals из legend (оставить подсказку + CTA «Спецификация →»).
4. Success-only; skin/unsupported не раздувают; секции `—` пока SEEDS пусты.

### P2 — DnD assign (UI-PDF-03)

**Нужно:**
1. Видимые **drop zones** (Самрег / Резистив / при необходимости «Нераспределённые») — крупные hit-area ≥40 px высоты.
2. Tabs — **только навигация**, не drop target.
3. Drag handle на строках unassigned (и multi-select: тащим выбранные).
4. Библиотека: `@dnd-kit` (уже в package.json) **или** HTML5 + явные зоны — но зоны обязательны.
5. Кнопки «Назначить / Вернуть» оставить (a11y + mobile).
6. Skin/mineral drop → toast reject; unassign confirm rules не ломать.

### P3 — Heat 3-col (UI-PDF-01)

**Нужно:**
1. CSS grid 3 колонки с named areas `heat | cable | spec` (≥1280).
2. Классы `--heat/--cable/--spec` + card-shell (как 3 блока PDF).
3. Убрать конфликт со старыми `geometry/fittings/climate/insulation` areas для pdf-three.
4. Responsive: stack 1 col на узком.
5. «Пол» disabled; «Далее → Электротехнический расчёт» gate; unit mm↔m не ломать.
6. Заголовки колонок — **короткие, инженерные** (как PDF), не checklist.

### P4 — Section shell (UI-PDF-04)

**Нужно:** expand row → спокойный empty state:
- «Секции появятся после подбора кабеля и заполнения каталога секционирования.»
- Без SEEDS/UI-PDF/shell jargon.
- Не показывать фейковые Nсек.

### P5 — Spec table (UI-PDF-05)

**Нужно:**
1. При `groupBy=object_section`: колонки как PDF (без «Категория»).
2. Заголовки разделов: **Трубопроводы / Ёмкости / Общие материалы**.
3. Марка / Код / Поставщик / Ед. поставки / Количество — на месте.

---

## 3. Acceptance (честный)

- [ ] Desktop 1440: summary **над** таблицей, 4 cards, без double footer totals  
- [ ] Drop zone видна **до** drag; drop unassigned→самрег работает; skin reject  
- [ ] Heat ≥1280: 3 колонки с заголовками; ≤720 stack  
- [ ] Section expand: human copy, no fake Nсек  
- [ ] Spec section group: PDF columns  
- [ ] vitest: AssignmentPanel, SpecTable, useElectricalStats, heat layout smoke  
- [ ] STATUS §H: **quality-fixed** + дата, не ложный «done» без polish  

---

## 4. Файлы (ориентир)

- `frontend/src/components/electrical/ElectricalSummary.tsx`
- `frontend/src/pages/ElecCalcPage.tsx`
- `frontend/src/pages/electrical/ElectricalAssignmentPanel.tsx`
- `frontend/src/components/wizard/ObjectWizardWidePanel.tsx`
- `frontend/src/styles.css` (pdf-three grid)
- `frontend/src/components/specification/SpecTable.tsx`
- tests under `frontend/src/__tests__/`
- `docs/tnp/cases/guest-specification/STATUS.md`

---

## 5. Definition of done

1. Код + focused tests green.  
2. STATUS §H обновлён честно.  
3. Commit local main, **без push** (пока пользователь не сказал).  
4. В чат — только дельта + ссылка на STATUS, не full matrix.
