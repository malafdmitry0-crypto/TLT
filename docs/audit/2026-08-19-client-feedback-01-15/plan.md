# Замечания 1–15 — план исправлений по vertical slices

**Статус:** PROPOSED execution packet, не ACTIVE-очередь.

**Исходное состояние:** [snapshot.md](./snapshot.md)

**Исполняемые промпты:** [prompts.md](./prompts.md)

Этот пакет запускается только по явному выбору пользователя. Он не добавляет
`pending`, не меняет статусы и не конкурирует с единственной ACTIVE
frontend-очередью в
[docs/frontend/refactor-backlog.md](../../frontend/refactor-backlog.md).
Один agent run выполняет один слайс, одного feature-owner и один commit.

## Цель

Закрыть остаток замечаний 1–15 без смешивания независимых причин изменения:

- сделать импорт честным по отношению к form/domain validation;
- обеспечить обратимый XLSX/CSV round-trip и явную семантику источников;
- показывать зависимые ошибки там, где пользователь может их исправить;
- различать ручной выбор кабеля и автоматический поиск по каталогу;
- восстановить автогенерацию имён и видимость реально применённого I доп;
- закрыть два небольших навигационных/контрастных дефекта;
- скрыть технический `tm`, сохранив внутренний расчёт;
- сделать session contract измеримым и не терять draft при обновлении auth;
- разрешить ручной override λ для справочного материала без потери его кода.

## Зафиксированные решения

### Импорт

1. Импорт остаётся best-effort: валидные строки создаются, невалидные
   пропускаются. Невалидная строка не входит в `created` и не появляется в
   проекте красной строкой.
2. Для каждой пропущенной строки результат содержит лист/строку, поле,
   машинный код и понятное русское сообщение. Frontend показывает число
   созданных и число пропущенных по валидации отдельно.
3. Если экспортированное climate-значение не менялось, источник остаётся
   `climate`. Если пользователь изменил редактируемую ячейку температуры, это
   явный manual override, даже если служебная ячейка всё ещё содержит
   `climate`.
4. CSV имеет семантический паритет с XLSX. Равенство определяется набором
   импортируемых полей и round-trip, а не случайным совпадением количества
   физических колонок.

### UI и формулы

1. Зависимая ошибка содержит конкретное условие и значения. Для формы она
   видна у поля и в summary до отправки; backend остаётся авторитетной границей.
2. При ручной марке кабеля сообщение называет выбранную марку и требуемое либо
   нарушенное значение. Каталожная формулировка остаётся только для auto mode.
3. Применённый I доп показывается по каждой рассчитанной строке вместе с
   источником `по каталогу`/`проектный`. Поле проектной настройки не подменяет
   объектное applied value.
4. Кнопка Guest Help называется «Назад», использует реальную историю и имеет
   fallback в `/workspace/heat-calc`.
5. Ссылка выхода администратора имеет видимый hover/focus и контраст не ниже
   4.5:1 на фактическом фоне header.

### `tm` и λ изоляции

1. Последнее указание пользователя заменяет прежнюю позицию в
   `answers/03-insulation-temperature-mode`: `tm` не показывается на доске — ни
   в форме, ни в таблице, ни в настройках колонок. Внутреннее значение и
   формула сохраняются; basis детерминированно выводится из placement.
2. Последнее указание пользователя расширяет прежнюю позицию в
   `answers/01-insulation-conductivity`: справочный material можно оставить
   выбранным и вручную переопределить λ.
3. Источник λ явный: `reference` либо `manual_override`. Код материала не
   подменяется на `other`; сброс override возвращает справочную зависимость.
4. Контракт действует отдельно для каждого поддержанного слоя и для pipe/tank.

### Сессии

Пять минут ожидания не должны терять введённые данные независимо от момента
выдачи токена. В качестве минимального проверяемого контракта принимается:

- гостевая сессия — sliding TTL не менее трёх суток, как обещает Help;
- сотрудник — короткий access token допустим только при прозрачном refresh;
  refresh session сохраняет вход не менее семи суток;
- значения заданы одной конфигурационной цепочкой и реально передаются в
  compose/runtime;
- незавершённый локальный draft переживает access-token rollover и
  восстанавливаемую сетевую ошибку.

Увеличивать security TTL сверх этих значений без отдельного продуктового
решения не требуется: сначала устраняется конфигурационный дрейф и проверяется
сам путь обновления сессии.

### Температурные границы

Пункт 14 не дублируется. Его owner и контракты уже находятся в
[ATB plan](../../../answers/05-ambient-temperature-bounds/plan.md) и
[ATB prompts](../../../answers/05-ambient-temperature-bounds/prompts.md).
Этот пакет только задаёт handoff gate и финальную общую регрессию.

## Порядок и зависимости

```text
текущий ATB WIP → FB15-00 → завершить конфликтующие ATB-03*/ATB-04
                                  ↓
FB15-01A → FB15-01B               импортная сводка
     ↓
FB15-02                           edit intent температуры
     ↓
FB15-03A → FB15-03B               schema → CSV parity

FB15-04A → FB15-04B               backend message → ранняя form validation
FB15-05                           ручная марка кабеля
FB15-06A → FB15-06B               name model → draft persistence
FB15-07A → FB15-07B               result projection → visible applied I доп
FB15-08                           Guest Help Back
FB15-09                           Admin Logout contrast

FB15-10A → FB15-10B → FB15-12A → FB15-12B → FB15-12C → FB15-12D
 basis derived    hide tm       λ backend   λ mapping    λ UI       interchange

FB15-11A → FB15-11B               config → rollover/draft

все выбранные ветки → FB15-QA
```

Импортная цепочка FB15-01A → 02 → 03A → 03B выполняется строго
последовательно: все слайсы владеют
`backend/app/services/excel_import_service.py`. FB15-12D стартует только после
неё. FB15-10B и FB15-12C также последовательны, потому что оба меняют wizard и
field registry.

## Реестр слайсов

| ID | Owner | Пункты | Наблюдаемый результат | Зависит от |
|---|---|---:|---|---|
| FB15-00 | qa/handoff | 14 | Чужой ATB WIP классифицирован и конфликтующие файлы освобождены без смешивания слайсов | — |
| FB15-01A | heat/interchange | 2 | Невалидные строки не сохраняются; response содержит structured row errors | FB15-00/ATB-04 |
| FB15-01B | heat/frontend | 2 | Модалка честно показывает created/invalid и причины | FB15-01A |
| FB15-02 | heat/interchange | 3 | Изменённая climate-ячейка импортируется как manual override | FB15-01A |
| FB15-03A | heat/interchange | 4 | Один канонический descriptor владеет spreadsheet fields/headers | FB15-02 |
| FB15-03B | heat/interchange | 4 | CSV заводит underground и многослойный объект без потерь | FB15-03A |
| FB15-04A | heat/backend | 5 | Обе зависимые ошибки имеют field-aware русский текст и числа | — |
| FB15-04B | heat/frontend | 5 | Те же правила видны до save у поля и в summary | FB15-04A |
| FB15-05 | electrical | 6 | Manual cable error называет марку и нарушенный предел | — |
| FB15-06A | heat/frontend | 8 | Pure name model безопасно строит underground имена по T грунта | FB15-00 |
| FB15-06B | heat/frontend | 8 | Watch/sync сохраняет автоимя в draft и object payload | FB15-06A |
| FB15-07A | electrical/frontend | 9 | Pure projection извлекает applied I доп и source из результата | FB15-00 |
| FB15-07B | electrical/frontend | 9 | В каждой строке виден применённый I доп и его источник | FB15-07A |
| FB15-08 | help/frontend | 10 | Guest Help возвращает в проект; fallback ведёт в heat workspace | — |
| FB15-09 | admin/frontend | 11 | Выход видим и доступен с клавиатуры во всех desktop-профилях | — |
| FB15-10A | heat/frontend | 12 | Internal basis детерминированно выводится из placement | FB15-00 |
| FB15-10B | heat/frontend | 12 | `tm` исчезает из формы, таблицы и настроек колонок | FB15-10A |
| FB15-11A | auth/backend | 13 | Runtime TTL имеет один источник и наблюдаемое значение | — |
| FB15-11B | auth/frontend | 13 | 5+ минут и access rollover не теряют draft пользователя/гостя | FB15-11A |
| FB15-12A | heat/backend | 15 | API/core поддерживает per-layer manual λ override у reference material | FB15-10B |
| FB15-12B | heat/frontend | 15 | Typed form↔API mapping сохраняет material, λ и source | FB15-12A |
| FB15-12C | heat/frontend | 15 | Пользователь включает/сбрасывает override для каждого слоя | FB15-12B |
| FB15-12D | heat/interchange | 15 | λ/source переживают project/XLSX/CSV round-trip и видны в provenance | FB15-03B, FB15-12C |
| FB15-QA | qa/docs | 1–15 | Все сценарии повторены на одном HEAD; пункты 1/7 не регрессировали | все выбранные |

## Контракты слайсов

### FB15-00 — handoff текущего ATB WIP

- Production не менять и не «доделывать» несколько ATB-слайсов одним commit.
- По diff определить точный незавершённый ATB slice и его владельца.
- Сверить diff с контрактом существующего ATB prompt; всё лишнее вернуть как
  `FILE / EVIDENCE / DECISION NEEDED`.
- Импортные слайсы разблокированы только после commit/handoff ATB-04; table
  slices — после commit/handoff ATB-03a/03b.

### FB15-01A — import validation gate

- Characterization: файл с одной валидной и одной строкой с диаметром 5000 мм.
- Выполнять canonical normalization и validation до добавления объекта в batch
  и до dedupe-key mutation.
- Невалидная строка не потребляет sort order/лимит, не создаёт object id и не
  ставится в heat-loss task.
- Response различает `created`, `invalid`, parse errors, duplicates и limit;
  structured error содержит sheet/row/field/code/message.
- Валидные соседи импортируются; `replace` не уничтожает старые данные до
  успешного preflight всех операций, которые обещает его контракт.

### FB15-01B — честная сводка импорта

- Тип `ImportResult` включает backend counts и structured validation errors.
- Toast не говорит «без ошибок», если есть invalid rows.
- Modal раздельно показывает созданные, невалидные, дубли и лимит; причина
  диаметра 5000 мм видна без открытия объекта.
- Loading, error, keyboard, focus и длинный текст проверяются в desktop UI.

### FB15-02 — edited climate value becomes manual

- Unchanged export→import сохраняет `climate` и то же вычисленное значение.
- Если пользователь меняет только temperature cell, импорт сравнивает её с
  ожидаемым climate value и сохраняет введённое число с source=`manual`.
- Пустая/неизвестная climate provenance не угадывается; возвращается
  field-aware row error либо сохраняется legacy behavior, закреплённое тестом.
- Pipe и tank покрыты; подземная pipe не получает воздушное поле.

### FB15-03A — canonical spreadsheet descriptor

- Вынести декларативный descriptor semantic key → aliases/header/unit/object
  applicability/export/import.
- XLSX sheets, CSV template и object export получают заголовки из descriptor;
  порядок остаётся стабильным и старые aliases сохраняются.
- Characterization доказывает отсутствие потерь до включения новых CSV fields.
- Не менять validation, source precedence или продуктовые формулы.

### FB15-03B — CSV semantic parity

- Включить все применимые поля: грунт/температура/глубина/λ, труба/λ,
  три слоя с thickness/material/λ/range, cover и служебные source fields.
- Тест создаёт underground pipe с глиной и глубиной 1.5 м и отдельную pipe с
  тремя слоями, делает CSV parse→params и API import→export→import.
- Семантический set CSV является superset применимых pipe/tank XLSX fields;
  исключения перечислены явно и имеют причину.

### FB15-04A — dependent domain messages

- `invalid_buried_height` преобразуется в текст: заглублённая высота не может
  превышать полную высоту резервуара, с фактическими числами и units.
- Pipe message продолжает использовать наружный радиус вместе со всеми слоями.
- Structured path остаётся `tank_buried_height`/`pipe_centerline_depth`.
- Формула и граница сравнения не меняются.

### FB15-04B — dependent form validation

- Tank H=4 м и buried=10 м блокируется до request с конкретным сообщением.
- Pipe D=108 мм, insulation=50 мм: depth 0.10 м блокируется, 0.11 м проходит.
- Изменение диаметра, слоёв, высоты или placement перевалидирует зависимое
  поле; field message и верхний summary согласованы.
- Backend text остаётся fallback для старого/внешнего клиента.

### FB15-05 — manual cable diagnostics

- При `cable_mark != null` power error имеет вид
  `Выбранная марка <mark> не обеспечивает требуемую мощность <q> Вт/м`.
- Temperature error называет ту же марку, температуру объекта и допустимую
  границу/нарушение.
- При auto mode сохраняются catalog-wide messages.
- Mark и числовые значения берутся из typed details, без парсинга текста;
  query/UI не заменяют конкретный message общим hint.

### FB15-06A — безопасный underground name model

- Генератор выбирает environment temperature по placement: ground для
  underground pipe/tank, ambient для остальных поддержанных случаев.
- Неполные values возвращают пустое предложение без exception/non-null cast.
- Pure unit tests покрывают pipe/tank, обе температуры и неполную форму.

### FB15-06B — watch и сохранение автоимени

- Watch list включает placement и ground temperature.
- Programmatic name вызывает draft callback; сохранённый object содержит имя.
- Ручное имя никогда не перезаписывается автоименем.

### FB15-07A — projection applied I доп

- Pure selector читает canonical `section_plan.max_start_current_a` и source.
- Pending/error/no calculation возвращают явный display state, не числовой 0.
- Legacy result shape поддерживается только при существующем доказанном
  контракте; новые догадки по нескольким полям не добавляются.

### FB15-07B — applied I доп в таблице

- Добавить объектную read-only колонку/ячейку «I доп применённый, А».
- Значение берётся из FB15-07A; рядом различим source `по каталогу` или
  `проектный`.
- Pending/error/no calculation показывают однозначный прочерк/status, не 0.
- Настройка проекта остаётся редактируемой и не выдаётся за объектный предел.
- Catalog fixture с известным результатом проверяет точное отображаемое число.

### FB15-08 — Guest Help Back

- Использовать тот же navigation contract, что у других Help pages.
- Реальная история: `navigate(-1)`; прямой entry без app history:
  `/workspace/heat-calc`.
- Название и accessible name — «Назад»; guest session/project store не
  очищаются и новый проект не создаётся.

### FB15-09 — Admin Logout contrast

- Использовать semantic button/link с клавиатурной активацией и видимым focus.
- Цвет берётся из подходящего token для реального header background;
  normal/hover/focus contrast ≥4.5:1.
- Logout API, store clear и redirect semantics не меняются.

### FB15-10A — internal `tm` из placement

- Pure mapping задаёт действующий canonical basis для каждого placement.
- Form/API sync и edit/recalc используют mapping без ручного control.
- Legacy object с несовместимым basis нормализуется без невидимой ошибки.
- Формула и само поле payload не удаляются.

### FB15-10B — скрыть `tm` с доски

- Удалить control из wizard/full/inline forms и поле из table/settings catalog.
- Internal `insulation_temperature_basis` остаётся в payload и formula input и
  управляется FB15-10A.
- XLSX/project backward compatibility не удаляется в этом слайсе.

### FB15-11A — единый runtime TTL contract

- Устранить расхождение default, `.env`, production example и compose.
- Guest TTL и cleanup interval передаются backend runtime явно; startup log или
  health-safe diagnostic позволяет увидеть effective non-secret values.
- Тест с управляемым временем доказывает sliding touch и границы cleanup.
- Access/refresh cookie max-age соответствует backend token expiry.

### FB15-11B — rollover и draft durability

- Characterization воспроизводит access expiry во время заполнения формы и
  отдельную transient 401/network ветку.
- Employee refresh повторяет запрос один раз без logout/navigation и без
  очистки draft.
- Guest activity продлевает sliding TTL; отсутствующая/реально истёкшая guest
  session не создаёт новый проект молча поверх несохранённой формы.
- Тест минимум 6 минут виртуального времени, без реального `sleep`.

### FB15-12A — backend λ override contract

- Per-layer contract хранит material и явный conductivity source.
- `reference`: λ/range берутся из каталога; `manual_override`: finite positive
  λ пользователя имеет приоритет, material остаётся для идентичности.
- Missing manual value, неизвестный source и несовместимые combinations дают
  structured field errors; legacy `other` продолжает работать.
- Расчётный provenance показывает applied λ и source для каждого слоя.

### FB15-12B — typed λ mapping

- Form types и API mappers хранят material, conductivity value и source для
  каждого поддержанного слоя.
- API→form→API сохраняет reference/manual modes, null/clear и legacy `other`.
- Этот слайс не добавляет visible controls.

### FB15-12C — frontend λ override UI

- Для каждого слоя есть явное действие «Использовать своё значение» и
  «Вернуть из справочника».
- В reference mode видны справочное applied value/source; в override mode
  доступен числовой input с range validation.
- Pipe/tank, первый/второй/третий слой, reopen, placement change и material
  change не теряют выбранный режим.
- Смена материала в reference mode обновляет λ; в manual mode не стирает
  override без подтверждённого product rule.

### FB15-12D — λ interchange и provenance

- Project file, XLSX и CSV сохраняют material, conductivity source и override.
- Старые файлы без source выводят его детерминированно из legacy shape.
- Export→import→recalc сохраняет applied λ и результат; справочный режим не
  материализуется как случайный manual override.
- Report/confirmation показывает применённое значение и источник там, где уже
  выводится λ; нового отдельного redesign нет.

### FB15-QA — финальная приёмка

- Production не менять. Новый дефект возвращается владельцу отдельным слайсом.
- Повторить все 15 исходных сценариев на одном commit и записать новый dated
  snapshot с PASS/FAIL/NOT RUN.
- Пункты 1 и 7 входят как обязательные regression guards.
- Browser matrix выбирается по viewport policy: видимый desktop UI минимум
  `1440×900` плюс релевантные `1000×768`, `1280×800` или `1920×1080`.
- Проверить keyboard/focus, clipping/overflow, console и failed requests.
- Полный frontend DoD запускается локально только по отдельному прямому запросу;
  иначе используется diff-wide calculated proof, а DoD отмечается NOT RUN.

## Волны исполнения

1. **Нулевая:** завершить/передать текущий ATB WIP.
2. **Импортная:** FB15-01A → 01B → 02 → 03A → 03B.
3. **Независимые feature slices:** FB15-04A/B, 05, 06, 07, 08, 09.
4. **Скрытые инженерные параметры:** FB15-10A → 10B → 12A → 12B → 12C → 12D.
5. **Сессии:** FB15-11A → 11B.
6. **Seal:** существующий ATB-QA и общий FB15-QA.

Волны описывают зависимости, а не разрешают склеивать commits. Независимые
ветки можно вести параллельно только в разных worktree/ветках с явными
владельцами; общий dirty workspace для этого не используется.

## Общий proof contract

Backend-слайс запускает точные focused pytest рядом с изменённым поведением и
ruff для затронутой зоны. Формульные изменения дополнительно используют
`scripts/formula-qa.sh quick` по риску.

Frontend-слайс сначала выполняет:

```text
cd frontend
npm run agent:scope -- <каждый production path>
npm run agent:scope -- --changed --json
npm run agent:proof-run -- --changed
npm run agent:proof-check -- --changed
```

Видимый UI требует browser proof по
[viewport-policy.md](../../frontend/viewport-policy.md). E2E запускается только
из `e2e/`. Full `test:agent-dod:dual-safe` не запускается без отдельного прямого
запроса пользователя.

## Критерий закрытия пакета

Пакет закрыт только после FB15-QA на одном HEAD, когда:

1. импорт не создаёт невалидные строки и объясняет каждую пропущенную;
2. ручная правка climate-temperature и все CSV/XLSX поля переживают round-trip;
3. зависимые правила и manual cable errors конкретны;
4. underground names и applied I доп видны и сохраняются;
5. Help Back и Admin Logout работают и доступны;
6. `tm` скрыт, но расчётный basis стабилен;
7. пятиминутная пауза/token rollover не теряет draft;
8. reference material поддерживает обратимый manual λ override;
9. температурные границы закрыты собственным ATB-QA;
10. regression #1 и #7 остаётся зелёной.
