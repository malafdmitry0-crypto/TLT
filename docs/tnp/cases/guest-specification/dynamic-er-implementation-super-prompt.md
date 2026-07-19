# Супер-промпт: динамические именованные ЭР вместо фиксированных СО1…СО4

Этот текст предназначен для отдельного будущего запуска Codex из корня
репозитория TLT. Он описывает полную миграцию доменной модели, а не визуальное
переименование вкладок.

> На итерации подготовки этого документа код, Git-ветки и тесты не менялись,
> агенты не запускались. Реализация начинается только после отдельного запуска
> и подтверждения продуктовых решений, отмеченных ниже.

---

## Текст для запуска

Работай как Functional Accuracy Lead в режиме `/fix-focused`. Для всех
видимых UI-изменений дополнительно соблюдай `/ui-proof`.

### 1. Цель

В локальной ветке `main` продолжить и завершить замену фиксированной модели вариантов расчёта
`СО1…СО4`, основанную на целочисленном `variant_number`, на полноценную
динамическую сущность электротехнического расчёта:

- пользовательское название: **ЭР**;
- максимум 5 ЭР в одном проекте;
- постоянный UUID каждого ЭР;
- создание первого ЭР;
- создание пустого ЭР;
- создание ЭР на основании существующего;
- переименование;
- переключение;
- выбор активного ЭР;
- удаление с подтверждением;
- независимые распределение объектов, кабели, кандидаты, секции, ошибки,
  stale-состояние и спецификация каждого ЭР;
- передача выбранного ЭР через весь поток:
  `БД -> API -> frontend -> спецификация -> отчёт -> export/import -> tests`.

Это не задача «поменять СО на ЭР в тексте». Не оставляй `variant_number` как
скрытый источник истины под новым названием.

### 2. Git и изоляция работы

1. До любых изменений выполни `git status --short` и `git branch --show-current`.
2. Дальнейшую работу вести **только в локальной ветке `main`**. Не создавать и
   не переключаться на feature-ветки или отдельные worktree без новой явной
   команды пользователя.
3. Не обращаться к `origin` и другим remote, не выполнять fetch/pull/push и не
   сравнивать локальный результат с remote без отдельной команды пользователя.
4. Не удалять, не перемещать и не откатывать чужие dirty/untracked-файлы. Не
   создавать, применять или удалять stash без отдельной команды пользователя.
5. Не использовать `git reset --hard`, `git clean` или checkout чужих файлов.
6. Не делать commit, merge или PR без отдельного разрешения пользователя.

### 3. Agent routing для будущего запуска

Сначала прочитай `AGENTS.md`, затем `.agents/routing.yaml` и
`.agents/roles/functional-accuracy.md`.

Primary role: `functional_accuracy`.

Если delegation разрешён в будущем запуске:

- один lead отвечает за архитектурный контракт, интеграцию и итоговый отчёт;
- `docs_contract` сначала делает read-only сверку источников;
- `backend_business` работает только в `backend/` и связанных backend tests;
- `frontend_ui_proof` начинает write-scope только после фиксации API-контракта
  и работает только в `frontend/` и выделенных e2e-файлах;
- `qa_regression` сначала делает read-only test inventory и независимо
  проверяет gates;
- `formula_oracle` подключается к секционированию и BOM только после фиксации
  источника формул;
- два агента не редактируют один файл или один write-set одновременно;
- sidecar не меняет код, если ему явно не назначен disjoint write-set.

Если delegation не разрешён, выполни эти роли последовательно локально.

### 4. Обязательные источники

До оценки и реализации полностью прочитай:

- `AGENTS.md`;
- `.agents/routing.yaml`;
- `.agents/roles/functional-accuracy.md`;
- `codex-docs/README.md`;
- `codex-docs/project-map.md`;
- `codex-docs/requirements-map.md`;
- `codex-docs/testing.md`;
- `codex-docs/business-formula-contracts.json`;
- `codex-docs/functional-accuracy-agent.md`;
- `formules.md`;
- `coefficients.MD`;
- `docs/context/formulas-summary.md`;
- `docs/playbooks/formula-validation-agent.md`;
- `docs/api.md`;
- `docs/analysis/business-rules.md`;
- `docs/srs.md`;
- профильные файлы `docs/srs/`;
- `docs/tz-compliance.md`;
- `docs/qa/test-cases-electrical.md`;
- `docs/qa/test-cases-specification.md`;
- `docs/qa/test-cases-reports.md`.

Источники аудита PDF:

- `docs/tnp/cases/guest-specification/README.md`;
- `docs/tnp/cases/guest-specification/pdf-page-index.md`;
- `docs/tnp/cases/guest-specification/pdf-requirements.md`;
- `docs/tnp/cases/guest-specification/product-decisions.md`;
- `docs/tnp/cases/guest-specification/traceability-matrix.md`;
- `docs/tnp/cases/guest-specification/functional-accuracy-report.md`;
- `docs/tnp/cases/guest-specification/verification-log.md`;
- `docs/analysis/tnp-1-case-gap-vs-implementation.md`;
- `docs/analysis/tnp-1-case-frontend-change-assessment.md`.

Первичный источник:

```text
ТНП/1_Кейс_«Расчёт_спецификации_для_неавторизованных_пользователей» (1).pdf
Редакция: 4
Дата: 07.07.2026
SHA-256: 5bf9a5f12f1ea609e7889f12dbbf4dbc24be8653258ea0e65f3d691d19fc978d
```

Для ЭР особенно проверить страницы 33–60 PDF:

- 33: readiness gate и создание первого ЭР;
- 34–38: сущность ЭР, create/copy/delete;
- 39–40: `Нераспределённые / Самрег / Резистив / Скин`;
- 41–46: подбор кабеля и installed/order length;
- 47–49: секционирование и иерархия строк;
- 50–52: ручная корректировка и возврат в нераспределённые;
- 53–54: partial specification и stale per ЭР;
- 55: inline rename;
- 56–60: спецификации отдельных ЭР и мастер формирования.

### 5. Утверждённые продуктовые решения

Product Decision Log зафиксирован в
`docs/tnp/cases/guest-specification/product-decisions.md`. PDL-ER-01…17
получены от пользователя 18.07.2026, PDL-ER-18…41 дополнены 18–19.07.2026;
они не являются открытыми gates:

| ID | Утверждённый контракт |
|---|---|
| PDL-ER-01 | Спецификация формируется для одного или нескольких явно выбранных ЭР; UI предоставляет явное `Выбрать все`. |
| PDL-ER-02 | Закупочный BOM использует заказную длину с резервом 10% и коммерческим округлением; `Lсек × Nсек` хранится отдельно как фактическая длина. |
| PDL-ER-03 | Прямое редактирование секций запрещено; разрешены марка кабеля и навив/шаг, после чего секции пересчитываются автоматически. |
| PDL-ER-04 | Гостю доступен полный автоматический BOM; ручное изменение позиций — только сотруднику/администратору. |
| PDL-ER-05 | Гостю доступны HTML preview и browser print; server export PDF/DOCX/XLSX — только сотруднику/администратору. |
| PDL-ER-06 | MVP: `Трубопровод` и `Ёмкость`; `Бочка` — синоним ёмкости, не отдельный backend type. `Пол` — вне MVP/disabled future option. |
| PDL-ER-07 | Настройки — project defaults; генерация сохраняет snapshot и применяет текущие defaults только к явно выбранным ЭР. |
| PDL-ER-08 | Порог коробок включительный: `dтр ≥ 57 мм`. |
| PDL-ER-09 | Имена ЭР уникальны внутри project после `trim + casefold`. |
| PDL-ER-10 | Действующий resistive flow сохраняется; `single_core/three_core` нормализуются в `resistive`. |
| PDL-ER-11 | `system_type` отделяется от `assignment_state`; исходный requested cable type сохраняется, mineral/MI disabled. |
| PDL-ER-12 | Первый active `ЭР1` создаётся readiness-gated mutation при первом переходе в электрический расчёт. |
| PDL-ER-13 | Specification при copy не копируется и не регенерируется; target получает `not_generated`. |
| PDL-ER-14 | Multi-ЭР generation атомарна между выбранными ЭР; object partial только после явного подтверждения. |
| PDL-ER-15 | Phase 4 остановлена до утверждённых `Lmax`, пусковых и токовых данных; defaults запрещены. |
| PDL-ER-16 | PDF 07.07 задаёт BOM semantics; XLSX 29.05 используется только как непротиворечащий каталог/источник данных. |
| PDL-ER-17 | Expand window завершается one-way UUID cutover с проверенным backup/recovery point. |
| PDL-ER-18 | Источник section data — только официальный каталог/утверждённая методика производителя ТЛТ с зафиксированной версией. |
| PDL-ER-19 | Неполная строка данных блокирует расчёт секций с диагностируемой ошибкой; defaults и ближайшие значения запрещены. |
| PDL-ER-20 | `Iдоп`, А, задаётся явно для марки и напряжения, не выводится из автомата и не является глобальной константой. |
| PDL-ER-21 | Используется прямой `Iст.уд`, А/м, из источника; общий `kпуск` не вводится. |
| PDL-ER-22 | Строка каталога выбирается по минимальной расчётной температуре конкретного объекта/климата. |
| PDL-ER-23 | `Lmax`, `Iдоп` и `Iст.уд` хранятся и проверяются отдельно для каждого напряжения. |
| PDL-ER-24 | `Lогр` округляется вниз только по правилу официального источника; отсутствие правила блокирует расчёт. |
| PDL-ER-25 | Новый section contract Phase 4 применяется только к саморегулирующемуся кабелю. |
| PDL-ER-26 | Guest project временно хранится в PostgreSQL 3 дня с последней активности, изолирован по session и автоматически удаляется после TTL. |
| PDL-ER-27 | Целевой предел — 500 объектов и 5 ЭР; переход с 50 разрешён только после performance gate полного flow и PDF-порогов 30 секунд. |
| PDL-ER-28 | Phase 4 требует фактический официальный каталог/«Таблицу Виктора»; имеющиеся неполные PDF/XLSX не заменяют numeric artifact. |
| PDL-ER-29 | Один канонический автоматический full data-driven BOM; `basic` — только переходный internal path до удаления в Phase 6. |
| PDL-ER-30 | Интерактивный UI поддерживается от 1280 px; mobile не входит в Phase 5, browser print остаётся адаптивным. |
| PDL-ER-31 | `Rгр` — отдельный project setting/default `1.0`, не 10% order reserve и не глобальный множитель BOM. |
| PDL-ER-32 | Tank/resistive получают только доказанные BOM-позиции; недоказанные группы дают подтверждаемый `partial`, без подмены pipe/self-reg формулами. |
| PDL-ER-33 | Mark/code/temperature group/default берутся из явных catalog fields; prefix/suffix/row-order inference запрещён. |
| PDL-ER-34 | PDF всегда задаёт specification semantics/formulas; XLSX-only формула не переносится без отдельного утверждённого контракта. |
| PDL-ER-35 | Условия коробок `Ex/Rгр` требуют официальной per-row матрицы; до неё зависимые позиции fail closed. |
| PDL-ER-36 | Multi-ЭР partial: один side-effect-free preflight, одно окно с per-ЭР exclusions и одна атомарная transaction после подтверждения. |
| PDL-ER-37 | Stale snapshot только read-only с явной пометкой; он исключён из totals/print/report/exports. |
| PDL-ER-38 | Default grouping: `Трубопроводы / Ёмкости / Общие материалы`; merge опционален по catalog base + code. |
| PDL-ER-39 | Один report по явному списку UUID ЭР с независимыми главами/specifications и без cross-ЭР sums. |
| PDL-ER-40 | Финальный corporate template не блокирует Phase 5 functional HTML preview/browser print и остаётся отдельным report brief. |
| PDL-ER-41 | Export только v3; v2 import-only. Missing/mismatched source делает imported result stale/unsupported; guest manual BOM rows атомарно отклоняются. |

Эти решения сильнее расходящихся legacy SRS, текущего кода и старых golden.
Golden values можно менять только с прямой ссылкой на соответствующий PDL,
формулу/каталог и независимый oracle. Не возвращай PDL-ER-01…41 в статус
«нужно решение» без нового явного указания пользователя.

PDL-ER-09…17 явно утверждены пользователем 18.07.2026 как варианты А;
PDL-ER-18…25 — 18.07.2026 также как варианты А; PDL-ER-26…28 — 19.07.2026
как варианты А; PDL-ER-29…41 — 19.07.2026 как варианты А для Phase 5.
Продуктовые вопросы guest persistence/TTL, лимита 500 и Phase 5 contract
закрыты, но их реализация остаётся pending. Фактический numeric artifact
PDL-ER-15/18/28, per-row `Ex/Rгр` data PDL-ER-35 и недостающие методики из
PDL-ER-32 должны быть предоставлены и не могут быть заменены предположениями.

### 6. Зафиксированный целевой контракт ЭР

Используй в коде термин `ElectricalVariant`, таблицу
`electrical_variants`, API-поле `electrical_variant_id`; в UI показывай
русское `ЭР`. Не используй `run` для доменной сущности: в проекте уже есть
фоновые task/job executions.

#### 6.1. Сущность `ElectricalVariant`

Минимальные поля:

- `id: UUID` — постоянный публичный идентификатор;
- `project_id: UUID` — обязательный FK с `ON DELETE CASCADE`;
- `name: string` — trimmed, непустое пользовательское имя;
- `sort_order: int` — порядок вкладок;
- `is_active: bool` — бизнес-активный ЭР;
- `copied_from_id: UUID | null` — traceability создания на основании;
- `created_at`, `updated_at`.

Инварианты:

- от 1 до 5 ЭР на проект после создания первого ЭР;
- не более одного active ЭР на проект на уровне БД;
- сервис гарантирует ровно один active ЭР, когда у проекта есть ЭР;
- до readiness initialization у проекта допустимо 0 ЭР;
- первый ЭР создаётся при первом успешном readiness-gated переходе, получает
  имя `ЭР1` и становится active;
- UUID, а не позиция/имя, связывает расчёты и downstream-данные;
- `sort_order` не используется как бизнес-ID;
- имя после rename синхронно отображается на вкладке спецификации и в отчёте
  через связь с сущностью, а не копированием текста по таблицам;
- пустое имя отклоняется;
- имя уникально внутри проекта после `trim + casefold`;
- создание шестого ЭР атомарно отклоняется, включая конкурентные запросы;
- последний ЭР удалить нельзя;
- при удалении active ЭР active становится ближайший по `sort_order`, а при
  отсутствии следующего — предыдущий;
- пользовательское имя не должно самопроизвольно меняться при reorder/delete.

Различай:

- **selected ЭР** — открытая вкладка интерфейса;
- **active ЭР** — сохранённое бизнес-состояние проекта.

Selected ЭР можно хранить в URL/query и локальном UI state. Active ЭР хранится
на backend. Ни спецификация, ни отчёт не должны полагаться на случайное значение
из `localStorage`.

#### 6.2. Lifecycle

Нужны атомарные операции:

1. Получить упорядоченный список ЭР проекта.
2. Создать пустой ЭР.
3. Создать ЭР на основании существующего.
4. Переименовать ЭР.
5. Сделать ЭР active.
6. Изменить порядок, если reorder входит в утверждённый UX.
7. Удалить ЭР с подтверждением.

Copy должен создавать независимую глубокую копию:

- распределения объектов;
- выбранных типов систем;
- параметров подбора;
- выбранных кабелей и их snapshots;
- расчётных результатов;
- кандидатов и папок кандидатов, если это подтверждено текущим contract;
- нагревательных секций;
- ручных корректировок;
- диагностических полей.

Не копировать UUID дочерних сущностей. Изменение target после copy не должно
менять source. Specification и manual items не копируются; target получает
`not_generated` и требует отдельной явной generation (PDL-ER-13).

#### 6.3. Объект внутри ЭР

Создай явную связь `electrical_variant_objects`:

- `id: UUID`;
- `electrical_variant_id`;
- `object_id`;
- `system_type`: `self_regulating | resistive | skin | mineral | null`;
- `assignment_state`: `unassigned | ready | unsupported | stale | error`;
- `requested_cable_type` для lossless legacy trace;
- snapshot/version исходного объекта, достаточный для stale detection;
- timestamps и необходимые диагностические поля.

Инварианты:

- уникальность `(electrical_variant_id, object_id)`;
- объект присутствует ровно один раз внутри конкретного ЭР;
- один объект может иметь разные назначения в разных ЭР;
- новый объект проекта появляется как `unassigned` во всех существующих ЭР;
- удаление объекта каскадно удаляет его данные во всех ЭР;
- новый первый ЭР получает все готовые объекты как `unassigned`;
- `self_regulating` и существующий `resistive` доступны;
- `skin` и `mineral` видимы как unsupported/disabled;
- назначение и массовое назначение атомарны;
- возврат в `unassigned` требует подтверждения и удаляет только в выбранном ЭР:
  assignment-specific calculation, candidates, sections и electrical fields;
- heat inputs/results объекта при этом сохраняются;
- связанная спецификация только этого ЭР становится stale;
- операции другого ЭР не затрагиваются.

#### 6.4. Электрический расчёт

Переведи `ElectricalCalculation` с `variant_number` на обязательный
`electrical_variant_id` и связь с assignment.

Целевые ограничения:

- unique `(electrical_variant_id, object_id)`;
- calculation разрешён только для assignment подходящего system type;
- project/object/variant должны принадлежать одному проекту;
- successful/error/unsupported/stale различаются структурированно;
- хранить `formula_id`, версию/источник, `category`, `error_code`, message и
  snapshot входов/каталога;
- сохранить manual/auto source metadata;
- изменение ProjectObject делает calculation stale отдельно во всех ЭР, где
  этот объект присутствует;
- пересчёт одного ЭР не обновляет другие;
- применение candidate, direct calculate, batch и manual cable selection
  делают stale только спецификацию затронутого ЭР;
- cache/query invalidation scoped по UUID ЭР.

Переведи на `electrical_variant_id` также:

- `ElectricalCandidate`;
- `ElectricalCandidateFolder`;
- unique/index/partial-index constraints;
- batch job payload;
- query/capabilities;
- direct calculation;
- candidate create/apply/unapply;
- multi-variant cable selection;
- audit events;
- specification/report handoff.

#### 6.5. Нагревательные секции

Не подменяй `Nсек` существующим `num_circuits`: сейчас это количество ниток,
а не число нагревательных секций.

Добавь сохраняемую сущность `heating_sections`, связанную с конкретными
assignment/calculation и ЭР. Минимально обеспечить:

- постоянный UUID;
- номер/порядок секции внутри объекта;
- длину секции;
- фактическую длину `Lсек × Nсек`;
- заказную длину с отдельным резервом 10% и коммерческим округлением;
- напряжение;
- мощность;
- рабочий ток;
- стартовый ток;
- status/category/error code;
- formula/source/version traceability;
- timestamps.

Формульный контракт из PDF должен иметь независимый oracle:

```text
Lток = Iдоп / Iст.уд
Lогр = min(Lмакс, Lток), с оговорённым округлением вниз
N = ceil(Lтреб / Lогр)
все auto-секции группы одинаковы
последняя секция не является остатком
Lфакт = Lсек × N >= Lтреб
пример: 200 / 67 -> 3 × 67 = 201
```

PDL-ER-18…25 фиксируют section data contract:

- source of truth — официальный каталог/утверждённая методика производителя
  ТЛТ с названием, версией, датой и точной ссылкой на строку/страницу;
- строка данных обязана явно содержать `Lмакс`, `Iдоп` в А, `Iст.уд` в А/м,
  напряжение, температуру холодного пуска и правило округления вниз;
- `Iдоп` выбирается по марке и напряжению, `Iст.уд` берётся непосредственно из
  источника, а температура холодного пуска равна минимальной расчётной
  температуре конкретного объекта/климата;
- значения разных напряжений не взаимозаменяемы;
- если строка или правило округления отсутствуют, вернуть структурированную
  ошибку и не создавать секции; defaults, nearest-value fallback и общий
  `kпуск` запрещены;
- этот новый section contract применяется только к саморегулирующемуся кабелю.

Выбор семантики утверждён, но фактический официальный числовой артефакт пока не
предоставлен. До его регистрации в formula/data contract Phase 4 остаётся
blocked; нельзя превращать PDL-ER-18…25 в вымышленные значения.

Прямое редактирование длины, количества или состава auto-секций запрещено
(PDL-ER-03). Разрешены только марка кабеля и навив/шаг; их изменение должно
атомарно пересчитывать секции, фактическую/заказную длину и связанные итоги.

### 7. Рекомендуемый API-контракт

Сначала оформить OpenAPI/ADR. Предпочтительный ресурсный API:

```text
GET    /api/v1/projects/{project_id}/electrical-readiness
POST   /api/v1/projects/{project_id}/electrical-variants/initialize
GET    /api/v1/projects/{project_id}/electrical-variants
POST   /api/v1/projects/{project_id}/electrical-variants
POST   /api/v1/projects/{project_id}/electrical-variants/{id}/copy
PATCH  /api/v1/projects/{project_id}/electrical-variants/{id}
POST   /api/v1/projects/{project_id}/electrical-variants/{id}/activate
DELETE /api/v1/projects/{project_id}/electrical-variants/{id}

GET    /api/v1/projects/{project_id}/electrical-variants/{id}/assignments
PATCH  /api/v1/projects/{project_id}/electrical-variants/{id}/assignments
POST   /api/v1/projects/{project_id}/electrical-variants/{id}/unassign
```

Существующие endpoints расчёта должны принимать
`electrical_variant_id: UUID`, а не произвольный integer:

- electrical query/page/capabilities;
- direct calculate;
- batch/jobs;
- cable selection;
- candidates/folders/apply;
- specification GET/generate/save;
- report preview/export/jobs.

Для операции над несколькими ЭР использовать
`electrical_variant_ids: list[UUID]`, проверить уникальность, максимум 5,
принадлежность одному проекту и доступ principal до начала транзакции.

Минимальные стабильные error codes:

- `ELECTRICAL_VARIANT_NOT_FOUND`;
- `ELECTRICAL_VARIANT_LIMIT_REACHED`;
- `ELECTRICAL_VARIANT_NAME_EMPTY`;
- `ELECTRICAL_VARIANT_NAME_CONFLICT`;
- `ELECTRICAL_VARIANT_LAST_DELETE_FORBIDDEN`;
- `ELECTRICAL_VARIANT_PROJECT_MISMATCH`;
- `ELECTRICAL_ASSIGNMENT_REQUIRED`;
- `ELECTRICAL_SYSTEM_UNSUPPORTED`;
- `ELECTRICAL_RESULT_STALE`;
- `ELECTRICAL_SECTIONS_NOT_READY`.

Не возвращать `404`/`403` непоследовательно для одинакового security contract.
Следовать существующей политике сокрытия чужих ресурсов и доказать её negative
tests.

#### Backward compatibility

`electrical_variant_id` становится единственным источником истины.

Если внешним API-клиентам временно нужен `variant_number`:

- compatibility mapping должен быть явным, read-only и deprecated;
- integer отображается на UUID через migration mapping;
- новые записи нельзя создавать только по integer;
- frontend должен перейти на UUID в локальном `main`;
- задать дату/условие удаления compatibility layer;
- не поддерживать два независимо изменяемых источника истины.

Если внешних клиентов нет, выполнить атомарный hard cut в локальном `main` и удалить
legacy path после успешной миграции и тестов.

### 8. Миграция PostgreSQL

Текущий Alembic head на момент подготовки — `0026`. Перед работой проверить,
что head не изменился.

Использовать безопасную expand/backfill/validate/contract последовательность:

1. Создать `electrical_variants` и `electrical_variant_objects`.
2. Добавить nullable `electrical_variant_id` в:
   - `electrical_calculations`;
   - `electrical_candidates`;
   - `electrical_candidate_folders`;
   - `specifications`.
3. Для каждого проекта собрать union существующих `variant_number` по всем
   зависимым таблицам.
4. Всегда создать как минимум `ЭР1`; создавать `ЭР2…ЭР4` только если для
   соответствующего legacy slot реально есть данные.
5. Имена backfill: `ЭР1`, `ЭР2`, ...; active — ЭР с минимальным legacy number.
6. Заполнить UUID FK по `(project_id, legacy variant_number)`.
7. Создать assignment для каждого объекта каждого реально созданного ЭР.
8. Если есть успешный calculation, вывести system type из его проверенного
   cable type; иначе оставить `unassigned`.
9. Не генерировать фиктивные heating sections из `num_circuits`. Старые
   результаты без доказанных секций пометить `sections_not_ready`/stale и
   потребовать явный пересчёт.
10. Связанные старые specifications пометить stale, если их корректность
    зависит от отсутствующих секций.
11. Проверить counts, orphan FKs, duplicates, cross-project links и nulls.
12. Только после успешного backfill включить `NOT NULL`, новые unique/index/FK
    constraints.
13. Перевести код и frontend на UUID.
14. Удалить legacy constraints/columns только после доказанной совместимости.

Обязательные migration invariants:

- число legacy calculations/candidates/folders/specifications не уменьшается;
- каждая старая строка получает ровно один корректный ЭР того же проекта;
- нет assignment на object другого проекта;
- не более одного active ЭР на проект;
- не более 5 ЭР;
- уникальности новых таблиц соблюдены;
- cascade delete проверен;
- миграция повторно не запускается и не создаёт дубли;
- concurrent create не позволяет создать шестой ЭР.

Пятый ЭР и пользовательские имена нельзя losslessly вернуть в модель 1…4.
Не писать притворно безопасный downgrade. Утверждена стратегия PDL-ER-17:
expand compatibility window, затем one-way UUID cutover с проверенным
backup/recovery point; rollback после cutover только restore.

### 9. Export/import проекта

Текущий `schema_version=2` хранит `variant_number` в секциях `electrical` и
`specifications`. Ввести следующую версию схемы, не переписывая silently v2.

Рекомендуемый v3:

```text
[electrical_variants]
variant_key;name;sort_order;is_active;copied_from_key

[electrical_assignments]
variant_key;object_key;system_type;state

[electrical]
variant_key;object_key;...calculation fields...

[heating_sections]
variant_key;object_key;section_key;sort_order;...section fields...

[specifications]
variant_key;...spec fields...
```

Требования:

- `variant_key` стабилен внутри файла и не зависит от display name;
- экспорт v3 содержит имена, порядок, active, assignments, calculations,
  sections, specifications и generation settings;
- после Phase 5 export создаётся только в v3; v2 export запрещён
  (PDL-ER-41);
- импорт v3 восстанавливает полный graph и новые UUID;
- импорт v2 поддерживается только как legacy input adapter: numbers 1…4
  превращаются в ЭР1…ЭР4; его удаление требует отдельного решения;
- guest import с manual BOM rows атомарно отклоняется и не обходит manual-write
  RBAC;
- если formula/catalog source version отсутствует или не совпадает, inputs и
  graph можно восстановить, но calculations/sections/specifications становятся
  `stale`/`unsupported`, а не актуальными;
- повреждённая ссылка variant/object делает весь single-project import
  атомарно неуспешным;
- текущий проект не удаляется до полной проверки файла;
- export -> import -> export сохраняет бизнес-смысл;
- формульная/source traceability не теряется;
- bulk import сохраняет partial success только на границе проектов, не внутри
  одного проекта.

### 10. Backend write/read scope

Основные существующие точки для обязательной сверки:

- `backend/app/models/electrical_calculation.py`;
- `backend/app/models/electrical_candidate.py`;
- `backend/app/models/electrical_candidate_folder.py`;
- `backend/app/models/specification.py`;
- `backend/app/models/project.py`;
- `backend/app/models/project_object.py`;
- `backend/app/schemas/calculation.py`;
- `backend/app/schemas/specification.py`;
- `backend/app/schemas/report.py`;
- `backend/app/api/v1/calculations.py`;
- `backend/app/api/v1/specifications.py`;
- `backend/app/api/v1/reports.py`;
- `backend/app/services/calculation_service.py`;
- `backend/app/services/electrical_query_service.py`;
- `backend/app/services/specification_service.py`;
- `backend/app/services/report_service.py`;
- `backend/app/services/project_io_service.py`;
- `backend/app/services/task_service.py`;
- релевантные Alembic migrations `0007`, `0020…0026`.

Не расширяй существующий монолитный `CalculationService` бесконтрольно.
Выдели cohesive variant/assignment service с явными транзакционными границами,
если это уменьшает риск и покрывается focused tests.

Все mutations должны использовать write-level ownership guard. В текущем
specification API обнаружено использование read-level `get_project_basic` для
операций записи; не переноси этот дефект в новый API. Добавь negative tests:
employee не может regenerate/replace specification чужого employee/admin
project.

### 11. Frontend contract

Обязательные существующие точки:

- `frontend/src/store/calculationVariantStore.ts`;
- `frontend/src/types/calculation.ts`;
- `frontend/src/types/specification.ts`;
- `frontend/src/api/calculations.ts`;
- `frontend/src/api/specifications.ts`;
- `frontend/src/api/reports.ts`;
- `frontend/src/pages/ElecCalcPage.tsx`;
- `frontend/src/pages/electrical/elecCalcVariantModel.ts`;
- `frontend/src/pages/electrical/ElectricalBatchActionBar.tsx`;
- `frontend/src/pages/SpecificationPage.tsx`;
- `frontend/src/pages/ReportPage.tsx`;
- `frontend/src/pages/ReportWizardPage.tsx`;
- `frontend/src/components/reports/ReportWizard.tsx`;
- electrical query/candidate hooks и React Query keys.

#### 11.1. State

- заменить numeric union `[1,2,3,4]` на API-loaded list ЭР;
- хранить selected UUID per project, не число;
- selected UUID отражать в URL (`?er=<uuid>`) для reload/deep link;
- если URL невалиден: выбрать backend active ЭР, затем первый доступный;
- active state не подменять localStorage;
- очищать старый persisted Zustand schema через versioned migration;
- все query keys включают `electrical_variant_id`;
- переключение ЭР не должно показывать placeholder-data другого ЭР как
  актуальный результат;
- invalidation после mutation должна быть минимально scoped и полной.

#### 11.2. Dynamic tabs

Реализовать:

- вкладки из backend list, а не четыре hardcoded controls;
- имя ЭР и active marker;
- `Добавить ЭР` до достижения лимита 5;
- варианты создания: пустой / на основании текущего;
- inline rename: Enter сохраняет, Esc отменяет, blur имеет явно описанное
  поведение, пустое имя не отправляется;
- delete confirmation с ясным перечислением удаляемых зависимых данных;
- запрет удаления последнего ЭР;
- loading/error/retry/empty states;
- keyboard navigation и доступные имена controls;
- отсутствие мигания `ЭР1` до получения реального списка.

#### 11.3. Системные вкладки и assignments

Внутри выбранного ЭР:

- `Нераспределённые`;
- `Самрег`;
- `Резистив` disabled с объяснением;
- `Скин` disabled с объяснением.

Пользователь может выбрать один/несколько объектов и назначить их в Самрег.
Если реализуется DnD, обязательно дать клавиатурную/button alternative.
Возврат рассчитанного объекта в unassigned требует confirm. После операции UI
обновляет только выбранный ЭР и показывает уничтожаемые downstream data.

#### 11.4. Иерархия и summaries

Показать иерархию:

```text
Объект
└── Нагревательные секции
    ├── Секция 1
    ├── Секция 2
    └── Секция N
```

Строка объекта показывает агрегаты, секции — собственные длину, мощность,
рабочий/стартовый ток и status. Нужны отдельные summary:

- Самрег;
- Резистив;
- Скин;
- Итого.

Не смешивать successful, stale, error, unsupported и unassigned в успешных
суммах.

`ElecCalcPage.tsx` уже крупный. Сначала добавь characterization tests и
выделяй bounded components/hooks; не переписывай всю страницу одновременно.

#### 11.5. Object taxonomy

Канонические типы MVP — `pipe` и `tank` (PDL-ER-06). В UI показывать
`Трубопровод` и `Ёмкость`. Слово `Бочка` является синонимом/подписью ёмкости и
не создаёт отдельный enum, API payload, таблицу или ветку формулы. Старые и
новые export/import файлы должны нормализовать это значение в `tank`.

`Пол` не входит в MVP. Если он показан как future option, control disabled и
имеет понятное объяснение; он не создаёт объект и не даёт ложный успешный
расчёт.

### 12. Спецификация и отчёт

Переведи `Specification` на обязательный `electrical_variant_id` и unique
constraint по `(project_id, electrical_variant_id)`.

Обязательные правила:

- одна независимая спецификация на ЭР;
- вкладка использует текущее имя связанного ЭР;
- rename не требует переписывать specification row;
- change одного ЭР делает stale только его specification;
- error/stale/unsupported/unassigned объекты не входят в успешные суммы;
- multi-ЭР partial использует side-effect-free preflight, одно окно с
  per-ЭР списком/count исключений и одну атомарную transaction после явного
  подтверждения (PDL-ER-36);
- нельзя генерировать accessory-only «успешную» specification при нуле
  успешных electrical results;
- manual items не теряются по действующему контракту, но не маскируют stale
  auto items;
- generator получает реальное число sections, а не `num_circuits`.
- generation API принимает один или несколько явно выбранных UUID ЭР
  (PDL-ER-01); `Выбрать все` разворачивается в явный список текущих UUID;
- никакой фоновой/неявной генерации всех ЭР при открытии страницы или изменении
  settings;
- full data-driven BOM является единственным целевым product mode и доступен
  guest (PDL-ER-04/29); `basic` не является fallback при ошибке, а manual
  add/edit/delete items остаются backend-protected для employee/admin;
- cable procurement quantity берётся из заказной длины с резервом 10% и
  коммерческим округлением (PDL-ER-02); `Lсек × Nсек` показывается и хранится
  отдельно как фактическая инженерная длина;
- project defaults настроек versioned; каждая generation сохраняет полный
  snapshot (PDL-ER-07);
- изменение defaults не регенерирует все ЭР автоматически; specs с отличающимся
  snapshot помечаются stale, а новые defaults применяются только к явно
  выбранным при следующей generation ЭР;
- `Rгр` хранится отдельно с default `1.0`, применяется только явно связанными
  catalog/formula rules и не заменяет procurement reserve 10% (PDL-ER-31);
- для tank/resistive включаются только доказанные позиции; недоказанные группы
  возвращаются как подтверждённый `partial`, без pipe/self-reg substitution
  (PDL-ER-32);
- catalog mark/code/temperature group/default читаются только из explicit
  fields; prefix/suffix/row-order inference запрещён (PDL-ER-33);
- PDF задаёт все specification semantics/formulas; XLSX-only rule не переносится
  без отдельного source mapping/PDL (PDL-ER-34);
- зависимые от `Ex/Rгр` коробки fail closed до официальной per-row матрицы
  (PDL-ER-35);
- stale snapshot доступен только read-only с явной красной пометкой и исключён
  из totals, browser print, report и server exports (PDL-ER-37);
- default grouping — `Трубопроводы / Ёмкости / Общие материалы`; merge
  опционален только после отдельного расчёта типов и по совпадающим catalog
  base + nomenclature code (PDL-ER-38);
- правило коробок использует `dтр ≥ 57 мм` (PDL-ER-08), включая ровно 57 мм.

Report preview/jobs принимают явный список UUID ЭР, показывают их имена и не
берут selected значение из localStorage. Один report содержит независимые
главы/specifications выбранных ЭР; cross-ЭР sums запрещены, diagnostics
показываются отдельно (PDL-ER-39). Guest получает HTML preview и доступное
действие browser print с корректным print CSS (PDL-ER-05). Server exports
PDF/DOCX/XLSX остаются backend-protected для employee/admin. Отсутствие
финального corporate template не блокирует functional Phase 5, но текущий
шаблон не объявляется финальным (PDL-ER-40).

### 13. Аудит, безопасность и конкурентность

Для create/copy/rename/activate/delete/assign/unassign/recalculate/generate
писать структурные audit events:

- principal role/id или guest session surrogate;
- project_id;
- electrical_variant_id;
- electrical variant name, если допустимо;
- object_ids/count;
- action/result;
- category/error_code;
- correlation/request id;
- duration;
- copied_from_id для copy.

Не логировать токены, секреты, полный импортированный файл или персональные
данные.

Обязательные negative/concurrency cases:

- guest/employee не читает и не меняет чужой ЭР;
- UUID ЭР другого проекта не принимается вместе с текущим project_id;
- два concurrent create при 4 ЭР не создают 6-й;
- concurrent rename/delete/calculate заканчиваются предсказуемо;
- delete во время active job не оставляет orphan task/result;
- copy retry не создаёт неконтролируемые дубли;
- multi-object assignment атомарен;
- stale и specification transitions не теряются при race.

### 14. Порядок реализации

Не делать один giant diff. Работать вертикальными slices, сохраняя зелёный
baseline после каждого.

#### Phase 0 — contract и characterization, без production behavior change

- составить ADR `docs/architecture/dynamic-electrical-variants.md`;
- включить утверждённые PDL-ER-01…08 в ADR без повторного открытия решений;
- построить полную матрицу `variant_number` usages;
- зафиксировать текущие API payload/response и DB invariants;
- добавить characterization tests только там, где они нужны для безопасной
  миграции;
- снять before screenshots текущих СО1…СО4 на desktop и mobile;
- не менять expected values без источника истины.

#### Phase 1 — DB entity, migration и lifecycle API

- expand/backfill/validate;
- CRUD/copy/activate/delete;
- RBAC, audit, concurrency;
- backend integration и migration tests;
- старый frontend пока может жить через строго ограниченный adapter.

#### Phase 2 — frontend dynamic tabs

- UUID types/API/query keys/store migration;
- list/create/copy/rename/activate/delete;
- reload/deep-link persistence;
- integration tests и UI proof.

#### Phase 3 — assignments и system tabs

- unassigned/self-reg/resistive domain;
- массовые операции и confirmation;
- disabled future skin/mineral systems;
- scoped stale/spec side effects;
- backend/frontend/e2e proof.

#### Phase 4 — sections

- семантика источника и обработки данных утверждена PDL-ER-18…25;
- остановиться до фактического предоставления официального числового каталога/
  методики с `Lmax`, `Iдоп`, `Iст.уд`, напряжениями, температурами и правилом
  округления по PDL-ER-15/18/28; не вводить defaults;
- после получения данных зарегистрировать formula/data contract;
- independent golden, boundary и metamorphic oracles;
- persisted sections + hierarchical UI + summaries;
- formula QA and mutation evidence.

#### Phase 5 — specification/report/project I/O

- UUID scope everywhere;
- явный multi-select ЭР + `Выбрать все`;
- один canonical full guest BOM, order-length procurement и settings snapshots;
- подтверждаемый partial только для доказанных tank/resistive позиций;
- PDF-first formula contract; XLSX-only rules не наследуются автоматически;
- fail-closed `Ex/Rгр` boxes до официальной per-row матрицы;
- preflight + одно confirmation + atomic multi-ЭР generation;
- stale read-only, но запрещён в totals/print/report/export;
- default split grouping с optional catalog-code merge;
- multi-ЭР report с независимыми главами;
- guest HTML preview/browser print и employee/admin server exports; corporate
  template остаётся отдельным acceptance scope;
- `pipe/tank` taxonomy и `barrel -> tank` normalization;
- inclusive `dтр ≥ 57 мм` boundary;
- CSV v3-only export + v2 import-only migration;
- guest persistence: PostgreSQL, sliding TTL 3 дня, cleanup и session isolation;
- подготовка к 500 объектам без снятия rollout guard до performance gate;
- no-mixing and round-trip tests.

#### Phase 6 — legacy removal и release gate

- удалить authoritative `variant_number` path;
- удалить fixed arrays/labels;
- обновить docs/API/SRS/QA/contracts;
- проверить search остаточных legacy usages;
- доказать PDF thresholds на 500 объектах до повышения runtime limit;
- выполнить функциональные gates и DB invariants после UI flow.

После каждой phase дай checkpoint report и не переходи дальше при красном
in-scope gate.

### 15. Обязательные тесты

#### Backend model/service/API

- первый ЭР создаётся один раз и active;
- create empty, copy, rename, activate, delete;
- шестой ЭР отклоняется;
- concurrent max-5 invariant;
- пустое/конфликтующее имя;
- последний ЭР нельзя удалить;
- active fallback после delete;
- copy deep и source/target independence;
- assignment independent между двумя ЭР;
- новый объект unassigned во всех ЭР;
- unassign удаляет только scoped downstream data;
- object change stale во всех затронутых ЭР;
- recalc одного ЭР не меняет другой;
- calculation/candidate/spec/report с cross-project UUID отклоняются;
- negative ownership для specification mutations;
- specification при zero successful electrical не содержит auto accessories;
- stale spec не выдаётся как актуальная;
- no orphan/cascade invariants.

#### Migration/DB

- empty project -> ЭР1;
- legacy data только variant 1;
- legacy data variants 1 и 4 без искусственных 2/3;
- calculations/candidates/folders/specs сохраняют counts и mapping;
- duplicate/dirty legacy fixtures дают диагностируемый fail, а не data loss;
- 5th dynamic ЭР;
- upgrade на realistic dump;
- rollback strategy доказана отдельно;
- query-count/N+1 evidence для 500 objects × 5 ЭР.

#### Sections/formulas

- documentation golden `200/67 -> 3×67=201`;
- boundary ровно на `Lмакс` и `Lток`;
- чуть ниже/выше границы;
- одинаковость всех auto-секций;
- `Lфакт >= Lтреб`;
- ни одна секция не превышает canonical limit;
- увеличение required length не уменьшает N;
- уменьшение допустимого тока не увеличивает section limit;
- отсутствующие catalog inputs дают structured error;
- `Nсек != num_circuits` доказано отдельным тестом;
- фактическая и заказная длина хранятся раздельно;
- заказная длина включает ровно утверждённый резерв 10% и коммерческое
  округление.
- `Rгр` не заменяет 10% order reserve и влияет только на explicit rules;
- XLSX-only formula не становится oracle без отдельного PDL/source contract;
- отсутствующие `Ex/Rгр` row values дают structured data error.

#### Frontend

- список вкладок строится из API;
- нет hardcoded `[1,2,3,4]`;
- create/copy/rename Enter/Esc/error;
- max 5 disabled + backend error handling;
- active и selected визуально различимы;
- delete confirm/last delete disabled;
- selected UUID сохраняется после reload и URL deep link;
- удалённый/чужой UUID в URL безопасно нормализуется;
- React Query cache одного ЭР не протекает в другой;
- assignments/system tabs и disabled states;
- unassign confirmation;
- hierarchical sections keyboard expand/collapse;
- summaries исключают stale/error/unsupported/unassigned;
- specification/report используют имя и UUID выбранного ЭР;
- loading/error/retry/empty states.

#### Export/import/report/specification

- v2 -> v3 import mapping;
- v3 round trip с 5 ЭР, custom names, assignments, sections и specs;
- export после migration не создаёт v2;
- guest manual BOM rows отклоняются атомарно;
- missing/mismatched source version восстанавливает inputs, но stale-ит
  calculation/sections/specification;
- corrupted variant_key не стирает текущий проект;
- multi-project partial success только per project;
- spec одного ЭР не содержит позиции другого;
- один multi-ЭР report содержит отдельные главы и не смешивает расчёты/итоги;
- rename отражается без дублирования данных;
- selected/active semantics соответствуют утверждённому contract;
- multi-select генерирует только явно переданные ЭР, `Выбрать все` передаёт
  явный полный список;
- guest full generation разрешена, manual item write запрещён;
- guest preview и browser print доступны, server exports дают 403;
- stale snapshot виден read-only, но не попадает в print/report/export;
- default split grouping и optional merge сохраняются в settings snapshot;
- tank/resistive partial показывает недоказанные группы и не создаёт
  approximate accessories;
- `Бочка` round trip нормализуется в `tank` без третьего object type;
- settings snapshot воспроизводит результат после изменения defaults;
- коробка на границе `56.999 / 57 / 57.001 мм` выбирается по `dтр ≥ 57`.

#### E2E user flow

Минимальный Playwright flow:

1. Войти гостем.
2. Создать два валидных объекта.
3. Пройти readiness gate — получить ЭР1 с обоими объектами unassigned.
4. Переименовать ЭР1.
5. Назначить один объект в Самрег и рассчитать.
6. Создать ЭР2 на основании ЭР1.
7. Изменить кабель/параметр только в ЭР2.
8. Доказать, что ЭР1 не изменился.
9. Создать пустой ЭР3 и доказать независимое unassigned state.
10. Перезагрузить страницу и проверить names/selected/active/data.
11. Выбрать конкретные ЭР, затем проверить multi-select и явное `Выбрать все`.
12. Сформировать full guest specification и доказать order-length quantity.
13. Проверить payload, persistence, multi-ЭР chapters, HTML preview/browser
    print и отсутствие смешения ЭР; server export для guest должен остаться
    запрещён.
14. Изменить project defaults и доказать snapshot/stale behavior без
    автоматической регенерации всех ЭР.
15. Изменить heat input одного объекта и проверить stale per ЭР.
16. Export v3, импортировать, проверить полный round trip, source-version stale,
    guest manual-row rejection и `barrel -> tank`; v2 export отсутствует.
17. Запустить `db-invariants` после сценария.

### 16. UI proof

Для каждой изменённой страницы обязательны before/after screenshots и
программная проверка минимум на:

- desktop `1440×1000`;
- boundary `1280 px` без clipping/overflow/overlap;
- viewport ниже `1280 px` показывает явное unsupported-width предупреждение;
- print preview проверяется отдельно на узком листе/viewport;
- длинные русские имена ЭР;
- 1 и 5 вкладок;
- inline rename;
- open menus/modals;
- system tabs;
- expanded sections;
- stale/error/partial specification states.

Verifier должен ловить overflow, clipping, `text-overflow`, overlap,
горизонтальный scroll рабочего сценария, disabled controls, нечитаемый текст и
keyboard/ARIA проблемы. Если browser/Playwright недоступен, UI phase — blocked,
не pass.

### 17. Команды проверки

Выбрать минимально достаточные focused commands на каждой phase, а перед
завершением выполнить широкий gate:

```bash
scripts/formula-qa.sh quick
scripts/test.sh backend-unit
scripts/test.sh backend-int
scripts/test.sh frontend
scripts/codex-functional-audit.sh contracts
scripts/codex-functional-audit.sh docs
scripts/codex-functional-audit.sh user-flows
scripts/codex-functional-audit.sh layout
scripts/codex-functional-audit.sh accessibility
scripts/codex-functional-audit.sh db-invariants
scripts/codex-functional-audit.sh all
```

Для критичных section/BOM formulas после contract registration:

```bash
scripts/codex-functional-audit.sh calc
scripts/codex-functional-audit.sh mutation
```

Не маскировать focused pass глобальным coverage failure и наоборот: в журнале
раздельно указать assertion result, exit code и coverage/gate result.

### 18. Search-gate перед завершением

Проверить `rg` минимум по:

```text
variant_number
variant_numbers
CALCULATION_VARIANTS
[1, 2, 3, 4]
СО1
СО4
CO1
CO4
ge=1, le=4
variant=99
```

Остаточные совпадения допустимы только в:

- исторических migrations;
- v2 import compatibility;
- явно помеченных legacy/deprecation tests;
- исторических audit/report материалах.

Каждое production-совпадение объяснить. Нельзя объявлять DoD, если integer
остаётся скрытым authoritative key.

### 19. Definition of Done

Готово только если одновременно доказано:

- есть persistent dynamic сущность ЭР с UUID и именем;
- 1…5 и active invariants обеспечены backend/DB;
- legacy данные мигрированы без потери;
- frontend не строит четыре фиксированные вкладки;
- lifecycle create/copy/rename/activate/delete работает после reload;
- распределение объектов независимо между ЭР;
- расчёты/candidates/sections scoped UUID ЭР;
- stale распространяется корректно и не смешивает варианты;
- спецификация и отчёт не смешивают данные разных ЭР;
- export/import сохраняет весь graph;
- RBAC доказан negative backend tests;
- critical formulas имеют independent golden/boundary/metamorphic evidence;
- before/after UI screenshots и verifier зелёные;
- Playwright flow и последующий `db-invariants` зелёные;
- docs, API, SRS, QA и formula contracts обновлены;
- PDL-ER-01…41 реализованы без скрытых альтернативных semantics;
- никакие assertions/golden values не ослаблены без источника новой правды;
- все in-scope failures исправлены либо итог честно помечен blocked/fail.

### 20. Stop conditions

Остановись и запроси решение, если:

- обнаружена новая необходимая семантика вне PDL-ER-01…41 и действующих
  контрактов; уже утверждённые решения не переоткрывать молча;
- миграция может потерять или неверно связать существующие данные;
- невозможно однозначно отличить `num_circuits` от `Nсек`;
- в каталоге нет данных для section oracle;
- API пытается поддерживать два независимых источника истины;
- RBAC доказан только frontend guard;
- требуется массово изменить expected/golden без утверждённого источника;
- migration, PostgreSQL, Docker, browser или Playwright недоступны для
  обязательного evidence;
- UI изменён без before/after screenshots и verifier;
- persisted flow не завершён `db-invariants`;
- unrelated dirty changes пересекаются с write-set;
- текущая phase требует giant rewrite вместо проверяемого vertical slice.

### 21. Обязательные артефакты результата

- ADR целевой модели со ссылкой на утверждённый `product-decisions.md`;
- migration map old -> new;
- обновлённая traceability matrix;
- OpenAPI/API documentation;
- focused tests и test inventory;
- before/after screenshots и geometry evidence;
- command log с exit codes;
- DB invariant report;
- Functional Accuracy Report по форме:

```text
Functional Accuracy Report
Scope: dynamic named ЭР1…ЭР5 replacing fixed СО1…СО4
Docs checked: ...
Implementation found/changed:
- DB/migration: ...
- Backend: ...
- Frontend: ...
- Specification/report/import-export: ...
- Tests: ...
Verification:
- Command: ...
- Result: pass/fail/blocked
Findings:
- ID / severity / expected / actual / evidence / impact / status
Residual risk: ...
```

### 22. Формат первого ответа будущего агента

До изменения production-кода верни пользователю checkpoint:

1. подтверждение локального `main`, отсутствие самовольного remote/worktree и
   текущий dirty-state;
2. подтверждённый source-of-truth;
3. подтверждение применения PDL-ER-01…41 и список только новых blockers;
4. точная текущая цепочка
   `DB -> backend API -> frontend store/pages -> spec/report/CSV -> tests`;
5. предлагаемая схема таблиц и API;
6. migration/rollback strategy;
7. phase plan с disjoint write sets;
8. baseline tests/screenshots, которые будут сняты до правок;
9. blockers.

Только после этого checkpoint и отсутствия блокирующих решений начинай Phase 1.
