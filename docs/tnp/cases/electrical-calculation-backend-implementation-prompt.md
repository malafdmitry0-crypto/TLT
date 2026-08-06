# Промпт: backend-only обновление электротехнического расчёта

**Назначение:** этот текст нужно целиком передать агенту, который будет реализовывать обновление электротехнического расчёта.  
**Граница задачи:** изменяется только backend. Данные, которые в целевой схеме должен передавать frontend, но пока не передаёт, временно подставляются централизованным mock-адаптером только в dev/test-режиме.

---

## Роль и ожидаемый результат

Ты работаешь в репозитории `/Users/dmalafey/Desktop/TLT` над полным backend-срезом электротехнического расчёта саморегулирующихся кабелей `ТТН`, `ТТВ`, `ТТХ`.

Не ограничивайся анализом или планом: исследуй текущий код, реализуй backend, миграции, каталоги, API и backend-тесты, затем выполни проверки. Не изменяй frontend, E2E или UI-контракты на стороне клиента.

Итог задачи:

1. Backend единолично и детерминированно выполняет подбор кабеля, навив, секционирование, пересчёт итогов и подготовку кабельной BOM-позиции.
2. Новый расчёт соответствует целевому ТЗ.
3. Пока frontend не передаёт часть входов, локальная разработка и backend-тесты могут использовать контролируемые mock-значения.
4. Mock-значения никогда не становятся неявными production-defaults и всегда видны в provenance результата.
5. Legacy-результаты остаются читаемыми, но legacy-линейка не используется для нового расчёта.

## Обязательные источники

Перед изменениями полностью прочитай:

1. `/Users/dmalafey/Desktop/TLT/AGENTS.md`.
2. `/Users/dmalafey/Desktop/TLT/docs/tnp/cases/guest-electrical-calculation-tz.md` — нормативный контракт, особенно §§ 3, 5, 6, 8–10, 11, 13 и 17.
3. `/Users/dmalafey/Desktop/TLT/docs/audit/2026-08-02-electrical-calculation/snapshot.md` — зафиксированные расхождения текущей реализации.
4. Текущие backend-модули формул, секционирования, расчётного сервиса, ЭР, назначений, спецификации, моделей, схем и миграций.

Приоритет при конфликте:

1. `guest-electrical-calculation-tz.md`.
2. Указанные в нём технические PDF/XLSX-источники.
3. Действующий backend-контракт, если он не противоречит ТЗ.
4. Текущие тесты — как описание текущего поведения, но не как основание сохранять ошибочное правило.

Не используй `backend/app/reference_data/cables_tlt.json` для нового расчёта. `ТЛТ` — поставщик, а расчётные серии MVP — `ТТН`, `ТТВ`, `ТТХ`.

## Жёсткая граница задачи

Разрешено изменять:

- `backend/**`;
- backend-ориентированную документацию и новый датированный audit snapshot, если это нужно для фиксации результата;
- общие repo-скрипты только тогда, когда без этого невозможно запустить backend-gate и изменение не влияет на frontend.

Запрещено изменять:

- `frontend/**`;
- `e2e/**`;
- React/TypeScript-контракты, компоненты, стили и frontend-тесты;
- исходные PDF/XLSX в `ТНП/**`;
- несвязанный Heat/tank WIP;
- существующие инженерные данные посредством догадки или «исправления на глаз».

В конце обязательно докажи командой `git diff -- frontend e2e`, что эти зоны не менялись твоим срезом.

## Безопасность работы с текущим WIP

До редактирования выполни `git status --short`. Чужие незакоммиченные изменения не удаляй, не откатывай и не форматируй целиком.

Особенно осторожно работай с общими файлами вроде:

- `backend/app/schemas/calculation.py`;
- `backend/app/services/calculation_service.py`;
- общими object/project schemas и сервисами.

Перед изменением такого файла посмотри его текущий diff, внеси минимальный локальный patch и после изменения проверь, что чужие hunks сохранены. Не используй `git reset --hard`, `git checkout --`, массовую перегенерацию или broad formatter по грязному дереву.

## Переходный контракт входов frontend

### Основной принцип

Сделай один централизованный resolver входных данных, например `ElectricalInputResolver`, а не набор разрозненных `or default` внутри формул.

Порядок источников должен быть явным:

```text
explicit request override
  > сохранённый override assignment конкретного UUID ЭР
  > project electrical settings
  > актуальные object/Heat data
  > dev/test frontend mock, только если mock-режим явно включён
  > доменная ошибка об отсутствующем обязательном входе
```

Resolver должен возвращать одновременно:

- канонические значения;
- источник каждого значения;
- список замоканных полей;
- список использованных legacy aliases;
- warnings;
- признак `production_eligible`.

Не смешивай resolution входов с расчётными формулами.

### Режим mocks

Добавь один явный backend-config для mock-режима по действующему паттерну настроек проекта, семантически эквивалентный:

```text
ELECTRICAL_FRONTEND_MOCK_MODE=off|test|dev
```

Требования:

- default — `off`;
- production не может стартовать с `test` или `dev`; добавь fail-fast проверку конфигурации;
- unit/integration tests включают mocks через fixture/config override, а не через глобальное изменение production-defaults;
- dev-режим включается явно окружением;
- значения mocks определены в одном typed-объекте/модуле;
- результат содержит `mocked_fields`, `input_sources` и warning `ELECTRICAL_FRONTEND_INPUTS_MOCKED`;
- результат с mocks не должен незаметно считаться production-ready;
- production-спецификация не принимает mocked result. Верни стабильную диагностику `ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED`, если такой результат оказался на production-boundary.

Временный профиль mocks:

| Каноническое поле | Mock | Смысл |
|---|---:|---|
| `steam_temperature_c` | `null` | Пропарка не применяется |
| `maintain_temperature_c` | `10.0` | Временный `T3` |
| `cold_start_temperature_c` | `-20.0` | Временная температура включения |
| `aggressive_product` | `false` | Временный `R` |
| `winding_pitch_mm` | `null` | Прямая укладка, `Kнав = 1` |
| `thread_count` | `null` | Автоподбор `1..3` |
| `manual_cable_model` | `null` | Автоматический выбор |
| `selection_policy` | `technical_minimum` | Единственная политика MVP |

Не mock-ай идентификаторы проекта, объекта, UUID ЭР, assignment version, теплопотери, длину, диаметр или `T1`, если их нет в базе: это признаки неготового объекта, которые должны завершаться readiness/domain error.

`nominal_voltage_v` также не является frontend-mock: его всегда задаёт backend как `230`.

Если safety factor отсутствует в существующих object/project data, разреши `1.1` только в том же dev/test mock-профиле и обязательно пометь источник. В production отсутствие однозначного значения должно быть ошибкой, а запас нельзя применить дважды.

### Нормализация имён на API-boundary

На API-boundary временно распознавай текущие имена полей и преобразуй их в канонические:

- `process_temperature` → `product_temperature_c`;
- `vapor_temperature` → `steam_temperature_c`;
- `maintain_temperature` → `maintain_temperature_c`;
- `ambient_temperature` или `min_switch_temperature` → `cold_start_temperature_c`;
- `winding_pitch` → `winding_pitch_mm`;
- `number_of_threads` → `thread_count`;
- `cable_mark` → `manual_cable_model`, но только после удаления разрешённого суффикса на boundary.

Legacy aliases не должны проникать в формулы. Фиксируй их в provenance/warnings.

`max_section_start_current_a` задаётся только через project electrical settings.
Одноимённое поле и `max_start_current_per_section` в request payload являются retired inputs
и должны завершаться `ELECTRICAL_INPUT_RETIRED`; mock/assignment fallback для Iдоп отсутствует.

Различай отсутствующее поле и явный `null` по исходному payload/Pydantic `model_fields_set`:

- `steam_temperature_c = null` нормативно означает отсутствие пропарки;
- явный `null` у override снимает сохранённый override;
- отсутствие поля означает переход к следующему источнику resolver.

Переходное поведение напряжения:

- в strict/mock-off режиме явное значение, отличное от `230`, возвращает `ELECTRICAL_NOMINAL_VOLTAGE_UNSUPPORTED`;
- в dev/test compatibility-режиме входные `220` не используются в формулах: backend принудительно применяет `230`, сохраняет warning и источник `backend_forced_230`;
- новые результаты всегда сохраняют `230`.

Legacy `winding_coefficient` допускается только на migration/read boundary. Для нового расчёта авторитетен `winding_pitch_mm`; если шага нет, `Kнав = 1`. Не сохраняй старый default `1.1` как скрытое правило.

## Функциональный объём backend

### 1. Канонический контракт и настройки проекта

Реализуй или доведи до ТЗ:

- typed canonical request/result для расчёта объекта в UUID ЭР;
- `ProjectElectricalSettings` с `project_id`, неизменяемым `nominal_voltage_v=230`, nullable `max_section_start_current_a`, optimistic `version`, audit timestamps/principal;
- `GET /projects/{project_id}/electrical-settings`;
- `PATCH /projects/{project_id}/electrical-settings` с `expected_version`;
- object override `Iдоп` в пределах assignment конкретного UUID ЭР;
- корректную precedence project/object/mock;
- безопасную идемпотентную миграцию и downgrade.

В strict-режиме отсутствие object override и project `Iдоп` блокирует секционирование кодом `SECTION_CURRENT_LIMIT_REQUIRED`.

### 2. Каталоги и provenance

Backend должен работать с тремя раздельными версиями каталогов:

1. `power` — 14 моделей `ТТН/ТТВ/ТТХ`, `q1`, `q2`, температурные пределы и `230 В`;
2. `section` — `Lмакс` и `Iст.уд` из `Параметры Кабеля.xlsx`;
3. `bom` — точная карта полного маркоразмера на номенклатурный код.

Для каждой версии храни как минимум `kind`, version, source, source checksum, schema version, status, import/activation metadata и diagnostics. Активный payload неизменяем; новый импорт создаёт новую версию.

Важное ограничение по power catalog:

- не придумывай коэффициенты;
- не исправляй `q1=-0.491` для `15ТТВ2` без утверждённого источника;
- текущий `cables_tt.json` можно использовать как точную provisional-версию для dev/test;
- пометь её как `unapproved/provisional` и отрази это в provenance/warning;
- strict production требует утверждённый active source, иначе `ELECTRICAL_CATALOG_SOURCE_UNREGISTERED`.

Section catalog должен выбирать только exact row либо ближайшую более холодную строку. Если строки с `Tcatalog <= Tstart` нет, верни `ELECTRICAL_SECTION_CATALOG_ROW_NOT_FOUND`; не выбирай более тёплую строку.

Импортируй BOM v1 из нормативной карты §6.5 ТЗ. Не подменяй отсутствующий код текстом марки и не используй приблизительное совпадение.

### 3. Формула выбора кабеля

Реализуй ровно следующие правила:

```text
Pтреб = q * K

если T1 < 65 и (T2 = null или T2 < 85): ТТН
иначе если T1 < 120 и (T2 = null или T2 < 210): ТТВ
иначе если T1 < 150 и (T2 = null или T2 < 250): ТТХ
иначе: ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED

Pкаб(T3) = q1 * T3 + q2
```

Правила полного маркоразмера:

```text
ТТН: СТ при R=false, СР при R=true
ТТВ: всегда СР
ТТХ: всегда СР
```

Manual input принимает базовую модель, например `30ТТВ2`, а не пользовательский суффикс. Модель должна точно существовать и принадлежать вычисленной серии. Автозамена ручной модели запрещена.

Число ниток — только `1`, `2`, `3`. Auto проверяет их по порядку и выбирает минимально достаточный технический вариант. Если недостаточно трёх ниток, верни `ELECTRICAL_CABLE_POWER_INSUFFICIENT` без успешного результата.

Единственная политика MVP — `technical_minimum`. `cheapest`, `fastest`, `in_stock`, `preferred_supplier`, `balanced` и balanced weights отклоняй стабильной доменной ошибкой.

### 4. Навив

Для трубопровода:

```text
если winding_pitch_mm = null: Kнав = 1
иначе:
    D = outer_diameter_mm / 1000
    S = winding_pitch_mm / 1000
    если S <= D: ELECTRICAL_WINDING_PITCH_INVALID
    Kнав = sqrt(1 + (pi * D / S)^2)
```

Проверь таблицу максимального `Kнав` из §9.4 ТЗ, включая отдельные boundary-cases `56.999`, `57`, `75`, `89`, `108 мм`. Переводи мм в метры один раз.

### 5. Секционирование и финальные итоги

Секционирование обязано быть fail-closed:

```text
Lтреб = Lbase * Kнав * Nнит
Lток = Iдоп / Iст.уд
Lогр.raw = min(Lмакс, Lток)
Lогр = floor(Lогр.raw * 1000) / 1000
Nсек = ceil(Lтреб / Lогр)
Lсек = Lогр
Lфакт = Lсек * Nсек
Lдоп = Lфакт - Lтреб
```

Все секции, включая последнюю, равны `Lогр`.

После секционирования обязательно замени предварительные totals величинами от `Lфакт`:

```text
Iст.сек = Iст.уд * Lсек
Pсек = Pкаб * Lсек
Iраб.сек = Pсек / 230
Iст.общ = Iст.сек * Nсек
Pобщ = Pсек * Nсек
Iраб.общ = Iраб.сек * Nсек
Lзаказ = ceil(Lфакт * 1.10 * 1000) / 1000
```

Не оставляй `cable_length`, `total_power`, `current` и `order_cable_length`, рассчитанные до выравнивания секций, в качестве финальных значений.

Проверки выполняй на неокруглённых промежуточных значениях. Используй один deterministic Decimal/rounding helper: обычные результаты `ROUND_HALF_UP`, `Lогр` вниз, `Lзаказ` вверх.

### 6. Результат, ошибки и сохранение

Успешный result должен содержать структуру и provenance из §5.3 и §10.2 ТЗ, включая:

- snapshot объекта и Heat result с версиями;
- resolved inputs и их источники;
- series, base model, suffix, full mark, nomenclature code;
- `q1`, `q2`, `T1`, `T2`, `T3`, `R`, `230 В`;
- requested/applied threads и selection source;
- `Lтреб`, `Lфакт`, `Lдоп`, `Lзаказ`;
- полный section plan;
- рабочие и стартовые токи;
- immutable snapshots и версии power/section/BOM catalogs;
- checksum каталогов и formula fingerprint/version;
- warnings, legacy aliases и mocked fields.

Не сохраняй незавершённый расчёт как success. Ошибка одного объекта в batch сохраняется как пообъектный error и не откатывает успешные результаты остальных объектов.

Замени текстовые `ValueError` на typed domain errors и единый envelope §10.3:

```json
{
  "detail": {
    "code": "ELECTRICAL_CABLE_POWER_INSUFFICIENT",
    "message": "...",
    "issues": [],
    "details": {}
  }
}
```

Реализуй весь минимальный словарь ошибок §10.3, не определяя бизнес-ветвление по тексту сообщения.

### 7. Stale, legacy и lifecycle ЭР

- Включи object version, Heat result version, project settings version, power/section/BOM catalog IDs/checksums и formula version в stale fingerprint.
- Изменение Heat result, `Iдоп`, применимого объекта, активного каталога или формулы помечает затронутые результаты и спецификации stale.
- Пересчёт одного UUID ЭР не должен снимать stale с других ЭР.
- Legacy snapshot с `220 В`, условной маркой, отсутствующим fingerprint или без `Iдоп` остаётся доступным для чтения/экспорта истории, но исключается из ready summary и новой BOM до явного пересчёта.
- Не переписывай старый инженерный результат на месте; свяжи новый результат через `supersedes_result_id` или существующий эквивалент.
- Сохрани существующие UUID/lifecycle guarantees: 1–5 ЭР, idempotency create/copy, assignment optimistic concurrency и scoped batch.

### 8. Спецификация

Кабельная позиция строится только по точному `full_mark` активного BOM catalog и использует `Lзаказ`, рассчитанную от `Lфакт`.

Для отсутствующей марки верни `SPEC_CABLE_NOMENCLATURE_MISSING`. Запрещены:

- fallback к тексту марки как article/code;
- выбор похожей позиции;
- использование `cables_tlt.json`;
- включение stale/error/mocked production result в production-спецификацию.

Не меняй frontend-вызов генерации. Сохрани совместимость текущего API-boundary, но внутри используй UUID ЭР и канонический result.

## Архитектурные требования

- Формулы должны оставаться pure или максимально близкими к pure; DB/config resolution выполняется сервисным слоем до вызова формул.
- Не читай environment variables непосредственно из formula modules.
- Не прячь mock/default behavior в Pydantic defaults расчётных моделей.
- Не дублируй формулы между endpoint, service и specification builder.
- Не используй `float`-округление для нормативных направленных округлений.
- Сохраняй текущие публичные import paths или добавь совместимый адаптер.
- Не добавляй зависимость без необходимости; при добавлении синхронизируй manifest/lock.
- Не логируй токены, персональные данные или полный пользовательский payload.

## Обязательные тесты

Добавь или обнови backend-тесты так, чтобы проходили все backend goldens `AC-BE-01..AC-BE-30` из §13.1 ТЗ.

Отдельно зафиксируй тестами переходный mock-контракт:

1. Mock mode default `off`.
2. Production не стартует с включёнными mocks.
3. При `off` отсутствие `Iдоп` даёт `SECTION_CURRENT_LIMIT_REQUIRED`.
4. При `dev/test` отсутствующие frontend-поля заполняются единым профилем.
5. Явный request override имеет приоритет над mock.
6. Сохранённый assignment/project input имеет приоритет над mock.
7. В результате перечислены все и только реально замоканные поля.
8. Явный `T2=null` не заменяется другим значением.
9. В compatibility-mode входные `220` не влияют на расчёт, итог всегда `230` и содержит warning.
10. Mocked result блокируется на production specification boundary.
11. В formula modules отсутствуют скрытые frontend defaults.

Также обязательны тесты:

- строгих температурных границ;
- `1..3` ниток и ошибки при недостаточности трёх;
- TTN `СТ/СР`, TTV/TTX только `СР`;
- exact/nearest-lower section lookup и отсутствия fallback вверх;
- обязательного `Iдоп`;
- пересчёта totals от `Lфакт`;
- направленного округления `Lогр` и `Lзаказ`;
- точной BOM-карты всех 18 полных марок;
- stable error envelope для single и batch;
- stale propagation;
- read-only legacy behavior;
- guest/authenticated parity при одинаковых resolved inputs и catalog versions;
- миграции upgrade/downgrade на тестовой БД;
- текущего integration lifecycle ЭР.

Синхронизируй красную fixture integration-теста с действующим object API внутри `backend/app/tests/**`; не возвращай запрещённые heat-owned поля в production API только ради старой fixture.

## Проверки перед завершением

Определи актуальный способ запуска из `pyproject.toml`, Makefile и Docker-конфигурации. Минимально выполни:

```bash
docker exec heatcalc_backend python -m pytest --no-cov -q \
  app/tests/unit/formulas/test_self_regulating_tt.py \
  app/tests/unit/formulas/test_sections.py

docker exec heatcalc_backend python -m pytest --no-cov -q \
  app/tests/integration/api/test_electrical_variants.py \
  app/tests/integration/api/test_electrical_assignments.py \
  app/tests/integration/api/test_specifications.py

make lint-backend
make test-formulas
make test-backend
```

Если имена новых focused-тестов отличаются, добавь их к первому прогону. Проверь миграцию `upgrade head`, downgrade созданной ревизии и повторный upgrade на тестовой БД.

Не называй незапущенную проверку зелёной. Если полный suite падает на доказанном несвязанном WIP, покажи отдельно:

- точную команду;
- exit code;
- первые релевантные ошибки;
- почему сбой не относится к электрическому slice;
- результаты focused-проверок изменённого backend-кода.

## Definition of Done

Задача завершена только когда одновременно выполнено следующее:

- изменён только разрешённый backend/doc slice;
- frontend и E2E не изменены;
- mock-режим централизован, явно включаем, выключен по умолчанию и невозможен в production;
- strict-режим не содержит инженерных silent defaults;
- расчёт использует только `ТТН/ТТВ/ТТХ`, `230 В`, `1..3` нитки и `technical_minimum`;
- секционирование fail-closed и итоговые величины пересчитаны от `Lфакт`;
- точная BOM-карта реализована без fallback;
- provenance и stale fingerprint полные;
- stable domain errors доступны single/batch API;
- все относящиеся к backend критерии §13 проходят;
- миграции проверены;
- выполненные команды и их фактические результаты перечислены в финальном отчёте;
- неподтверждённые `q1/q2` и источник production `Iдоп` явно отмечены как внешние условия, а не выданы за решённые.

## Формат финального отчёта агента

Начни с результата, затем кратко укажи:

1. Что реализовано.
2. Как устроен mock-режим и как его включить локально.
3. Какие миграции/API/catalog changes добавлены.
4. Какие тесты выполнены и их результаты.
5. Какие внешние утверждения всё ещё нужны для production (`q1/q2`, включая `15ТТВ2`, и нормативный `Iдоп`).
6. Подтверждение, что `frontend/**` и `e2e/**` не изменялись.

Не объявляй production-ready, пока не выполнены внешние условия §18 ТЗ.
