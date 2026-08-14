# Heat-loss cleanup — актуальная очередь

**Статус:** CLOSED — формульный cleanup завершён (CF PASS WITH BASELINE DEBT).
Дальше теплопотери ведутся в
`docs/audit/2026-08-14-heat-loss-application-boundary/plan.md`.

**Дата:** 2026-08-13

**Production baseline, проверенный перед планом:** `ac7af10`

**Коммит, которым очередь взята под Git:** `cae0d81`

**Промпты:** `cleanup-prompts.md`

**Динамические данные:** только `snapshot.md`, переснятый C0 на фактическом HEAD

Этот файл заменяет маршрутизацию из соседнего `plan.md`: старый план и старые
snapshot-ы остаются историческим контекстом, но не задают NEXT.

Единственная ACTIVE frontend-очередь остаётся в
`docs/frontend/refactor-backlog.md`. C5 может затронуть frontend как
атомарное доказательство потребителя backend-контракта, но не меняет frontend
backlog, его NEXT или приоритеты.

Документы уже tracked. Для них используется обычный адресный `git add <file>`;
`git add -f` и `git add .` не нужны.

## Фактическое состояние на `cae0d81`

| Область | Сейчас | Вывод |
|---|---|---|
| `common.py` | Файл и его тест ещё есть, production-потребителей нет | C1 актуален |
| `app.formulas.heat_loss.core` | Thin shims и identity-тест ещё есть | C2 актуален |
| `_COMPAT` | Есть в `pipe.py` и `tank.py` | C3 актуален |
| Execution | Prepared flow преобразуется в legacy evaluation DTO | C4 актуален |
| Catalog validation | `InsulationLayer` и parent Pydantic ходят в loader | C5 актуален |
| Root API | `run_*_formula` и preparation DTO не экспортированы из root | C6b актуален |
| Legacy API | Решено сохранить | C6a DONE |

## Целевой поток

```text
Pydantic
  ├─ разбирает типы, обязательность и форму данных
  └─ один раз вызывает catalog-free validators библиотеки
                    ↓
Application preparation
  ├─ выбирает project/admin/climate policy
  ├─ один раз резолвит каждый reference material → law + interval
  └─ вызывает только недостающую catalog-resolved проверку process T
                    ↓
Prepared input с конкретными законами и коэффициентами
                    ↓
Один execution kernel
  ├─ tm / λ(T) / alpha
  ├─ ровно одна low-level ветка calculate_*
  ├─ finite-result guard
  └─ post-formula hot-side validation
                    ↓
result XOR FormulaValidationReport
                    ↓
Backend adapter
  ├─ русские сообщения и structured field paths
  ├─ разное округление pipe/tank
  └─ API / JSONB / БД
```

Это не означает «одна проверка вообще». Сохраняются три разные границы:

1. catalog-free input contract до справочника;
2. проверка температуры процесса после разрешения интервала материала;
3. проверка рассчитанной горячей стороны и конечности результата после формулы.

Нельзя повторно запускать полный `validate_*_contract` на второй границе или
сливать pre-formula и post-formula temperature checks.

## Принятые решения

### Legacy API

`evaluate_pipe`, `evaluate_resolved_air_tank` и
`evaluate_resolved_buried_tank` сохраняются публичными. После C4 это тонкие
совместимые адаптеры того же execution kernel.

Старые `resolve_safety_factor` и legacy evaluators не «исправляются». В частности,
их историческая семантика `primary=0` остаётся совместимой. Новый prepared path
получает уже выбранный приложением конкретный K.

### Коэффициенты

- Pipe: user/climate K → admin K только при отсутствии первого → профиль `1.1`.
- `0` считается переданным на новом backend path, после чего отклоняется
  диапазоном `1.0…1.7`.
- Tank: K обязателен; `coefficients` по-прежнему игнорируется.
- `ground_conductivity` и другие ключи словаря коэффициентов не получают нового
  поведения.
- Профиль библиотеки хранит только стандартные `9.0`, `11.6`, `7.0`, `1.1` и
  `40 °C`; явно переданный валидный профиль используется вместо стандартного.

### Каталог и Pydantic

- Pydantic вызывает чистые validators библиотеки, но не loader и не БД.
- Manual-layer правила остаются catalog-free и продолжают проверяться при
  создании `InsulationLayer`.
- Standalone `InsulationLayer.model_validate()` после C5 гарантирует структуру и
  manual rules, но не существование reference material. Это намеренное изменение
  внутреннего Python-контракта.
- Финальный application entrypoint обязан разрешить reference material до
  расчёта. Невалидный импорт всё равно сохраняется как `is_valid=false`,
  `results=null` с заполненным `validation_errors`.
- Каждый reference layer резолвится один раз через один loader entrypoint,
  возвращающий и law, и interval.

### Ошибки C5

Одна application-модель ошибки используется в create, update, import,
recalculate и admin preview. Для object persistence/API она обязана дать:

- стабильный code/category/message;
- путь `insulation_layers.{index}.material` для ошибки reference material;
- `field` для единственной ошибки и `fields` для структурированного mapping;
- исходный русский текст без парсинга строки на frontend.

Admin preview использует тот же resolver и возвращает input/catalog failure как
422, сохраняя совместимый пользовательский `detail`; объектные потоки сохраняют
structured `validation_errors`.

Frontend уже умеет читать `field`, `fields` и `insulation_layers.N.*`. C5 сначала
характеризует это. Production frontend меняется только при доказанной дыре.
Hot-side regex и его литерал не относятся к catalog lookup и не меняются.

## Очередь

| # | Слайс | Суть | Full backend |
|---|---|---|---|
| **C0** | Переснять baseline | HEAD, failing IDs, imports, package, benchmark | да |
| **C1** | Удалить `common.py` | Файл, тест и лживый facade docstring | нет |
| **C2** | Удалить app shims | Канонические imports + architecture ratchet | нет |
| **C3** | Удалить `_COMPAT` | Только мёртвые facade re-exports | нет |
| **C6a** | Решение legacy API | Уже принято и tracked | DONE |
| **C4** | Один execution kernel | Prepared и legacy используют одно выполнение | да |
| **C5** | Catalog только в preparation | Backend contract + consumer proof | да |
| **C6b** | Recommended root API + README | Без удаления legacy API | нет |
| **CF** | Финальная регрессия | Сравнение с C0, package/wheel/backend/frontend proof | да |

Слайсы выполняются строго по порядку. C1–C3 — shrink-only. C4 и C5 — отдельные
коммиты: библиотечное выполнение и application/catalog boundary нельзя смешивать.

## Инварианты C4

- Предпочтительный canonical execution input — существующий `Prepared*`.
  Если мешает import cycle, типы можно перенести в нейтральный внутренний модуль
  и re-export-нуть, но нельзя создавать ещё одну расходящуюся копию скаляров.
- Legacy adapter сам сохраняет свою старую pre-resolution семантику, затем
  передаёт concrete values в kernel.
- Kernel предполагает resolved input; entrypoint-specific validation остаётся
  перед ним.
- На один вызов: один tm, одна wall λ, одна λ каждого слоя, один alpha, одна
  low-level branch.
- Physical resistance/heat-balance equations остаются только в `calculate_*`;
  kernel их оркестрирует через библиотечные primitives, не копирует выражения.
- Pipe layer issues идут по порядку слоёв; tank — air layers, затем ground layers.
- `FormulaOutcome`: result XOR report.
- `FormulaDomainError`, model/version, assumptions/corrections и exact unrounded
  core values сохраняются.
- Pipe округляет в backend facade, tank сохраняет текущую неокруглённую выдачу.
- Особенность air-pipe domain-check с пустым кортежем толщин не исправляется.

## Инварианты C5

- Удаление catalog lookup из Pydantic атомарно с final application validation.
- Ошибка process temperature вне reference interval остаётся pre-formula.
- Hot-side temperature остаётся post-formula и сохраняет точный русский литерал.
- Fail-fast/order не превращается в collect-all.
- Нет fallback на старый Pydantic lookup и нет двойного resolver-вызова.
- Неизвестный/deprecated material, отсутствующие interval/law и unavailable
  выбранная λ-ветка сохраняют корректную классификацию и layer index.
- Frontend manual create/update сохраняет существующий save gate; backend
  persistence semantics не меняются. Импорт по-прежнему может сохранить
  невалидный объект.

## Запрещено во всей очереди

Менять формулы и порядок операций; ranges; units; result keys; formula model
versions; pipe/tank rounding; API routes/query keys/UUID; БД и миграции; UX вне
структурированной подсветки C5; электротехнический расчёт; specification;
унифицировать pipe и tank; удалять широкий low-level API; запускать незаявленный
frontend refactor; обновлять frontend backlog.

## Критерий закрытия

1. `common.py`, app shim directory и `_COMPAT` отсутствуют, запрещённых imports нет.
2. Prepared и legacy call graph сходятся в один kernel для pipe и tank.
3. Pydantic не импортирует/не вызывает insulation catalog; один reference layer
   даёт один resolve в application preparation.
4. Обе температурные проверки и finite-result guard активны.
5. Все application entrypoints дают одинаковую классификацию и field path.
6. Canonical package имеет документированный recommended API и проходит isolated
   wheel import без repository `PYTHONPATH`.
7. Facade JSON, формулы и hot-side сообщение совпадают с characterization.
8. В full backend нет новых failed/error nodeids относительно C0.
9. Повторный benchmark записан в snapshot; воспроизводимое ухудшение не скрыто.
10. Если C5 менял frontend, существует валидный content-bound proof receipt и
    browser evidence для реально изменённого видимого поведения.

## NEXT

Очередь закрыта. Не начинать C0 заново.

Следующая работа по теплопотерям:
`docs/audit/2026-08-14-heat-loss-application-boundary/plan.md` — слайс A0.
