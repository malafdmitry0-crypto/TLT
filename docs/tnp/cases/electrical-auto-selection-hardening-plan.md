# Упрощение выбора кабеля в электрорасчёте

Дата: 2026-08-12
Область: frontend + backend, выбор марки и параметры укладки Самрег
Формулы Case 1: не изменяются

## Решение

Любое изменение кабеля выполняется только для одного объекта в открытом
текущем ЭР. Multi-ЭР сценария в выборе кабеля нет.

- «Авто» очищает ручную марку и ручное количество ниток.
- Ручная марка сохраняется с явным количеством ниток 1–3.
- Assignment и новый результат расчёта фиксируются одной транзакцией.
- При ошибке расчёта assignment и прежний результат остаются без изменений.
- Версия assignment передаётся как optimistic-lock precondition.
- Если каталог заранее не содержит марки, допустимой по температурам объекта,
  интерфейс блокирует «Авто» и показывает фактические температуры и пределы.

## API-контракт

Единственная команда выбора кабеля:

```text
POST /projects/{project_id}/electrical-variants/{electrical_variant_id}/objects/{object_id}/cable-selection
```

Команда адресует точный UUID ЭР и один объект. Payload содержит:

- `expected_assignment_version`;
- `mode: auto | manual`;
- `cable_mark`;
- `cable_source`;
- `thread_count`;
- `winding_pitch_mm`;
- `selection_policy`.

Ответ возвращает согласованную пару `assignment + calculation`.

Старый multi-ЭР endpoint `/calc/electrical/select-cable/variants` и его frontend
адаптер удалены. Обратная совместимость для них не поддерживается.

## Жизненный цикл ЭР

- Новый пустой ЭР содержит assignments без расчётов и требует расчёта.
- ЭР, созданный копированием, получает копии assignments и расчётов; немедленный
  повторный расчёт не требуется.
- Последующие Auto/manual/укладочные изменения относятся только к открытому ЭР.

## Проверяемые инварианты

1. В модальном окне нет выбора других ЭР.
2. Запрос всегда содержит UUID открытого ЭР.
3. Успех обновляет assignment и calculation вместе.
4. Ошибка не меняет version, overrides и сохранённый результат.
5. Повторный запрос со старой версией получает конфликт и не перезаписывает данные.
6. «Авто» отправляет `cable_mark=null` и `thread_count=null`.
7. Ручная марка отправляет точную марку и `thread_count` от 1 до 3.
8. Температурно невозможный Auto объясняется до отправки команды.

## Профильная регрессия

- backend schema/service tests;
- backend integration: success + rollback on failed manual mark;
- frontend hook tests: current ER only, version chaining, Auto reset;
- frontend integration: modal close/error behavior and inline layout edits;
- browser QA на desktop и mobile viewport.
