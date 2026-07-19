# Checkpoint реализации динамических ЭР: Phase 1

Дата: 18.07.2026. Ветка: `feature/tnp-dynamic-electrical-variants`.

Статус: **PASS — backend/DB Phase 1 checkpoint complete**.

Этот checkpoint фиксирует завершённый и проверенный backend/DB-контур Phase 1.
Он не означает завершение PDF-кейса, общего Definition of Done, product release
или выпуска функции динамических ЭР в пользовательском интерфейсе.

## Реализованный срез

### Lifecycle и readiness

Backend предоставляет project-scoped API:

```text
GET    /api/v1/projects/{project_id}/electrical-readiness
POST   /api/v1/projects/{project_id}/electrical-variants/initialize
GET    /api/v1/projects/{project_id}/electrical-variants
POST   /api/v1/projects/{project_id}/electrical-variants
POST   /api/v1/projects/{project_id}/electrical-variants/{variant_id}/copy
PATCH  /api/v1/projects/{project_id}/electrical-variants/{variant_id}
POST   /api/v1/projects/{project_id}/electrical-variants/{variant_id}/activate
DELETE /api/v1/projects/{project_id}/electrical-variants/{variant_id}
```

Readiness требует хотя бы один объект, поддерживает `pipe` и `tank` и для
каждого объекта проверяет `is_valid=true` и конечный положительный
`results.total_heat_loss`. Неуспех возвращает стабильные коды с привязкой к
объекту. `initialize` идемпотентен: создаёт первый active `ЭР1`, полную
матрицу исходных `unassigned` assignments и заполняет
`projects.electrical_initialized_at`; повторный вызов достраивает недостающие
связи без второго `ЭР1`.

Lifecycle-мутации сериализуются блокировкой project row. Сервис обеспечивает:

- максимум пять ЭР и не более одного active;
- непустое имя до 128 символов и уникальность после `trim + casefold`;
- owner/admin write guard; read-only readiness/list сохраняют существующий
  project read policy;
- запрет удаления последнего ЭР и удаления ЭР с active background tasks;
- детерминированный active fallback при удалении;
- deep copy assignments, calculations, candidates, folders и folder items по
  `Idempotency-Key`, но без specification согласно PDL-ER-13;
- атомарный отказ копирования legacy-графа в пятый ЭР до UUID-only cutover.

Ответ lifecycle содержит UUID, имя, порядок, active-state, compatibility
`legacy_variant_number` и `specification_state` (`not_generated`, `generated`,
`stale`). Assignment CRUD/UI в этот срез не входит.

### Миграции 0027 и 0028

Миграция `0027_dynamic_electrical_variants_expand`:

- добавляет `projects.electrical_initialized_at`;
- создаёт `electrical_variants` и `electrical_variant_objects`;
- backfill-ит `ЭР1` для существующих проектов и только реально занятые
  дополнительные legacy slots из calculations, candidates, folders,
  specifications и старых task payloads;
- создаёт полную матрицу `project object × electrical variant`;
- сохраняет исходный cable type в `requested_cable_type`, нормализует
  `self_regulating_tt → self_regulating`, `single_core/three_core → resistive`,
  а `skin/mineral` оставляет `unsupported`;
- добавляет nullable expand-window `electrical_variant_id` в calculations,
  candidates, folders и specifications, backfill-ит его и связывает composite
  FK с project/legacy slot; object-scoped таблицы дополнительно ссылаются на
  assignment scope;
- помечает существующие specifications как
  `electrical_sections_not_ready`/`ELECTRICAL_SECTIONS_NOT_READY` с данными для
  безопасного восстановления при допустимом downgrade;
- устанавливает sync triggers для legacy downstream writes и для создания
  `unassigned` assignments при добавлении нового project object;
- отказывается от upgrade/downgrade, если lossless-инварианты не доказаны.

Миграция `0028_background_task_electrical_variant` добавляет индексированный
`background_tasks.electrical_variant_id`, backfill для electrical/report tasks
и check согласованности v3 payload с колонками задачи. FK на
`electrical_variants` намеренно отсутствует: terminal task history сохраняет
исходный UUID после удаления ЭР. Downgrade разрешён только для UUID, имеющих
представимый legacy slot `1…4`.

Object-insert trigger сериализует создание assignments блокировкой
`FOR NO KEY UPDATE` на строке конкретного проекта. Она согласована с lifecycle
`FOR UPDATE`, не вводит глобальную/advisory lock и закрывает гонку
`object create ↔ ER lifecycle`; два concurrency-теста проверяют обе стороны
гонки.

### UUID-first фоновые задачи и compatibility adapter

Новые `electrical_batch` и async `report_export` задачи записывают
`payload_version=3`, `project_id` и `electrical_variant_id`; числовой ключ в
новый payload не переносится. Worker повторно разрешает UUID в пределах проекта
и использует legacy number только как внутренний мост к ещё не переведённым
расчётным/report services. `CalculationTaskResponse` и report task result
возвращают UUID ЭР.

Входной `variant_number=1…4` остаётся deprecated adapter. Он под project lock
создаёт/находит соответствующий UUID и не позволяет смешивать UUID и number в
одном запросе. Исторические payload без версии и v2 продолжают исполняться;
replay валидирует scope и при возможности обновляет их до v3. Это временная
совместимость, а не второй источник идентичности.

Обычные legacy write paths — calculation/batch/copy/select, candidates,
folders, specification generate/save, numeric electrical/report jobs — и seed
data используют один readiness-gated adapter до первой доменной записи. На
свежем готовом проекте запрос slot `4` создаёт только `ЭР1 + ЭР4`, без
искусственных `ЭР2/ЭР3`; неготовый проект получает `409
ELECTRICAL_READINESS_FAILED` атомарно. В частности, objectless specification
возвращает 409 и не оставляет variant/specification rows.

Project duplication после heat recalculation проверяет readiness: готовая
копия подготавливает `ЭР1`/UUID через тот же adapter до batch electrical;
неготовая возвращается как heat-only project без ЭР, assignments и electrical
rows. Audit сохраняет status, UUID/legacy slot и readiness issue codes.

Явный `Idempotency-Key` фоновой задачи имеет namespace
`principal + task type + project` и привязан к полному payload, включая UUID
ЭР. Точный retry, в том числе terminal task, возвращает исходную задачу;
повтор того же ключа с другим payload или ЭР возвращает `409` с
`TASK_IDEMPOTENCY_KEY_REUSED`. Контракт одинаков для electrical, report и heat
jobs. Heat enqueue сериализует lookup/insert project-row lock даже через
terminal transition. Повтор audit-ится отдельным `*.idempotency_replayed`
event с реальным durable task result, а не ложным `queued`.

Для `ElectricalBatchJobRequest` omitted numeric selector сохраняет legacy
default slot `1`; UUID-only request удаляет этот implicit default. Явный
`variant_number:null` без UUID получает стабильный `422
ELECTRICAL_VARIANT_SELECTOR_REQUIRED`, а одновременные UUID и ненулевой number —
selector conflict. Schema validation выполняется до adapter, поэтому invalid
selector не создаёт ЭР.

Candidate apply и lifecycle delete используют общую project-row lock. После
блокировки apply перечитывает candidate и существующий UUID mapping, не
восстанавливает удалённый ЭР и для проигранной гонки возвращает стабильный
`404/409`, а не integrity `500`.

### Project CSV v2

Одиночный и пакетный import сохраняют schema v2 и числовые slots, но строят
UUID-граф явно:

- до записей валидируются все занятые slots из секций `electrical` и
  `specifications`; допустимы только `1…4`;
- создаётся active `ЭР1` плюс только реально занятые slots; для импорта
  `1 + 4` искусственные `ЭР2/ЭР3` не создаются;
- для каждого созданного ЭР создаются assignments всех импортированных
  объектов с lossless `requested_cable_type` и нормализованным state/type;
- calculations и specifications получают явный `electrical_variant_id`;
- legacy specifications не регенерируются и импортируются как stale с
  `ELECTRICAL_SECTIONS_NOT_READY`;
- проект без electrical/spec rows остаётся с нулём ЭР;
- неверный slot отклоняется атомарно до замены guest project; в bulk rollback
  ограничен ошибочным project graph, остальные проекты продолжают импорт.

Export v2 остаётся числовым. Он достаточен для lossless round-trip разреженных
legacy slots, но не переносит произвольные имена, active-state, assignments,
пятый ЭР или sections. Полный формат относится к CSV v3 в Phase 5.

## Явные переходные ограничения

- Frontend по-прежнему показывает фиксированные `СО1…СО4`; UUID tabs,
  deep-link `?er=<uuid>` и UI lifecycle относятся к Phase 2.
- Прямые candidates, candidate folders, specification, report preview и
  синхронный report export остаются scoped по `variant_number=1…4`.
- Прямые calculation endpoints также работают через deprecated numeric
  adapter; UUID-first завершён только для lifecycle и фоновых electrical/report
  tasks.
- Успешный normal legacy-adapter calculation уже получает UUID, но созданная
  заранее assignment до Phase 3 может остаться `unassigned` с
  `system_type=null`. Это intentional MEDIUM residual границы Phase 3:
  consumers не должны считать `assignment_state` authoritative до атомарной
  синхронизации assignment semantics.
- Пятый ЭР доступен для lifecycle и пустых assignments. Он не имеет legacy
  slot, поэтому расчётный/candidate/spec/report graph для него недоступен;
  deep-copy непустого legacy-графа в пятый ЭР атомарно отклоняется.
- Phase 3 (assignment service/UI и scoped cleanup) и Phase 5
  (spec/report/settings/CSV v3, guest print/full BOM) не выполнены.
- Phase 4 (persisted heating sections и новые формулы) заблокирована PDL-ER-15:
  утверждённых `Lmax`, пусковых и токовых данных нет, подстановка defaults
  запрещена.
- Зафиксированные ранее дефекты guest specification, report propagation и
  mobile layout этим backend-срезом не закрыты.

## Финальное evidence checkpoint

| Проверка | Результат |
|---|---|
| Working DB Alembic current | **PASS: `0028`**. |
| Alembic 0027/0028 + metadata lifecycle | **PASS: 5 tests**. |
| Dynamic-ER integration full suite | **PASS: 21 collected**; включая оба candidate apply/delete race order — **2/2 PASS**. |
| Project I/O + Excel import | **PASS: 46 tests**; sparse slots, UUID FK, complete assignments, stale spec, zero-ЭР и atomic invalid slot сохранены. |
| Legacy write adapter + specification | **PASS: 15 tests** (`3` new legacy-adapter + `12` specification). |
| Project duplicate flow | **PASS: full `test_projects.py` 21 tests; focused duplicate class 4 tests**. Ready copy имеет `ЭР1`/UUID до batch, not-ready copy остаётся heat-only. |
| Calculation integration full suite | **PASS: 73 tests**. |
| Calculation/specification unit suites | **PASS: 114 tests**. |
| Task service unit suite | **PASS: 56 tests**. |
| Calculation jobs | **PASS: 14 tests**. |
| Reports | **PASS: 11 tests**. |
| Focused task matrix | **PASS: 56 unit + 25 integration** (`14` calc jobs + `11` reports); heat terminal-transition race и truthful replay audit включены. |
| Full backend unit gate | **PASS: exit 0; exactly 1069 collected**. |
| Full backend integration gate | **PASS: clean single-process run, exit 0; exactly 421 collected**. Единственный expected skip: `test_performance_nfr.py:467`, недоступен `sample_import.csv`. Два ранее запущенных одновременно backend-int были infrastructure-invalid и этим результатом superseded. |
| `scripts/formula-qa.sh quick` | **PASS**; доказывает только зарегистрированные legacy formulas, не PDF-BOM/sections Phase 4. |
| `scripts/codex-functional-audit.sh contracts` | **PASS: 5 legacy contracts / 5 commands**; dynamic sections/PDF-BOM ещё не зарегистрированы. |
| `scripts/codex-functional-audit.sh docs` | Проходил после generated-doc sync; **будет повторно запущен root после этого финального docs-only обновления**. |
| `scripts/codex-functional-audit.sh db-invariants` | **PASS: 28 checks, 0 violations** на финальном head. |
| Smoke gate | **PASS: 18/18**. |
| Scale proof | **PASS:** `500 objects × 5 ER = 2500 assignments`; lifecycle initialization выполнил постоянные **69 SQL statements** при ceiling `80`. |
| Fresh `0001 → 0028` + seed | **PASS:** 19 calculations, 10 specifications, 10 variants, 28 assignments; **0** nullable downstream UUID и **0** scope mismatch. |
| Static/model gates | **PASS:** Ruff, pre-commit, formatter (`40` changed Python files) и SQLAlchemy mapper checks. |
| Full frontend gate | **NOT GREEN: 925 passed, 1 failed, 1 skipped**. Неизменённый `HeatCalcPage.settings.test.tsx:321` не находит accessible separator; isolated rerun: **1 failed, 10 skipped**. Это pre-existing дефект вне backend/DB Phase 1 и не regression Phase 1, но blocker общего product release. |
| `alembic check` | **NOT GREEN вне ER-среза:** обнаружен ранее существовавший metadata drift для `correction_coefficients`, `guest_sessions`, `insulation_materials`, trigram indexes `project_objects`, legacy index `specifications` и `users`; новых операций для таблиц dynamic ER не обнаружено. |
| `scripts/security-scan.sh` | **NOT GREEN вне Phase 1 diff:** Bandit не сообщил findings, но dependency audit нашёл 15 Python advisories и 7 npm vulnerabilities; frontend lint также воспроизводит существующий `_omit` error в `projectStore.test.ts:49`. Это blocker общего product release. |

Обычный metadata `create_all/drop_all` lifecycle проходит. Чистый одиночный
backend-int run является единственным засчитанным full-integration evidence;
два перекрывавшихся запуска не засчитаны из-за инфраструктурной конкуренции.

## Что не считается завершённым

Backend/DB checkpoint Phase 1 завершён, но общий PDF/DoD и product release
остаются незакрытыми. Frontend gate не green из-за воспроизводимого
pre-existing accessibility-test failure; dependency security gate и общий
Alembic drift также не green. Пользовательский frontend всё ещё fixed
`СО1…СО4`. Phase 2/3/5 pending. Phase 4 нельзя начинать до снятия PDL-ER-15.

Основные источники evidence:

- `backend/alembic/versions/0027_dynamic_electrical_variants_expand.py`;
- `backend/alembic/versions/0028_background_task_electrical_variant.py`;
- `backend/app/api/v1/electrical_variants.py`;
- `backend/app/services/electrical_variant_service.py`;
- `backend/app/services/task_service.py`;
- `backend/app/services/project_io_service.py`;
- `backend/app/tests/integration/api/test_electrical_variants.py`;
- `backend/app/tests/integration/api/test_project_io.py`;
- `backend/app/tests/integration/db/test_dynamic_electrical_variants_phase1a.py`;
- `backend/app/tests/integration/db/test_background_task_electrical_variant_migration.py`.
