# Чек-лист фронтенда по кейсу 1 «Расчёт спецификации для неавторизованных пользователей»

**Дата:** 2026-08-03
**Статус:** рабочая ведомость (сводка требований и пробелов), не ACTIVE frontend-очередь —
маршрутизация работ выполняется через [`../../frontend/refactor-backlog.md`](../../frontend/refactor-backlog.md)
отдельными vertical slices.

> **Errata:** см. [`case1-docs-verification.md`](./case1-docs-verification.md).  
> Iдоп fail-closed на BE уже есть — FE gap = UI settings.  
> Project download = schema v3 multi-section CSV, не «только объекты».

> **Закрытие спецификации FE (2026-08-04, HEAD `a2f6e9d` / track `5038c56`):**  
> - selection panel + PUT `catalog-selections` + generate без client store — **есть**;  
> - F5 hydrate из GET `generation_status` / `generation_candidate_groups` — **есть**;  
> - unit+integration specification pack **43/43**, E2E phase5 **17/17** на `:3003`.  
> Остаётся продуктовый polish (kind-ветки UI, «Исправить» unassigned, admin catalog UX) —
> не блокер engineering path. Residual authority catalog — BE/owner, не FE.

**Источники:**

- Кейс 1, редакция 4 от 07.07.2026 (`ТНП/1_Кейс_«Расчёт_спецификации_для_неавторизованных_пользователей» (1).pdf`);
- [`guest-electrical-calculation-tz.md`](./guest-electrical-calculation-tz.md) (§7, §12.5, §13.2, §17.3, §18);
- [`guest-specification-calculation-algorithm.md`](./guest-specification-calculation-algorithm.md);
- [`specification-backend-implementation-prompt.md`](./specification-backend-implementation-prompt.md);
- [`specification-frontend-follow-up.md`](./specification-frontend-follow-up.md);
- [`case1-backend-status.md`](./case1-backend-status.md) — парная оценка бэкенда;
- [`case1-closure-slice-plan.md`](./case1-closure-slice-plan.md) — план слайсов закрытия;
- аудиты `docs/audit/2026-08-02-pdf-app-conformance`, `2026-08-02-electrical-calculation`,
  `2026-08-02-heatcalc-tab-audit`, `2026-08-03-heat-params-contract`;
- ревизия кода `frontend/src` от 2026-08-03.

**Что уже закрыто** (для калибровки объёма): heat-calc — труба и резервуар, Excel-режим с
clipboard, reorder строк, настройки колонок, импорт XLSX; каркас ЭР — до 5 вкладок, rename,
саммари, назначение типов, модалки «Выбор»/«Подбор», защита ручных выборов при пересчёте;
спецификация V1 — вкладки по ЭР, настройки Ex/K1i/K2i/Kiu/L,K2i/R,гр, группировки,
stale/partial-баннеры; отчёт — гостевой preview + печать, серверный экспорт за `require_employee()`.

---

## P0 — Спецификация (ядро кейса, разделы 7.2–7.15)

- [x] Переход на канонический V2-контракт генерации: `variant_ids` +
      `options {catalog_id, catalog_version, grouping_mode, Ex, K1i, K2i, Kiu, L_K2i_m, R_gr}` +
      `exclude_unassigned_confirmed` + `catalog_selections`; удалить `electrical_variant_ids`,
      `confirm_partial`, `variant`, `electrical_variant_id`, `mode`.
- [x] Per-ER статусы `generated / blocked / confirmation_required / selection_required` и типы
      проблем `confirmable / blocking / selection_required`; HTTP-успех не маскирует `blocked`
      отдельного ЭР.
- [ ] Ветвление generation UI по typed `diagnostics[].kind/code`, не по тексту сообщения.
      **Частично (ревизия 2026-08-03):** по `code` ветвление есть
      (`getSpecificationErrorDetail`, `useSpecificationPageModel.ts`), но `kind`
      (`blocking / confirmable / selection_required`) в UI не используется — все диагностики
      рендерятся одним danger-алертом (`SpecPageChrome.tsx`), `kind` служит только React-key.
      Осталось: разные UI-ветки по `kind` (confirmable → подтверждение, selection_required →
      выбор кандидата, blocking → блокирующий алерт).
- [x] UI выбора каталожной позиции при нескольких кандидатах (кейс 7.10–7.15):
      `SpecCandidateSelectionPanel` + server PUT `catalog-selections` + generate без client store
      (FINAL-06 / REM-05). F5 восстанавливает panel из GET `generation_*`.
      **Остаток polish (не блокер path):** ветка UX «выбор выпал из кандидатов» (BE уже
      fail-closed → `selection_required`), показ имени ЭР в панели, kind-ветвление алертов.
- [ ] Ветка «Исправить» в предупреждении о нераспределённых (кейс 7.3): переход в первый ЭР с
      нераспределёнными, открытие вкладки «Нераспределённые объекты», подсветка строк. Сейчас
      есть только подтверждение partial-генерации («Всё равно сформировать»).
- [ ] Полный состав строки спецификации (алгоритм §7.3): добавить категорию/раздел, id и версию
      строки каталога, применённые параметры и формулу количества.
- [x] Запрет скрытых frontend-defaults: различать «пользователь не задал значение» и явные
      `false`/`0`; не подменять отсутствующие настройки/справочники моками.
- [ ] Переработать постоянные пустые секции «Расчёт спецификации для данного типа объекта пока
      недоступен» (`SpecTable.tsx`, `alwaysShowSections`) — алерт показывается даже когда
      спецификация просто не сформирована.

## P0 — Электрорасчёт (план §17.3 ТЗ; аудит 2026-08-02: соответствие 48%)

- [ ] Напряжение 230 В read-only: убрать редактируемые 220 В из defaults, state, payload и
      fixtures (сейчас `make seed` даёт 3 electrical-ошибки на 220/230).
- [ ] Ограничить нитки `1..3` (сейчас UI допускает до 100); при нехватке трёх ниток показывать
      причину и рекомендацию, а не формально успешный вариант.
- [ ] `Iдоп`: FE UI настройки проекта + override; BE уже кидает
      `SECTION_CURRENT_LIMIT_REQUIRED` без значения — нужен empty/error UX и форма ввода,
      не повторная реализация fail-closed на клиенте.
- [ ] Единственный тип MVP `self_regulating_tt` («ТТН / ТТВ / ТТХ»); полностью скрыть
      Резистив/Скин/Минеральный (сейчас видимы вкладки и саммари-карточки, пункт «Скин (скоро)»,
      мёртвое условие `tab.key === 'skin' && false`); убрать legacy-линейку и `ТТС*`.
- [ ] Починить drag-and-drop назначение: drop-зоны есть, но drag-источник реализован только в
      AntD-ветке таблицы, а движок по умолчанию — glide → в дефолтной конфигурации перетаскивание
      не работает. Плюс обязательная клавиатурная альтернатива (FE-12).
- [ ] Provenance view: полный маркоразмер, серия, база модели, мощность при T3, номенклатурный
      код, версии каталога/формулы; отображение `Lтреб / Lфакт / Lдоп / Lзаказ`; manual options
      только с бэкенда (во фронте нет копий `q1/q2`, `Lмакс`, `Iст.уд`).
- [ ] Управляемая применимость T2 (пропарка), обязательный T3, показ источника значений
      (override vs Heat).
- [ ] «Применить правило к группе»: сейчас жёстко зашитый массовый «Назначить Самрег» —
      привести к семантике ТЗ или переименовать.
- [ ] Статус «Требуется перерасчёт» per-объект после изменения исходных данных (кейс 6.19,
      FE-21…24): подсветка строк, кнопка «Пересчитать» в строке, исключение stale-значений из
      итогов и сводки.
- [ ] Полный набор состояний экрана (§7.8): loading / empty / no-assigned / progress /
      partial batch failure / stale / network retry / validation / permission / 409 conflict с
      перезагрузкой версии; `Idempotency-Key` от двойного клика; disabled create/copy на пятом ЭР
      с пояснением; прогресс фоновой задачи и виртуализация на 500 объектов.

## P1 — Гостевая сессия, лимиты, справка (pdf-app-conformance: FAIL)

- [ ] Атомарное восстановление истёкшей гостевой сессии (AUTH-05): отмена и удаление TanStack
      Query keys старого проекта до установки нового; ноль 401/404 и console-ошибок (Slice 6).
- [ ] Лимит 500 объектов вместо 50 (CAP-01) + разделить лимит строк файла импорта и остаточную
      вместимость проекта в сообщениях (CAP-02).
- [ ] Актуализировать `GuestHelpPage` (P2-FAIL): сессия 3 дня (не 30), кнопка «Начать без
      регистрации», автосоздание проекта, реальные лимиты, права на отчёты (гость — HTML/печать,
      PDF/DOCX/XLSX — сотрудник) (Slice 7).
- [ ] Сохранение проекта в файл (кейс 4.2, 5.11–5.12): BE schema v3 CSV уже multi-section
      (objects/ЭР/spec/settings); FE labels «CSV» + нужен round-trip proof и copy «файл проекта».
- [ ] Групповая корректировка (кейс 5.8): для выбранных объектов форма «один параметр → новое
      значение → применить» с проверкой применимости ко всем выбранным. Как отдельной функции
      нет; Excel-режим закрывает сценарий частично.

## P1 — Heat-calc: доделки по контрактам

- [ ] Реализовать целевые grid-манифесты
      [`../../frontend/heatcalc-object-fields-grid.md`](../../frontend/heatcalc-object-fields-grid.md) и
      [`../../frontend/heatcalc-tank-fields-grid.md`](../../frontend/heatcalc-tank-fields-grid.md)
      (статус «для последующей реализации»; включают geometry assertions и удаление старого
      coordinate-пути).
- [ ] Согласовать диапазон ручной λ: UI `0.001…400` против backend `>0…500`
      (P1 аудита heatcalc-tab).
- [ ] Решение владельца по обязательности толщины стенки трубы (P2 там же).

## P2 — Качество и гейты (предусловие release-green)

- [ ] Console seal: убрать `Warning: There may be circular references` (Ant Form) при первом
      сохранении трубы (AF100-13).
- [ ] Семь красных архитектурных гейтов: direct Ant imports `140 > 139`, coordinate-layout
      `72 > 71`, CSS LOC caps (3 файла), breakpoints `999px`/`1399px`, пять `!important`,
      селекторы cable wizard вне owner root, root `AGENTS.md` vs `repoRootHygiene`
      (AF100-11+ / AF100-15).
- [ ] Browser-matrix `1000×768 / 1280×800 / 1440×900`: home/help, гостевой проект, Heat, ЭР,
      Спецификация, состояние «нет Iдоп», session recovery; geometry, page overflow, console,
      failed requests. Плюс 19 приёмочных сценариев `AC-FE-01…19` (§13.2 ТЗ) — в свежих аудитах
      помечены NOT RUN.

## Зависимости и оговорки

- **Бэкенд впереди фронта**: V2-контракт спецификации, метаданные каталога, preflight-форма и
  кандидаты приходят backend-слайсами 2–9; фронт приводится к фактической OpenAPI после
  завершения backend-контракта (см. `specification-frontend-follow-up.md`).
- **Открытые бизнес-вопросы, блокирующие часть UI**: формулы спецификации для резервуаров
  (сейчас только `pipe` → раздел «Бочки» остаётся unsupported); матрица `condition_Ex`/`R_gr`
  для 12 коробок; номенклатурные коды клея и лент; подтверждение `Iдоп` и первоисточника
  `q1`/`q2` владельцами справочников.
- **SRS-прототипы** `docs/srs/ui/guest/*.html` устарели (220 В, марки ТЛТ-10…30, четыре типа
  кабеля, карточки вместо таблицы, `CO1…CO4`): ориентир — ТЗ и алгоритм спецификации, не SRS.
- **Не переносить во фронт** (из follow-up): формулы количества и округления, подбор каталожной
  позиции, полноту справочников, решение об обходе blocker, вычисление актуальности snapshot,
  объединение строк спецификации.
