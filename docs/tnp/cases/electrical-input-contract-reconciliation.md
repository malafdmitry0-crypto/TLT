# Сверка источников входов TT-электрорасчёта

**Статус:** повторно проверенное решение по контракту и handoff на исправление

**Дата:** 2026-08-05

**Область:** путь `Heat object -> UUID ЭР -> self_regulating_tt`

**Не является:** новым алгоритмом или заменой [основного ТЗ](./guest-electrical-calculation-tz.md)

## 1. Итоговое решение

1. `product_temperature_c` (`T1`) и `maintain_temperature_c` (`T3`) - разные физические входы.
2. Fallback `maintain_temperature_c = product_temperature_c` неверен и должен быть удалён.
3. Отсутствующие nullable-входы `steam_temperature_c`, `winding_pitch_mm`, `thread_count` и
   `manual_cable_model` после исчерпания источников должны разрешаться как `null`. Эту часть правки
   resolver нужно оставить.
4. Проблема `T3` не в полном отсутствии элемента управления: поле уже есть в **групповой** панели
   ЭР. Но это не объектный источник и не сохранённый per-object override текущего UUID ЭР. Начальное
   значение панели равно `null`, поле необязательно и при пустом значении не попадает в request.
5. Базовый `T3` должен храниться на объекте как `maintain_temperature`; панель ЭР может задавать
   групповой override, а редактирование строки - per-object override текущего ЭР. Если значения нет
   ни в объекте, ни в применимом override, расчёт блокируется с типизированной ошибкой. Скрытых
   defaults и подстановки `T1` быть не должно.
6. `environment` («среда эксплуатации») и `aggressive_product` (`R`, агрессивный продукт) нельзя
   автоматически считать одним полем. Первоисточники описывают разные смыслы. Для `R` нужен
   отдельный объектный ввод и/или явный override ЭР.
7. В новом TT-контракте напряжение равно `230 В`, а авторитетный ввод укладки -
   `winding_pitch_mm`. Поля Heat-формы `supply_voltage=220/380` и `winding_coefficient` не должны
   выглядеть как входы нового TT-расчёта.
8. По решению владельца от 2026-08-05 целевой контракт охватывает `pipe` и `tank`. Для резервуаров
   первоисточник задаёт электрическую раскладку только для `cylindrical` и `rectangular`; для
   `spherical` нельзя изобретать формулу - такой объект должен завершаться fail-closed ошибкой до
   отдельного алгоритма.

## 2. Что подтверждено первоисточниками

Проверены визуально, а не только через извлечённый текст:

- «Алгоритм Самрег. трубы.pdf», лист 1;
- «1 Кейс “Расчёт спецификации для неавторизованных пользователей”», редакция 4 от
  07.07.2026, страницы 26-28 и 42;
- нормализованный контракт [guest-electrical-calculation-tz.md](./guest-electrical-calculation-tz.md),
  имеющий приоритет над текущей реализацией при расхождениях.

Исходные XLSX-книги в эту повторную сверку не включались как самостоятельное доказательство:
обязательный spreadsheet runtime в текущей сессии недоступен. Выводы ниже опираются на визуально
проверенные PDF, нормализованное ТЗ, фактический UI/API/backend-код и сфокусированные тесты. Там,
где нормализованное ТЗ уже фиксирует решение по книге, это явно названо решением ТЗ, а не новой
интерпретацией XLSX.

Основное ТЗ пока называет формулу резервуара будущим расширением и ограничивает прежний MVP
трубопроводом. Этот документ намеренно расширяет scope после явного решения владельца. Источник
для расширения есть на странице 42 кейса:

```text
цилиндр:       perimeter = pi * diameter
прямоугольник: perimeter = 2 * (length + width)
Lbase = (perimeter / 2) * (heating_height / laying_step)
q = heat_loss_without_repeated_safety / Lbase
```

Для сферического резервуара электрическая формула раскладки в проверенных источниках отсутствует.

Алгоритм объявляет отдельные переменные:

```text
T1 = температура продукта
T2 = температура пропарки
T3 = температура поддержания
R  = агрессивный продукт
Pоб = теплопотери
```

Назначение переменных различается:

- `T1` и применимый `T2` выбирают серию `ТТН` / `ТТВ` / `ТТХ`;
- `T3` входит в кривую мощности `Pкаб(T3) = q1 * T3 + q2`;
- `R` участвует в выборе исполнения марки;
- число ниток в auto-режиме рассчитывается, а в ручном режиме является проверяемым override.

Кейс отдельно перечисляет `process_temperature` и `maintain_temperature` в технической
трассировке объекта. Поэтому подпись `process_temperature` как «Температура поддержания» в части
текущего UI не превращает `T1` и `T3` в одну величину.

### Уточнение по суффиксу марки

Фраза «`R` всегда выбирает `-СТ` или `-СР`» слишком широкая. По нормализованному контракту и
текущей формуле:

```text
ТТН:  aggressive_product=true -> -СР, false -> -СТ
ТТВ:  -СР
ТТХ:  -СР
```

Это соответствует ветвлению исходной блок-схемы: проверка `R=1` расположена на пути `ТТН`, а
ветви `ТТВ` и `ТТХ` приходят к `-СР` напрямую.

## 3. Оценка выводов второго агента

| Утверждение | Вердикт | Комментарий |
|---|---|---|
| `T1` и `T3` различаются | Согласен | Прямо следует из алгоритма и формулы мощности |
| Fallback `T3=T1` неверен | Согласен | Он меняет мощность кабеля и может изменить модель/число ниток |
| Отсутствующий `T2` может быть `null` | Согласен | `null` означает отсутствие применимой пропарки |
| Отсутствующие шаг, нитки и ручная марка могут быть `null` | Согласен | Это соответственно прямая укладка, auto и автоматический выбор |
| У четырёх полей вообще нет источника в UI | Не согласен | `T2/T3` есть на панели ЭР; шаг/нитки/ручная марка есть в построчных редакторах и модалках |
| Нужно добавить `T3` на панель ЭР | Частично не согласен | Групповое поле уже существует; отсутствуют объектный источник и полноценный per-object override текущего ЭР |
| `environment=aggressive` обязательно означает `R=true` | Не подтверждено | Кейс: среда эксплуатации нужна для материалов/исполнения; алгоритм: `R` означает агрессивный продукт |
| `number_of_threads` только выход | Частично не согласен | `applied thread count` - выход; `requested thread count` - допустимый ручной вход `1..3` |
| Флаг `steam_tracing` можно игнорировать | Не согласен | Он не входит в формулу, но должен управлять обязательностью/очисткой `T2` |
| Напряжение формы должно поддерживаться TT-формулой | Не согласен | Целевой MVP-контракт фиксирует серверные `230 В`; устаревшие варианты надо убрать из TT-UI |

## 4. Что фактически умеет текущий UI

Слова «источника в интерфейсе нет» смешивают отсутствие автоматического значения с отсутствием
элемента управления.

| Вход | Фактический UI | Текущая проблема |
|---|---|---|
| `T2 / vapor_temperature` | Heat-форма и групповая панель ЭР | Пустое значение опускается из UUID-first job request; связь со `steam_tracing` не выражена |
| `T3 / maintain_temperature` | Групповая панель ЭР | Начальное значение `null`; request опускает поле; объектного round-trip и обязательности нет |
| `aggressive_product` | Групповой чекбокс панели ЭР | Начальное `false` всегда отправляется и перебивает возможное объектное значение |
| `winding_pitch_mm` | Построчная колонка/модалка подбора | В Heat-форме вместо него показывается legacy `winding_coefficient`; assignment resolver его сейчас не получает |
| `thread_count` | Построчная колонка/модалка подбора | `null` корректен для auto; assignment resolver сейчас получает только `Iдоп` |
| `manual_cable_model` | Выбор марки в строке/модалке | Manual-flow отправляет `cable_mark`; обычный batch по замыслу не задаёт модель |
| Tank `heating_height` / `laying_step` | State и request-поля существуют | Для TT контролы скрыты веткой `isResistive`; request всё равно несёт скрытый `laying_step=0.1`, а backend подставляет полную высоту резервуара |

Ключевые точки реализации:

- состояние `T2/T3/R`: [useElecCalcRecalculationParams.ts](../../../frontend/src/pages/electrical/useElecCalcRecalculationParams.ts);
- формирование batch request: [electricalBatchCalc.ts](../../../frontend/src/api/electricalBatchCalc.ts);
- поля панели ЭР: [ElecCalcParamsPanel.tsx](../../../frontend/src/pages/electrical/ElecCalcParamsPanel.tsx);
- построчные шаг/нитки: [useElecCalcGlideLayoutCommit.ts](../../../frontend/src/pages/electrical/useElecCalcGlideLayoutCommit.ts);
- ручная марка: [useElecCalcCableSelectionMutationFlow.ts](../../../frontend/src/pages/electrical/useElecCalcCableSelectionMutationFlow.ts).

Для UUID-first фоновой задачи JSON-сериализация удаляет значения `undefined`. Поэтому пустые
`T2`, `T3`, шаг и число ниток физически отсутствуют в `ElectricalBatchJobRequest.model_fields_set`.
При этом текущий boolean state всегда добавляет `aggressive_product=false`. Это проверено не только
чтением TypeScript: `ElectricalBatchJobRequest.electrical_params()` на UI-подобном payload вернул
только `supply_voltage`, `aggressive_product` и `selection_policy` из перечисленных здесь полей.

Resolver как общий компонент умеет precedence для любого assignment-поля, но фактический
`CalculationService._prepare_self_regulating_tt_request()` передаёт из assignment только
`max_section_start_current_a`. Поэтому нельзя описывать шаг, нитки и ручную модель как уже
работающие assignment-источники.

Для tank есть дополнительный конфликт имён: построчный `winding_pitch` одновременно попадает в
канонический трубный `winding_pitch_mm` и используется как fallback для tank `laying_step`.
Резервуар после этого требует отсутствующий `outer_diameter_mm`. В целевом UI трубный шаг навива
для tank недоступен; tank получает отдельный шаг раскладки в метрах.

## 5. Все 15 канонических входов: факт и целевой контракт

Таблица специально разделяет текущий runtime и целевое состояние. Общий resolver поддерживает
precedence `explicit -> assignment -> project -> object/Heat -> mock`, но сервис передаёт не все
эти источники для каждого поля.

| Канонический вход | Что реально приходит сейчас | Целевой источник/override | Пустое значение |
|---|---|---|---|
| `product_temperature_c` | object `process_temperature`; canonical/legacy API override возможен, но групповой UI его не отправляет | object source; per-object override текущего ЭР по ТЗ | ошибка |
| `steam_temperature_c` | object `vapor_temperature`; групповой request override | object source с правилом пропарки; per-object/group override текущего ЭР | `null`, если пропарка не применяется |
| `maintain_temperature_c` | object `maintain_temperature`, если ключ создан вне wizard; групповой request; ошибочный WIP fallback из `T1` | обязательный object source; per-object/group override текущего ЭР | ошибка |
| `cold_start_temperature_c` | object `min_switch_temperature`, затем `ambient_temperature` | object/Heat source | ошибка |
| `aggressive_product` | object `aggressive_product`, если ключ существует; групповой UI всегда отправляет `false/true` | обязательный object source; tri-state per-object/group override текущего ЭР | default `false` только для явно нового объекта |
| `winding_pitch_mm` | object legacy keys `winding_pitch`/`winding_pitch_mm`; явный построчный request без фильтра по типу объекта | только pipe: сохранённый per-object layout override текущего ЭР; для tank всегда `null` | `null` = прямая укладка/неприменимо для tank |
| `thread_count` | object legacy `number_of_threads`; явный построчный request | сохранённый per-object override текущего ЭР | `null` = auto `1..3` |
| `manual_cable_model` | explicit `cable_mark` в manual-flow; assignment в resolver не передаётся | ручной выбор, сохранённый в текущем ЭР | `null` = auto |
| `max_section_start_current_a` | project electrical settings; это единственное поле assignment, реально передаваемое resolver | project setting; per-object assignment override | ошибка |
| `selection_policy` | групповой request либо object param; фактически `technical_minimum` | backend/UI constant `technical_minimum` в MVP | другие значения не поддержаны |
| `safety_factor` | Heat result `safety_factor_applied`, затем object params | Heat result/object source без повторного применения | ошибка |
| `base_length_m` | pipe: Heat `effective_length`, затем object `pipe_length`; tank: геометрия раскладки, но со скрытыми defaults | pipe source; tank `Lbase` из shape/dimensions + явных `heating_height`/`laying_step` | ошибка |
| `outer_diameter_mm` | pipe object `outer_diameter * 1000`; для tank отсутствует | pipe object source; для tank всегда `null` | `null` допустим при прямой укладке pipe и для tank |
| `heat_loss_per_meter_w` | pipe: Heat `heat_loss_per_meter_base`; tank сейчас использует `total_heat_loss_base / Lbase` и теряет `q_additional` | pipe как сейчас; tank `(total_heat_loss_design / safety_factor_applied) / Lbase` | ошибка |
| `nominal_voltage_v` | backend constant `230`; иное явное значение отклоняется | backend constant | всегда `230` |

Текущий object-to-canonical mapping находится в
[calculation_service.py](../../../backend/app/services/calculation_service.py), а порядок источников - в
[electrical_input_resolver.py](../../../backend/app/services/electrical_input_resolver.py).

Tank-преобразование выполняется до 15-полевого resolver. Его upstream-входы (`shape`, размеры,
`heating_height`, `laying_step`) обязаны попасть в provenance и stale fingerprint, иначе одинаковые
канонические числа невозможно доказуемо восстановить из исходных данных.

## 6. Решение по спорным полям

### 6.1 `maintain_temperature_c`

Целевое поведение:

1. Добавить `maintain_temperature` в реестр и форму исходных данных для подбора кабеля.
2. Сохранять его в `params` объекта.
3. Оставить существующий групповой `T3` панели ЭР как batch override, а не как единственный
   источник; реализовать требуемое ТЗ per-object редактирование с сохранением в текущем UUID ЭР.
4. Отсутствующий override должен переходить к object value. Явный `null` для обязательного `T3`
   очищает сохранённый override и также возвращает resolution к object value; если его нет - ошибка.
5. Если после resolution значения нет, вернуть `ELECTRICAL_INPUT_REQUIRED` с полем
   `maintain_temperature_c` и не строить кабель/секции/BOM.
6. Удалить runtime resolver fallback `object_product_temperature`. WIP-тест, который требует
   `T3=T1`, заменить тестом типизированной ошибки; тест явного/object precedence сохранить.

В `electrical_candidate_dedupe.py` существует отдельный fallback `maintain_temperature ->
process_temperature` для ключа дедупликации старых кандидатов. Это не источник расчётного T3.
Его можно оставить только как явно ограниченный read/migration boundary для legacy-истории либо
удалить с повышением версии dedupe key; он не должен делать новый объект расчётным.

### 6.2 `steam_temperature_c` и `steam_tracing`

`steam_tracing` - upstream-признак применимости, а не один из 15 входов формулы:

- `steam_tracing=no` -> итоговый `T2=null`; сохранённый устаревший T2 должен быть очищен/проигнорирован;
- `steam_tracing=yes` -> override текущего ЭР имеет приоритет, затем используется object
  `vapor_temperature`; итоговый T2 обязателен;
- поле T2 в UI доступно только при включённой пропарке;
- отсутствие object value и override при `steam_tracing=no` является корректным состоянием.

Это сохраняет нормативный смысл `null`, но делает правило пропарки явным.

### 6.3 `environment` и `aggressive_product`

До отдельного бизнес-решения поля считаются разными:

- `environment` - условия эксплуатации, материалы и спецификация;
- `aggressive_product` - вход `R` алгоритма кабеля.

Нельзя добавлять неявный alias `environment -> aggressive_product`. Вместо этого:

1. добавить отдельный объектный boolean «Агрессивный продукт» в блок подбора кабеля;
2. сделать групповой и per-object override tri-state (`undefined | false | true`), чтобы отсутствие
   override не перебивало object value;
3. для явно нового объекта разрешить осознанный default `false`, как требует основное ТЗ;
4. фиксировать источник `R` в provenance.

### 6.4 Навив трубы, раскладка резервуара и нитки

- Удалить `winding_coefficient` из списка авторитетных TT-входов Heat-формы.
- Для pipe пользователь задаёт `winding_pitch_mm`; backend вычисляет `Kнав`.
- Для tank `winding_pitch_mm=null` и `Kнав=1`; вместо него используются отдельные
  `heating_height` и `laying_step` в метрах.
- Не использовать tank `laying_step` как alias трубного `winding_pitch_mm` ни в одну сторону.
- `thread_count=null` запускает auto `1..3`.
- Ручной `thread_count` остаётся входом и валидируется как `1`, `2` или `3`.
- Шаг, запрошенное число ниток и ручная модель должны храниться как per-object override текущего
  UUID ЭР. Сейчас `CalculationService` передаёт из assignment только `Iдоп`; одного наличия
  построчных редакторов недостаточно.
- В результате раздельно хранить `requested_thread_count` и `applied_thread_count`.

### 6.5 Напряжение

Для текущего TT MVP:

- единственное значение - backend-authoritative `230 В`;
- в панели ЭР оно показывается read-only;
- варианты `220/380` удаляются из TT-части Heat-формы;
- значение `supply_voltage` старого объекта не становится входом нового TT-расчёта.

Поддержка других напряжений потребует отдельной версии формулы, каталогов секционирования и
контракта; это не исправление маппинга.

### 6.6 Резервуары

Целевой TT-контракт поддерживает pipe и два вида tank:

- `cylindrical`: нужны `diameter > 0`, `heating_height > 0`, `laying_step=0.1..0.4 м`;
- `rectangular`: нужны `length > 0`, `width > 0`, `heating_height > 0`,
  `laying_step=0.1..0.4 м`;
- `spherical`: fail closed с типизированной ошибкой `ELECTRICAL_TANK_SHAPE_UNSUPPORTED`, потому что
  формулы раскладки в источнике нет.

`heating_height` и `laying_step` являются обязательными upstream-входами tank. Они не увеличивают
15-полевой канонический набор: backend сначала вычисляет `base_length_m`, затем передаёт его
resolver. Подстановка `heating_height=height` и скрытый UI-default `laying_step=0.1` недопустимы.
Default разрешён только если он видим пользователю, сохранён как принятое значение и отражён в
provenance.

`shape` и габариты берутся из Heat-объекта. `heating_height` и `laying_step` хранятся как
per-object layout текущего UUID ЭР; групповое действие может записать их нескольким объектам, но
не становится скрытым глобальным источником.

Тепловая мощность tank передаётся без двойного запаса и без потери дополнительных теплопотерь:

```text
Qwithout_repeat = total_heat_loss_design / safety_factor_applied
heat_loss_per_meter_w = Qwithout_repeat / base_length_m
downstream Qrequired = heat_loss_per_meter_w * safety_factor_applied
```

Текущий `_tt_object_heat_inputs()` вместо этого использует `total_heat_loss_base / Lbase`, поэтому
`q_additional` исчезает. В сервисе уже есть корректный helper
`_tank_heat_loss_without_double_safety()`; новый TT mapping должен использовать ту же семантику.

## 7. Порядок исправления

1. Удалить runtime fallback `T3=T1`; заменить только тест, который закрепляет эту подстановку.
2. Оставить resolution отсутствующих nullable-полей в `null` после mock/source precedence.
3. Добавить object field `maintain_temperature` и сквозной round-trip формы.
4. Сделать readiness/error для отсутствующего итогового `T3`.
5. Перевести `aggressive_product` override в tri-state и добавить отдельный object field `R`.
6. Связать `steam_tracing` с обязательностью `vapor_temperature`.
7. Сохранять per-object `T2/T3/R/шаг/нитки/ручную модель` в текущем UUID ЭР и фактически
   передавать эти assignment overrides resolver.
8. Добавить для cylindrical/rectangular tank явные `heating_height` и `laying_step`, разнести их с
   pipe `winding_pitch_mm` и включить исходную геометрию в provenance/stale fingerprint.
9. Исправить tank power mapping: использовать `total_heat_loss_design / K / Lbase`, сохранив
   `q_additional` и применив запас ровно один раз.
10. Убрать из TT-формы ложные входы `220/380` и `winding_coefficient`, не затрагивая их возможных
   legacy/resistive-потребителей.
11. Для spherical tank вернуть типизированную unsupported-ошибку до создания результата.
12. Обновить E2E для pipe и cylindrical/rectangular tank: объект без `T3` получает понятную ошибку;
    после заполнения обязательных входов расчёт проходит.
13. Удалить из `elec-calculation.spec.ts` ожидания старого контракта СО1-СО4; не переносить их в
    ЭР1 ради формального сохранения покрытия.

## 8. Минимальные критерии приёмки

- Объект `T1=80`, `T3=10` сохраняет разные значения в `resolved_inputs` и provenance.
- Изменение только `T3` меняет `Pкаб(T3)`; выбор серии по `T1/T2` не меняется.
- Объект без `T3` не получает успешный электрический результат.
- Пустой групповой T3 не стирает объектный T3; per-object T3 меняет только выбранный объект и
  только текущий UUID ЭР.
- Отсутствующий `T2` даёт `steam_temperature_c=null`, а не
  `ELECTRICAL_INPUT_REQUIRED`.
- При `steam_tracing=yes` отсутствие итогового T2 блокирует readiness; при `no` итоговый T2 равен
  `null` даже при наличии устаревшего сохранённого значения.
- Пустые шаг, нитки и ручная марка дают прямую укладку, auto `1..3` и auto-модель.
- Сохранённые per-object шаг/нитки/ручная модель доходят через assignment resolver и не меняют
  соседние объекты/другие UUID ЭР.
- Для cylindrical tank `D=2 м`, `heating_height=3 м`, `laying_step=0.1 м` получается
  `Lbase=(pi*2/2)*(3/0.1)`; для rectangular
  `Lbase=(2*(length+width)/2)*(heating_height/laying_step)`.
- Для tank с `Qbase=1000 Вт`, `K=1.2`, `q_additional=100 Вт` downstream требуемая общая мощность
  равна `1300 Вт`: дополнительная нагрузка не исчезает и запас не применяется второй раз.
- Изменение tank `heating_height`/`laying_step` меняет только текущий объект/UUID ЭР и помечает его
  результат stale; трубный `winding_pitch_mm` для tank недоступен.
- Spherical tank получает `ELECTRICAL_TANK_SHAPE_UNSUPPORTED`, а не pipe-формулу или скрытый default.
- Object `aggressive_product=true` не перебивается невыбранным значением панели ЭР.
- `environment=aggressive` само по себе не меняет `R`, пока это явно не утверждено отдельным
  бизнес-решением.
- Для `ТТН` проверяются оба исполнения `-СТ/-СР`; для `ТТВ/ТТХ` сохраняется нормативное `-СР`.
- Новый TT request и результат всегда используют `230 В`.
- E2E покрывает pipe, cylindrical tank и rectangular tank отдельными сценариями.
- E2E не становится зелёным за счёт mock/fallback обязательного `T3`.

## 9. Граница этой сверки

Старый E2E-контракт СО1-СО4 и закрепляющие его устаревшие ожидания удаляются по решению владельца;
потеря их покрытия допустима. Это не требует сохранять фиктивную совместимость в ЭР1.

Поля, которые фактически нужны другому вычислительному контуру, не удаляются вслепую вместе с
тестом: legacy/resistive-потребители сначала отделяются от `self_regulating_tt`, затем их контракт
удаляется отдельным slice, если они также выведены из продукта.

Нормализованное ТЗ пока помечает tank как будущее расширение; решение владельца в этом документе
расширяет именно электрический подбор кабеля и секционирование. Оно не разрешает выводить по
аналогии отсутствующие формулы tank-BOM/аксессуаров спецификации.

Fallback T3 в dedupe key старых кандидатов остаётся отдельной зоной совместимости. Его судьба
решается миграцией/повышением версии ключа; он не оправдывает runtime-подстановку `T3=T1`.
