# Статус бэкенда по кейсу 1 «Расчёт спецификации для неавторизованных пользователей»

**Дата оценки:** 2026-08-03 (повторная; первая — тем же днём до коммитов 3abab01…d399241)  
**Последнее закрытие спецификации (engineering):** 2026-08-04, HEAD `5038c56`  
**Статус:** рабочая ведомость (снимок соответствия), не ACTIVE-очередь.

> **Errata 2026-08-03 вечер (HEAD `33079ef`+):**  
> 1) Iдоп: формула `sections.py` **fail-closed** при `None` (`SECTION_CURRENT_LIMIT_REQUIRED`) — пункты «optional Iдоп / only Lмакс» **устарели**.  
> 2) `project_io` schema v3 + snapshot consumers усилены коммитом `33079ef` — IO-пробелы FE, не «CSV only objects».  
> 3) Полная сверка: [`case1-docs-verification.md`](./case1-docs-verification.md).

> **Оценка №4 — engineering closed (2026-08-04, HEAD `5038c56`):**  
> Спецификация **как кодовый контур** закрыта: UUID BOM, selection GET/PUT + project IO,  
> ER-level ceil, seed-debt bootstrap, last generation status на GET (F5), FE hydrate,  
> stale fingerprint fail-closed, HTTP production flow + E2E phase5 **17/17** на `:3003`.  
> **Не production authority:** active catalog = `seed-debt-v1` (TECH-DEBT), owner  
> MATERIALS / EX-RGR / COMMON **OPEN**. Критические оговорки №3 п.1–5 **сняты кодом**  
> (кроме owner-матриц и замены seed-debt). Электрика (п.6) — вне этого закрытия.  
> Матрица: локальный audit `docs/audit/2026-08-03-specification-production/closure-matrix.md`.

Парный документ по фронту: [`case1-frontend-checklist.md`](./case1-frontend-checklist.md).
План закрытия: [`case1-closure-slice-plan.md`](./case1-closure-slice-plan.md).

**Источники:** кейс 1 ред. 4 от 07.07.2026; [`guest-electrical-calculation-tz.md`](./guest-electrical-calculation-tz.md);
[`guest-specification-calculation-algorithm.md`](./guest-specification-calculation-algorithm.md);
[`specification-backend-implementation-prompt.md`](./specification-backend-implementation-prompt.md);
ревизия кода `backend/app` рабочей копии от 2026-08-03 (включая незакоммиченные правки:
canonical generation service, preflight rules v2, обработчики 422 в `main.py`).

## Сводка по разделам кейса

| Раздел кейса | Оценка №1 | Оценка №2 | Оценка №3 | Динамика №3 |
|---|---:|---:|---:|---|
| 4. Работа с проектами, гость | ~70% | ~85% | **~90%** | display-settings проекта для гостя + перенос в файле |
| 5. Объекты и теплорасчёт | ~85% | ~92% | **~92%** | без изменений |
| 6. Электротехнический расчёт | ~72% | ~78% | **~83%** | справочники 230 В, посев active/approved каталогов, сводка+UUID |
| 7. Спецификация | ~45% | ~55% | **~84%*** | калькуляторы BOM на Decimal, snapshot, selection, группировки |
| 7. Спецификация (№4 eng.) | — | — | **~95%†** | end-to-end path closed; residual = owner catalog authority |

\* по коду; см. критические оговорки оценки №3 ниже.  
† engineering; production claim blocked on owner-approved catalog (не seed-debt).

## Оценка №3 (2026-08-03, вечер) — дельта и критические оговорки

Проверены коммиты 5d9046d…ebb940e (канонический UUID-контракт, authoritative BOM-каталоги,
калькуляторы аксессуаров, кандидаты per-ER, box-матрица, группировки, атомарные snapshot,
удаление legacy-пути) и незакоммиченные правки.

**Что заработало в спецификации** (было «корректно отказывает», стало «считает»):
все 7 категорий позиций считаются в продовом пути на `Decimal`
(`specification_bom_builder.py` + `calculators/*`): кабель, соед./рем. комплекты (capacity из
строки каталога), клей, обе ленты, коробки по condition-матрице; **R_gr — условие применимости,
не множитель**; статус `generated` достижим и доказан интеграционно; snapshot с полным
provenance персистится, fingerprint сверяется под локом → `SPEC_GENERATION_CONFLICT`;
selection-протокол (0/1/N кандидатов, ER-scoped группы); `merge_materials` применяется;
multi-ЭР — savepoint per ER. HTTP-endpoints admin import/activate каталога появились.

**Критические оговорки №3** (исторический снимок вечера 2026-08-03):

1. ~~Рабочая копия несогласована~~ → **снято** (UUID path + legacy builders removed, HEAD `297ffb5`+).
2. ~~Каталог не засеян~~ → **частично**: есть `seed-debt-v1` + `--specification-catalog-only`
   (**TECH-DEBT**, не owner-approved).
3. **Авторитетной Ex/R_gr owner-матрицы нет** — OPEN (`SPEC-OWNER-EX-RGR`); fail-closed authority
   path есть, placeholder activation запрещён.
4. ~~ceil по object-type first~~ → **снято кодом** (ER-level ceil kits, `fccd1a0`); owner COMMON
   mapping table всё ещё OPEN.
5. ~~`catalog_selections` только на клиенте~~ → **снято** (таблица + GET/PUT + project IO + F5 status).
6. Электрика: топ-пробелы №2 **не входят** в закрытие спецификации (отдельный track Slice 6).
7. ~~FE `console.log SPEC_DEBUG`~~ → считать **снятым** при зелёном phase5 / console-seal path
   (повторно не воспроизводилось в closure 2026-08-04).

*Ниже — детальный разбор состояния на оценку №2 (сохранён как история); проценты в
заголовках разделов соответствуют №2.*

## Раздел 4 — проекты (~85%)

Закрыто повторной оценкой: `GUEST_MAX_OBJECTS_PER_PROJECT = 500` (`core/config.py:81`);
`ProjectService.touch_project` вызывается во всех мутациях объектов — сортировка «по дате
изменения» корректна; файл проекта (schema v3) включает `specification_settings(+version)` и
секцию `electrical_settings`, импорт их восстанавливает (`project_io_service.py`).

Остаточные пробелы:

- [ ] «Мои проекты» сотрудника показывают проекты **всех** сотрудников
      (`project_service.py:110`, фильтр `user_id.is_not(None)` без `principal.user_id`).
- [ ] Серверного контракта «есть несохранённые изменения» нет (`ProjectStatus` = draft|completed).
- [x] ~~Настройки отображения не проектные и гостю недоступны~~ — закрыто оценкой №3:
      `Project.display_settings(+version)`, API `/projects/{id}/display-settings` под
      `require_any()` (гость имеет доступ), значения входят в файл проекта
      (metadata: `display_settings`, `display_settings_version`; NULL ≠ явный сброс `{}`).
      Целевой контракт и чек-лист реализации:
      [`project-display-settings-portability.md`](./project-display-settings-portability.md).

## Раздел 5 — объекты и теплорасчёт (~92%)

Закрыто: `POST .../objects/duplicate-batch` и `POST .../objects/group-update`
(`api/v1/objects.py:242-384`, `require_any()`, всё-или-ничего, пересчёт, инвалидация ЭР/спецификаций,
лимит проекта). Формулы теплопотерь полные: труба (3 размещения, локальные элементы, 1–3 слоя,
«Другое» с λ и температурным диапазоном), резервуар (3 формы, частичное заглубление, `q_additional`,
сфера с критическим радиусом), климат/грунты/режимы tm с provenance.

Остаточные пробелы:

- [ ] Гейт «невалиден после пересчёта → 422» стоит только для `pipe` — невалидный резервуар
      коммитится молча (`objects.py:166`, `:323`, `:575`).
- [ ] Локальные элементы резервуара отсутствуют (только скалярный `q_additional`)
      (`heat_contract.py:53-64`).
- [ ] `pump/platform/other` создаются (201), но расчёт падает `CalculationError`
      (`schemas/project.py:41` vs `calculation_service.py:1142`).
- [ ] «Пол» (floor) — нет типа/формул; по кейсу допустимо (future), фиксируется для полноты.

## Раздел 6 — электрорасчёт (~78%)

Закрыто повторной оценкой: сводка по §8.5 — `total_sections`, `total_start_current_a`,
`system_summaries`, Lфакт вместо Lзаказ, UUID-скоуп, фильтр ready-назначений
(`calculation_service.py:570-735`); `/calc/electrical/query` отдаёт `required_installed_length_m`,
`section_l_max/l_tok/l_ogr/l_excess`, `provenance` (`electrical_query_service.py:723-825`);
seeds переведены на канонический pipeline 230 В (`seeds.py:1602-1652`) и до расчётов
регистрируют active/approved версии существующих power/section/BOM-каталогов.

Ядро стабильно с прошлой оценки: TT-pipeline (230 В форсировано, нитки 1..3, обязательный T3,
fail-closed `Iдоп` project+object, серия `q1·T3+q2`, СТ/СР, fingerprint + чексуммы трёх каталогов);
секционирование по кейсу 6.12–6.14 буквально (`Lогр = min(Lмакс, Lток)` округлением вниз,
равные секции, `Lфакт ≥ Lтреб`, `Lзаказ = Lфакт × 1.10`); 27 доменных кодов; staleness-каналы
с изоляцией по UUID ЭР.

Остаточные пробелы (приоритетно):

- [ ] `GET /calc/cable-options/{object_id}` — заглушка на каталог ТЛТ
      (`calculation_service.py:5246-5249`): нет TT-моделей, серии, мощности при T3, причин
      недоступности, параметра ЭР (§17.3.5 ТЗ).
- [ ] Legacy `cable_type` (`self_regulating`/ТЛТ, `single_core`, `three_core`, `mineral`, `skin`)
      остаётся валидным входом и исполняется по 220-вольтовым формулам
      (`schemas/calculation.py:1105-1112`, `calculation_service.py:1991-2020`); дефолты
      `"self_regulating"` в select-cable/batch/candidates.
- [ ] `POST /calc/electrical` и `/calc/electrical/batch` — без `Idempotency-Key` и
      `expected_assignment_version`; batch не принимает `electrical_variant_id`
      (`calculations.py:1066`); `/calc/electrical/page` тоже только `variant_number`
      (`calculations.py:290`).
- [ ] Нет финального гейта §9.15: `status="ready"` — литерал (`electrical_tt_pipeline.py:341`),
      `Pуст ≥ Pтреб` и `Lфакт ≥ Lтреб` после секционирования не переподтверждаются.
- [ ] Дефолт объекта `supply_voltage: 220` (`project_object_params.py:66`) **участвует в токе
      legacy-расчёта**: по кейсу §6.13 `current = total_power / supply_voltage` — пока поле
      не тронуто пользователем, токи legacy-строк считаются при 220 В и расходятся с
      TT-контуром (жёсткие 230 В) на ~4,5%. Однострочная правка 220 → 230; на сохранённые
      объекты не влияет (значение уже записано в params).
- [ ] Табличный статус не различает «Требуется перерасчёт» / «Требуется корректировка»
      (`electrical_query_service.py:103-108`, `stale` схлопывается в `not_calculated`).
- [ ] `_apply_section_plan` больше не мёртвый — вызывается в расчётном пути (только для
      `self_regulating_tt`, `calculation_service.py:2017`), но внутри остаются fallback-дефолты
      220 В / −20 °C (`:2044-2050`); для TT практически не срабатывают (voltage в TT-результате
      всегда 230), однако fallback стоит убрать или сделать fail-closed.

## Раздел 7 — спецификация (~55%): контур готов, ядра нет

Качественный переворот: из «считает частично неверно» в «корректно отказывает» (fail-closed).

Закрыто:

- Канонический контракт: POST generate принимает только `variant_ids (1..5)` +
  `options {catalog_id, catalog_version, grouping_mode, Ex, K1i, K2i, Kiu, L_K2i_m, R_gr}` +
  `exclude_unassigned_confirmed` + `catalog_selections`; `extra="forbid"` отвергает legacy-тело
  (`api/v1/specifications.py:161-166`, `schemas/specification.py:160-186`).
- Per-ER статусы `generated/blocked/confirmation_required/selection_required`; HTTP по
  precedence 201/422/409; общий rollback multi-ЭР устранён.
- Preflight по assignments ЭР (`preflight_service.py:186-234`), blocking не обходится
  подтверждением (`specification_preflight_rules.py:99-118`), precedence blocking >
  selection_required > confirmable > ready — инвариант модели.
- Каталожные гарды: только `active + approved + complete` (`specification_catalog_service.py:748-770`),
  синтетическая box-матрица в production-путь больше не попадает; валидация Ex/R_gr условий
  строк на импорте.
- Project-scoped настройки с версией, без скрытых дефолтов, со stale-каскадом и попаданием
  в файл проекта; object-level опции спецификации удалены.
- Диагностики: большинство `SPEC_*` кодов реально поднимаются (в т.ч. `SPEC_VARIANT_IDS_REQUIRED`,
  `SPEC_UNASSIGNED_CONFIRMATION_REQUIRED`, `SPEC_VARIANT_NOT_READY`, `SPEC_RESULT_STALE`,
  `SPEC_UNSUPPORTED_OBJECT_TYPE`, `SPEC_ACCESSORY_SELECTION_REQUIRED`).

Не закрыто (ядро):

- [ ] **Канонические калькуляторы BOM отсутствуют**: каждый READY-вариант →
      `blocked / SPEC_CANONICAL_CALCULATORS_UNAVAILABLE`
      (`specification_generation_service.py:142-151`); статус `generated` недостижим, snapshot
      всегда `None`, записи в БД нет. Формулы §7.9–7.15 живут мёртвым кодом в
      `formulas/specification/full_builder.py` (со старыми дефектами: R_gr множит секции,
      capacity комплектов из запроса, аксессуары всегда в `bom_section="pipe"`).
- [ ] **Versioned-каталог пуст**: посева в `seeds.py` нет, HTTP-эндпоинтов import/activate нет
      (сервисные методы `import_draft`/`activate` есть) → любой generate в реальной инсталляции
      даёт 503 `SPEC_CATALOG_UNAVAILABLE`.
- [ ] Selection-протокол — только валидация уже сохранённого выбора; «требуется выбрать» никто
      не поднимает (нет генератора), UI выбора на фронте нет.
- [ ] Группировки `separate_by_object_type`/`merge_materials`: enum + резолв + fingerprint есть,
      применяющего кода нет; раздела «Общие материалы» нет.
- [ ] Snapshot не персистится, fingerprint не сверяется повторно, `SPEC_GENERATION_CONFLICT`
      не поднимается нигде.
- [ ] Мёртвые схемы/методы V1 (`SpecificationOptions`, `preflight_variant`,
      `generate_for_electrical_variants` и др.) подлежат зачистке.
- [ ] `connector_kit_sections_per_kit` выпал из canonical options (должен прийти из строки
      каталога — проверить при написании калькуляторов).

## Критический путь до работающего сценария «Сформировать спецификацию»

1. **Канонические калькуляторы BOM** — перенос формул §7.9–7.15 из `full_builder.py` в новый
   генератор (с исправлением известных дефектов: R_gr как условие применимости, capacity из
   строки каталога, Decimal вместо float) + запись snapshot и персист fingerprint.
2. **Посев/импорт versioned-каталога** — seeds для dev/test + admin HTTP-endpoints
   import/activate (сервисные методы готовы).
3. **Selection-протокол end-to-end** — бэк поднимает `selection_required` со списком кандидатов,
   фронт даёт UI выбора и шлёт `catalog_selections`.
4. **Группировки** — применяющий код `separate_by_object_type` (с «Общими материалами») и
   `merge_materials`.

## Замечания ревью №8–10 (электрорасчёт): важность и порядок работ

Оценка 2026-08-03 по коду рабочей копии и кейсу 1 ред. 4 (§3.12, §6.8, §6.12–6.14).
Итог: **№9 и №10 закрыты этой ревизией; по №8 принято решение владельца продукта
(2026-08-03): полное удаление legacy-контура без совместимости — только `ТТН`/`ТТВ`/`ТТХ`,
никаких кабелей «ТЛТ» (см. подраздел №8 ниже).**

### №10 — закрыто: существующие каталоги зарегистрированы как production-authoritative

- Новый каталог не создавался: зарегистрированы 14 строк из `reference_data/cables_tt.json`,
  126 строк `section_catalog.json` и 18 строк `electrical_tt_bom_v1.json`. Коэффициенты power
  перенесены без догадок и исправлений, включая `15ТТВ2.q1 = -0.491`.
- Для каждого каталога зафиксированы immutable version, источник, checksum источника,
  checksum точного импортированного JSON, canonical payload checksum и audit principal. Power
  content-version `tt-power-approved-r1-2026-08-03-5ebb23d7` имеет
  `production_approved=true`.
- Нормализация §17.1 выполнена: power и section payload используют 230 В; исходный checksum
  секционного XLSX отделён от checksum нормализованного импорта.
- Миграция `0039` чинит schema drift ранних установок: добавляет/backfill-ит обязательный
  `import_checksum`, восстанавливает CHECK active-power approval и полный immutable trigger.
- Идемпотентный `python -m app.seeds --electrical-catalogs-only` активирует power/section/BOM,
  не пересоздавая проекты; обычный full seed делает это до электрических расчётов.
- Гейт остаётся fail-closed по §3.12/§6.12: production считает только при трёх active DB-версиях,
  но штатный seed теперь создаёт именно такой набор вместо static fallback.

### №9 — сводка и таблица: закрыто этой ревизией, с одной оговоркой

Закрыто: сводка §8.5/§6.8 (`total_sections`, `total_start_current_a`, `system_summaries`,
длина по Lфакт, UUID-скоуп), `/query` — `required_installed_length_m`,
`section_l_max/l_tok/l_ogr/l_excess`, `provenance`. Обоснование из кейса — буквальное:
§6.14 «Общая длина = длина одной секции × количество секций» (= Lфакт) и цепочка
Lтреб → Lогр = min(Lмакс, Lток) → Lфакт → Lдоп; §6.13 «Установленная длина нужна для
мощности. Заказная длина нужна для закупки и спецификации».

- [ ] Оговорка: legacy-строки (ТЛТ-движок) секций не имеют — в новых показателях сводки они
      дают нули; дашборд станет полностью честным после cutover №8.

### №8 — legacy-контур: РЕШЕНИЕ 2026-08-03 — полное удаление, без совместимости

**Решение владельца продукта (2026-08-03): клиентов нет, обратная совместимость не нужна.
Старые марки кабеля забываются, legacy-контур ТЛТ выпиливается целиком. Расчёт — только
серии `ТТН`/`ТТВ`/`ТТХ` (`self_regulating_tt`). Никаких кабелей «ТЛТ-…».**

Это ужесточает прежний план (§17.2 п.1 ТЗ «закрыть вход» → «удалить контур») и снимает
все deprecation-соображения. Прежний блокер (каталоги) снят посевом active/approved версий.

Состояние на момент решения: `single_core`/`three_core`/`self_regulating`(ТЛТ) валидны
(`schemas/calculation.py:1105-1112`), дефолт `cable_type="self_regulating"` в
select-cable/batch/candidates, `GET /cable-options` — заглушка на каталог ТЛТ
(`calculation_service.py:5246-5249`).

Скоуп полного удаления (бэкенд):

1. `ElectricalCableType` → единственное расчётное значение `self_regulating_tt`; legacy-значения
   на входе → 422 `ELECTRICAL_LEGACY_CABLE_MARK_UNSUPPORTED` (§10.3 ТЗ, AC-BE-21); дефолты
   в select-cable/batch/candidates → TT-путь. (`mineral`/`skin` остаются только как
   system_type назначений со статусом unsupported — это вкладки систем, не расчёт.)
2. Удалить legacy-формулы: `formulas/electrical/self_regulating.py` (ТЛТ),
   `resistive.py` (single/three core), `commercial.py` (коммерческие критерии — вне MVP,
   FE-28); связанные ветки `calculation_service` (`:1991-2020`) и `_dispatch`-код.
3. Удалить каталог ТЛТ: `reference_data/cables_tlt.json`, `list_tlt_cables()`
   (`loader.py`), выдачу в `api/v1/references.py`, `seed_demo_commercial_catalog`.
4. Переписать `GET /cable-options` на TT-модели: серия, температурная группа, мощность
   при T3, причина недоступности, параметр ЭР (§9 таблица API, §17.3.5 ТЗ).
5. Убрать `supply_voltage: 220` из дефолтов объекта (`project_object_params.py:66`);
   напряжение нового расчёта — жёсткие 230 В (DEC-11).
6. Импорт файлов проекта: v2/v3-секции electrical с legacy `cable_type` — объекты
   импортируются, legacy-расчёты отбрасываются (или весь файл 422 — решить при
   реализации; клиентских файлов не существует).
7. Тесты/сиды: удалить legacy-фикстуры и сьюты resistive/ТЛТ, перевести общие тесты
   на `self_regulating_tt`.
8. Фронт (зеркально, §17.3 пп.1-2,5-6): единственный тип MVP, 230 В read-only, селекторы
   без legacy-марок.

Документальное основание — [`guest-electrical-calculation-tz.md`](./guest-electrical-calculation-tz.md):

- **§1.1/§3 DEC-07**: марки с префиксом «ТЛТ» — условные legacy-данные, «не могут
  использоваться для нового расчёта»; обязательный MVP — только серии `ТТН`/`ТТВ`/`ТТХ`,
  мощность по кривой `q1·T3+q2`.
- **§3 DEC-11**: нормативное напряжение — 230 В; 220 В допустимо только при чтении
  legacy snapshot и требует пересчёта.
- **BE-16 (§8)**: legacy-марки не принимаются ни в auto-, ни в manual-режиме;
  автосопоставление legacy-марки с ТТ-моделью запрещено. Код ошибки §10.3:
  `ELECTRICAL_LEGACY_CABLE_MARK_UNSUPPORTED` (422); приёмка AC-BE-21.
- **FE-28 (§7), AC-FE-19**: UI не предлагает 220 В, legacy-марки, серии `ТТС*` и
  коммерческие стратегии вне MVP.
- **§9 (таблица API)**: `GET /calc/cable-options/{object_id}?electrical_variant_id=...` →
  «модели допустимой серии, расчётная мощность при T3, причина недоступности».
- **§17.2 п.1** (миграция backend): «Закрыть вход нового расчёта для legacy-линейки,
  напряжения не 230 В, неподдерживаемых серий и коммерческих политик» — первый пункт
  плана; **§17.3 пп.1–2, 5–6** — зеркальные шаги фронта (единственный тип
  `self_regulating_tt`, 230 В read-only, manual options с backend, legacy не показывать).

### Про напряжение: 230 В — требование ТЗ, кейс нейтрален

Кейс нигде не фиксирует 230 В: напряжение питания — пользовательский ввод, ток считается
`current = total_power / supply_voltage` (§6.13). Нормализация 230 В — из ТЗ §17.1.
Следствия: TT power/section-каталоги уже нормализованы до 230 В; поле `"voltage": 220` в
`cables_tlt.json` — косметика; а вот дефолт объекта `supply_voltage: 220` — реальный вход
формулы тока legacy-контура (см. чекбокс в разделе 6).

## Оценка №3 (2026-08-03, вечер): дельта после коммитов ee6924c…ebb940e

Повторный анализ рабочей копии. Сводные проценты: раздел 4 ~85→**~88**, раздел 5 — без
изменений (~92), раздел 6 — без изменений (~78), раздел 7 ~55→**~75** (появилось ядро BOM).

### Закрыто с оценки №2

- **Настройки отображения (раздел 4, кейс §5.9/§5.11)**: проектные
  `display_settings(+version)`, API под `require_any()` — доступны гостю, входят в файл
  проекта и восстанавливаются импортом. Пробел «не проектные и гостю недоступны» снят.
- **Ядро генерации спецификации (раздел 7, §7.9–7.15)**: появились канонические калькуляторы
  (`formulas/specification/calculators/` — кабельные аксессуары, box-матрица approved,
  кандидаты каталога per ER), группировки `separate_by_object_type`/`merge_materials`
  реализованы (`grouping.py`), BOM-snapshot персистится атомарно по UUID
  (`specification_generation_service.py:337-349`), legacy generate production path удалён.
  `SPEC_CANONICAL_CALCULATORS_UNAVAILABLE` из кода исчез — статус `generated` достижим.
- **`SPEC_GENERATION_CONFLICT` реально поднимается**: повторный preflight под локом при
  генерации, несовпадение fingerprint → blocked с диагностикой
  (`specification_generation_service.py:200-266`). Пункт «конфликт не поднимается нигде» снят.
- **Ревью №10 (draft power-каталог) закрыт кодом**: поставляемый набор электрокаталогов
  power/section/bom создаётся с `production_approved=True`
  (`electrical_catalog_service.py:107-182`; power-кривые «exactly as supplied», включая
  аномальную 15ТТВ2; section-каталог нормализуется к 230 В на лету) и автоактивируется
  посевом — `seed_electrical_catalogs` / `ensure_bundled_catalogs_active`, CLI
  `python -m app.seeds --electrical-catalogs-only`. Admin HTTP для замены версии:
  `/admin/electrical-catalogs/import` + `/{id}/activate`. Гейт TT-контура в засеянной
  инсталляции больше не блокирует расчёт → **№8 (закрытие legacy-входа) разблокирован**;
  подтверждением владельца считается включение данных в поставку.

### Не изменилось (ключевые остатки)

- Раздел 4: «Мои проекты» сотрудника — все проекты сотрудников (`project_service.py:110`;
  отложено решением от 2026-08-03); серверного контракта «несохранённые изменения» нет.
- Раздел 5: 422-гейт после пересчёта только для `pipe`; `pump/platform/other` в схеме;
  локальных элементов резервуара нет.
- Раздел 6 (ревью №8–10): `cable-options` — заглушка ТЛТ (`calculation_service.py:5241`);
  legacy `cable_type` валиден, дефолты `"self_regulating"` (в т.ч. batch,
  `calculations.py:1063-1068`); batch/page — только `variant_number`; §9.15-гейт — литерал
  `"ready"` (`electrical_tt_pipeline.py:340`); 220 В в каталогах и дефолте объекта
  `supply_voltage` (`project_object_params.py:66`); табличный статус не различает
  перерасчёт/корректировку. Порядок работ обновлён: №10 закрыт bootstrap-ом каталогов →
  №8 разблокирован (состав шагов прежний: запрет legacy-типов → дефолт TT →
  `/cable-options` на TT-модели с P(T3)).
- Раздел 7: **каталог СПЕЦИФИКАЦИЙ (SpecificationCatalogService) по-прежнему без посева и
  без admin HTTP** (эндпоинты `/admin/electrical-catalogs/*` — только про электрокаталоги);
  generate без активного спец-каталога корректно отказывает (422 канонического контракта).
  Selection-UI на фронте; `connector_kit_sections_per_kit` — проверить в калькуляторах.

### Состояние тестов на момент оценки

Проектные/объектные сьюты зелёные (`test_projects`, `test_project_io` кроме известного
`test_export_includes_electrical_and_specifications` — нет каталога → нет спецификации,
`test_objects_group_ops`). В зоне активной работы параллельной сессии красные:
`test_specifications.py` (3), `test_report_service_unit.py` (4) — вероятно, in-flight.

**Критический путь раздела 7 сжался до одного пункта данных**: посев/импорт + активация
versioned-каталога (admin HTTP + seeds) — после этого сценарий «Сформировать спецификацию»
проходим end-to-end; далее selection-UI на фронте.

### №8 — статус выполнения (2026-08-03, вечер): ядро выпилено, хвосты — техдолг

**Сделано (рабочая копия, дерево импортируется, collection чистая):**

- Схемы: `ElectricalCableType = {self_regulating_tt, mineral, skin}`; все дефолты
  `self_regulating` → `self_regulating_tt` (схемы + query-параметры select-cable/batch).
- Сервис: legacy-ветки диспатча заменены доменной ошибкой
  `ELECTRICAL_LEGACY_CABLE_TYPE_UNSUPPORTED` (422); физически удалены
  `_apply_section_plan` (220 В/−20 °C), `_resistive_policy_payload`, commercial-ranking,
  резистивные загрузчики каталога и legacy-ветки `_build_electrical_data`/batch/
  select-cable/candidates/copy-validation (~500 строк).
- Формулы: удалены `resistive.py`, `commercial.py`, `mineral.py`; из
  `self_regulating.py` удалён legacy `calc_self_regulating` + хелперы (осталась только
  TT-часть). Admin formula-test: ветки `electrical`/`resistive_single`/`resistive_three`
  удалены.
- References API: удалены `/resistive-cables`, `/cables/commercial` (ТЛТ-проекция),
  ТЛТ/resistive из `/internal` и ETag-ов; `/cables` — только TT-модели.
- Seeds: resistive-коэффициенты и demo-commercial посев отключены.
- Тесты: удалены 6 юнит-сьютов удалённых формул (113 legacy-тестов).

**Отключено «выключателем» (работает, но помечено в коде как ТЕХДОЛГ №8):**

- `load_cable_catalog`: builtin ТЛТ — пустой список; plumbing `tlt_catalog` через
  batch/candidates/copy-validation ещё не удалён.
- `GET /calc/cable-options/{object_id}` возвращает `[]` (ТЛТ отключён, TT-выдача не
  реализована).

**Техдолг №8 (отложено решением владельца 2026-08-03 «остальное отключи»):**

- [ ] `/cable-options` → TT-модели активного power-каталога: серия, температурная
      группа, мощность при T3 (`q1·T3+q2`), причина недоступности, параметр ЭР
      (§9/§17.3.5 ТЗ). Series-хелперы готовы (`_select_tt_series`, `_tt_row_series`);
      маппинг серия→группа: ТТН→low, ТТВ/ТТХ→high.
- [ ] Удалить plumbing `tlt_catalog`/`load_cable_catalog` и `cables_tlt.json`,
      `resistive_cables.json`, `list_tlt_cables`/`list_resistive_cables`/
      `get_tlt_cable_by_mark` из loader; `seed_demo_commercial_catalog` +
      `_upsert_demo_cable` удалить.
- [ ] `supply_voltage: 220` в `COMMON_OBJECT_DEFAULTS` — после удаления legacy-движка
      стал инертной метаданной; убрать вместе с полем формы (DEC-11: 230 фикс).
- [ ] Импорт файла проекта: legacy-строки `electrical` (v2/v3) сейчас импортируются
      как есть; отбрасывать с диагностикой.
- [ ] Мёртвые схемы: `SelfRegulatingParams/Result`, `Resistive*Params/Result`,
      `RESISTIVE_DEFAULT_*`, `CableType` enum в `models/cable.py` (DB-enum — нужна
      миграция), `contracts.py` SINGLE_CORE/THREE_CORE.
- [ ] Тестовый sweep: 45 юнит-падений (38 — `test_calculation_service_unit.py`,
      legacy-механика; 4 — `test_reports_helpers.py`; 2 — `test_spec_builder.py`;
      1 — `test_no_double_safety.py`) и ~48 интеграционных в `test_calculations.py`
      (фикстуры без обязательного T3 `maintain_temperature`) — перевести на TT-вход
      или удалить вместе с legacy-семантикой.
