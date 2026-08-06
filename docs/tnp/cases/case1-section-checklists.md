# Кейс 1 — пораздельные чек-листы соответствия (Rev.4)

**Источник:** `ТНП/1_Кейс_«Расчёт_спецификации_для_неавторизованных_пользователей» (1).pdf`  
**Редакция:** 4, 07.07.2026, 81 стр.  
**Дата чек-листа:** 2026-08-03  
**Статус:** рабочая ведомость приёмки, не ACTIVE-очередь.

**Легенда статусов**

| Метка | Значение |
|---|---|
| `[x]` | **PASS** — реализовано и согласуется с кейсом |
| `[~]` | **PARTIAL** — есть, но с оговоркой / неполная UX |
| `[ ]` | **FAIL / TODO** — нет или противоречит кейсу |
| `[—]` | **N/A / out of scope** — вне MVP кейса 1 (гость) или future |
| `[?]` | **UNVERIFIED** — нужно прогнать приёмку / goldens |

Связанные снимки: [`case1-backend-status.md`](./case1-backend-status.md), [`case1-frontend-checklist.md`](./case1-frontend-checklist.md), [`case1-closure-slice-plan.md`](./case1-closure-slice-plan.md).  
**Верификация фактов:** [`case1-docs-verification.md`](./case1-docs-verification.md) — читать до ревью; проценты ниже = оценка, не метрика.

### Errata (верификация 2026-08-03, HEAD `33079ef`)

1. **§6.14 Iдоп:** BE **fail-closed** (`SECTION_CURRENT_LIMIT_REQUIRED` при `None` в `sections.py`). Пробел = **FE UI** настроек Iдоп, не «считаем только Lмакс».
2. **§5.11–5.12 / §4.2 файл:** UI `export/import-csv` → `.tlt.csv`, но BE schema **v3 multi-section** (objects + ЭР + specs + settings). Не «только объекты».
3. **Evidence:** `screenshots/01–03` и часть mockups — **employee/view-only** (кнопки «Новый проект»/«Открыть» + «Режим просмотра»), не pure guest.
4. **Help** хуже, чем «3 vs 30»: ещё «50 объектов», «Пользователь», «кабель ТЛТ», «создайте проект» (гость получает auto project).

### Errata (платформа, 2026-08-04) — **раз и навсегда**

5. **Мобильной версии нет.** Phone/tablet / viewport &lt;1000 px = **`[—]` N/A**, не FAIL.  
   Норматив: [`../../frontend/viewport-policy.md`](../../frontend/viewport-policy.md) §0,  
   [`case1-designer-brief.md`](./case1-designer-brief.md) §2.1.  
   Пересчёт готовности: [`../../audit/2026-08-04-case1-conformance-reverify/reassessment-desktop-only.md`](../../audit/2026-08-04-case1-conformance-reverify/reassessment-desktop-only.md).

---

## Сводка по разделам

| Раздел | Тема | PASS | PARTIAL | FAIL | Оценка* |
|---|---|---:|---:|---:|---:|
| §3 | NFR | 8 | 6 | 4 | ~65–70% |
| §4 | Проекты / гость / сотрудник | 18 | 6 | 4 | ~75–80% |
| §5 | Объекты и тепло | 28 | 10 | 6 | ~85% |
| §6 | Электрорасчёт | 35 | 14 | 16 | ~68–72% |
| §7 | Спецификация | 22 | 12 | 14 | ~65–70% |
| **Итого (функционал)** | | **~111** | **~48** | **~44** | **~70–75%** |

\*Экспертная оценка по чек-листу, **не** измеримый score. Без AC-FE / **desktop** browser proof не заявлять release-ready.  
**Мобильные viewport не входят в знаменатель.** Актуальный пересчёт (desktop-only + post SPEC-P0): см. `reassessment-desktop-only.md` (**feature ~83%, release ~76–80%, NOT READY**).

---

## §3. Нефункциональные требования

### 3.1 Архитектура и среда

- [x] Веб-приложение
- [x] Локальное развёртывание (сервер + БД) на инфраструктуре заказчика
- [x] Docker-образы + `docker-compose.yml`
- [x] Работа в локальной сети без интернета (офлайн-capable runtime)
- [x] Основные функции без внешних облачных сервисов
- [x] Справочники и формулы доступны локально
- [x] Настройки отдельно от исходного кода (env / config)

### 3.2 Браузеры

- [?] Chrome (актуальная версия)
- [?] Firefox
- [?] Opera
- [?] Яндекс Браузер  
  *Примечание: matrix в аудитах — Chrome-oriented; Opera/Яндекс NOT RUN.*

### 3.3–3.5 Сервер, perf, объёмы

- [x] Минимальная конфигурация сервера описана в доке (не runtime-gate)
- [~] ≥10 одновременных пользователей — NFR-тесты есть, full load на prod default не закрыт
- [?] Открытие страниц ≤3 с
- [?] Сохранение проекта ≤5 с
- [?] Открытие сохранённого ≤10 с
- [?] Расчёт 1 объекта ≤5 с
- [?] Расчёт 500 объектов ≤30 с (есть NFR с monkeypatch; на default 500 — ?)
- [?] Формирование спецификации ≤30 с
- [x] Индикатор длительных операций (частично — loading states)
- [x] Сообщение об ошибке, если расчёт не завершён
- [x] Не зависать без уведомления
- [x] ≥500 объектов в проекте (`GUEST_MAX_OBJECTS_PER_PROJECT=500`)
- [x] ≥5 вариантов ЭР
- [?] ≥50 сохранённых проектов на пользователя
- [?] ≥10 000 записей в справочниках

### 3.6–3.8 Надёжность, данные, backup

- [x] Ошибка одного объекта не роняет весь проект
- [x] После рестарта сохранённые проекты сотрудников доступны
- [x] Незавершённый расчёт не пишется как финальный (статусы/stale)
- [~] После изменения исходных — зависимые результаты «требуют перерасчёта» (частично)
- [~] Повторный клик не создаёт дубликаты (Idempotency-Key не везде)
- [x] Удаление проекта только с подтверждением (сотрудник)
- [x] Данные в volume/БД переживают рестарт контейнеров
- [?] Инструкция backup/restore подготовлена
- [?] Рекомендуемый daily backup + 7 дней хранения — ops, не app

### 3.9–3.10 Безопасность и сессии

- [x] Серверный код недоступен клиенту как исходники
- [~] Клиентский код минимизирован (prod build); полной обфускации формул нет (они на BE)
- [x] Расчётные формулы на сервере
- [x] Пароли как хеши
- [~] HTTPS — зависит от инфраструктуры (Caddy есть)
- [x] Роли: гость / сотрудник / admin (базово)
- [x] Гость не видит чужие/БД-проекты
- [x] Logout завершает сессию
- [x] Guest TTL 3 дня sliding (`4320` мин)
- [ ] Атомарное восстановление истёкшей guest-сессии без 401/404 stale queries

### 3.11–3.12 UI / валидация

- [x] Инженерный UI, единицы измерения, обязательные поля
- [~] Подсказки на сложных полях
- [x] Ошибки привязаны к полям (heat form)
- [~] После изменения исходных — явная индикация «нужен перерасчёт» (ЭР partial)
- [x] Таблицы: copy/paste (Excel-режим)
- [x] Reorder строк (heat)
- [x] Confirm перед удалением ЭР/проекта/объекта
- [x] Числовая валидация, диапазоны
- [x] Нет расчёта без обязательных данных (fail-closed heat/electrical)

### 3.13–3.17 Журналы, docs, тесты, доступность

- [x] Серверные логи ошибок
- [~] API Swagger / OpenAPI
- [~] Документация Docker deploy
- [ ] Полный пакет программной документации по §3.15
- [~] Критический путь покрыт e2e/integration; AC-FE 01–19 NOT RUN
- [—] 24/7 SLA не требуется

---

## §4. Работа с проектами

### 4.1 Основные положения / стартовая

- [x] «Начать без регистрации»
- [x] «Войти с паролем»
- [x] Стартовая страница показывает оба варианта

### 4.2 Работа без регистрации (гость) — **ядро кейса 1**

- [x] Кнопка «Начать без регистрации»
- [x] Открывается рабочая область
- [x] Автосоздание временного проекта
- [x] Нет формы «создать проект» и списка проектов у гостя
- [x] Сразу ввод данных / объекты
- [x] Один временный проект на сессию
- [~] «Скачать/Загрузить» → `.tlt.csv` schema **v3** (objects+ЭР+spec+settings на BE); UX-лейблы «CSV», не «файл проекта»; round-trip E2E `[?]`
- [x] Проект гостя **не** пишется в БД как owned employee project
- [~] Import: warn replace current — есть; accept только `.csv`
- [x] Ошибка на битый/неподдерживаемый файл (текущий проект не заменяется)
- [x] После 3 дней неактивности данные удаляются (TTL)
- [x] Список БД-проектов недоступен гостю (`Открыть`/`Новый проект` только employee)
- [ ] Help: 30 дней → 3; 50 obj → 500; «Пользователь» → «Начать без регистрации»; убрать «создайте проект» / «кабель ТЛТ»
- [ ] Session recovery без console 401/404 `[?]` runtime

### 4.3 Вход как сотрудник

- [x] «Войти с паролем» → форма логин/пароль
- [x] Успех → «Мои проекты»
- [~] Ошибка «Неверный логин или пароль» + очистка пароля (проверить точный текст)

### 4.4 «Мои проекты»

- [x] Заголовок + «Создать проект»
- [~] Таблица: название, дата изменения, кол-во объектов, действия
- [x] Сортировка по дате изменения (touch_project)
- [x] «Открыть» / «Удалить»
- [~] Пустой список: «У вас пока нет проектов» + CTA
- [x] Создание: поле названия, валидация пустого
- [ ] Сотрудник видит **только свои** проекты (сейчас фильтр «все сотрудники» — баг/решение)

### 4.5–4.8 Open / save / back / delete

- [x] Open загружает объекты, heat, ЭР, спецификации
- [~] Ошибка открытия с сообщением
- [ ] Состояние «Есть несохранённые изменения» / «Все сохранены» / «Сохранение» — серверного контракта dirty нет
- [~] Кнопка «Сохранить» + toast «Проект сохранён»
- [ ] Возврат к списку с confirm: «Сохранить и выйти» / «Без сохранения» / «Отмена»
- [x] Удаление с confirm + название проекта
- [x] Отмена удаления
- [~] Ошибка удаления с сообщением

### 4.9 Бизнес-правила

- [x] Гость = один временный проект
- [x] Временный не в «Мои проекты»
- [x] Только auth пишет проекты в БД
- [ ] Auth видит только доступные ему (см. 4.4)
- [x] Delete только после confirm
- [—] Поиск/фильтр проектов — out of scope

---

## §5. Алгоритм создания объекта обогрева

### 5.1–5.2 Интерфейс / навигация

- [x] После открытия проекта — раздел исходных данных
- [x] Пустая таблица у нового проекта
- [x] Вкладки: Исходные (Heat) → ЭР → Спецификация (+ Отчёт в UI)
- [x] Типы: Трубопровод, Резервуар/Бочка, Пол
- [x] «Пол» недоступен (future) — OK по кейсу
- [~] Три блока форм: тепло / подбор кабеля / спецификация — UI объединяет; параметры разнесены
- [x] «Добавить» / «Сохранить» (save inactive без edit)
- [x] Фильтр вкладок по типу объекта
- [x] Дефолт — трубопровод
- [x] Таблица: checkbox, параметры, Q, статус
- [x] Настройки отображения столбцов

### 5.2 Параметры (бизнес-минимум)

**Общие**

- [x] Тип объекта
- [x] Наименование
- [x] T продукта (обязат.)
- [x] T окр. среды (обязат.)
- [x] Источник T (климат / manual)
- [x] Размещение (помещение / улица / грунт)
- [x] Скорость ветра (улица)
- [x] Коэффициент запаса
- [x] Условия расчёта изоляции / режимы tm

**Изоляция**

- [x] Наличие изоляции определяется обязательной таблицей из 1–3 слоёв; отдельный `has_insulation` не требуется
- [x] Материал и толщина задаются для каждого слоя
- [x] 1–3 слоя
- [x] «Другое»: λ + температурный диапазон
- [~] Покровный материал (желательно)

**Труба**

- [x] Dн, длина
- [~] Толщина стенки / материал (опц. по кейсу)
- [x] Глубина + грунт для underground
- [x] Локальные элементы (кол-во / Lэкв)

**Резервуар**

- [x] Форма: цил. / прям.
- [x] Габариты по форме
- [~] Объём (желательно)
- [x] Частичное заглубление + грунт
- [~] q_additional вместо детальных локальных элементов
- [—] Локальные элементы резервуара (фланцы/штуцера) как у трубы — нет

**Выходы heat**

- [x] Q на м / общая мощность трубы
- [x] Q резервуара / площадь
- [x] Запас, climate/ground provenance (BE)

**Смежные (для ЭР/spec)**

- [x] supply_voltage (дефолт всё ещё 220 — PARTIAL vs ТЗ 230)
- [x] min switch T, среда, Ex/zone, T-group, steam tracing, maintain T

**Правила приёмки данных**

- [x] T продукта > T среды (валидация)
- [x] Обязательные: тип, геометрия, T, изоляция
- [x] Non-standard material требует λ + range
- [x] Underground требует грунт
- [x] Local elements входят в расчёт трубы
- [~] Источник справочника в отчёте

### 5.3–5.4 Добавление / редактирование

- [x] Ручное добавление трубы (+ резервуара)
- [x] Валидация обязательных → не создаёт
- [x] Авто heat calc после add
- [x] Очистка форм после add
- [x] Edit: load в формы, Save, recalc, back to add mode
- [~] 422-гейт после пересчёта только для pipe (tank может закоммититься invalid)

### 5.5 Excel

- [x] Загрузка XLSX
- [x] Проверка формата/столбцов/типов
- [x] Calc heat per row
- [x] Сообщение о кол-ве загруженных
- [x] Ошибка структуры файла

### 5.6–5.7 Копии

- [x] Add на основании открытого в формах (Add vs Save)
- [x] Batch «добавить на основании выбранных»
- [~] FE batch может ходить циклом single POST вместо `duplicate-batch`

### 5.8 Групповая корректировка

- [ ] UI: «один параметр → значение → применить»
- [x] BE: `POST .../objects/group-update` (всё-или-ничего, recalc, invalidate)
- [~] Excel-режим частично закрывает сценарий

### 5.9–5.10 Display / reorder

- [x] Настройки столбцов + default
- [x] Checkbox выбора нельзя скрыть
- [x] Display settings **проектные** + в файле (закрыто 2026-08-03)
- [x] Drag reorder порядка объектов

### 5.11–5.12 Файл проекта (гость)

- [x] Open from file: format/structure/version check (v3; v2 electrical legacy path)
- [x] Warn replace current data
- [~] Load: objects + electrical + specs + settings (BE v3); FE label «CSV» — copy/UX
- [~] Save: schema v3 multi-section dump; human name «файл проекта» + round-trip proof `[?]`
- [x] Ошибка формирования/формата; current project не затирается

### 5.13 Переход к ЭР

- [x] «Далее → Электротехнический расчёт»
- [x] Проверка готовности объектов
- [x] Создание ЭР + copy objects → unassigned
- [~] Подсветка проблемных строк при отказе
- [x] Некорректные не уходят в ЭР (гейт)

---

## §6. Электротехнический расчёт

### 6.1–6.2 Основные / UI

- [x] Цель: варианты ЭР, распределение, кабель, секции → spec
- [x] MVP-тип: саморегулирующийся (TT-серии)
- [ ] Резистив / Скин — **должны быть disabled/hidden**; в UI **активны вкладки и саммари**
- [x] Вкладки ЭР1…ЭРN
- [x] «Добавить новый расчёт»
- [x] «Добавить на основании ЭР»
- [x] «Удалить текущий расчёт»
- [~] Саммари Самрег / Итого (+ лишние Резистив/Скин)
- [x] Вкладки: Нераспределённые / Самрег (+ лишние)
- [x] Таблица объектов
- [~] «Выбрать тип» / assign buttons
- [~] «Применить правило к группе» (зашито «Назначить Самрег»)
- [x] «Сформировать спецификацию»

### 6.3–6.7 Lifecycle ЭР

- [x] Первый ЭР из heat: «ЭР 1», все unassigned
- [~] Отказ создания при ошибках объектов + список
- [x] Переключение вкладок — независимое состояние
- [x] Max **5** вариантов
- [x] Новый ЭР: объекты из heat → unassigned
- [x] Copy ЭР: objects, assignments, cables, sections, manual; **spec не копируется**
- [x] Delete + confirm + open neighbor
- [x] Rename (6.20) — кнопка «Переименовать»

### 6.8 Сводка

- [x] Кол-во объектов
- [x] Общая длина кабеля (**Lфакт**, не Lзаказ)
- [x] Кол-во секций
- [x] Общая мощность
- [x] Рабочий ток
- [x] Стартовый ток
- [x] Обновление после assign/recalc
- [~] Legacy-строки дают нули в новых метриках (после cutover — N/A)

### 6.9–6.11 Unassigned / assign / DnD

- [x] Вкладка нераспределённых + checkbox
- [x] Один объект — одна вкладка системы в ЭР
- [x] Unassigned не в итогах системы / не в spec
- [x] Assign «Самрег» (+ auto calc)
- [ ] DnD назначение в default glide-engine **не работает**
- [—] Клавиатурная альтернатива DnD (FE-12) — нет

### 6.12–6.13 Подбор кабеля

*Продуктовое уточнение (ТЗ): MVP = серии ТТН/ТТВ/ТТХ, 230 В, не legacy «ТЛТ-…».*

- [x] Автоподбор после assign
- [x] Мощность с запасом (один раз, без double safety)
- [x] Температурные фильтры (T env / T product)
- [x] Нитки 1…3 в авто TT
- [ ] UI/schema cap ниток **строго 1…3** (были le=100 / wrong type check)
- [x] Мин. достаточный вариант (N, P, sort)
- [x] Ручная марка **не** подменяется молча
- [x] K_nav: straight / spiral; max по D; reject bad step
- [x] installed_length = L_base × K_nav × N
- [x] order_length = installed × **1.10**
- [x] total_power / current от **installed**, не order
- [~] supply_voltage: кейс = user input; ТЗ/runtime TT = **230**; UI показывает **220**
- [x] Ошибки: no heat, q≤0, temp, power, manual fail, winding — persist
- [x] Batch recalc не трогает manual без флага
- [x] Spec берёт только successful cable rows
- [—] Коммерческие критерии (дешевле/быстрее/наличие) — вне MVP FE-28
- [ ] `GET /cable-options` → TT-модели с P@T3 (сейчас [] / techdebt)
- [~] Provenance: марка, Lфакт/Lзаказ, токи; полный view (серия, catalog ver, P@T3) partial

### 6.14 Секционирование

- [x] Lмакс, Iст.уд из section catalog по марке + Tmin (nearest lower)
- [x] Lток = Iдоп / Iст.уд; при отсутствии Iдоп → **BE fail-closed** `SECTION_CURRENT_LIMIT_REQUIRED` (не silent Lмакс-only)
- [x] Lогр = min(Lмакс, Lток); floor до 0.001 m (не ceil)
- [x] N = ceil(Lтреб / Lогр)
- [x] Равные секции; Lфакт = Lсек×N ≥ Lтреб; Lдоп
- [x] Iст.сек = Iст.уд × Lсек ≤ Iдоп (при заданном Iдоп)
- [x] Агрегаты объекта: длина, токи, мощность × N
- [~] Финальный гейт §9.15 / «Рассчитано» vs «Требуется корректировка» — partial
- [~] Колонки таблицы: марка, нитки, L, токи, мощность — partial set
- [x] **FE UI:** единый project Iдоп + blocking empty «Задать Iдоп» + CTA в настройки

### 6.15–6.17 Unassign / manual edit / unassign confirm

- [x] «Вернуть в нераспределённые»
- [x] Confirm + wipe cable/sections, keep heat
- [x] Manual: марка, навив (pipe); auto recalc row
- [~] Inline edit в таблице (есть модалки «Выбор»/«Подбор»)
- [x] Manual protection on batch recalc
- [x] Error → «Требуется корректировка», значение сохраняется
- [x] Spec stale after manual change
- [—] Ёмкость: шаг раскладки (не MVP UI, tank partial)

### 6.18 Формирование спецификаций (из ЭР)

- [x] Кнопка «Сформировать спецификацию»
- [~] Generate **выбранных** ЭР (не «все всегда») — product decision: selected only
- [x] Per-ER tabs
- [x] Warning unassigned + «Всё равно сформировать»
- [ ] Кнопка **«Исправить»** → первый ЭР + unassigned + highlight
- [x] Blocking errors: no cable/sections → no generate for that ER
- [x] Partial: others can generate
- [x] Spec invalidation per changed ER only

### 6.19 Stale после heat change

- [~] Сообщение «исходные изменены, нужен перерасчёт»
- [ ] Per-row status «Требуется перерасчёт»
- [ ] Per-row кнопка «Пересчитать»
- [ ] Highlight rows
- [x] Stale не в актуальных итогах (частично на BE)
- [x] Multi-ER: независимо
- [x] Spec becomes stale

### 6.20 Rename

- [x] Rename ЭР
- [~] Esc / empty validation messages
- [~] Имя синхронизируется со вкладкой спецификации

---

## §7. Расчёт спецификации

### 7.1–7.2 UI / first open

- [x] Вкладки по ЭР
- [x] «Настройки» / «Обновить»
- [—] Фильтры/сортировка UI — **не в scope** текущей версии (кейс прямо говорит)
- [ ] Разделы «Трубы / Бочки / Общие» — **баг**: всё в «Общие» (`bomSectionOf`)
- [x] Пустое состояние + «Сформировать»
- [x] Modal: выбор ЭР + options
- [x] Generate **только выбранных** ЭР (не auto all)
- [x] Tabs только для сформированных

### 7.3 Unassigned check

- [x] Preflight unassigned → confirmation_required
- [x] «Всё равно сформировать» / exclude_unassigned_confirmed
- [ ] «Исправить» → navigate + highlight
- [x] Warning на partial spec

### 7.4 Настройки

- [x] Ex, K1i, K2i, Kiu, L_K2i, R_gr
- [x] База номенклатуры (одна, read-only auto)
- [x] grouping: separate_by_object_type / merge_materials
- [x] Settings project-scoped + version + в файл
- [~] После смены settings — явный re-generate (не silent)

### 7.5–7.7 Tabs / display / stale

- [x] Переключение вкладок ЭР без merge
- [~] Имя вкладки = имя ЭР
- [x] Колонки: name, mark, code, supplier, unit, qty
- [x] Merge одинаковых внутри раздела
- [x] Stale banner после изменения ЭР
- [x] «Сформировать заново» / Пересчитать
- [ ] Пустые секции не должны писать «расчёт недоступен» когда spec просто пуста

### 7.8 Отчёт

- [x] Выгрузка = отдельный кейс; guest HTML preview/print
- [~] Server PDF/DOCX/XLSX — employee only (clarified)
- [—] Полный отчётный кейс вне 7.x

### 7.9 Греющий кабель

- [x] Сумма длин по марке: Lсек × N (факт секций)
- [~] Продуктово: BOM может брать **order_length** (×1.1) — DECISION vs §7.9 «фактическая»; зафиксировать в Rev.5
- [x] Разные марки — разные строки
- [x] Только distributed + successful
- [x] Errors excluded

### 7.10 Соединительные комплекты

- [x] Filter by temp group
- [x] 1 кандидат → auto; N → selection
- [x] qty = ceil(N_sec / sections_per_kit) from catalog row
- [~] UI dropdown + persist selection + rehydrate after F5
- [~] Capacity из каталога (не из request) — BE calc; catalog seed risk

### 7.11 Ремонтные комплекты

- [x] Group by temp group, sum cable length
- [x] qty = ceil(L_group / length_per_kit)
- [~] Selection UI same as 7.10

### 7.12 Клей-герметик

- [x] qty = ceil((conn + repair) / kits_per_unit)
- [~] Multi-candidate selection

### 7.13 Стекловолоконная лента

- [x] By temp group
- [x] L = ((π × D × 2.5 / 1000) × (L_cable / 0.3)) × 1.1
- [x] qty = ceil(L / spool_length)
- [~] Selection UI

### 7.14 Алюминиевая лента

- [x] L = L_cable × consumption_per_m
- [x] qty = ceil(L / spool)
- [~] Selection UI

### 7.15 Соединительные коробки

- [x] Condition engine: d≥57, K1i/K2i/Kiu, Lсек≥L_K2i, Nсек≥3, Ex, R_gr
- [x] formula: round(N_sec / divider), min_quantity=1
- [ ] **Авторитетная матрица 12 коробок** vs PDF table — runtime provisional; owner approval
- [?] Goldens на границах d=56.999/57, N=2/3, Ex, R_gr
- [~] R_gr как **условие**, не множитель N_sec (исправлено в canonical)

### Selection protocol (сквозной 7.10–7.15)

- [x] BE: selection_required + candidates per ER
- [~] FE: SpecCandidateSelectionPanel (happy path)
- [ ] FE: hydrate from snapshot after reload
- [ ] FE: stale selection when candidate dropped
- [ ] FE: UI branch by diagnostics.kind
- [ ] catalog_selections server-side project persist (optional)

### Catalog / generate readiness

- [ ] Seed/import **SpecificationCatalog** на чистом стенде (иначе 503/422 catalog)
- [x] Electrical catalogs seeded active/approved
- [x] Snapshot + fingerprint conflict
- [~] Tank/barrel formulas completeness
- [~] separate_by_object_type «Общие материалы» + ceil semantics — owner decisions

---

## Критический путь приёмки (мини-сценарий)

Прогнать руками/e2e и отметить:

1. [ ] Home → «Начать без регистрации» → auto project  
2. [ ] Add pipe + tank → heat OK (status green)  
3. [ ] Далее → ЭР1 → все unassigned  
4. [ ] Assign Самрег → auto cable+sections, summary non-zero  
5. [ ] (Optional) second ER copy; max 5 disabled  
6. [ ] Spec → settings Ex/K* → generate selected ER  
7. [ ] Unassigned warning: Fix / Proceed  
8. [ ] Rows in **Трубы** (not only Общие) + cable qty sensible  
9. [ ] Stale after heat edit → regenerate  
10. [ ] Download project file → new session → upload → continue  
11. [ ] Guest report preview/print  
12. [ ] Session expire → recovery clean (no 401 spam)

---

## Приоритеты закрытия (из чек-листа)

| Pri | Пункты | Зачем |
|---|---|---|
| P0 | §7.1/`bomSectionOf`, §7 catalog seed, §7.3 «Исправить» | Видимый слом спецификации |
| P0 | §6.14 Iдоп fail-closed, §6.13 нитки 1…3 | Алгоритм секций/кабеля |
| P0 | §6.2 hide Resistive/Skin; 230 V UI | MVP-конформность ЭР |
| P1 | §6.11 DnD, §6.19 per-row recalc, §7 selection hydrate | UX кейса |
| P1 | §4.2 help + session recovery, §5.8 group UI | Гостевой контур |
| P2 | §7.15 matrix approve, §3 NFR 500/10, AC-FE | Release / приёмка |

Детальный план слайсов: [`case1-closure-slice-plan.md`](./case1-closure-slice-plan.md).

---

## Примечания по расхождениям документа и runtime

1. **§6.13 «кабель ТЛТ»** vs runtime **ТТН/ТТВ/ТТХ** — продуктовое решение 2026-08-03: legacy ТЛТ выпилен; документ частично устарел.  
2. **§7.9 «фактическая длина»** vs **§6.13 order×1.1** — зафиксировать в Rev.5: кабель в BOM = закупочная; аксессуары = монтажная.  
3. **§6.18 «формировать все ЭР»** vs runtime **selected ER only** — product decision: только выбранные.  
4. **§7.15 PDF table** vs **runtime box matrix** — принять runtime и перенести в Rev.5 после approval.

---

*Конец чек-листа. Обновлять статусы `[x]/[~]/[ ]` по мере закрытия slices; не смешивать с ACTIVE frontend backlog.*
