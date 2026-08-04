# START HERE — handoff для дизайн-агента (Кейс 1)

**Задача:** **развить существующие макеты** гостевого UI до полного покрытия кейса 1.
**Не задача:** писать production-код FE/BE, править формулы, **менять визуальный язык**, делать мобильные и планшетные раскладки (устройств нет — бриф §2.1).

> **Два правила выше всех остальных** (бриф §0.1):
> **R1 — стили не менять.** `mockups/heatcalc-shared.css` заморожен; новые кадры собираются из его классов, недостающие компоненты — в отдельном additive-файле в той же логике токенов.
> **R2 — функционал расширять, а не урезать.** При выборе «убрать или показать недоступным» — показываем недоступным. Удаляем только то, что перечислено в брифе §0.3 и §6.2.

**Дата пакета:** 2026-08-03  
**Продукт:** HeatCalc / TLT — гость: 1 временный проект → тепло → ЭР → спецификация → файл/отчёт.

---

## 1. Что открыть (порядок)

| # | Файл | Зачем |
|---|---|---|
| **1** | **Этот файл** | Маршрут и DoD |
| **2** | [`case1-designer-brief.md`](./case1-designer-brief.md) | **Главное ТЗ дизайна** (v1.1): §0 базис и правила R1/R2, экраны P0/P1, states, microcopy, отклонения |
| **3** | [`case1-design-review.md`](./case1-design-review.md) | **Ревью существующих макетов**: что переиспользуем, что исправляем (§2, §0.3 брифа) |
| **4** | [`case1-docs-verification.md`](./case1-docs-verification.md) | Что в брифе уже перепроверено / где не врать |
| **5** | [`electrical-designer-residual-prompt.md`](./electrical-designer-residual-prompt.md) | **Детализация D-ELEC** (D-ELEC-01…12) после cutover E0–E9: статус → тон, ручная марка с P@T3, защита ручных марок, конфликт 409, колонки L\*. Подчинён брифу. **Содержит блокирующий вопрос EQ5** |
| **6** | [`specification-designer-residual-prompt.md`](./specification-designer-residual-prompt.md) | **Детализация D-SPEC** (D-SPEC-01…06): diagnostics по kind, badges на вкладках ЭР, provenance строки, «выбор устарел». Подчинён брифу |
| **7** | [`case1-frontend-user-stories.md`](./case1-frontend-user-stories.md) | User stories FE (AC) — макеты закрывают P0 stories UI |
| **8** | PDF UI-референсы | `guest-specification/assets/pdf/page-21-input-ui.png`, `page-35-electrical-ui.png`, `page-49-section-ui.png`, `page-56-specification-ui.png` |
| 9 | Текущий UI (осторожно) | `screenshots/01–03` и `mockups/` — часто **не pure guest** (employee / view-only) |
| 10 | Полный PDF кейса | `ТНП/1_Кейс_«Расчёт_спецификации_для_неавторизованных_пользователей» (1).pdf` (опц. для copy) |
| 11 | BE readiness (опц.) | [`case1-backend-fe-readiness.md`](./case1-backend-fe-readiness.md) — **макеты не блокируются BE** |

**Не читать как источник правды UI:** `docs/srs/ui/guest/*` (устарели: 220 В, ТЛТ, 4 типа кабеля).

**Не обязательно для макетов:** `case1-backend-status.md`, closure plan, section checklists целиком — только если нужен статус «что уже есть в коде».

---

## 2. Объём макетов (минимум)

### P0 — сделать в первую очередь

#### D-CHROME — гостевая шапка (делать первой: она общая для всех кадров)

**Frames:** 1440 и 1000.

- Навигация из трёх пунктов: «Исходные данные» → «Электротех. расчёт» → «Спецификация» (PDF стр. 21/35/56)
- Бейдж «Режим: гость», инфо-строка «Без регистрации. Один временный проект.»
- «Открыть проект из файла» / «Сохранить проект в файл» — дословно
- Без «Новый проект» / «Открыть» (employee-функции, гостю недоступны по коду)
- На 1000 px — без горизонтального overflow страницы

#### D-ELEC — Электротехнический расчёт

**Frames (desktop 1440; желательно ещё 1000):**

1. Happy: 1+ объект Самрег рассчитан, саммари заполнено  
2. All unassigned  
3. Iдоп не задан (blocking empty/error + CTA в настройки)  
4. Stale after heat: подсветка строк + «Пересчитать»  
5. Max 5 ЭР (disabled create + tooltip)  
6. Delete ER confirm  

**Обязательные UI-решения на макете:**

- Только **Самрег** активен. Судьба Резистива и Скина — **открытый вопрос EQ5**: бриф §4.1 и правило R2 требуют показать их `disabled` («Скоро»), а продукт после cutover E1 их **скрыл**. До ответа владельца эта часть кадров черновая; расклад — [`electrical-designer-residual-prompt.md`](./electrical-designer-residual-prompt.md) §8.1. В любом варианте кнопки «Назначить: Резистив» быть не должно  
- **230 В read-only** (не select 220) — пометка: требование **ТЗ**, не буква PDF  
- Нитки **1…3**  
- Статусы строки: Рассчитано / Требуется перерасчёт / Требуется корректировка  
- «Вернуть в нераспределённые» — confirm copy  

#### D-SPEC — Спецификация

**Frames:**

1. Never generated (empty + CTA)  
2. Happy: секции **Трубы / Бочки / Общие** (не всё в «Общие»)  
3. Stale banner + «Сформировать заново»  
4. Unassigned warning: **«Исправить»** + **«Всё равно сформировать»** (или «Подтвердить…»)  
5. `selection_required`: panel кандидатов **без** silent default  
6. `blocking`: danger list  
7. Settings open: Ex, K1i, K2i, Kiu, L_K2i, R_gr, grouping  
8. Результат «Разделять по типам» vs «Объединять материалы» — два состояния таблицы (§7.4, стр. 59)  

**Обязательно:**

- Три **разных** empty copy: не сформирована / нет позиций / тип unsupported  
- Diagnostics **по kind** (не один red alert на всё)  
- Transition «Исправить» → ЭР → Нераспределённые (annotation)  
- Без сортировщиков колонок (§7.1, стр. 57)  

**Детализация состояний** — [`specification-designer-residual-prompt.md`](./specification-designer-residual-prompt.md), кадры D-SPEC-01…06: тон по `kind`, badges `generation_status` на вкладках ЭР, provenance строки, «сохранённый выбор устарел».

### P1 — если остаётся время

- D-HELP: 3 дня, 500 obj, 5 ЭР, «Начать без регистрации», файл проекта  
- D-SESSION: одно сообщение «сессия истекла, новый проект»  
- D-HEAT: group update modal
- D-HOME: copy 3 дня + CTA  

### Вне scope

Формулы, матрица коробок, admin, мобильные и планшетные раскладки, full UI Резистив/Скин/Пол.

---

## 3. Носитель и куда класть результат

**Носитель — Penpot** (решение владельца 2026-08-04): локальный инстанс, файл «Формы TLT».
Кадры собираются генератором, а не рисуются руками — так соблюдается R1: каждый шейп это
`clone()` эталонного шейпа из самого файла, стили не переизобретаются.

```text
scripts/penpot_screens.py   # декларативные экраны кейса 1 — единственный источник правды
scripts/penpot_kit.py       # FrameBuilder → JS-рантайм поверх Penpot plugin API
tools/penpot/penpot.local.json  # доступы и MCP-ключ (инстанс локальный)
mockups/README.md           # карта кадров, генерируется из screens
mockups/microcopy.md        # тексты со ссылками на параграфы PDF
mockups/current-state/      # прежние HTML-кадры 01–03 как baseline «как было»
```

Кадры кейса 1 живут в «Формы TLT» ниже baseline, от y=7200. Прогон идемпотентный:
пересборка удаляет одноимённые кадры и создаёт заново, baseline не трогается.
Проверка геометрии — `node scripts/mockup-geometry.mjs` для HTML-версий.

Существующие `mockups/01–03` — **baseline «как есть»**, переезжают в `current-state/`. Новые кадры делаются рядом, не поверх: пара «до/после» нужна для приёмки. При конфликте побеждает brief P0.

---

## 4. Жёсткие правила (не ломать)

0. **R1 / R2** (см. шапку): стили заморожены, функционал расширяем.
1. **Guest chrome:** без «Открыть» / «Новый проект» (это employee). Гость: auto project + «Открыть проект из файла» / «Сохранить проект в файл» + Инструкция + бейдж «Режим: гость».
2. Не копировать «Режим просмотра» с employee-скриншотов в guest happy path.
3. Iдоп: рисовать **форму ввода + empty state**, BE уже блокирует расчёт.
4. Файл проекта: copy «файл проекта» / `.tlt.csv` — формат уже есть, не invent binary.
5. UI kit: table-first, engineering density; не card marketing redesign.
6. **Только десктоп.** Вьюпорты 1000 / 1280 / 1440; **1000 — узкое окно десктопа, не планшет**. Page overflow запрещён на всех трёх; широкие таблицы — в скролл-контейнере с закреплённой первой колонкой. Проверка: `node scripts/mockup-geometry.mjs`.
7. **Microcopy — из брифа §7** (дословные формулировки PDF); свои тексты только с пометкой об отклонении.
8. **Колонки таблиц — контракт:** §6.14 стр. 49 (таблица Самрег) и §7.6 стр. 60 (строка спецификации).
9. **Сортировщики и фильтры спецификации не рисуем** — §7.1 (стр. 57) выводит их из этой версии.

---

## 5. Definition of Done (для агента)

- [ ] Все P0 frames D-CHROME + D-ELEC + D-SPEC (список §2) лежат в `mockups/` по структуре §3  
- [ ] `heatcalc-shared.css` не изменён (R1): в diff его нет  
- [ ] `node scripts/mockup-geometry.mjs` — переполнений нет ни на 1000, ни на 1280, ни на 1440  
- [ ] `README.md` в папке: карта frames → story/brief ID  
- [ ] `microcopy.md` (RU) для баннеров/confirm/empty  
- [ ] Annotations: hide legacy, 230 V, sections, 3 diagnostic kinds, «Исправить» flow  
- [ ] Нет противоречий errata (`case1-docs-verification.md`)  
- [ ] Краткий summary в ответе: что сделано, что отложено (P1)  

---

## 6. Связь макетов ↔ user stories (P0 UI)

| Макет | Stories |
|---|---|
| D-ELEC MVP (hide legacy, 230, threads) | US-ELEC-01, 06; US-HEAT-05 |
| D-ELEC Iдоп / stale / unassign | US-ELEC-07, 09, 10 |
| D-ELEC variants max 5 | US-ELEC-02 |
| D-SPEC sections + empty | US-SPEC-03 |
| D-SPEC generate / stale | US-SPEC-01, 07 |
| D-SPEC unassigned Fix/Proceed | US-SPEC-02 |
| D-SPEC selection + kind | US-SPEC-04, 05 |
| D-SPEC settings | US-SPEC-08 |

Полные AC: [`case1-frontend-user-stories.md`](./case1-frontend-user-stories.md).

---

## 7. Prompt-вставка (можно скопировать агенту)

```text
Ты дизайн-агент TLT. Цель: развить существующие макеты гостевого UI кейса 1, не код.

1. Прочитай docs/tnp/cases/case1-design-agent-handoff.md (START HERE).
2. Прочитай case1-designer-brief.md (v1.1: §0 R1/R2, §2.1 десктоп, §7 microcopy),
   case1-design-review.md (замеры и план правок §5.3), case1-docs-verification.md.
   Для экрана спецификации — ещё specification-designer-residual-prompt.md.
3. R1: heatcalc-shared.css не менять; новые компоненты — в heatcalc-states.css.
   R2: функционал расширять, а не урезать (Резистив/Скин — disabled «Скоро», не скрыты).
4. Сделай P0 frames D-CHROME + D-ELEC + D-SPEC на 1440 и 1000 по handoff §2.
   Только десктоп: мобильных и планшетных раскладок нет.
5. Сохрани в mockups/ по структуре §3; baseline 01–03 перенеси в mockups/current-state/,
   не затирая. Плюс README.md и microcopy.md.
6. Не используй screenshots/* как pure guest golden (там employee/view).
7. 230 В read-only; Iдоп = форма ввода + empty; секции спецификации Трубы/Бочки/Общие
   с правильной раскладкой (кабель и муфты — в «Трубы», PDF стр. 56); без сортировщиков.
8. Проверь: node scripts/mockup-geometry.mjs — переполнений быть не должно.
9. В конце: список файлов + что отложено.
```

---

## 8. Статус пакета документов

| Артефакт | В репо? | Для макетов |
|---|---|---|
| Designer brief | ✅ | **обязателен** |
| Design agent handoff (этот файл) | ✅ | **обязателен** |
| Verification / errata | ✅ | **обязателен** |
| FE user stories | ✅ | AC для states |
| Section checklists | ✅ | опц. глубина |
| PDF page thumbs | ✅ | референс layout |
| Frontend checklist / backend status | ✅ | опц. «что уже в коде» |
| Готовые финальные mockups P0 | ❌ / WIP в `mockups/` | **агент делает** |

**Итог:** текстовый пакет для проверки и макетов **готов**. Финальные P0-макеты — **работа дизайн-агента**, не этого анализа.
