# Request-scoped calculations: одна кнопка — одна операция — явно выбранный scope

## Роль и цель

Ты работаешь в репозитории TLT. Реализуй cross-owner reliability slice,
закрепляющий продуктовый контракт:

> Система выполняет только тот расчёт, который пользователь явно запросил,
> и только для объектов и ЭР, которые пользователь явно выбрал.

Пользователь может бизнесово выбрать один, два или несколько ЭР. Multi-ER
операция разрешена, только если каждый ЭР явно отмечен в UI и точный список UUID
передан backend. Запрещены implicit-all, скрытое расширение scope и запуск
соседних расчётных стадий.

Приоритеты: точность scope → отсутствие скрытых side effects → надёжность
idempotency/retry/recovery → производительность → удобство реализации.

## Зафиксированное продуктовое решение

Расчётные домены независимы:

| Явное действие | Разрешённый эффект |
|---|---|
| Пересчитать теплопотери | Только heat-loss для явно указанного object/project scope |
| Пересчитать выбранные объекты текущего ЭР | Только указанные `object_id` этого ЭР |
| «Пересчитать все · ЭРN» | Только назначенные объекты явно названного ЭРN |
| Пересчитать выбранные ЭР | Только явно отмеченный набор UUID ЭР |
| Сформировать спецификацию выбранных ЭР | Только явно отмеченный набор UUID ЭР из сохранённых electrical results |

Жёсткие инварианты:

- heat-команда не запускает electrical или specification;
- electrical-команда не запускает heat или specification;
- specification-команда не запускает heat или electrical;
- multi-ER разрешён только через явный selection control и точный UUID-list;
- пустой список, implicit-all и «все ЭР проекта» по умолчанию запрещены;
- backend никогда не добавляет к запросу невыбранный ЭР;
- переход, reload, polling, query invalidation и восстановление сессии не
  запускают новую команду;
- отсутствие prerequisite диагностируется fail-closed, а не исправляется
  скрытым пересчётом.

Атомарный heat-пересчёт при создании или явном изменении теплотехнических
входов объекта остаётся частью object mutation. Он затрагивает только созданный
или изменённый объект и не запускает electrical/specification.

## Термины scope

- `selected ER set` — непустой упорядоченный список уникальных UUID, каждый из
  которых пользователь явно выбрал в текущем действии;
- `current ER` — активная вкладка ЭР, если действие имеет singular scope;
- `selected objects` — точный непустой список `object_id`, выбранный внутри
  одного ЭР;
- `all in ER` — все назначенные подходящие объекты одного явно указанного ЭР;
- `implicit-all` — отсутствие UUID/scope, которое backend трактует как все ЭР
  или все объекты. Такой контракт запрещён.

Порядок UUID должен быть детерминированным и сохраняться от frontend request до
worker checkpoints и response. Не используй unordered `set` как публичный
порядок выполнения.

## Обязательный preflight

1. Прочитай корневой `AGENTS.md`, `frontend/AGENTS.md` и
   `docs/frontend/agent-development-standard.md` полностью.
2. Выполни `git status --short`; не трогай чужой WIP.
3. Найди ближайшие backend-инструкции, если они существуют.
4. Изучи как минимум:
   - `backend/app/services/calculation_workflow_service.py`;
   - `backend/app/services/task_service.py`;
   - `backend/app/services/calculation_service.py`;
   - `backend/app/services/project_calculation_guard.py`;
   - `backend/app/api/v1/calculation_workflows.py`;
   - `backend/app/api/v1/calculations.py`;
   - `backend/app/api/v1/specifications.py`;
   - `backend/app/schemas/calculation_workflow.py`;
   - `backend/app/schemas/calculation.py`;
   - `backend/app/schemas/specification.py`;
   - `frontend/src/api/calculationWorkflows.ts`;
   - `frontend/src/api/electricalBatchCalc.ts`;
   - `frontend/src/api/specifications.ts`;
   - `frontend/src/pages/specification/useSpecificationPageModel.ts`;
   - `frontend/src/pages/electrical/ElectricalBatchActionBar.tsx`;
   - ближайшие unit/integration/E2E-тесты этих владельцев.
5. До production-изменений добавь characterization-тесты:
   - specification button с двумя явно выбранными ЭР отправляет ровно два UUID;
   - текущий `project_pipeline` запускает electrical перед specification;
   - singular electrical action отправляет current ER UUID;
   - запрос без явного ER scope не создаётся.
6. Запусти characterization на старом поведении, затем преобразуй тесты в
   regression нового контракта. Не коммить assertions скрытого каскада.

## Целевая модель команд

### 1. Heat

- Heat batch принимает явный project/object scope.
- Кнопка «выбранные» передаёт точные `object_ids`.
- Полный project scope допустим только у явно подписанной кнопки
  «пересчитать все теплопотери» с подтверждением.
- Heat не создаёт и не обновляет electrical calculations/specifications.

### 2. Electrical singular scope

- «Пересчитать выбранные объекты» передаёт один `electrical_variant_id` и
  точные `object_ids`.
- «Пересчитать все · ЭРN» передаёт один `electrical_variant_id`; слово «все»
  относится только к назначенным объектам этого ЭР.
- Backend повторно проверяет принадлежность ЭР проекту и объектов этому scope.
- Другие ЭР не меняются.

### 3. Electrical multi-ER scope

- UI содержит отдельное явное действие «Пересчитать выбранные ЭР (N)».
- Пользователь отмечает каждый ЭР checkbox/multi-select; preselected hidden ER
  запрещён.
- Перед submit UI показывает точные имена выбранных ЭР и требует подтверждение
  для `N >= 2`.
- Request содержит непустой список уникальных UUID `electrical_variant_ids`.
- Backend валидирует, что каждый UUID принадлежит проекту и доступен принципалу,
  до создания task.
- Worker рассчитывает только переданный список в сохранённом порядке.
- Для `N` ЭР выполняется ровно `N` вызовов `batch_calc_electrical`, по одному на
  UUID; heat и specification не вызываются.
- Не распараллеливай ЭР внутри проекта в этом slice: последовательность проще
  для fencing, checkpoints и транзакционных границ.
- Checkpoint `electrical.{variant_id}` предотвращает повтор уже завершённого ЭР
  после recovery.
- Ошибка одного ЭР не должна молча превращать весь набор в succeeded. Верни
  per-ER structured result и итоговый статус согласно существующей fail-closed
  policy либо зафиксируй отдельное решение до реализации.

### 4. Specification

- Пользователь явно отмечает один или несколько ЭР в specification dialog.
- Кнопка показывает scope: «Сформировать выбранные ЭР (N)».
- Request содержит точный `variant_ids`, без implicit default.
- Specification использует только сохранённые electrical results выбранных ЭР.
- Specification не вызывает heat и `batch_calc_electrical`.
- Другие ЭР и их specifications не меняются.
- Confirmation/catalog-selection flow относится к тому же зафиксированному
  набору UUID; resume не добавляет и не удаляет ЭР.
- При invalid/stale/missing prerequisite вернуть per-ER diagnostic с
  `electrical_variant_id`, затронутыми `object_id` и next action.
- Переход по next action не запускает пересчёт автоматически.

## Судьба `project_pipeline`

Текущий `project_pipeline` выполняет скрытый каскад
`electrical -> specification`. Это противоречит принципу «одна кнопка — одна
операция», даже когда ER scope выбран явно.

Целевая модель:

- electrical UI создаёт только electrical task для выбранного ER set;
- specification UI вызывает только specification preflight/generation для
  выбранного ER set;
- heat UI создаёт только heat task;
- frontend больше не использует `project_pipeline`;
- `project_pipeline`, endpoints, schemas, worker dispatch и frontend client/hook
  удаляются, если после перевода consumers не остаётся;
- не оставляй скрытый или disabled путь `electrical -> specification`;
- не заменяй pipeline frontend-циклом, который после electrical автоматически
  вызывает specification.

Старых активных `project_pipeline` задач в целевой среде нет; backward
compatibility не требуется. Если task-type constraint перечисляет pipeline,
обнови его минимальной новой миграцией, не переписывая историю миграций.

Если обнаружен доказанный внешний consumer, без которого удалить pipeline
невозможно, остановись и верни:

```text
FILE / EVIDENCE / DECISION NEEDED
```

## API-контракт explicit ER set

1. Multi-ER calculation/generation request принимает только явный непустой
   список UUID.
2. `min_length=1`, `max_length=MAX_ELECTRICAL_VARIANTS`, UUID уникальны.
3. Пустой список, omitted key, `null`, unknown UUID и UUID другого проекта
   завершаются typed `422/404/403` до enqueue/mutation.
4. Не подставляй current/default/first/all ER на backend.
5. Не фильтруй неизвестные UUID молча и не выполняй «валидное подмножество».
6. Singular endpoints могут сохраняться для object-scoped действий текущего ЭР.
7. Idempotency fingerprint включает упорядоченный ER UUID-list, object scope и
   параметры команды.
8. Replay того же ключа с другим порядком или составом ER set возвращает typed
   conflict, если порядок является частью execution contract.
9. Response и audit event содержат точный requested/completed/failed ER set.
10. Read-only reports/exports могут агрегировать несколько ЭР отдельно; они не
    являются расчётной командой и не должны запускать side effects.

## Worker, checkpoints и progress

Для multi-ER electrical task с `N` выбранными ЭР:

- `progress_total = N`;
- после каждого успешно сохранённого electrical checkpoint
  `progress_current += 1`;
- skipped checkpoint при recovery не увеличивает progress повторно;
- retry сбрасывает execution checkpoints и начинает тот же ER set заново либо
  следует явно существующей retry policy, но не меняет scope;
- recovery сохраняет persisted checkpoints и продолжает незавершённые ЭР;
- terminal transition не публикуется без fencing token;
- repeated Redis delivery terminal task ничего не пересчитывает;
- heat/specification stages отсутствуют.

Для specification command progress описывает только specification выбранного
ER set. Не учитывай heat/electrical как скрытые стадии.

Если specification остаётся синхронным canonical API, не создавай background
task ради симметрии. Если измерения требуют async specification task, это
отдельный task type только для specification, без electrical cascade.

## Project guard и конкурентность

- Не ослабляй существующий project calculation guard.
- Второй несовместимый submit во время active task получает существующий busy
  contract, а не скрытую очередь.
- Не добавляй `Promise.all` отдельных ER tasks как обход единого explicit-set
  контракта.
- Один multi-ER request должен иметь одну idempotency identity и persisted scope.
- Разные worker могут обслуживать разные проекты.
- Внутри одного проекта ER set обрабатывается последовательно в этом slice.

## Frontend UX

1. Singular object/all actions на electrical page остаются привязаны к active ER.
2. Multi-ER recalculation является отдельным осознанным действием, а не
   побочным эффектом кнопки текущего ЭР.
3. Selection control показывает все доступные ЭР без скрытых preselected items.
4. Для `N >= 2` confirmation перечисляет точные имена ЭР.
5. Кнопка disabled при пустом selection.
6. После выбора текст содержит количество: «Пересчитать выбранные ЭР (N)» или
   «Сформировать выбранные ЭР (N)».
7. Во время active command selection snapshot фиксирован; смена вкладки или
   checkbox не меняет уже отправленный scope.
8. Double click создаёт одну команду.
9. Reload/polling восстанавливает только существующую command и её ER set.
10. Typed prerequisite diagnostic предлагает перейти к проблемному ЭР, но не
    запускает расчёт при переходе.
11. Удали текст «Полный расчёт», если реальный эффект — только electrical либо
    только specification.

## Надёжность и side-effect boundaries

- Формулы, коэффициенты, справочники, units и rounding не меняются.
- Electrical использует сохранённые heat results и не вызывает heat.
- Specification использует сохранённые electrical results и не вызывает
  electrical/heat.
- Ошибка heat не меняет electrical/specification.
- Ошибка electrical не меняет heat/specification.
- Ошибка specification не меняет heat/electrical.
- Cancellation, retry, resume и recovery не расширяют requested ER set.
- Frontend не является correctness boundary: backend повторяет scope validation.
- Не добавляй catch-all fallback или auto-repair соседней стадии.

## Обязательные backend-тесты

Добавь или обнови минимум следующие сценарии:

1. Singular electrical action вызывает один `batch_calc_electrical` с точным ER.
2. Explicit set `[ER1, ER2]` вызывает ровно ER1, затем ER2.
3. ER3 проекта не вызывается и его persisted state побайтово не меняется.
4. Electrical multi-ER task не вызывает `batch_recalculate` и specification.
5. Specification `[ER1, ER2]` не вызывает heat/electrical и не меняет ER3.
6. Empty/omitted/null ER set отклоняется до enqueue.
7. Unknown/cross-project UUID отклоняет всю command без частичного выполнения.
8. Duplicate UUID отклоняется, а не рассчитывается дважды.
9. Idempotent replay возвращает ту же task/result.
10. Тот же ключ с другим составом/порядком UUID возвращает typed conflict.
11. Checkpoint ER1 при recovery пропускает ER1 и выполняет только ER2.
12. Retry не добавляет и не удаляет ER UUID.
13. Потеря fencing token не публикует следующий checkpoint/terminal result.
14. Repeated delivery terminal task ничего не выполняет.
15. Heat batch не вызывает electrical/specification.
16. Object heat-input mutation пересчитывает только изменённый объект.
17. `project_pipeline` больше не создаётся/dispatch-ится после удаления consumers.

Хотя бы один integration-тест создаёт ER1, ER2, ER3 с различимыми state,
выполняет explicit command `[ER1, ER2]` и доказывает полную неизменность ER3.

## Обязательные frontend-тесты

1. Один выбранный ЭР отправляет список из одного точного UUID.
2. Явно выбранные ER1 и ER2 отправляют `[ER1, ER2]` без ER3.
3. Пустой selection не позволяет submit.
4. Для двух ЭР confirmation перечисляет оба имени.
5. Невидимый/невыбранный ЭР не попадает в payload.
6. Specification submit не вызывает calculation workflow/electrical API.
7. Electrical submit не вызывает heat/specification API.
8. Active operation использует frozen selection snapshot.
9. Double click создаёт одну command.
10. Reload/polling не создаёт command повторно.
11. Diagnostic navigation не запускает автоматический расчёт.
12. Singular «Пересчитать выбранные объекты» сохраняет точные `object_ids` и
    current ER UUID.

## Browser/E2E proof

Это browser-visible cross-owner изменение.

1. Выполни `npm run agent:scope -- --changed --json` из `frontend/`.
2. Выполни required proof через `agent:proof-run` и `agent:proof-check`.
3. Проверь Browser/Playwright на `1000`, `1280`, `1440x900`:
   - существуют ER1, ER2, ER3;
   - без selection submit disabled;
   - выбраны ER1 и ER2, confirmation называет только их;
   - network payload содержит только UUID ER1/ER2;
   - electrical request не порождает heat/spec requests;
   - specification request не порождает heat/electrical requests;
   - reload не создаёт новую command;
   - console и неожиданные network failures отсутствуют.
4. E2E запускай только из `e2e/`.
5. Full dual-safe DoD локально запускай только по отдельному явному запросу.

## Проверки backend

Запусти фактически доступные:

- focused task/electrical/specification unit tests;
- API integration electrical jobs/specification generation;
- idempotency, project guard, fencing, retry/recovery;
- object mutation heat-scope tests;
- Ruff check/format изменённых Python-файлов;
- migration tests при изменении task-type constraint.

Не называй незапущенное green и не исправляй unrelated failures.

## Non-goals

- Не менять формулы, коэффициенты, справочники и округление.
- Не добавлять Go-сервис.
- Не менять Redis transport.
- Не распараллеливать ЭР одного проекта.
- Не добавлять implicit-all.
- Не менять read-only multi-ER reports/exports без доказанной связи.
- Не ослаблять project guard.
- Не добавлять backward compatibility для `project_pipeline`.
- Не выполнять общий frontend/backend refactor.
- Не чинить performance harness в этом slice.

## Критерий готовности

Изменение готово только если доказано:

- одна кнопка создаёт одну command одного доменного типа;
- command выполняет ровно явно выбранный ER/object scope;
- multi-ER работает только после явного выбора каждого ЭР;
- implicit-all отсутствует и на frontend, и на backend;
- heat, electrical и specification не запускают друг друга;
- невыбранные ЭР/объекты побайтово не меняются;
- retry/recovery/idempotency/fencing не расширяют scope;
- формулы и результаты при одинаковых входах не изменились;
- UI и network behavior подтверждены browser proof.

После проверок создай один scoped conventional commit только из файлов задачи.
Push не выполняй.
