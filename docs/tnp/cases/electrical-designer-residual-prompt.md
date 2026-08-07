# Задание дизайнеру — UI электрорасчёта (D-ELEC residual, после MVP cutover)

**Версия:** 1.1  
**Дата:** 2026-08-04  
**Проверка фактов (2026-08-04):** утверждения §0.1 сверены с репозиторием и **подтверждены** —
коммиты `5e72a50` E0 … `ca8805e` E7.4–E9; вкладки Резистив/Скин отфильтрованы
(`ElectricalAssignmentPanel.tsx:155-158`, «E1 / FE-28»), саммари только Самрег + Итого
(`ElectricalSummary.tsx:74-75`), 230 В read-only (`ElecCalcParamsPanel.tsx:97-102`, DEC-11),
нитки 1…3 (`elecCalcLayoutModel.ts:150`), есть `ElecCalcIdopSettings.tsx`,
`ElecCalcStaleBanner.tsx`, `useElecCalcCableMarkOptions.tsx`.  
**Статус:** ACTIVE design task (узкий scope)  
**Код / формулы / каталог TT / Iдоп-формулы:** **не трогать** — engineering path **уже закрыт** (cutover E0–E9).  
**Носитель и правила handoff:** как в [`case1-design-agent-handoff.md`](./case1-design-agent-handoff.md).

> **Место в системе документов.** Это **детализация раздела D-ELEC** из [`case1-designer-brief.md`](./case1-designer-brief.md) §4.1, а не параллельное ТЗ.  
> Углубляет то, чего в брифе нет на уровне **состояний после cutover**: Iдоп, stale, manual mark options, L*, keyboard-assign, 230/threads, conflict 409.  
>
> **При расхождении побеждает бриф** (§0 R1/R2, §4.1, §7 microcopy).  
> **Нумерация:** вопросы — **EQ1–EQ5**; кадры — **D-ELEC-01…12**.

---

## 0. Контекст для дизайнера (коротко)

### 0.1 Что уже сделано в продукте (не «придумать с нуля»)

Engineering MVP cutover **E0–E9 закрыт** (локальные commits 2026-08-04). В живом UI уже есть:

| Зона | Как сейчас в коде |
|---|---|
| Системы | Только **Нераспределённые + Самрег**; Resistive/Skin **скрыты** (не disabled-вкладки — **убраны**) |
| Сводка | Только **Самрег + Итого** |
| Напряжение | **230 В read-only** |
| Нитки | **1…3** |
| Assign | Кнопки «Назначить: Самрег» / «Вернуть…»; DnD **только AntD-таблица**, default engine = **Glide** → keyboard/button primary |
| Iдоп | Форма project settings + empty banner, если не задан |
| Stale | Баннер «N требуют перерасчёта» + «Выделить» + «Пересчитать устаревшие»; row yellow `row-stale` |
| Status | `calculated` / **`stale`** / `error` / `unsupported` / `not_calculated` (не схлопывать stale в empty) |
| Manual mark | Dropdown марок **с backend** `cable-options`: серия, P@T3, disabled + reason |
| Колонки L* | По умолчанию: Lтреб, Lфакт, Lток, Lдоп, Lзаказ |
| Конкуренция | 409 при чужой версии assignment; Idempotency-Key на calc/batch |

**Задача дизайна — не изобрести экран**, а:

1. **Довести читаемость и states** до PDF §6 / бриф §4.1.  
2. **Зафиксировать microcopy и layout** там, где engineering сделал «работает, но сыро».  
3. **Дать FE hand-off** (что оставить / что polish / что сознательно отклонить от PDF).

### 0.2 Базис

| # | Файл | Зачем |
|---|---|---|
| 1 | **Этот документ** | ТЗ residual D-ELEC |
| 2 | [`case1-designer-brief.md`](./case1-designer-brief.md) §0, §4.1, §7 | R1/R2, требования, microcopy-канон |
| 3 | [`case1-design-agent-handoff.md`](./case1-design-agent-handoff.md) | носитель, папка, viewport |
| 4 | [`case1-frontend-user-stories.md`](./case1-frontend-user-stories.md) EP-ELEC | AC историй |
| 5 | PDF кейса 1 Rev.4 §6 (UI refs стр. 35, 38, 49–55) | copy + layout ref |
| 6 | `mockups/02-elec-calc` (или `current-state/02-…`) | visual baseline «как есть» |
| 7 | Live app после cutover | **источник правды поведения** (не старый employee-скрин) |

### 0.3 Правила R1 / R2 (обязательны)

- **R1:** не менять визуальный язык (`heatcalc-shared.css` / UI-kit / tokens). Только **additive** состояния в той же логике.  
- **R2:** не урезать функции; disabled / empty / blocked — **честно**, не «серый квадрат без смысла».  
- **Viewport:** desktop only — **1000×768**, **1280×800**, **1440×900**. Primary QA: **1440×900**.  
- **Guest only** для golden frames (бейдж «Режим: гость», без employee «Мои проекты»).

---

## 1. Цель

Спроектировать **недостающие и «сырые» состояния** экрана «Электротех. расчёт», чтобы гость:

1. Понимал, что доступен **только Самрег (ТТН/ТТВ/ТТХ)**.  
2. **Задал Iдоп** и не упирался в silent fail.  
3. **Назначил объекты** (кнопки + keyboard; DnD — secondary, см. EQ1).  
4. Видел **устаревшие строки** и мог **пересчитать только их**.  
5. Читал **статусы** «Рассчитано / Требуется перерасчёт / Требуется корректировка / Не рассчитано».  
6. Выбирал **ручную марку** из списка с P@T3 / reason.  
7. Видел **Lтреб / Lфакт / Lток / Lдоп / Lзаказ** без «инженерной каши».  
8. Не терял работу на **5-м ЭР** и понимал **delete/rename**.

**Не цель:** full UI Резистив/Скин/Пол; коммерческий ranking mock; мобильный адаптив; редизайн таблицы Glide.

---

## 2. Вне scope (явно не делать)

| Тема | Почему вне |
|---|---|
| Формулы q1×T3+q2, секции, Iдоп = Iст.уд×L | BE |
| Полный каталог ТЛТ / resistive | выпилен |
| Новый DnD engine для Glide canvas | deferred engineering; дизайн **keyboard path** |
| Admin catalogs | отдельный track |
| Спецификация / heat (кроме перехода «Исправить») | D-SPEC / D-HEAT |
| Выдуманные марки кабеля | только реальные TT-примеры: `10ТТН2`, `30ТТВ2`, `45ТТХ2` (+ суффикс -СТ/-СР в preview) |

---

## 3. Что считать baseline (не перерисовывать с нуля)

Отмечать в README «уже в product»:

- [x] Вкладки ЭР + initialize  
- [x] Самрег-only tabs + note «только саморегулирующийся…»  
- [x] Summary Самрег + Итого  
- [x] U = 230 RO  
- [x] Threads 1…3  
- [x] Iдоп settings block  
- [x] Stale banner + bulk recalc  
- [x] Status badge stale (↻)  
- [x] Manual mark modal / options from API  
- [x] Default L* columns  
- [~] DnD: zones есть, drag source на Glide **нет** → **D-ELEC-08**  
- [~] Inline edit §6.16 «без модалки» — в коде часто **модалка**; нужно **решение + кадры** (EQ2)  
- [~] Колонки §6.14 PDF vs текущий набор L* / power — **сверка** (EQ3)  
- [~] Microcopy PDF vs product (баннер stale, Iдоп empty)

---

## 4. Обязательные кадры (P0)

Для каждого: **1440** (primary) + **1000** (functional, без overflow страницы). 1280 — желательно.  
Аннотации: story ID / brief § / PDF page / что отличается от baseline.

### D-ELEC-01 · Happy path (pipe, assigned, calculated)

- 1+ объект в Самрег, status **Рассчитано**.  
- Сводка Самрег + Итого заполнена.  
- U **230** read-only.  
- В таблице: марка TT, нитки 1–3, **Lтреб / Lфакт / Lток / Lдоп / Lзаказ** (или явный tooltip-паттерн, если колонки ужаты на 1000).  
- Primary CTA в зоне действия: путь к спецификации (disabled reason если нет ready — показать).

**Story:** US-ELEC happy · brief §4.1 frame 3.

### D-ELEC-02 · All unassigned

- Вкладка «Нераспределённые», empty/list.  
- Счётчик **«Выбрано: N из M»**.  
- Primary: **«Назначить: Самрег»** (доступна при selection).  
- Hint keyboard: «Выделите строки → Назначить: Самрег» (уже частично в note — **уточнить tone/placement**).  
- Drop-zones: если рисуем — подпись, что drag **в табличном режиме** / secondary.

**Story:** US-ELEC assign · brief frame 2.

### D-ELEC-03 · Iдоп not set (blocked)

- Banner **warning**: нет max section current.  
- Form: ввод **Iдоп** (project electrical settings) + save.  
- CTA «Сохранить и продолжить» / focus на поле.  
- Calc / batch **disabled** с reason «Задайте Iдоп…» (не silent 422).

**Story:** US-ELEC-07 · brief frame 6.  
**Microcopy:** бриф §7 + product; не «fail-closed» как термин для пользователя.

### D-ELEC-04 · Stale after heat / Iдоп / catalog change

- Banner: **«N объектов требуют перерасчёта»** (1 / many).  
- Actions: **Выделить** · **Пересчитать устаревшие**.  
- Rows: yellow **stale** highlight + status **«Требуется перерасчёт»** (не «—» / не empty).  
- After success sketch (опц. second state): highlight off, status Рассчитано.

**Story:** US-ELEC-10 · brief frame 5 · PDF §6.19.

### D-ELEC-05 · Partial error («Требуется корректировка»)

- 1+ row **error** (danger tint), status badge error.  
- Banner or inline reason (formula / validation).  
- Не смешивать визуально со **stale** (warning).

**Story:** brief frame 4.

### D-ELEC-06 · Manual mark picker (from BE options)

- Open mark control (modal **или** cell dropdown — см. EQ2).  
- List shows: **full mark preview**, **series**, **P@T3**, disabled + **reason** (напр. «серия не подходит»).  
- Eligible selectable; API mark = **base model** (без -СТ/-СР) — в UI preview с суффиксом ок.  
- «Авто» option + saved/project fallback if any.

**Story:** US-ELEC-08 · FE-25.  
**Примеры строк:** `30ТТВ2-СР · ТТВ · 30.59 Вт/м @T3`; disabled `25ТТН2 · серия не подходит`.

### D-ELEC-07 · Max 5 ER + rename + delete confirm

- 4 вкладки ЭР; **Добавить** disabled + tooltip **«Максимум 4 варианта»**.
- Rename inline: Enter/blur save, Esc cancel; empty → **«Укажите название электрорасчёта»**.  
- Delete confirm: имя/номер ЭР, последствия.

**Story:** brief frames 7–8 · PDF §6.5, §6.7, §6.20.

### D-ELEC-08 · Assign: keyboard primary + DnD secondary

- **Primary path** (обязателен): multi-select → **Назначить: Самрег** / **Вернуть в нераспределённые** (+ confirm unassign).  
- **Secondary:** drop-zones; annotate «перетаскивание — в режиме Ant Design table; в Glide — кнопки».  
- Focus ring, aria-labels на icon-only.

**Story:** US-ELEC-04 / FE-12 · **не** рисовать fake Glide drag.

### D-ELEC-09 · Recalc chrome (selected / all / manual overwrite)

- Batch bar: пересчитать выбранные / все.  
- Explicit control: **не перезаписывать ручные марки** (default ON) vs overwrite (confirm).  
- Loading / job progress if shown.

**Story:** PDF §6.13 manual preserve.

### D-ELEC-10 · Empty: no objects in project / no objects in ER

- Различить: (a) в проекте нет объектов → CTA «к исходным данным»; (b) в ЭР/вкладке пусто после filter.  
- Не врать «ошибка расчёта».

### D-ELEC-11 · Conflict 409 (assignment version)

- Toast / inline: **«Назначение изменено в другой вкладке — обновите данные»**.  
- Primary: **Обновить** (refetch assignments).  
- Не silent fail.

**Story:** E8 / concurrency.

### D-ELEC-12 · Wide table @1000 (L* + §6.14 density)

- Скролл-контейнер таблицы; sticky first content col (Объект).  
- Какие колонки **default** vs **opt-in** (Lмакс, provenance advanced).  
- На 1000: не ломать page chrome; horizontal scroll **внутри** table region only.

---

## 5. Статусы и цвета (SoT для FE)

| Backend / table status | UI label | Tone | Notes |
|---|---|---|---|
| `calculated` | Рассчитано | success | green check |
| `stale` | Требуется перерасчёт | **warning** | ↻; row yellow; **не** empty dash |
| `error` | Требуется корректировка | danger | PDF wording preferred over «Ошибка» |
| `unsupported` | Не применимо | neutral | minus |
| `not_calculated` | Не рассчитано | muted | em dash |

**Assignment_state `stale`** и **calc status `stale`** — оба «перерасчёт», но не дублировать баннеры без нужды (один workspace banner + row).

---

## 6. Microcopy (канон; сверка с PDF §7 брифа)

Использовать **дословные** формулировки брифа §7 / PDF, где есть. Ниже — product gaps.

> **Сверка выполнена (v1.1):** у stale-баннера в PDF **есть** дословная формулировка, она и канон.
> Продуктовое «N объектов требуют перерасчёта» допустимо только как вторичная строка-счётчик
> рядом с канонической, но не вместо неё.

| Ситуация | Рекомендуемый текст | Источник |
|---|---|---|
| Stale banner (заголовок) | «Исходные данные некоторых объектов были изменены. Необходимо выполнить повторный электротехнический расчёт» | **PDF §6.19, стр. 53 — канон** |
| Stale banner (счётчик) | «1 объект требует перерасчёта» / «N объектов требуют перерасчёта» | product E3 — вторичная строка |
| Stale body | «Исходные данные или Iдоп изменились после последнего электрорасчёта…» | product E3 — уточнение, не замена канона |
| Stale CTA | «Пересчитать устаревшие» / «Выделить» | product |
| Iдоп empty | «Задайте максимально допустимый пусковой ток секции (Iдоп)…» | E2 product — polish |
| Only Samreg | «В этой версии доступен только саморегулирующийся кабель (ТТН / ТТВ / ТТХ).» | product |
| Assign keyboard | «Выделите строки… и нажмите «Назначить: Самрег»…» | product — **укоротить** если шумит |
| Max 4 ER | «Максимум 4 варианта» | актуальный продуктовый контракт |
| Empty ER name | «Укажите название электрорасчёта» | PDF §6.20 |
| 409 version | «Назначение изменено другим запросом. Обновите данные.» | E8 |

**Deliverable:** `mockups/microcopy-elec.md` (или секция в общем `microcopy.md`) — таблица final copy + page ref.

---

## 7. Component notes для FE (обязательный hand-off)

| Component | States | Notes |
|---|---|---|
| `ElecCalcIdopSettings` | empty / filled / saving / error | placement: above assign chrome |
| `ElecCalcStaleBanner` | 0 hide / 1 / N / loading / RO | actions only if canMutate |
| Status badge | 5 statuses above | map labels §5 |
| Assign toolbar | unassigned vs system tab | unassign confirm |
| Drop zones | idle / over / disabled | secondary to buttons |
| Mark options list | eligible / disabled+reason / loading / error 422 heat | P@T3 format `XX.XX Вт/м @T3` |
| L* columns | default vs advanced | default: треб/факт/ток/доп/заказ |
| Voltage | RO 230 + helper | «норматив / система» |
| Threads | 1..3 | no 4 |
| Job bar | idle / running / cancel | if shown |

**Data rules (для annotations, не для дизайна формул):**

- Manual select value = **base model** (`30ТТВ2`); preview may show `-СТ/-СР`.  
- Voltage always 230.  
- Iдоп is **project** setting, not per-row.

---

## 8. Вопросы владельцу (EQ) — не блокируют старт кадров 01–05

| ID | Вопрос | Default если молчание |
|---|---|---|
| **EQ1** | DnD: оставить secondary + copy, или скрыть drop-zones до Glide DnD? | **Оставить zones**, copy keyboard primary |
| **EQ2** | Manual mark: модалка (как сейчас) vs PDF inline cell list? | **Модалка ok** + кадр «целевой inline» как P1 |
| ~~EQ3~~ | ~~Колонки: PDF §6.14 vs L* default~~ | **Решено (v1.1):** бриф §4.1 фиксирует §6.14 как контракт, причём «Тепловые потери» и «Мощность обогрева» обязаны стоять **рядом** (прямое требование PDF стр. 49 — «чтобы инженер мог сравнить их значения»). Default = набор §6.14, блок **L\*** добавляется справа в том же default на 1440 и уходит в opt-in только на 1000. Отдельный «режим плотности» не проектируем |
| **EQ4** | Summary metrics set (секции / Ist / Iwork) — exact labels from §6.8? | Follow PDF labels in RU |
| **EQ5** | Resistive/Skin: скрыть (как в продукте) или показать disabled «Скоро» (как требует R2)? | **Для макетов закрыт (2026-08-04):** владелец подтвердил «макеты по ТЗ» → в кадрах disabled «Скоро» (R2, бриф §4.1). Открытым остаётся только продуктовый хвост: FE-тикет на возврат disabled-вкладок либо записанное исключение из R2 — см. §8.1 |

---

### 8.1 EQ5 — расхождение трёх источников (решить до кадров 01, 02, 07)

| Источник | Что говорит |
|---|---|
| **Правило R2** (бриф §0.1, задано владельцем) | при выборе «убрать или показать недоступным» — **показать недоступным** |
| **Бриф §4.1** | саммари и вкладки Резистив/Скин видимы, но `disabled` + «Скоро» |
| **Продукт после E1** | вкладки **отфильтрованы**, карточек Резистив/Скин **нет** (`ElectricalAssignmentPanel.tsx:155-158`, `ElectricalSummary.tsx:74-75`) |
| **PDF стр. 35** | разрешает **оба**: «могут отображаться как недоступные элементы будущего расширения **либо не отображаются**» |

Кадры D-ELEC в Penpot собраны по **R2** — с disabled-карточками «Скоро».
Значит сейчас **макеты противоречат продукту**, и одно из двух должно поменяться.

1. **Принять «скрыто»** — макеты приводятся к продукту, R2 получает записанное исключение.
   Дёшево: один флаг в генераторе.
2. **Принять «disabled»** — продукт возвращает карточки и вкладки неактивными, появляется
   FE-тикет. Дороже, но буквально по R2 и брифу.

До ответа кадры 01, 02 и 07 в этой части считать черновыми.

## 9. Deliverables (Definition of Done)

1. **Кадры D-ELEC-01…12 в Penpot** «Формы TLT» — носитель сменён (handoff §3):
   собираются генератором `scripts/penpot_screens.py` через plugin API, каждый шейп —
   `clone()` эталона из файла (это и есть исполнение R1).
2. **PNG 1440 и 1000** для каждого P0-кадра (01–08 минимум).  
3. **`mockups/README.md` map:** frame → story / brief / PDF / product gap.  
4. **Microcopy sheet** (§6).  
5. **FE hand-off checklist** (§7): what to keep from cutover, what polish ticket.  
6. **Annotations** on deviations (EQ5 hide systems, EQ2 modal, EQ1 DnD).  
7. Geometry: **no page horizontal overflow** at 1000 / 1280 / 1440 (`node scripts/mockup-geometry.mjs` if available).

### Папка

Носитель — **Penpot**, а не отдельные HTML-файлы (решение владельца, handoff §3):

```text
Penpot «Формы TLT» → кадры «ЭР — …» ниже baseline (от y=7200)
scripts/penpot_screens.py   # декларативные экраны — единственный источник правды
scripts/penpot_kit.py       # FrameBuilder → plugin API (clone эталонов)
mockups/README.md           # карта кадров, генерируется из screens
mockups/microcopy.md        # тексты со ссылками на PDF (секция ЭР — сюда же)
mockups/current-state/      # baseline «как было»
```

Прогон идемпотентный: пересборка сносит одноимённые кадры и создаёт заново.

---

## 10. Порядок работы (1–1.5 недели)

| День | Фокус |
|---|---|
| 1 | Baseline audit live UI vs `02-elec-calc`; EQ5 decision note |
| 2–3 | D-ELEC-01, 02, 03, 04 (critical path guest) |
| 4 | D-ELEC-05, 06, 09 |
| 5 | D-ELEC-07, 08, 10 |
| 6 | D-ELEC-11, 12 + 1000 pass |
| 7 | Microcopy + FE hand-off + geometry check |

---

## 11. Критерии приёмки (чек-лист)

- [ ] Все P0 frames 01–08 (+ 12) с 1440 и 1000  
- [ ] Stale **не** выглядит как «не рассчитано»  
- [ ] Iдоп empty ведёт к действию  
- [ ] Only Samreg; 230 RO; threads 1…3  
- [ ] Manual options show P@T3 + disabled reason  
- [ ] L* readable at 1440; scroll strategy at 1000  
- [ ] Keyboard assign path first-class  
- [ ] 409 conflict has clear recovery  
- [ ] R1: no new palette / bare ant restyle  
- [ ] Microcopy sheet + README map  
- [ ] Annotated deviations from PDF (EQ1–5)

---

## 12. Связь с FE (для дизайнера — только ориентир)

Не править код в этой задаче. После приёмки макетов FE polish tickets:

| Макет | Возможный FE follow-up |
|---|---|
| D-ELEC-04/05 | status label «Требуется корректировка» везде |
| D-ELEC-06 | sizing modal тоже на BE options |
| D-ELEC-08 | hide zones on Glide if EQ1 = hide |
| D-ELEC-12 | column defaults already partially shipped (E7.4) |

---

*Конец. При конфликте с устаревшими employee-скриншотами — побеждает **live guest UI + этот prompt + бриф**.*
