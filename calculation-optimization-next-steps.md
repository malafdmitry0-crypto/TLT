# Оставшиеся идеи по ускорению электрорасчёта

Статус: в коде уже выполнены два базовых ускорения для большого batch:

- cancel проверяется throttled, а не SQL-запросом на каждый объект;
- batch обрабатывает объекты чанками: чтение объектов, чтение existing calculations, расчёт, bulk upsert и `flush` выполняются по частям.

## 1. Fast mode без чтения existing calculations

Сейчас даже после chunk processing каждый chunk читает `ElectricalCalculation` для объектов чанка. Это нужно для двух сценариев:

- `skip_manual=true`, чтобы не перезаписать ручной выбор;
- сохранение layout overrides из предыдущего результата (`winding_pitch`, `number_of_threads`, `winding_coefficient`).

Для массового полного пересчёта можно добавить явный режим `preserve_layout=false` или `fast_recalculate=true`.
В этом режиме сервис не будет читать старые `ElectricalCalculation` вообще, а будет генерировать новые строки с `ON CONFLICT DO UPDATE`.

Ожидаемый выигрыш: меньше SELECT, меньше ORM-объектов, проще hot path. Риск: надо явно определить UX-контракт, можно ли при массовом пересчёте сбрасывать сохранённую раскладку кабеля.

## 2. Убрать Pydantic из внутреннего hot path batch

Сейчас на каждый объект создаётся `ElectricalRequest`, затем Pydantic-модель конкретной формулы (`SelfRegulatingParams`, `SelfRegulatingTTParams` и т.д.), затем результат снова превращается в dict через `model_dump()`.

Для одиночного API это нормально, но на 20k объектов это заметный CPU overhead.

Вариант улучшения:

- оставить Pydantic на API boundary;
- внутри batch собирать проверенный dict/dataclass;
- вызывать формулы через внутренние функции без повторной Pydantic-валидации на каждый объект.

Ожидаемый выигрыш: меньше CPU и аллокаций в Python. Риск: надо аккуратно сохранить валидационные ошибки и сообщения, чтобы поведение API не разошлось.

## 3. Параллельные chunk jobs

Если после fast mode и снятия Pydantic-overhead batch всё ещё медленный, следующий шаг - делить один большой расчёт на дочерние chunk-задачи.

Схема:

- parent task создаёт N chunk tasks по диапазонам объектов;
- несколько worker-процессов считают chunks параллельно;
- parent агрегирует progress/result;
- retry применяется к конкретному chunk, а не ко всему batch.

Ожидаемый выигрыш: реальное использование нескольких CPU cores. Риск: это уже архитектурная работа: нужны агрегация прогресса, идемпотентность chunk tasks, правила cancel/retry и защита от гонок при повторном запуске batch.

## 4. Метрики до следующего шага

Перед следующим крупным изменением стоит фиксировать:

- worker duration для 20k, 50k, 100k объектов;
- количество SELECT/UPDATE по `background_tasks`;
- количество SELECT по `project_objects` и `electrical_calculations`;
- CPU time worker-процесса;
- p95 для параллельных запусков 3-5 batch jobs.

Порог для перехода к parallel chunk jobs: одиночный 20k batch стабилен, но 3-5 параллельных batch jobs дают неприемлемый p95 или заметно блокируют worker.
