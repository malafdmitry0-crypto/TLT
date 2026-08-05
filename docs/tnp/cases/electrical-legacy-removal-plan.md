# Безопасное удаление legacy-контура электрорасчёта

**Статус:** согласованный порядок очистки, не ACTIVE frontend-очередь

**Дата:** 2026-08-05

**Область:** старые расчётные `cable_type`, 220-вольтовые схемы и старые
справочники ТЛТ/резистива

**Не является:** реализацией, миграцией данных или разрешением удалять чужой WIP

## 1. Цель

После выполнения плана новый электрический расчёт должен иметь один расчётный
дискриминатор:

```text
cable_type = self_regulating_tt
```

Подбор выполняется только по паспортным сериям `ТТН` / `ТТВ` / `ТТХ` и
versioned-каталогам `power` / `section` / `bom`.

Обратная совместимость со следующими расчётными значениями не поддерживается:

```text
self_regulating  # старый cable_type ТЛТ, но не system_type назначения
single_core
three_core
```

Старые значения не преобразуются в `self_regulating_tt`, не восстанавливаются
как `ready` и не получают скрытых значений по умолчанию.

## 2. Критическое различие имён

| Значение | Решение | Почему |
|---|---|---|
| `system_type = self_regulating` | **оставить** | Действующее назначение объекта в систему «Самрег» |
| `cable_type = self_regulating_tt` | **оставить** | Единственный расчётный тип Case 1 |
| `cable_type = self_regulating` | **удалить** | Старый расчёт и каталог условных марок ТЛТ |
| `cable_type = single_core` | **удалить** | Старый одножильный резистивный контур |
| `cable_type = three_core` | **удалить** | Старый трёхжильный резистивный контур |
| `system_type = resistive` | **закрыть для новых назначений**, затем удалить после очистки данных | Ведёт только в удаляемые `single_core` / `three_core` |
| `system_type = mineral/skin` | **не удалять в этой инициативе** | Это отдельные неподдержанные системы, а не старые схемы R1/R3 |
| `supply_voltage = 230` | **оставить** | Нужно downstream для тока и секций; не участвует в выборе марки |
| редактируемые/default `220 В` | **удалить** | Старый расчётный контракт |

Файл
`backend/app/formulas/electrical/self_regulating.py` нельзя удалять по имени:
сейчас он владеет актуальной функцией `calc_self_regulating_tt`. Возможное
переименование — отдельный механический slice после очистки.

## 3. Что уже является каноническим

- Public calc-схема принимает `self_regulating_tt`; старые расчётные типы уже
  отсутствуют из `ElectricalCableType`.
- Основной frontend предлагает только `self_regulating_tt`, но скрытые ветки
  `single_core` / `three_core` всё ещё компилируются и делают reference-запросы.
- Versioned electrical catalogs являются источником `power`, `section` и `bom`.
- Старый DB commercial seed отключён и при штатном seed удаляет demo/test
  строки неподдерживаемых типов.
- Старые `SelfRegulatingParams`, `Resistive*Params`, frontend reference
  plumbing, admin UI и недостижимое тело seed всё ещё находятся в source.
- Project import пока сохраняет специальный soft-stale путь старых типов.

## 4. Инварианты очистки

1. Не менять формулы `self_regulating_tt`, выбор серии/марки, units и границы
   температур.
2. Не удалять `system_type=self_regulating` и не переименовывать его в
   `self_regulating_tt`.
3. Не удалять рабочее напряжение из результата, snapshot, расчёта тока или
   секций. Удаляется только legacy-ввод/дефолт `220` и влияние напряжения на
   выбор марки.
4. Не выполнять silent remap старого типа в TT.
5. Не редактировать исторические Alembic-миграции. Новое состояние оформляется
   новой forward-only миграцией.
6. Не смешивать очистку типов кабеля с удалением `variant_number` /
   `legacy_variant_number`: UUID/slot bridge — отдельный риск и отдельный план.
7. Не смешивать с формулами резервуаров, агрегацией спецификации или
   production-каталогом.
8. Один commit — один vertical slice и один owner. Перед каждым slice —
   `git status --short`; чужой WIP сначала фиксируется его владельцем.
9. Только focused backend/frontend/E2E проверки. Общий прогон — только по
   отдельному запросу. Mobile-тесты не добавлять.

## 5. Порядок выполнения

### L0. Characterization и data gate

**Цель:** доказать канонический путь и разрешить последующее удаление.

Зафиксировать тестами до production-изменений:

- `system_type=self_regulating` запускает расчёт
  `cable_type=self_regulating_tt`;
- `self_regulating_tt` успешно проходит Heat → Electrical → Specification;
- новые calc/candidate/batch requests со `self_regulating`, `single_core` и
  `three_core` получают стабильный 422-код;
- `220 В` не появляется как default TT-запроса;
- legacy project import не может создать `ready`-результат.

До DB-slice выполнить read-only аудит как минимум для:

```text
cables_extended.cable_type
electrical_calculations.cable_type
electrical_calculation_revisions.cable_type
electrical_candidates.cable_type
electrical_variant_objects.system_type
electrical_variant_objects.requested_cable_type
background_tasks.payload
specifications, построенных из затронутых ЭР
```

**Hard stop:** неизвестные production-строки нельзя молча удалить. Для
демо-данных разрешена очистка; для неизвестных данных требуется экспорт или
явное подтверждение владельца.

### L1. Backend write cut

**Owner:** backend electrical contract.

Изменить только входные границы:

- calc, candidates, batch и per-object override принимают только
  `self_regulating_tt` как calculable `cable_type`;
- assignment mutation принимает только `system_type=self_regulating` из
  рассчитываемых систем;
- `resistive` запрещается для новых назначений стабильной диагностикой;
- import со старым `cable_type`, маркой ТЛТ или `system_type=resistive`
  отклоняется; soft-stale compatibility удаляется;
- query-параметры со старым типом дают стабильный 422, а не Pydantic-текст,
  silent fallback или пустой успешный ответ.

Read path пока сохраняется, чтобы можно было диагностировать и очистить
существующие строки.

**Focused proof:** HTTP-тесты на TT success и каждый запрещённый тип; import
reject; assignment optimistic concurrency для Самрег остаётся зелёной.

**Rollback:** revert только этого commit возвращает writers; БД ещё не менялась.

### L2. Frontend electrical runtime

**Owner:** frontend electrical, отдельный vertical slice.

Удалить:

- `single_core` / `three_core` из `CableTypeKey`, request types и layout models;
- ветки resistive в выборе марки, характеристиках, каталоге и params panel;
- автоматический payload `resistive -> single_core`;
- resistive assignment action/tab и связанные summary buckets из
  пользовательского workflow;
- фоновые запросы старого ТЛТ/resistive-каталога на странице ЭР;
- error guidance, относящийся только к `RESISTIVE_SECTION_NOT_FOUND`.

Оставить:

- `self_regulating` как тип назначения;
- `self_regulating_tt` как тип расчёта;
- `mineral/skin` read-only/unsupported состояние, пока отдельное решение не
  разрешит их удаление;
- TT manual cable options с backend.

**Focused proof:** typecheck, точные unit/integration тесты electrical owner,
network assertion `cable_type=self_regulating_tt`, отсутствие legacy controls.

**Desktop browser proof:** `1000`, `1280`, `1440x900`; assign Самрег, batch
calc, manual mark, stale/recalc, disabled specification при невалидном ЭР;
console/network без ошибок. Mobile не запускать.

### L3. Admin UI и admin API

**Owner:** admin; не смешивать с L2 из-за frontend PR budget.

Удалить:

- вкладку проверки резистивной формулы;
- `resistive_single` / `resistive_three` из `FormulaCheckRequest`;
- вкладки встроенных справочников «Кабели ТЛТ» и «Резистивные кабели»;
- старые типы из формы `DatabaseCableModal`;
- cable CRUD старой таблицы, если L0 подтверждает, что она не является
  источником актуальных TT-каталогов.

Администрирование актуальных TT-данных остаётся в versioned electrical catalog
UI/API. Accessory CRUD не затрагивается.

**Focused proof:** admin API 422 на удалённые formula types; frontend admin
tests; desktop browser проверяет отсутствие legacy tabs и наличие versioned
catalog page.

### L4. Backend dead code и static data

**Owner:** backend electrical/reference; при превышении размера разделить на
`schemas+formula-check`, `references`, `seed plumbing`.

Безопасные кандидаты после L1-L3:

- `SelfRegulatingParams` / `SelfRegulatingResult` старого ТЛТ;
- `ResistiveSingleCore*` и `ResistiveThreeCore*` schemas;
- отключённый `seed_demo_commercial_catalog` и используемые только им helpers;
- недостижимое тело `seed_cables` после unconditional `return`;
- `cables_tlt.json` и `resistive_cables.json`;
- соответствующие loader/cache/reference функции;
- `load_cable_catalog`, `_extended_cable_catalog_entry`,
  `_merge_commercial_cable_entry` и `tlt_catalog` plumbing, если consumer graph
  после L3 пуст;
- legacy commercial coefficients и tests, которые не читаются TT pipeline;
- тесты старых формул и старые cable-business E2E-сценарии.

Не удалять:

```text
cables_tt.json
section_catalog.json
electrical_tt_bom_v1.json
electrical_catalog_versions
calc_self_regulating_tt
TT final gate / snapshots / history
```

Старый E2E-файл можно удалить только после переноса всех общих assertion
(RBAC, UUID scope, stale lifecycle) в TT-сценарии. Потеря именно legacy coverage
допустима; потеря общего контракта — нет.

### L5. Data cleanup и schema drop

**Owner:** backend migration. Выполнять последним runtime-slice.

Рекомендуемая стратегия без обратной совместимости:

1. Повторить L0 data audit непосредственно перед миграцией.
2. Для затронутых legacy-ЭР сначала удалить/инвалидировать производные
   specification rows и candidates.
3. Удалить legacy calculation revisions и calculations.
4. Assignment с `system_type=resistive` или старым `requested_cable_type`
   перевести в `unassigned`, очистить requested type и записать явную
   диагностическую причину `legacy_electrical_type_removed`.
5. Удалить старые `CableExtended` rows.
6. После доказанного отсутствия consumers удалить `cables_extended` и
   PostgreSQL enum `cable_type` целиком. Канонические TT-каталоги используют
   отдельную versioned-модель и от этой таблицы не зависят.

Миграция должна fail closed при неожиданных строках, а не выбирать кабель за
пользователя. Для demo-базы допустим полный purge производных legacy-данных;
Heat, объекты и проекты сохраняются.

**Focused proof:** upgrade на БД с каждым legacy-типом; идемпотентное конечное
состояние; fresh DB upgrade; FK/cascade assertions; актуальный TT расчёт и
спецификация после миграции.

**Rollback:** schema drop считать необратимым. Перед ним обязательны backup и
успешный dry-run миграции на копии БД. Исторические Alembic-файлы не править.

### L6. Contract ratchet и документация

После runtime и migration commits:

- добавить scope-aware guard, запрещающий `single_core`, `three_core`, старый
  расчётный `self_regulating` и TT-default `220` в production runtime;
- исключить из guard исторические миграции и явно архивные документы;
- не запрещать строку `system_type=self_regulating`;
- актуализировать `case1-backend-status.md` и
  `case1-section-checklists.md` по фактическому HEAD;
- пометить старые execution prompts как superseded, не переписывать их под вид
  изначально актуальных;
- удалить stale утверждения о несуществующих заглушках, отсутствующих seed,
  admin API и persistence.

Этот docs-slice выполняется после кода, чтобы документация не объявляла
удаление раньше времени.

## 6. Отдельно не трогать

Следующие совпадения слова `legacy` не относятся к этой инициативе:

- `legacy_variant_number` и UUID bridge ЭР;
- исторические Alembic migrations `0027`, `0029`, `0031`, `0037`;
- тест `test_legacy_electrical_variant_writes.py`, пока он проверяет UUID/slot
  identity, а не поддержку старых кабельных формул;
- legacy fallback имён полей в read-only history, если он нужен для уже
  канонических TT revisions;
- spherical tank migration и другие Heat-задачи;
- значение `legacy` в каталогах спецификации.

Удаление numeric ER bridge требует отдельного data audit и отдельного плана.

## 7. Финальная приёмка

Очистка завершена только если одновременно доказано:

1. Новый расчёт и кандидаты принимают только `self_regulating_tt`.
2. Назначение «Самрег» продолжает использовать
   `system_type=self_regulating`.
3. Старые типы и марки получают стабильный reject; silent remap отсутствует.
4. В пользовательском и admin UI нет ТЛТ/R1/R3 controls и фоновых запросов.
5. В runtime source отсутствуют старые schemas, seed body, JSON-каталоги и
   formula/reference branches.
6. В БД нет старых расчётов, candidates, assignments и catalog rows.
7. TT versioned catalogs, exact mark, 230 В downstream, sections, history и
   specification остаются рабочими.
8. Focused desktop E2E проходит Heat → Electrical → Specification.
9. Полный test suite имеет статус `NOT RUN`, если пользователь отдельно его не
   запросил.

## 8. Рекомендуемая последовательность commits

```text
test(electrical): characterize TT-only cutover
fix(backend): reject new legacy electrical writes
refactor(frontend): remove legacy electrical runtime branches
refactor(admin): remove legacy cable and formula surfaces
refactor(backend): remove dead legacy schemas catalogs and seed plumbing
refactor(db): purge legacy electrical data and drop obsolete catalog schema
docs(electrical): reconcile Case 1 status after legacy removal
```

Каждый commit должен быть самостоятельно проверяемым и откатываемым до
необратимого DB-slice. Широкий commit «удалить всё legacy» запрещён.
