# Коммерческий автоподбор кабеля

**Дата среза:** 2026-05-17

Этот документ описывает фичу коммерческого автоподбора кабеля. Цель — после
технического отбора выбирать лучший вариант по явному критерию: технический
минимум, минимальная стоимость, минимальный срок поставки, наличие на складе,
предпочтительный поставщик или сбалансированная оценка.

Ключевое правило: коммерческий критерий никогда не может выбрать технически
неподходящий кабель.

## Статус документа

Это целевой контракт фичи и описание текущей реализации. Не все пункты контракта
закрыты полностью, ограничения перечислены ниже.

На текущем этапе в проекте уже заложен базовый commercial data layer для
кабелей:

- `price_per_meter`;
- `stock_quantity_m`;
- `lead_time_days`;
- `supplier_priority`;
- `is_preferred`;
- `order_multiple_m`.

После доработки 2026-05-17 закрыт production-oriented vertical slice:

- production-ready commercial fields добавлены в модель, схемы и Alembic;
- добавлен public/sanitized source `commercial` для всех ролей;
- `selection_policy` прокинут в batch/job/frontend API;
- ТЛТ-автоподбор и резистивный auto-подбор получили deterministic commercial
  ranking;
- `balanced` получил конфигурируемые веса и approval-gate;
- результат сохраняет requested/applied policy, reason, warnings и commercial
  snapshot;
- UI получил control критерия, commercial columns и admin-экран редактирования
  commercial fields;
- HTML/PDF report получил commercial block в разделе электрорасчёта;
- добавлены unit/integration/e2e tests на ranking, public catalog и UI policy
  flow.

Ограничения текущего среза:

- `balanced` не делает weighted score без `commercial_balanced_weights_approved`;
- стоимость остаётся `cable_only`, если нет явной accessory-cost metadata;
- для ТТН/ТТВ/ТТХ, mineral и skin commercial ranking не включён, пока нет
  формализованного набора альтернативных технических кандидатов.

## Термины

- `selection_policy` — техническое имя параметра API.
- Критерий подбора — пользовательское название в UI.
- Technical filtering — deterministic отбор кабелей по мощности, температуре,
  току, схеме, длине и ограничениям.
- Commercial ranking — deterministic ранжирование технически подходящих
  кандидатов по коммерческим данным.
- Applied policy — фактически применённая политика. Может отличаться от
  requested policy, если данных не хватает и backend сделал fallback.

## Правило доступа

Все роли могут выбрать все критерии подбора:

| Роль | Доступные критерии |
|---|---|
| Гость | Все |
| Сотрудник | Все |
| Администратор | Все |

Ограничение зависит не от роли, а от доступности данных.

Если выбранная база кабелей содержит коммерческие данные, backend применяет
выбранный commercial ranking. Если данных недостаточно, backend не падает и не
делает скрытый произвольный выбор: он применяет `technical_minimum`, возвращает
warning и явно пишет `applied_selection_policy`.

## Источники данных и модель данных

Commercial fields заведены в `cables_extended`:

- `price_per_meter` — цена за метр;
- `stock_quantity_m` — остаток на складе, м;
- `lead_time_days` — срок поставки, дней;
- `supplier_priority` — приоритет поставщика, меньше значит лучше;
- `is_preferred` — предпочтительная позиция;
- `order_multiple_m` — кратность заказа, м.

Production-ready расширение commercial model:

- `supplier_name` — поставщик/производитель для объяснения выбора;
- `article` — артикул;
- `currency` — валюта цены, default `RUB`;
- `price_updated_at` — дата актуализации цены;
- `stock_updated_at` — дата актуализации остатка;
- `commercial_data_source` — источник данных: `seed`, `admin`, `import`,
  `api`;
- `stock_status` — `in_stock`, `limited`, `on_order`, `unknown`;
- `min_order_quantity_m` — минимальная партия заказа, м;
- `is_discontinued` — позиция снята с поставки;
- `replacement_group` — группа аналогов/замен.

Для того чтобы все роли реально могли использовать commercial policies, нужен
один из двух вариантов:

1. Добавить commercial fields и в публичный встроенный каталог.
2. Дать всем ролям read-only sanitized projection commercial-полей из внешней БД
   без доступа к администрированию каталога.

До выбора одного из вариантов политики остаются доступны всем ролям, но для
каталогов без commercial data будут честно давать fallback.

Рекомендуемый вариант: read-only sanitized projection из БД. Это сохраняет один
источник правды, позволяет обновлять цены/остатки без пересборки и не открывает
admin CRUD гостю.

## Public commercial catalog

Добавить endpoint:

```text
GET /api/v1/references/cables/commercial
```

Доступен всем ролям: guest, employee, admin.

Sanitized payload:

- `cable_type`;
- `brand`;
- `model`;
- `power_per_meter`;
- `max_temperature`;
- `min_temperature`;
- `resistance_per_meter`;
- `price_per_meter`;
- `currency`;
- `stock_status`;
- `lead_time_days`;
- `supplier_priority`;
- `is_preferred`;
- `order_multiple_m`;
- `min_order_quantity_m`;
- `article`, если это не считается чувствительным;
- `commercial_data_source`;
- `price_updated_at`;
- `stock_updated_at`.

Не отдавать гостю:

- внутренний `id`, если он не нужен клиенту;
- служебные admin-only поля;
- точный `stock_quantity_m`, если остаток считается чувствительным.

Для employee/admin существующие endpoints расширенного каталога могут отдавать
полный payload, включая точный `stock_quantity_m`.

## Pipeline

1. Backend получает `selection_policy`.
2. Backend строит список технически подходящих кандидатов.
3. Если `selection_policy = technical_minimum`, выбирается текущий технический
   минимум.
4. Если выбрана commercial policy, backend проверяет полноту данных для этой
   политики.
5. Если данных достаточно, применяется commercial ranking.
6. Если данных недостаточно, применяется `technical_minimum`, а в результат
   пишется warning.
7. В результат сохраняются requested policy, applied policy, причина выбора,
   количество кандидатов и snapshot коммерческих данных выбранного кабеля.
8. Если ranking невозможен, результат сохраняет fallback и warning, а UI
   показывает это как нормальную диагностируемую ситуацию, не как silent change.

## Готовый промпт для реализации

```text
Ты senior backend/frontend engineer. Реализуй фичу коммерческого автоподбора
кабеля в текущем проекте без большого рефакторинга и без удаления существующей
логики технического подбора.

Цель:
после deterministic технического отбора кабелей добавить deterministic
commercial ranking по явно выбранному пользователем критерию.

Главное правило:
commercial ranking применяется только к технически подходящим кандидатам.
Коммерческая политика не может выбрать кабель, который не проходит расчётные
ограничения по мощности, температуре, току, длине, схеме подключения или другим
инженерным условиям.

Роли:
guest, employee и admin должны видеть один и тот же набор критериев выбора:
- technical_minimum;
- lowest_cost;
- fastest_delivery;
- in_stock;
- preferred_supplier;
- balanced.

Ограничение должно зависеть от полноты данных, а не от роли. Если данных для
выбранной политики не хватает, backend обязан вернуть результат с fallback:
requested `selection_policy`, фактический `applied_selection_policy`,
`selection_reason` и warning. Silent fallback запрещён.

Backend:
1. Добавь `selection_policy` в batch/select-cable/background payloads,
   calculation params/results и frontend API types.
2. Реализуй policies:
   - `technical_minimum` как текущий технический выбор;
   - `lowest_cost` через заказную длину, кратность заказа, минимальную партию и
     цену за метр;
   - `fastest_delivery` через минимальный известный срок поставки;
   - `in_stock` через точный остаток или `stock_status`;
   - `preferred_supplier` через `is_preferred` и `supplier_priority`;
   - `balanced` только если веса и нормализация явно сконфигурированы, иначе
     fallback или controlled not-configured warning.
3. Не трактуй `null` как `0` для цены, остатка или срока поставки.
4. Исключай `is_discontinued = true`, если есть хотя бы один технически
   подходящий не снятый с поставки кандидат.
5. Сохраняй в результат snapshot commercial fields выбранного кабеля, чтобы
   старые расчёты не меняли смысл после обновления цен и остатков.
6. Добавь public/sanitized commercial catalog для guest/employee/admin либо
   обоснованно расширь встроенный каталог commercial fields.

DB/model:
сохрани существующие поля:
- price_per_meter;
- stock_quantity_m;
- lead_time_days;
- supplier_priority;
- is_preferred;
- order_multiple_m.

Добавь production-ready поля:
- supplier_name;
- article;
- currency;
- price_updated_at;
- stock_updated_at;
- commercial_data_source;
- stock_status;
- min_order_quantity_m;
- is_discontinued;
- replacement_group.

UI:
добавь control рядом с выбором базы:
`Критерий: [Технический | Дешевле | Быстрее | В наличии | Приоритет | Баланс]`.

Control должен быть доступен всем ролям. UI не должен блокировать выбор из-за
неполных данных, но после расчёта обязан показать backend warning и фактически
применённую policy, если она отличается от requested policy.

Report:
добавь блок commercial selection: requested policy, applied policy, причина
выбора, количество технически подходящих кандидатов, выбранный кабель, цена,
валюта, заказная длина, итоговая стоимость только по кабелю, остаток, статус
склада, срок поставки, поставщик, артикул и warnings.

QA:
покрой unit/integration/e2e tests:
- текущий technical_minimum не меняется;
- lowest_cost выбирает минимальный total_cost, а не минимальный price_per_meter;
- order_multiple_m и min_order_quantity_m влияют на стоимость;
- null price/stock/lead_time не считается нулём;
- in_stock работает с точным остатком и stock_status;
- preferred_supplier учитывает is_preferred/supplier_priority;
- discontinued исключается при наличии нормальных кандидатов;
- fallback сохраняет requested/applied policy и warning;
- snapshot сохраняется;
- guest видит criteria и получает sanitized commercial data;
- UI показывает fallback и reason.

Definition of done:
1. Текущие расчёты без selection_policy дают прежний результат.
2. Все roles могут выбрать любую policy.
3. Backend ranking deterministic и покрыт тестами.
4. Результат объясним в UI и отчёте.
5. Старые отчёты воспроизводимы по snapshot.
6. Не используется LLM или эвристика как источник истины.
```

## Политики `selection_policy`

### `technical_minimum`

Безопасный режим по умолчанию. Выбирает технически минимальный подходящий
вариант по существующей логике.

Default для всех ролей:

```text
selection_policy = technical_minimum
```

### `lowest_cost`

Выбирает минимальную стоимость закупки.

```text
order_multiple = order_multiple_m ?? 1
min_order_quantity = min_order_quantity_m ?? 0
rounded_length = ceil(cable_length / order_multiple) * order_multiple
required_order_length = max(rounded_length, min_order_quantity)
total_cost = required_order_length * price_per_meter
```

Правила:

- кандидат без `price_per_meter` не участвует в этой политике;
- кандидат с `is_discontinued = true` не участвует, если есть хотя бы один
  технически подходящий кандидат без `is_discontinued`;
- если цены нет ни у одного технически подходящего кандидата, применяется
  fallback `technical_minimum`;
- стоимость на первом этапе считается только по кабелю, без аксессуаров.

Tie-breakers:

1. меньший `total_cost`;
2. `stock_status = in_stock` или достаточный точный остаток;
3. меньший срок поставки;
4. меньшая установленная мощность;
5. technical sort key.

### `fastest_delivery`

Выбирает минимальный `lead_time_days`.

Правила:

- `lead_time_days = null` значит “неизвестно”, а не `0`;
- кандидат с неизвестным сроком не должен выигрывать у кандидата с известным
  сроком;
- кандидат с `is_discontinued = true` исключается, если есть нормальные
  кандидаты;
- если сроки неизвестны у всех кандидатов, применяется fallback
  `technical_minimum`.

Tie-breakers:

1. меньший `lead_time_days`;
2. `stock_status = in_stock`;
3. достаточный точный остаток, если он доступен;
4. меньший `total_cost`, если цена известна;
5. technical sort key.

### `in_stock`

Выбирает кандидата, который закрывается складским остатком.

Проверка точного остатка:

```text
stock_quantity_m >= required_order_length
```

Правила:

- `stock_quantity_m = null` значит “неизвестно”, а не `0`;
- если точного остатка нет, использовать `stock_status`;
- `stock_status = in_stock` считается достаточным;
- `stock_status = limited` считается допустимым только если нет точного остатка
  и нет кандидатов `in_stock`;
- `stock_status = unknown` не должен выигрывать;
- если нет кандидатов с подтверждённым достаточным остатком, применяется
  fallback `technical_minimum`;
- если есть несколько складских кандидатов, выбирается лучший по tie-breakers.

Tie-breakers:

1. подтверждённый склад;
2. меньший `total_cost`, если цена известна;
3. меньший срок поставки;
4. меньшая кратность заказа;
5. technical sort key.

### `preferred_supplier`

Выбирает предпочтительного поставщика или предпочтительную позицию.

Сортировка:

1. `is_preferred = true`;
2. меньший `supplier_priority`;
3. `stock_status = in_stock`;
4. меньший `total_cost`, если цена известна;
5. меньший `lead_time_days`;
6. technical sort key.

Если `supplier_priority` и `is_preferred` отсутствуют у всех технически
подходящих кандидатов, применяется fallback.

### `balanced`

Сбалансированная политика. Не включать как default до утверждения весов.

Предварительная формула:

```text
score =
  price_score * 0.40 +
  lead_time_score * 0.25 +
  stock_score * 0.20 +
  supplier_score * 0.15
```

Меньше `score` — лучше.

Перед включением нужно зафиксировать:

- веса факторов;
- нормализацию score;
- поведение при неполных данных;
- tie-breakers;
- unit tests с ожидаемыми победителями.

Если `balanced` ещё не сконфигурирован, backend должен вернуть fallback или
явный `501`, но не делать неявный weighted score.

## API

Добавить `selection_policy` в:

- `POST /calc/electrical/batch`;
- `POST /calc/electrical/select-cable`;
- background task payload;
- params/results `ElectricalCalculation`;
- frontend API types;
- e2e/test payload helpers.

Тип:

```ts
type SelectionPolicy =
  | "technical_minimum"
  | "lowest_cost"
  | "fastest_delivery"
  | "in_stock"
  | "preferred_supplier"
  | "balanced";
```

## Result metadata

Результат успешного commercial ranking:

```json
{
  "selection_policy": "lowest_cost",
  "applied_selection_policy": "lowest_cost",
  "selection_reason": "Выбран минимальный total_cost среди 4 технически подходящих кабелей",
  "candidate_count": 4,
  "commercial": {
    "price_per_meter": 320,
    "currency": "RUB",
    "required_order_length": 132,
    "total_cost": 42240,
    "stock_quantity_m": 1200,
    "stock_status": "in_stock",
    "lead_time_days": 2,
    "supplier_name": "ТЛТ",
    "supplier_priority": 10,
    "is_preferred": true,
    "article": "TLT-25",
    "order_multiple_m": 1,
    "min_order_quantity_m": 0,
    "price_updated_at": "2026-05-17T00:00:00Z",
    "stock_updated_at": "2026-05-17T00:00:00Z",
    "commercial_data_source": "seed",
    "cost_scope": "cable_only"
  },
  "warnings": []
}
```

Результат fallback:

```json
{
  "selection_policy": "lowest_cost",
  "applied_selection_policy": "technical_minimum",
  "selection_reason": "Commercial data is incomplete; technical fallback was applied",
  "candidate_count": 4,
  "commercial": null,
  "warnings": [
    "Для выбранной базы кабелей нет достаточных коммерческих данных. Применён технический подбор."
  ]
}
```

## Snapshot

В результат расчёта нужно сохранять snapshot commercial fields выбранного
кабеля. Иначе старый отчёт нельзя будет объяснить после изменения цены или
остатков.

Минимальный snapshot:

- `price_per_meter`;
- `currency`;
- `required_order_length`;
- `total_cost`;
- `stock_quantity_m`;
- `stock_status`;
- `lead_time_days`;
- `supplier_name`;
- `supplier_priority`;
- `is_preferred`;
- `article`;
- `order_multiple_m`;
- `min_order_quantity_m`;
- `price_updated_at`;
- `stock_updated_at`;
- `commercial_data_source`;
- `cost_scope`;
- timestamp расчёта.

## UI

На странице электрорасчёта добавить control в верхнюю actionbar рядом с выбором
базы каталога:

```text
База: [Встроенная | Коммерческая | Внешняя | Все]
Критерий: [Технический | Дешевле | Быстрее | В наличии | Приоритет | Баланс]
```

Правила UI:

- control виден всем ролям;
- все критерии доступны всем ролям;
- рядом с control показывать статус данных:
  - `Коммерческие данные есть`;
  - `Коммерческие данные неполные`;
  - `Нет коммерческих данных`;
- UI не блокирует выбор политики только из-за неполных данных;
- после расчёта UI показывает warning backend и фактически применённую политику;
- если requested policy отличается от applied policy, это должно быть видно в
  строке результата и в отчёте.

## Таблица электрорасчёта

Добавить опциональные колонки:

- `Критерий`;
- `Применённый критерий`;
- `Причина выбора`;
- `Цена за м`;
- `Заказная длина`;
- `Стоимость`;
- `Валюта`;
- `Остаток`;
- `Статус склада`;
- `Срок поставки`;
- `Поставщик`;
- `Артикул`;
- `Приоритет`;
- `Предпочтительный`;
- `Обновление цены`;
- `Обновление склада`.

По умолчанию видны `Критерий` и `Применено`, чтобы fallback не был скрытым.
Остальные коммерческие колонки доступны через настройки отображения.

## Admin UI

В `Админ -> Внешняя БД -> Кабели` нужна полноценная таблица/форма редактирования
commercial fields:

- `supplier_name`;
- `article`;
- `currency`;
- `price_per_meter`;
- `stock_quantity_m`;
- `stock_status`;
- `lead_time_days`;
- `supplier_priority`;
- `is_preferred`;
- `order_multiple_m`;
- `min_order_quantity_m`;
- `is_discontinued`;
- `replacement_group`;
- `price_updated_at`;
- `stock_updated_at`;
- `commercial_data_source`.

Минимальный vertical slice: backend API принимает/отдаёт поля, admin UI
показывает и редактирует их, тесты проверяют create/update/list.

## Отчёт

В отчёте показывать:

```text
Критерий подбора: Минимальная стоимость
Фактически применено: Минимальная стоимость
Выбран кабель: ТЛТ-25
Технически подходящих вариантов: 4
Цена за метр: 460
Валюта: RUB
Заказная длина: 132 м
Итого по кабелю: 60 720
Остаток: 750 м
Статус склада: В наличии
Срок поставки: 3 дня
Поставщик: ТЛТ
Артикул: TLT-25
Причина выбора: минимальная стоимость среди технически подходящих кандидатов.
Примечание: стоимость указана только по кабелю, без аксессуаров.
```

Если был fallback:

```text
Критерий подбора: Минимальная стоимость
Фактически применено: Технический подбор
Предупреждение: для выбранной базы кабелей нет достаточных коммерческих данных.
```

## QA

Unit tests:

- `technical_minimum` не меняет текущий выбор;
- `lowest_cost` выбирает минимальный `total_cost`, а не просто минимальный
  `price_per_meter`;
- `lowest_cost` учитывает `order_multiple_m`;
- `lowest_cost` учитывает `min_order_quantity_m`;
- кандидат без цены исключается из `lowest_cost`;
- `fastest_delivery` не считает `lead_time_days = null` как `0`;
- `in_stock` не считает `stock_quantity_m = null` как `0`;
- `in_stock` использует `stock_status`, если точного остатка нет;
- `preferred_supplier` учитывает `is_preferred` и `supplier_priority`;
- `is_discontinued` исключается, если есть нормальные кандидаты;
- неполные commercial fields дают fallback и warning;
- commercial snapshot сохраняется;
- tie-breakers стабильны.

Integration tests:

- `POST /admin/cables` принимает commercial fields;
- `PUT /admin/cables/{id}` обновляет commercial fields;
- `GET /references/cables?source=extended` возвращает commercial fields;
- `GET /references/cables/commercial` доступен guest/employee/admin;
- public commercial endpoint не отдаёт sensitive/admin-only поля;
- batch electrical принимает `selection_policy`;
- результат сохраняет `selection_policy`, `applied_selection_policy`,
  `selection_reason`, `commercial`, `warnings`;
- ручной выбор кабеля не перезаписывается ranking policy.

E2E:

- пользователь выбирает критерий `Дешевле`;
- запускает пересчёт;
- видит выбранный кабель, фактически применённую политику и причину выбора;
- при отсутствии commercial data видит fallback-warning.
- admin редактирует цену кабеля, повторный расчёт меняет выбор или
  `selection_reason`.

## Оценка качества фичи

Текущая оценка фичи после расширения до admin/UI/resistive slice: **9.2/10**.

Разбивка:

| Область | Оценка | Комментарий |
|---|---:|---|
| Архитектура | 9/10 | Правильно разделены технический отбор, коммерческое ранжирование, snapshot и объяснение результата. |
| Инженерная корректность | 9/10 | Коммерческий критерий не подменяет расчётную пригодность кабеля. `null` не превращается в `0`. |
| UX | 8/10 | Все роли получают одинаковый control, но доверие пользователя зависит от качества `selection_reason` и fallback-сообщений. |
| Production readiness | 9/10 | Есть public commercial catalog, admin UI, deterministic ranking для ТЛТ и резистивного auto-подбора, snapshot и E2E. |
| Бизнес-готовность | 7/10 | Политики понятны, но финальные веса `balanced`, правила аксессуаров и период актуализации требуют утверждения. |
| QA-покрываемость | 9/10 | Поведение хорошо раскладывается на unit/integration/e2e tests. |

Сильные стороны:

- deterministic pipeline: technical filtering перед commercial ranking;
- нет LLM/эвристики как источника истины;
- данные живут в БД, а не в коде;
- все роли имеют одинаковый UX выбора критериев;
- fallback явно фиксируется через `applied_selection_policy`;
- `null` не трактуется как `0`;
- результат хранит commercial snapshot;
- UI и отчёт должны объяснять причину выбора.

Слабые места и меры:

- если commercial data в БД не заполнены, гости будут получать fallback даже при
  public `commercial` source. Мера: поддерживать seed/import/admin заполнение;
- стоимость по умолчанию считает кабель. Если в commercial metadata задан
  `accessory_total_cost`/`accessory_cost_per_circuit`, snapshot переходит в
  `cost_scope = cable_with_accessories`; нормализованные правила аксессуаров
  остаются бизнес-задачей;
- `balanced` может быть спорным. Мера: веса конфигурируются через коэффициенты
  `commercial_balanced_weight_*`, но применяются только при
  `commercial_balanced_weights_approved=1`;
- коммерческие данные устаревают. Мера: хранить `price_updated_at`,
  `stock_updated_at` и snapshot в каждом расчёте;
- без хорошего `selection_reason` пользователь не будет доверять выбору. Мера:
  reason обязателен для каждого результата.

Production-ready критерий:

1. Все policies покрыты unit tests.
2. Public commercial catalog доступен всем ролям.
3. Admin CRUD/UI поддерживает commercial fields.
4. UI показывает requested/applied policy и warnings.
5. Report содержит commercial block.
6. Старые расчёты воспроизводимы по snapshot.

Рекомендуемая последовательность внедрения:

1. Реализовать `selection_policy` и ranking без UI, покрыть unit tests.
2. Добавить metadata/snapshot/warnings в результат расчёта.
3. Добавить public/sanitized commercial catalog или расширить встроенный каталог.
4. Добавить UI-control и отображение requested/applied policy.
5. Добавить report block.
6. Подключить `balanced` только после утверждения весов.

## Открытые решения

1. Какой источник commercial data будет доступен гостю: встроенный каталог с
   commercial fields или sanitized projection внешней БД. Рекомендация:
   sanitized projection.
2. Финальные веса `balanced` и владелец их утверждения.
3. Нормализованная модель аксессуаров в стоимости: какие позиции обязательны,
   считаются ли они на объект, контур, кабельную линию или партию.
4. Какие поля считать чувствительными для guest projection.
5. Как часто обновлять цену/остатки и кто отвечает за актуальность.

## Что ещё не реализовано

1. Бизнес-утверждение финальных весов `balanced`. Технически веса уже
   конфигурируемые и защищены флагом approval.
2. Нормализованный справочник правил аксессуаров/монтажных комплектов для
   расчёта `full_installation_estimate`. Сейчас есть snapshot-инфраструктура
   `cable_with_accessories`, но сами правила не выдумываются.
3. Commercial ranking для веток `self_regulating_tt`, `mineral`, `skin`, если
   бизнес решит выбирать несколько технически допустимых вариантов в этих
   алгоритмах.
4. E2E на fallback-warning и report preview commercial block отдельно от
   базового UI-сценария выбора критерия.
