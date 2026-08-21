# Промпт-план: спецификация — production completion после SPEC-CANON

**Дата:** 2026-08-03

**Контур:** `backend/**` является основным; адаптация `frontend/**` выполняется отдельным slice
только после стабилизации API; финальное доказательство живёт в `e2e/**`

**Статус:** исполнимый continuation prompt по остаточным замечаниям 15–21

**Обратная совместимость:** не требуется

**Версионирование specification API:** отдельный V2 не создавать; поддерживается один
канонический контракт под общим техническим префиксом `/api/v1`

**Старт реализации:** `SPEC-FINAL-01`

Этот документ продолжает, а не повторяет выполненную часть
[`specification-backend-canonical-continuation-prompt.md`](./specification-backend-canonical-continuation-prompt.md).
Не восстанавливай удалённые aliases, numeric identity или старые builders только потому, что они
упоминаются в историческом
[`specification-backend-implementation-prompt.md`](./specification-backend-implementation-prompt.md).

Утверждённая нормализация формул остаётся в
[`guest-specification-calculation-algorithm.md`](./guest-specification-calculation-algorithm.md).
Настройки specification уже вынесены из Heat по
[`specification-settings-scope-rewrite-prompt.md`](./specification-settings-scope-rewrite-prompt.md);
этот перенос не выполнять повторно.

## Роль и конечный результат

Ты ведущий backend-инженер TLT. Закрой production-контур спецификации без фальшивых данных и
параллельных legacy-путей:

```text
approved immutable catalog + real electrical inputs
  → UUID-scoped preflight
  → zero/one/many candidate selection
  → persisted server-side selection
  → normalized Decimal calculation
  → aggregation before presentation grouping
  → atomic per-ER persistence
  → canonical snapshot/report/project IO
  → HTTP and E2E proof on a freshly seeded database
```

Backend является единственным источником формул, применимости, candidate groups, выбранной
номенклатуры, stale и blocking diagnostics. Frontend только вводит настройки, показывает серверное
состояние и отправляет UUID выбранной строки каталога. Frontend не вычисляет формулы, group keys,
кандидатов и не подставляет mock/default, если данных нет.

Один запуск выполняет ровно один выбранный slice, один conventional commit и останавливается.
Следующий slice автоматически не начинать.

## Как читать замечания 15–21

| Замечание | Вердикт ревизии | Где закрывается |
|---|---|---|
| 15. Snapshot-рефактор не завершён | Частично справедливо. Массовое утверждение про оставшиеся `variant_number/generation_options` устарело, но найдены реальные дефекты project IO, report consumer и тестового контракта | `SPEC-FINAL-01` |
| 16. Нет production seed каталога | Справедливо | `SPEC-FINAL-02`, затем `SPEC-FINAL-03` |
| 17. Ex/R_gr и номенклатура не авторитетны | Справедливо и является business-data hard stop | `SPEC-FINAL-02` |
| 18. `ceil` и «Общие материалы» | Частично справедливо. Агрегация материалов должна быть до presentation grouping; коробки остаются явным исключением с расчётом по трубе | `SPEC-FINAL-04` |
| 19. Выборы каталога живут только в запросе | Справедливо | backend `SPEC-FINAL-05`, затем frontend `SPEC-FINAL-06` |
| 20. Legacy builders ещё лежат в репозитории | Частично справедливо. Production-вызов уже запрещён, но физические файлы и legacy-тесты следует удалить после переноса покрытия | `SPEC-FINAL-07` |
| 21. Нет полного HTTP E2E zero/many → choose → generated | Справедливо | `SPEC-FINAL-08` |

Не делай из пункта 15 глобальный поиск с удалением каждого `variant_number`: numeric slot может
оставаться частью электротехнического домена. Он запрещён только как identity/data plane
канонической спецификации.

## Неподвижные решения

1. Спецификация идентифицирует ЭР только UUID `electrical_variant_id`.
2. Один ЭР имеет собственные строки, snapshot, fingerprint, lock и stale-state. Разные ЭР не
   объединяются.
3. Только `pipe` сейчас является поддержанным типом объекта. Не добавляй формулы резервуаров или
   иных типов без отдельного утверждённого источника.
4. Отсутствующие `Iдоп`, q1/q2, Ex/R_gr-правила, коды клея или лент не угадываются и не мокируются.
   Неполные данные блокируют формирование стабильным diagnostic code.
5. Явные `false` и `0` являются значениями; отсутствие ими не подменяется.
6. Кандидат не выбирается по первой строке, сортировке, mark/name/article или старому snapshot.
7. Все количества рассчитываются через `Decimal`; float не является промежуточным источником
   расчёта.
8. `grouping_mode` меняет представление строк, но не итоговые количества материалов.
9. Активировать можно только immutable, approved и complete версию каталога.
10. Прошлый snapshot — audit/reload artifact, а не каталог и не источник новых расчётов.
11. Ошибка импорта или генерации не оставляет частично обновлённый проект либо частично записанный
    ЭР.
12. Отдельного specification V2, compatibility reader и dual-write не создавать.
13. Политика кандидатов уже утверждена `SPEC-DEC-05`: ноль кандидатов блокирует ЭР, один кандидат
    выбирается автоматически, несколько кандидатов требуют явного выбора инженера.
14. Заблокированная попытка формирования не создаёт `blocked` snapshot. Канонические состояния
    отчёта: `absent`, `current`, `stale`.

## Внешние решения и предсказуемость delivery

Код не может заменить владельца бизнес-правил. До начала реализации заведи текущий execution
register в датированной папке `docs/audit/YYYY-MM-DD-specification-production/`. Для каждого пункта
обязательны имя владельца, конкретный артефакт решения, целевая дата и статус. Если владелец или дата
не назначены, production delivery считается `UNSCHEDULED`, даже если безопасная кодовая часть может
продолжаться.

| Decision ID | Владелец по роли | Обязательный артефакт | Нужен до |
|---|---|---|---|
| `SPEC-OWNER-EX-RGR` | владелец бизнес-правил коробок | утверждённые условия Ex/R_gr для каждой из 12 строк, включая operator/value либо осознанное `not_applicable` | полной приёмки `SPEC-FINAL-02` и старта `SPEC-FINAL-03` |
| `SPEC-OWNER-MATERIALS` | владелец номенклатурной базы | коды, units, capacities, applicability и source/approval для клея и обеих лент | полной приёмки `SPEC-FINAL-02` и старта `SPEC-FINAL-03` |
| `SPEC-OWNER-COMMON` | владелец specification UX/правил | исчерпывающая таблица category → `object section`/`common` с подтверждением для каждого типа материала | полной приёмки `SPEC-FINAL-04` |
| `SPEC-COORD-MIGRATION` | владелец electrical WIP вместе с интегратором ветки | зафиксированный commit/head либо письменное снятие текущего migration/seed WIP | старта `SPEC-FINAL-03` и `SPEC-FINAL-05` |

Утверждённый алгоритм уже требует раздел «Общие материалы», но не перечисляет исчерпывающе все
категории этого раздела. Решение `SPEC-OWNER-COMMON` фиксирует только mapping отображения, а не
переписывает утверждённые формулы.

### Coordination gate для electrical WIP

На baseline ревизии `seeds.py` изменён чужим electrical-потоком, а migration
`0039_repair_electrical_catalog_registry.py` ещё не является стабильной частью общей ветки. В начале
каждого slice перепроверь это, не полагайся на номер из этого документа.

1. `SPEC-FINAL-01` можно выполнять, если его файлы чисты и не пересекаются с актуальным WIP.
2. `SPEC-FINAL-03` нельзя начинать, пока владелец не освободил `seeds.py`, даже если новый migration
   этому slice не понадобится.
3. `SPEC-FINAL-05` нельзя начинать, пока migration head не зафиксирован владельцем WIP.
4. Допустимы только два исхода координации:
   - electrical WIP закоммичен; specification migration создаётся от подтверждённой committed head;
   - electrical WIP официально снят; исполнитель заново определяет committed head и следующий
     свободный revision.
5. Нельзя ссылаться `down_revision` на untracked-файл, копировать, дописывать, stage или commit
   чужой migration/seed WIP из specification slice.
6. В отчёте migration slice укажи `migration_base_commit`, `down_revision` и подтверждение владельца
   WIP. Без этих трёх значений migration gate не пройден.

## Правила выполнения каждого slice

Перед кодом:

1. Прочитай корневой `AGENTS.md`. При затрагивании frontend обязательно полностью прочитай
   `frontend/AGENTS.md` и выполни его gates.
2. Выполни `git status --short`; чужой WIP не исправляй, не форматируй и не добавляй в commit.
3. Перепроверь фактических consumers через `rg`; этот документ описывает контракт, но другой поток
   мог уже закрыть отдельный residual.
4. Сначала добавь characterization/regression test, который падает по реальному дефекту.
5. Если нужен новый migration, проверь актуальную цепочку Alembic и несохранённые migrations других
   потоков. Не создавай параллельную голову.

После кода:

1. Запусти focused tests выбранного slice.
2. Выполни `git diff --check` и повторный `git status --short`.
3. Проверь diff пофайлово; не используй `git add .`.
4. В commit добавь только собственные файлы slice.
5. Напиши фактически выполненные проверки. `NOT RUN` не является `PASS`.
6. Сделай указанный conventional commit и остановись.

## SPEC-FINAL-01. Закрыть остаточные consumers канонического snapshot

### Цель

Устранить реальные остатки рефактора, не возвращая numeric specification identity и не переписывая
корректный электротехнический код.

### Обязательная работа

1. В `project_io_service.py` валидировать весь specification-раздел до любого удаления или
   изменения гостевого проекта.
2. Для старого/versioned project payload, который больше не поддерживается, вернуть стабильный
   `422` до мутации. Отсутствие обратной совместимости не разрешает сначала удалить проект, а потом
   отклонить payload.
3. В каноническом import при одновременном наличии `variant_key` и `electrical_variant_id`:
   разрешить обе ссылки и потребовать, чтобы они указывали на один ЭР; конфликт отклонить.
4. После resolution выявлять дубликаты по итоговому UUID ЭР, а не только по исходной форме ключа.
5. Сделать import спецификаций атомарным для owner и guest: любой validation/domain failure
   сохраняет исходный проект без частичной замены.
6. В `report_service.py` построить одну каноническую report projection:

   ```text
   state: absent | current | stale
   electrical_variant_id: UUID
   items: строки только при state=current
   stale_reason: строка только при state=stale
   stale_at: timestamp только при state=stale
   stale_details: object только при state=stale
   retained_item_count: число сохранённых, но исключённых строк только при state=stale
   ```

   `state` — единственный источник выбора report/template branch. `is_partial`, `excluded_groups`,
   snapshot `status`, snapshot `blocked`, а также дублирующий report-флаг `is_stale` удалить из
   report payload/context и шаблонов.
7. Правила определения state:
   - specification row отсутствует → `absent`, `items=[]`;
   - row существует и `Specification.is_stale=false` → `current`, строки входят в отчёт;
   - row существует и `Specification.is_stale=true` → `stale`, строки исключаются из закупочных
     totals, но `retained_item_count` показывает сохранённое число;
   - заблокированная новая попытка не создаёт `blocked` snapshot: при отсутствии прежней строки
     состояние остаётся `absent`, а прежняя stale-строка остаётся `stale`.
8. Тесты Decimal/Pydantic должны проверять публичный отказ и diagnostic, а не случайный внутренний
   класс исключения (`ValidationError` против `decimal.InvalidOperation`). При необходимости
   нормализовать исключение на schema/service boundary.
9. Перепроверить согласованность сигнатур `save_items()` и `_upsert_specification()` через прямых
   callers. Не добавлять `variant_number` или `generation_options` ради старых тестов.
10. На этом slice repo-lock остаётся lock уровня imports: он проверяет только specification API и
    канонические generation/service consumers и запрещает им импортировать legacy builders/symbols.
    Не добавлять здесь проверку физического отсутствия legacy-файлов, не сканировать весь `app/**`
    и не ломать допустимую электротехническую модель вариантов. Lock уровня file absence вводится
    атомарно с удалением файлов только в `SPEC-FINAL-07`.

### Доказательства

- regression: неподдерживаемый project payload возвращает `422`, исходный guest-проект остаётся;
- regression: конфликт двух identity-полей отклоняется до записи;
- regression: две строки, разрешившиеся в один UUID ЭР, отклоняются как duplicate;
- regression: canonical project export/import/export сохраняет UUID, items и snapshot;
- report tests отдельно доказывают `absent`, `current` и `stale`; phantom keys отсутствуют в каждом
  report payload и render context;
- unit/integration tests `project_io`, `report_service`, `specification_service` зелёные;
- import-level repository lock зелёный и ещё не требует физического удаления legacy-файлов;
- backend импортируется и health endpoint отвечает после изменений.

Минимальный набор для выбора по актуальному tooling:

```text
backend/app/tests/integration/api/test_project_io.py
backend/app/tests/integration/api/test_report_no_mixing.py
backend/app/tests/integration/api/test_reports.py
backend/app/tests/unit/services/test_project_io_helpers.py
backend/app/tests/unit/services/test_report_service_unit.py
backend/app/tests/unit/services/test_specification_service_unit.py
```

### Не входит

- seed каталога;
- изменение формул;
- удаление электротехнического `variant_number` вне specification boundary;
- исправление чужого electrical WIP.

### Commit и остановка

```text
fix(specification): close canonical snapshot consumers
```

После commit остановиться.

## SPEC-FINAL-02. Провести границу авторитетности каталога

### Цель

Сделать невозможной активацию каталога, где provisional-заполнители выдаются за production
business rules.

### Обязательная работа

1. Разделить приём draft/import и activation:
   - draft может хранить неполный документ для административной проверки;
   - active версия обязана быть immutable, approved и complete;
   - generate использует только active approved complete.
2. Заменить scalar-семантику `"unused"` точным discriminated condition object. Для каждого условия
   допустимы ровно три формы:

   ```json
   {"mode": "match", "operator": "eq", "value": true}
   {"mode": "not_applicable", "decision_ref": "SPEC-OWNER-EX-RGR/..."}
   {"mode": "unresolved"}
   ```

   Правила схемы:
   - `mode=match`: `operator` и typed `value` обязательны, `decision_ref` запрещён;
   - `mode=not_applicable`: непустой `decision_ref` обязателен, `operator/value` запрещены;
   - `mode=unresolved`: допустим только в draft и всегда делает catalog incomplete;
   - старый scalar `"unused"` не нормализуется и отклоняется; обратная совместимость не нужна;
   - для Ex разрешён только утверждённый boolean match, например `eq true/false`;
   - для R_gr numeric value хранится Decimal-строкой, а допустимый operator берётся только из
     `SPEC-OWNER-EX-RGR`, не выбирается разработчиком.
3. Provenance условия образуют `item.source_ref` + catalog source/version/source checksum. Для
   `not_applicable` дополнительно обязателен `decision_ref`, указывающий на явное решение владельца.
   Не дублировать checksum в каждой ячейке, если он однозначно принадлежит immutable catalog version.
4. Для каждой строки базовой матрицы коробок потребовать явную, подтверждённую владельцем
   диспозицию Ex и R_gr в этой схеме. Все 12 строк должны ссылаться на один проверяемый набор
   owner-решений либо на точные построчные decision refs.
5. Каталог с `unresolved`, raw `"unused"` или двенадцатью недоказанными `not_applicable` условиями,
   из-за которых все коробки подходят любой трубе, не может быть activated.
6. Не выдумывать operator или пороги R_gr. Если `SPEC-OWNER-EX-RGR` не закрыт, activation остаётся
   заблокированной.
7. Для клея, стеклоленты и алюминиевой ленты требовать подтверждённые:
   - nomenclature UUID/code;
   - единицу измерения;
   - package/capacity;
   - применимость;
   - первоисточник и approval reference.
8. Проверить точные 12 identity строк базовой матрицы, их уникальность и отсутствие silently
   duplicated conditions.
9. Зафиксировать upstream boundary:
   - q1/q2 переиспользуются только из уже утверждённого electrical catalog source;
   - `Iдоп` должен прийти реальным входом electrical calculation/readiness;
   - specification catalog не seeds, не вычисляет и не мокирует `Iдоп`.
10. Возвращать стабильные machine-readable issue codes для каждой причины неполноты. Не заставлять
   frontend разбирать русский текст.
11. Synthetic fixtures допустимы только внутри тестов и никогда не являются bundled production
    payload.

### Business-data hard stop

Если владелец правил не дал матрицу Ex/R_gr или подтверждённые коды/ёмкости материалов:

- реализовать fail-closed validation, тесты и документацию;
- сохранить каталог draft/inactive;
- явно перечислить отсутствующие решения;
- не помечать каталог production-ready;
- не начинать `SPEC-FINAL-03`, потому что seed непроверенных значений запрещён.

### Доказательства

- raw `"unused"` не проходит canonical import schema;
- `mode=unresolved` сохраняется только как draft и не активируется;
- `not_applicable` без валидного `decision_ref` не активируется;
- all-not-applicable матрица без подтверждённого owner decision не активируется;
- пропуск одного Ex/R_gr disposition блокирует activation;
- неподтверждённый code/capacity блокирует activation;
- полный owner-approved документ активируется;
- повторная activation не мутирует immutable version/checksum;
- generate без допустимой active версии возвращает точный `503 SPEC_CATALOG_UNAVAILABLE`;
- admin/import diagnostics стабильны и структурированы.

Основные тестовые зоны:

```text
backend/app/tests/unit/services/test_specification_catalog_service.py
backend/app/tests/integration/api/test_specification_catalog_admin.py
backend/app/tests/integration/db/test_specification_catalog_migration.py
```

### Commit и остановка

Если закрыт кодовый slice, даже когда owner-data hard stop остаётся:

```text
fix(specification): reject placeholder catalog authority
```

В отчёте отдельно написать `CODE COMPLETE / BUSINESS DATA BLOCKED`. После commit остановиться.

## SPEC-FINAL-03. Добавить idempotent bundled seed спецификации

### Зависимость

Начинать только после того, как `SPEC-FINAL-02` получил реальный approved complete payload. Нельзя
делать этот slice зелёным на provisional `spec_accessories.json`, `box_ex_rgr_matrix.json` или
test fixture. Дополнительно `SPEC-COORD-MIGRATION` должен быть закрыт: `seeds.py` освобождён
владельцем electrical WIP, а актуальная Alembic head подтверждена committed commit hash.

### Цель

Новая dev/prod база после штатного seed сразу имеет одну рабочую версию каталога спецификации, но
пользовательская активная approved версия не перезаписывается.

### Обязательная работа

1. Добавить canonical bundled payload в `backend/app/reference_data/` с явной schema version,
   source version, approval reference и checksum.
2. Payload должен быть тем же импортным документом, который проходит публичную validation/activation
   boundary. Не создавать второй «внутренний» формат seed.
3. Реализовать service-level idempotent bootstrap:
   - одинаковый документ создаётся один раз;
   - повторный запуск не меняет UUID/version/checksum;
   - существующая пользовательская active approved complete версия не заменяется;
   - incomplete/corrupt bundled payload приводит к явной ошибке, а не частичному seed.
4. Добавить CLI-режим:

   ```text
   python -m app.seeds --specification-catalog-only
   ```

5. Включить тот же bootstrap в штатный full seed до demo generation, которая зависит от каталога.
6. Не смешивать specification catalog seed с electrical catalog repair WIP. До первого изменения
   `seeds.py` получить подтверждение владельца и записать base commit в execution register. Если
   нужен migration, создавать его только от подтверждённой committed Alembic head; untracked head
   не считается базой.
7. Сохранить честный fail-closed режим: удалённая/повреждённая active версия всё ещё даёт
   `503 SPEC_CATALOG_UNAVAILABLE`, а не fallback на static JSON.

### Доказательства

- empty database → specification-only seed → ровно одна active approved complete версия;
- второй запуск полностью идемпотентен;
- full seed даёт тот же результат;
- заранее активированная пользовательская approved версия остаётся active;
- corrupt/incomplete bundled payload не оставляет полузаписанной версии;
- на чистой seeded базе валидный generate не падает с `SPEC_CATALOG_UNAVAILABLE`;
- CLI help документирует новый режим.

### Commit и остановка

```text
feat(specification): seed approved BOM catalog
```

После commit остановиться.

## SPEC-FINAL-04. Исправить агрегацию, `ceil` и общие материалы

### Цель

Количество материала не зависит от того, как строки затем разложены по presentation sections.
Округление применяется в утверждённой бизнес-точке, а не по случайным секциям типа объекта.

### Decision prerequisite

До изменения presentation mapping получить `SPEC-OWNER-COMMON`: исчерпывающую таблицу для
`cable`, `connection_kit`, `repair_kit`, `sealant`, `fiberglass_tape`, `aluminium_tape`, `box` с
точным значением `object section` или `common`. В таблице отдельно указать, влияет ли mapping только
на отображение либо также на нормативный aggregation bucket. По умолчанию он влияет только на
отображение; обратное допустимо лишь при явном owner-решении с источником.

Без этой таблицы можно подготовить characterization и доказать formula aggregation, но нельзя
завершить общий slice, реализовать mapping эвристикой или обещать дату полной поставки.

### Нормативная агрегация

В пределах одного ЭР:

1. Кабель: суммировать `required_order_length_m` по точному выбранному SKU.
2. Соединительные комплекты: суммировать число секций по температурной группе и выбранному kit,
   затем один `ceil` по capacity.
3. Ремонтные комплекты: суммировать `actual_installed_length_m` по температурной группе и
   выбранному kit, затем один `ceil` по capacity.
4. Клей/герметик: сначала получить итоговое количество connection + repair kits, затем суммировать
   по выбранному material item и применить один `ceil` по capacity.
5. Стеклолента: вычислить raw length каждого объекта, суммировать по выбранной ленте в нормативном
   bucket и применить один `ceil`.
6. Алюминиевая лента: вычислить raw length каждого объекта, суммировать по выбранному item в
   нормативном bucket и применить один `ceil`.
7. Коробки — осознанное исключение: подобрать approved row и применить её `ceil/floor/min` к каждой
   трубе, затем суммировать строки одинакового box code. Не переносить общий one-ceil на коробки.
8. Никогда не агрегировать разные ЭР.

Точный состав bucket определяется утверждённым алгоритмом и выбранным catalog item. Нельзя
добавлять object type как границу округления только ради presentation grouping.

### Обязательная работа

1. Отделить calculation/aggregation stages от финального grouping строк.
2. Доказать, что `separate_by_object_type` и `merge_materials` дают одинаковые grand totals по
   identity материала при одинаковом входе.
3. В `separate_by_object_type` сформировать явный раздел «Общие материалы» для позиций, которые по
   утверждённой модели принадлежат ЭР в целом, а не конкретному типу объекта.
4. До изменения mapping добавить characterization текущих категорий, затем перенести точную
   таблицу `SPEC-OWNER-COMMON` в typed mapping и параметризованный тест без ручного дублирования.
5. Если decision register не содержит закрытого `SPEC-OWNER-COMMON`, остановиться после
   characterization. Не использовать эвристику по имени, unit или article.
6. Сохранить Decimal/provenance: snapshot объясняет raw sum, capacity, rounding rule и финальный
   quantity.
7. Не менять pipe-level box semantics и не применять R_gr к kit/cable/tape без approved row rule.

### Доказательства

- counterexample с двумя object sections показывает один нормативный `ceil`, а не сумму двух
  округлений;
- результаты `separate_by_object_type` и `merge_materials` имеют одинаковые grand totals;
- separate-mode содержит корректный «Общие материалы»;
- параметризованный тест проходит по каждой category из `SPEC-OWNER-COMMON` и не допускает новую
  unmapped category;
- box fixture подтверждает расчёт по каждой трубе, затем sum одинакового code;
- изменение порядка объектов не меняет quantity, identity и checksum;
- два ЭР с одинаковой номенклатурой остаются раздельными;
- normalized goldens выполняются через production calculators, а не только проверяются как JSON.

Основные тестовые зоны:

```text
backend/app/tests/unit/formulas/test_specification_calculators.py
backend/app/tests/unit/formulas/test_specification_box_calculator.py
backend/app/tests/unit/formulas/test_specification_grouping.py
backend/app/tests/unit/services/test_specification_bom_builder.py
backend/app/tests/fixtures/specification_normalized_goldens.json
```

### Commit и остановка

```text
fix(specification): aggregate BOM before grouping
```

После commit остановиться.

## SPEC-FINAL-05. Персистить catalog selections на сервере

### Цель

Пользователь выбирает кандидата один раз. Reload и повторная генерация используют валидный
серверный выбор без обязанности frontend пересылать его в каждом generate request.

Этот slice строго backend/API-first: не изменять `frontend/**` и не смешивать серверную migration с
UI-адаптацией. Frontend переключается отдельным `SPEC-FINAL-06` после стабилизации HTTP-контракта.

### Coordination prerequisite

`SPEC-COORD-MIGRATION` закрыт, base commit и committed Alembic head записаны в execution register.
Не создавать migration от untracked electrical head и не добавлять чужой migration в свой commit.

### Серверный контракт

1. Хранить явный выбор инженера для групп с несколькими кандидатами в specification-owned
   persistence с ключом как минимум
   `(project_id, electrical_variant_id, candidate_group_key)`.
2. Хранить UUID catalog version и catalog item, fingerprint/candidate-set identity, timestamps и
   concurrency/version token.
3. После построения применимой candidate group действует точная политика `SPEC-DEC-05`:
   - ноль кандидатов → blocking diagnostic;
   - один кандидат → backend автоматически использует единственный UUID без
     `selection_required`;
   - больше одного → явный request choice, иначе сохранённый валидный серверный choice, иначе
     `selection_required`.
4. Автовыбор единственного кандидата является derived state: отдельная пользовательская selection
   row не требуется, но effective item UUID, `selection_source=auto_single` и candidate fingerprint
   записываются в generation snapshot.
5. Для явного выбора snapshot содержит `selection_source=explicit`. «Первый по сортировке» при
   нескольких кандидатах и любой silent fallback запрещены.
6. Явный выбор валиден только внутри возвращённой candidate group и той catalog version, для
   которой он был рассчитан.
7. Смена active catalog, входов применимости или candidate set инвалидирует сохранённый выбор и
   делает связанную спецификацию stale:
   - `1 → N` требует нового явного выбора;
   - `N → 1` инвалидирует прежний explicit choice и использует новый `auto_single` только при
     следующей явной генерации;
   - неизменный набор сохраняет валидный explicit choice.
8. Смена выбора одного ЭР не stale-ит другие ЭР.

### Обязательная работа

1. Спроектировать canonical GET/PUT boundary для selections. Рекомендуемая форма:

   ```text
   GET /api/v1/specifications/{project_id}/variants/{electrical_variant_id}/catalog-selections
   PUT /api/v1/specifications/{project_id}/variants/{electrical_variant_id}/catalog-selections
   ```

   Если существующий unversioned route лучше выражает тот же ресурс, использовать его, но не
   создавать V2.
2. PUT заменяет целевую коллекцию атомарно, проверяет project access, UUID ЭР, group membership,
   catalog version и optimistic concurrency.
3. Допускается оставить optional selections в generate как atomic «сохранить и сформировать», но
   после успешной команды backend обязан персистить явные choices для multi-candidate groups.
   Клиент не является долговременным store.
4. Preflight/generate response возвращает effective selections и typed missing/stale candidate
   groups, включая `selection_source=auto_single|explicit|none`.
5. Включить effective selections, source и candidate fingerprint в generation fingerprint/snapshot.
6. Включить selections в project export/import. Импорт валидирует references, дубликаты и
   конфликты до записи и остаётся атомарным.
7. Миграция должна иметь подтверждённую единственную committed head, foreign keys, uniqueness и
   безопасный downgrade. В migration test выполнить upgrade → downgrade → upgrade.
8. API/OpenAPI tests фиксируют typed GET/PUT payload, concurrency token, permissions и стабильные
   diagnostic codes до начала frontend slice.

### Доказательства

- zero candidates → typed blocking diagnostic;
- one candidate → автоматический `auto_single`, без selection row и без `selection_required`;
- many candidates без saved/request choice → `selection_required`;
- PUT valid choice → reload → GET возвращает тот же выбор;
- последующий POST generate без повторной передачи selections успешно использует сохранённый
  explicit choice;
- `1 → N` и `N → 1` выполняют зафиксированную invalidation policy;
- UUID из чужой group/version отклоняется;
- catalog/candidate change инвалидирует выбор и не делает silent fallback;
- два конкурирующих PUT дают детерминированный version conflict;
- выбор и stale одного ЭР изолированы от другого;
- project export/import round-trip сохраняет валидные selections.

### Commit и остановка

```text
feat(specification): persist ER catalog selections
```

После commit остановиться.

## SPEC-FINAL-06. Переключить frontend на серверные selections

### Зависимость и scope

Начинать только после committed `SPEC-FINAL-05` и стабильного OpenAPI-контракта. Это отдельный
frontend slice и отдельный commit. Перед работой полностью прочитать `frontend/AGENTS.md`, явно
маршрутизировать slice через единственную ACTIVE frontend-очередь и выполнить все обязательные
frontend/browser gates. Требование «минимальная адаптация» не отменяет эти gates.

### Цель

Frontend перестаёт быть долговременным владельцем catalog selections и использует каноническое
серверное состояние без повторения candidate business logic.

### Обязательная работа

1. Сгенерировать/выровнять typed API client для GET/PUT selections и effective selection state из
   preflight/generate response.
2. После `selection_required` показывать только candidate groups, возвращённые backend. Не строить
   group key, применимость, candidate count или auto-select на клиенте.
3. Для одного кандидата принять `auto_single` из ответа без открытия окна выбора.
4. Для нескольких кандидатов отправить выбранный catalog item UUID один раз через canonical PUT
   либо согласованный atomic generate command.
5. После reload заново получить серверное состояние. Local mutation/query cache не является
   источником выбора и может быть полностью очищен без потери выбора.
6. Показать typed состояния `selection_required`, `saved explicit`, `auto_single`, `stale` и
   blocking diagnostic без ветвления по русскому тексту ошибки.
7. Не менять formulas, group keys, catalog applicability и stale resolution во frontend.
8. Не включать backend/migration cleanup в этот commit.

### Доказательства

- component/API tests: multi-candidate choice сохраняется ровно один раз;
- reload с очищенным client cache восстанавливает explicit choice с backend;
- one candidate отображается как `auto_single` без диалога выбора;
- stale choice снова показывает backend candidate group;
- zero candidates показывает blocking state и не предлагает fake/default;
- browser proof состояний initial → selection required → saved → reload → stale;
- обязательные viewport, overflow, geometry, accessibility и console checks из frontend gates;
- diff не содержит backend/migration файлов.

### Commit и остановка

```text
feat(specification): use persisted catalog selections
```

После commit остановиться.

## SPEC-FINAL-07. Физически удалить legacy builders

### Зависимость

Начинать по последовательности после committed `SPEC-FINAL-06`. Дополнительно production
calculators и tests из `SPEC-FINAL-04` должны полностью перенести ценное покрытие. Удаление файлов
не должно уменьшить доказанность формул.

### Цель

В репозитории остаётся один исполняемый путь построения спецификации.

### Обязательная работа

1. Через `rg` перечислить всех consumers:
   - `backend/app/formulas/specification/builder.py`;
   - `backend/app/formulas/specification/full_builder.py`;
   - `build_basic_specification`;
   - legacy source mapping/static runtime loaders.
2. Перенести уникальные полезные assertions в canonical calculator/service tests.
3. Удалить физические legacy builders и тесты, которые существуют только для них.
4. Если `source_mapping.py` или provisional static JSON больше не имеет consumers, удалить его из
   production runtime. Исторические первоисточники можно сохранить только как явно помеченное
   evidence/docs, не как fallback loader.
5. Удалить устаревшие comments/docstrings seed и perf guards, которые импортируют legacy.
6. Только на этом slice заменить/усилить import-level repo-lock из `SPEC-FINAL-01` до file-level
   lock, атомарно с удалением consumers:
   - legacy files отсутствуют;
   - production imports отсутствуют;
   - legacy symbols отсутствуют;
   - static provisional data не читается generation path.
   До этого commit file-absence assertion не добавлять. Perf tests/scripts сначала переключить на
   canonical builder, затем удалить legacy и запустить новый lock в той же рабочей копии.
7. Не удалять одноимённые электротехнические сущности вне specification scope без отдельного
   доказательства.

### Доказательства

- consumer search перед удалением сохранён в отчёте;
- после удаления `rg` не находит production consumers/symbols;
- canonical unit/integration suite собирается без skipped legacy substitute;
- normalized goldens и performance guard используют канонический builder;
- backend import/health зелёные.

### Commit и остановка

```text
refactor(specification)!: remove legacy builders
```

После commit остановиться.

## SPEC-FINAL-08. Закрыть HTTP/E2E production acceptance

### Цель

Доказать реальный пользовательский цикл на чистой базе с bundled approved catalog, а не только
изолированные unit/service cases.

Начинать только после committed `SPEC-FINAL-01`–`SPEC-FINAL-07` и закрытых обязательных решений
decision register.

### Обязательный положительный HTTP-сценарий

1. Поднять/очистить тестовую БД штатным migration + seed путём.
2. Создать проект, поддержанный pipe object, актуальный calculation и UUID ЭР с реальными upstream
   input/readiness.
3. Первый `POST generate` без выбора для группы с несколькими кандидатами возвращает точный typed
   `selection_required` и список из `N` применимых кандидатов.
4. Выбрать UUID ровно одного кандидата из ответа и сохранить его серверной командой.
5. Второй `POST generate` возвращает точный `generated`, UUID спецификации и строки.
6. `GET` по UUID ЭР возвращает persisted current snapshot/items.
7. После reload/новой клиентской сессии повторный generate без пересылки selections использует
   сохранённый выбор и остаётся детерминированным.
8. Проверить, что другой ЭР проекта не был изменён.
9. Отдельно выполнить single-candidate сценарий: backend возвращает `auto_single`, UI не просит
   выбора, snapshot содержит effective item UUID и candidate fingerprint.

### Обязательные отрицательные сценарии

- отсутствующий active catalog → `503 SPEC_CATALOG_UNAVAILABLE`;
- incomplete/provisional catalog невозможно активировать;
- zero candidates → blocking diagnostic, без записи;
- selection из чужой group/version → стабильный `422/409` по каноническому envelope;
- изменившийся candidate set → stale selection + `selection_required`;
- mixed ER request сохраняет per-ER atomicity и typed per-ER result;
- concurrent stale writer не перезаписывает более новый snapshot;
- project IO conflict не мутирует исходный проект;
- report точно различает `absent/current/stale`, а phantom/blocked report state отсутствует.

### Тестовые уровни

1. HTTP integration — добавить точный сценарий в актуальную specification API suite, без mocks
   production каталога.
2. DB integration — migration, seed idempotency, selection persistence, lock/fingerprint.
3. E2E — сценарий живёт только в `e2e/tests/`; расширить или заменить
   `phase5-specification-proof.spec.ts`, убрав допуски «один из нескольких статусов».
4. После `SPEC-FINAL-06` обязательно проверить минимум UI-состояний:
   - initial;
   - selection required;
   - selected/saved;
   - generated;
   - reload current;
   - stale selection;
   - blocking catalog error.
5. Выполнить state-driven browser proof, console check, overflow/geometry и обязательные viewport
   из frontend agent gates. Финальный E2E не заменяет component/browser gates предыдущего slice.

### Финальные проверки

По актуальному tooling выполнить, а не только перечислить:

```text
make lint-backend
make test-backend
make lint-frontend
make test-frontend
```

Запустить точный E2E spec из `e2e/`. Нестабильный/неподнятый внешний стенд отмечается честно и не
превращает `NOT RUN` в зелёный статус.

После всех проверок обновить status/checklist docs только фактическими доказательствами. Динамические
счётчики и timings складывать только в датированный `docs/audit/YYYY-MM-DD-*/snapshot.md`, не в этот
нормативный prompt.

### Commit и остановка

```text
test(specification): close production generation flow
```

После commit остановиться и отдать итоговую матрицу PASS/FAIL/NOT RUN.

## Итоговая матрица готовности

Работу можно назвать 100% только когда все строки доказаны:

| Область | Обязательное доказательство |
|---|---|
| Decision governance | у каждого обязательного owner-решения есть имя владельца, артефакт, дата и закрытый статус |
| Canonical consumers | project IO атомарен; report имеет только `absent/current/stale`; import-level repo-lock зелёный |
| Authority | raw `unused` запрещён; `unresolved` не активируется; `not_applicable` имеет decision ref; Ex/R_gr и номенклатура имеют owner source |
| Bootstrap | specification-only и full seed идемпотентны на чистой БД |
| Formula | агрегация/ceil соответствуют нормализации; grouping не меняет totals; boxes сохраняют pipe-level rule |
| Common section | точный утверждённый mapping и раздел «Общие материалы» в separate mode |
| Selection state | `auto_single` derived; explicit multi-choice хранится сервером, переживает reload и fail-closed инвалидируется |
| Frontend | клиент читает серверный choice, не повторяет candidate logic и восстанавливается после очистки cache |
| Legacy | старые builders/runtime loaders физически отсутствуют без потери coverage; file-level lock зелёный |
| HTTP | zero/one/many и many → save choice → generated → GET current проходят на real seeded catalog |
| Isolation | ни формулы, ни selection, ни stale одного ЭР не смешиваются с другим |
| Operations | migration имеет подтверждённую committed base и единственную head; seed/lint/backend/frontend/E2E имеют честный результат |

Наличие класса, migration или теста с подходящим названием не является доказательством. Требуется
исполненный тест на production path и проверка persisted результата.

## Общие hard stops

Не начинать или остановить тот slice, для которого выполняется хотя бы одно условие ниже. Другой
независимый code-only slice может продолжаться только если его файлы и контракт не пересекаются с
блокером:

1. для требуемого owner-решения нет назначенного владельца, артефакта или даты; безопасный code-only
   work может продолжиться, но production delivery остаётся `UNSCHEDULED`;
2. отсутствует авторитетная Ex/R_gr-матрица или подтверждение кодов/ёмкостей материалов;
3. требуется выдумать `Iдоп`, q1/q2, selection, capacity, grouping mapping или fallback;
4. источники не определяют, какая категория относится к «Общим материалам»;
5. чужой WIP пересекает нужные файлы, `seeds.py` не освобождён владельцем либо Alembic head не
   является committed и подтверждённой;
6. исправление требует расширить scope на электротехнический домен без доказанной необходимости;
7. три содержательные попытки одного proof дают один и тот же внешний blocker;
8. видимый UI изменён, но обязательный browser proof выполнить невозможно.

Hard stop не разрешает помечать slice выполненным. Зафиксируй точное доказательство, что уже сделано,
что осталось и какое решение/внешнее состояние требуется.

## Формат отчёта после каждого slice

```text
Slice: SPEC-FINAL-0N
Result: COMPLETE | CODE COMPLETE / BUSINESS DATA BLOCKED | BLOCKED
Commit: <hash или NOT COMMITTED>
Changed: <только собственные файлы>
Required decisions: <decision IDs, owner, target date, CLOSED/OPEN>
Migration base: <commit + down_revision либо NOT APPLICABLE>
Contract proven: <кратко>
Tests PASS: <точные команды>
Tests FAIL: <точные команды и причина>
Tests NOT RUN: <точные команды и причина>
Frontend/browser gates: PASS | NOT APPLICABLE | NOT RUN
Foreign WIP preserved: yes/no
Residual risk: <кратко>
Next allowed slice: SPEC-FINAL-0N+1 | none until owner decision
```
