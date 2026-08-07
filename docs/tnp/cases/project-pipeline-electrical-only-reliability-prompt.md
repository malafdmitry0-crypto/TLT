# Project pipeline: электрический расчёт без скрытого пересчёта теплопотерь

## Роль

Ты работаешь в репозитории TLT. Реализуй один надёжный backend slice:
`project_pipeline` больше не владеет расчётом теплопотерь и не запускает его
неявно перед пересчётом выбранных ЭР.

Приоритет задачи — корректность, повторяемость и безопасное восстановление
после сбоя. Оптимизация времени выполнения вторична.

## Обязательный preflight

1. Прочитай корневой `AGENTS.md` и ближайшие инструкции затрагиваемых зон.
2. Выполни `git status --short`; не трогай и не добавляй чужой WIP.
3. Изучи как минимум:
   - `backend/app/services/calculation_workflow_service.py`;
   - `backend/app/services/calculation_service.py`;
   - `backend/app/services/task_service.py`;
   - `backend/app/api/v1/objects.py`;
   - `backend/app/services/project_service.py`;
   - существующие unit/integration-тесты calculation workflow и task service.
4. До production-изменения добавь characterization-тест, доказывающий, что
   текущий `project_pipeline` вызывает `batch_recalculate` перед электрической
   стадией даже при уже рассчитанных теплопотерях. Сначала зафиксируй и запусти
   текущее поведение, затем преобразуй тест в regression-тест желаемого
   контракта. Не коммить assertion, требующий сохранения старого heat-вызова.

## Бизнес-инвариант

Команда «пересчитать ЭР» не пересчитывает теплопотери.

Владельцами теплового расчёта остаются только:

- явные heat-команды;
- операции изменения теплотехнических входов, которые уже выполняют
  перерасчёт объекта в своей транзакции;
- отдельные явно названные recovery/repair-операции, если они существуют.

`electrical_batch` и `project_pipeline` используют сохранённое состояние
теплопотерь как вход. Они не должны исправлять или пересчитывать его скрытым
побочным эффектом.

## Почему нельзя строить dirty heat planner в этом slice

В текущей модели нет доказанного канонического соответствия
`heat input revision -> heat calculation revision`:

- `ProjectObject.version` не является версией только тепловых входов;
- `results is None` неоднозначно: объект мог ещё не рассчитываться либо мог
  быть рассчитан с актуальной ошибкой;
- `is_valid=False` означает ошибку результата, но не обязательно изменение
  входов;
- изменение коэффициентов очищает кеш, но само по себе не даёт объектам
  надёжного per-object stale marker.

Поэтому запрещено определять необходимость теплового пересчёта эвристикой из
`version`, `results`, `is_valid`, `validation_errors`, timestamps или состояния
frontend. Не добавляй в этом slice новый fingerprint/revision-механизм.

## Зафиксированная граница freshness

В этом slice формулы, коэффициенты, справочники и версии расчётного ядра не
изменяются. Меняется только правило запуска существующих расчётов.

Для этой задачи сохранённый heat result считается результатом последнего
явного теплового расчёта или атомарного пересчёта при изменении
теплотехнических данных объекта. Команда ЭР использует этот сохранённый
результат как вход и не пересчитывает его.

Изменение глобальных коэффициентов, справочников или формул, их
ретроактивность и инвалидация ранее сохранённых результатов находятся вне
scope. Не добавляй ради них fingerprint/revision/invalidation-механику и не
используй их как причину для остановки этого slice. Если обнаружишь отдельный
дефект такого типа, зафиксируй его как residual risk без расширения текущей
реализации.

## Осознанное изменение семантики

Текущий `project_pipeline` документирован как workflow
`heat -> electrical -> specification`. Целевой контракт меняет его на
`saved heat input -> electrical -> specification`, сохраняя task type,
endpoint и response schema.

Обнови вводящий в заблуждение backend docstring. Не переименовывай task type.
Пользовательский текст «Полный расчёт» в рамках этого продукта означает полный
пересчёт выбранных ЭР и последующее формирование спецификации на сохранённых
теплопотерях. Frontend-текст и frontend scope не меняй.

## Требуемое изменение

1. Удали из нормального пути `project_pipeline` безусловный вызов тепловой
   стадии (`_run_heat` / `CalculationService.batch_recalculate`).

2. Не заменяй его условным или «инкрементальным» тепловым перерасчётом.
   После изменения `project_pipeline` не должен мутировать поля теплового
   результата `ProjectObject` ни в одном штатном сценарии create/retry/resume.

3. Электрическая стадия должна сохранить существующий доменный контракт
   `batch_calc_electrical`:

   - использовать актуальные валидные тепловые результаты;
   - пропускать либо диагностировать объекты без пригодных теплопотерь так, как
     уже определено сервисом;
   - сохранять `heat_loss_failed` и существующие structured errors;
   - не пытаться автоматически лечить такие объекты.

4. Workflow должен продолжить electrical -> specification pipeline. Если
   непригодные тепловые данные делают спецификацию невозможной, завершение
   должно происходить через существующий preflight/diagnostic контракт, а не
   через скрытый тепловой расчёт.

5. Используй точную progress/checkpoint policy:

   - новый create: `progress_total = len(variant_ids) + 1`;
   - новый retry, сбрасывающий execution checkpoints:
     `progress_total = len(variant_ids) + 1`;
   - пропущенная heat stage не создаёт checkpoint и не увеличивает progress;
   - resume из `waiting_input` сохраняет `progress_current/progress_total`;
   - infrastructure recovery сохраняет persisted progress и все checkpoints;
   - recovery с `electrical.{variant_id}` checkpoint не рассчитывает этот ЭР
     повторно;
   - не повышай `request_payload.payload_version` только из-за удаления
     стадии.

   Не ломай публичную response-схему. Добавь тесты точных progress-значений для
   create, waiting, resume, success, retry и recovery.

6. Legacy persisted-task compatibility не поддерживается: старых активных
   `project_pipeline` задач в целевой среде нет. Не добавляй код, ветки или
   тесты ради старого `heat` checkpoint либо старого progress denominator.

7. Retry failed/timed_out workflow должен перезапускать электрическую и
   последующие стадии согласно существующей retry-семантике, но не должен
   вызывать тепловой расчёт.

8. Сохрани без ослабления:

   - idempotency;
   - project calculation guard;
   - worker fencing (`attempt`, `locked_by`);
   - cancellation;
   - queue/execution timeouts;
   - recovery и terminal transitions;
   - транзакционные границы electrical/specification checkpoints.

9. Не скрывай отсутствие тепловых данных. Если slice остаётся backend-only,
   `CalculationWorkflowResponse` failed-задачи должен содержать structured
   `waiting_results` с `object_id` и предметной диагностикой; ложный
   `succeeded` запрещён. Не утверждай, что frontend показывает эти structured
   diagnostics: сейчас для failed workflow он показывает главным образом
   `error_message`.

## Надёжность и гонки

- Не добавляй read-then-write решения без существующего project guard/fencing.
- Потерявшая fencing token попытка не должна публиковать progress, checkpoint
  или terminal result.
- Повторная доставка одного Redis Stream message не должна повторно мутировать
  уже terminal workflow.
- Ошибка electrical/specification стадии не должна менять тепловые результаты.
- Не расширяй project lock и не ослабляй его в этом slice.
- Не используй catch-all fallback, который превращает ошибку проверки в
  «теплопотери актуальны».
- В этом slice сохрани существующую create/resume idempotency. Retry endpoint
  сейчас не реализует полноценную idempotency по заголовку; не исправляй это
  скрытым расширением scope.
- Не меняй frontend в этом backend slice.

## Обязательные тесты

Добавь или обнови тесты минимум для следующих сценариев.

1. При актуальных теплопотерях `project_pipeline` не вызывает
   `batch_recalculate`, но вызывает electrical и specification стадии.

2. Каноническая heat-ошибка: назначенный объект имеет `is_valid=False`,
   `results=None`, заполненный `validation_errors`. Он увеличивает
   `heat_loss_failed`, появляется по `object_id` в preflight diagnostics, heat
   не запускается.

3. Неконсистентное сохранённое состояние: `is_valid=True`, `results=None`.
   Workflow обязан fail-closed через существующий electrical/preflight error,
   не обязан классифицировать его как `heat_loss_failed` и не должен
   завершаться `succeeded`.

4. Persisted failure, полученный явной heat-командой без последующих изменений
   входов, не приводит к автоматическому повтору теплового расчёта.

5. Несколько выбранных ЭР рассчитываются в существующем порядке без heat
   stage.

6. Retry после ошибки electrical или specification стадии не вызывает
   `batch_recalculate`.

7. Resume после `waiting_input` не вызывает `batch_recalculate` и сохраняет
   persisted progress.

8. Recovered task с checkpoint первого из двух ЭР не повторяет первый ЭР,
   рассчитывает только второй и завершает specification.

10. Потеря fencing token проверяется на границе worker/TaskService и не
    публикует следующий checkpoint или terminal result.

11. Обычный `electrical_batch` сохраняет прежнее поведение и самостоятельно
    не пересчитывает теплопотери.

12. Явный `heat_loss_batch` продолжает пересчитывать теплопотери.

13. Повторная доставка stream message для уже terminal task не приводит к
    повторному выполнению.

14. Существующие тесты concurrent idempotent start, retry, cancellation,
    project lock и worker recovery остаются зелёными.

Тестируй наблюдаемое поведение, а не только отсутствие вызова приватного
метода. Хотя бы один тест должен доказать, что значения `ProjectObject.results`,
`is_valid` и `validation_errors` не изменились после electrical-only workflow.

## Проверки

Запусти фактически доступные проверки в установленном окружении:

1. focused unit-тесты `calculation_workflow_service`;
2. focused unit-тесты `task_service`, затронутые изменением;
3. integration-тесты calculation workflows;
4. регрессионные тесты heat/electrical batch jobs;
5. backend lint/type checks, предусмотренные репозиторием для изменённых
   файлов.

Не называй незапущенные проверки зелёными. Не исправляй посторонние падения и
не ослабляй assertions.

## Non-goals

- Не удалять worker или Redis.
- Не менять транспорт очереди.
- Не добавлять новый heat freshness fingerprint/revision.
- Не менять формулы, коэффициенты или справочники.
- Не менять frontend, UX, API payload/query keys/routes.
- Не распараллеливать расчёт ЭР.
- Не менять semantics явного heat batch.
- Не перерабатывать глобальную project-lock модель.
- Не выполнять сопутствующий архитектурный рефакторинг.

Если выяснится, что выполнение этого контракта требует нового публичного API,
изменения формул или нового heat freshness-механизма, остановись и верни
`FILE / EVIDENCE / DECISION NEEDED`; не расширяй scope самостоятельно.

## Критерий готовности

Изменение готово только если доказано:

- `project_pipeline` ни при create, ни при retry/resume/recovery не запускает
  тепловой расчёт;
- обычные операции изменения тепловых входов по-прежнему пересчитывают
  теплопотери своим существующим владельцем;
- непригодные тепловые результаты диагностируются, а не скрыто исправляются;
- recovery нового electrical-only workflow не повторяет завершённые стадии;
- idempotency, fencing, cancellation, recovery и terminal transitions не
  регрессировали;
- публичный API остался совместимым.

После проверок создай один scoped conventional commit только из файлов задачи.
Push не выполнять.
