# Heat-loss canonical flow

**Статус:** ACTIVE execution plan  
**Дата:** 2026-08-13  
**HEAD на открытии:** `03f6ef3` (`refactor(heat-loss): extract standalone calculation core`)  
**Очередь:** этот файл. Snapshot-ы не маршрутизируют работу.

План фиксирует способ вынести единый поток «подготовка → одна проверка → тот же input в формулу» без переписывания уравнений. Динамические числа (LOC, тайминги, число красных тестов) живут только в `snapshot.md` того же каталога.

## Целевой поток

```text
Pydantic: типы и структура
    ↓
Application resolver:
    справочники + admin/project/climate policy
    ↓
preparation / candidate input          # law ещё может отсутствовать
    ↓
validate + одно разрешение материала
    ↓
prepared / calculation input           # immutable, ConductivityLaw обязателен
    ↓
core validation ровно один раз
    ├─ ошибки → FormulaValidationReport
    └─ valid → расчёт этого же input
                    ↓
             проверка результата
                    ↓
             result или report
                    ↓
Backend: русские сообщения, округление, API, БД
```

Формула не принимает объект с опциональной λ. `None` у коэффициента или закона существует только в preparation.

Краткоживущие `PreparedPipeCalculation` / `PreparedTankCalculation` не хранятся в приватном поле Pydantic-модели.

## Жёсткие ограничения

Запрещено менять:

- формулы и порядок арифметических операций;
- числовые диапазоны;
- округление (pipe и tank остаются разными);
- JSON текущих результатов, пока отдельно не согласован этап trace;
- русские сообщения и пути Pydantic-ошибок;
- API и схему БД;
- сохранение импортированных невалидных объектов;
- frontend;
- широкий публичный `__all__` пакета;
- compatibility shims `app.formulas.heat_loss.core`;
- старые `resolve_safety_factor`, `evaluate_pipe`, `evaluate_resolved_*_tank`;
- набор коэффициентов, который сейчас реально применяется.

Запрещено попутно унифицировать pipe и tank.

Конкретные инварианты:

1. Новый pipe-путь получает одно уже выбранное приложением
   `effective_safety_factor: float | None`. После успешной проверки в формулу
   уходит `float`.
2. Приоритет pipe: пользовательский/climate K → admin K только если первого нет
   → профиль `1.1`.
3. На новом пути и на Pydantic/контракте `0` означает «передано», затем
   отклоняется диапазоном `1.0…1.7`. Старый `resolve_safety_factor` по-прежнему
   считает `0` пустым и не выравнивается.
4. Tank не использует admin coefficients. Его K остаётся обязательным.
5. Pre-check температуры процесса и post-check горячей границы слоя — две
   разные проверки. Их нельзя слить.
6. Fail-fast и текущий порядок ошибок сохраняются. Не переходить на collect-all
   там, где контракт сейчас выходит на первой ошибке.
7. Особенность air-pipe: domain-check получает пустой список толщин слоёв.
   Это не чинится в этом рефакторинге.
8. Pipe и tank сохраняют разные правила округления, стенки, Qдоп и заглубления.
9. Материал разрешается один раз, но только после отдельного решения по
   контракту `InsulationLayer`.
10. `InsulationLayer.model_validate()` — поддерживаемый публичный контракт.
    Нельзя просто удалить `check_contract`. Справочный lookup из слоя убрать
    можно только сохранив точные nested `loc/msg` или разделив type-only и
    валидируемую модели.
11. Новые optional trace-поля не аддитивны: `model_dump()` включит ключи даже
    при `None`. Профильная трассировка — отдельный этап либо явная смена
    JSON-контракта.
12. Full-suite gate: нет новых падений относительно свежего baseline HEAD.
    Сравнивается множество failing test IDs из датированного snapshot, не
    количество.

## Слайсы / коммиты

| Слайс | Содержание | Production? |
|---|---|---|
| **1** | Characterization + baseline failing IDs | нет |
| **2** | Preparation input, prepared input, outcome API. Старые типы и exports не удалять | только пакет, без backend-switch |
| **3** | Новый pipe-path: одно `effective_safety_factor`; профиль как источник default. Старый resolver не менять | пакет, без backend-switch |
| **4** | Решение по `InsulationLayer` + application preparation + переключение трубы | да, только pipe |
| **5** | Переключение резервуара | да, только tank |
| **6** | Cleanup неиспользуемых production-хелперов. `__all__` и shims не трогать | да, shrink-only |
| **7** | Профильный trace JSON — только по явному согласованию контракта | отдельно |

Каждый слайс зелёный и отдельно откатываемый. Tank-путь не менять, пока pipe не переключён и не сравнён.

## Слайс 1 — characterization

Дополнить существующие снимки, не плодить второй набор тех же range-тестов.

Зафиксировать, если ещё не зафиксировано:

- `InsulationLayer.model_validate()` как публичный контракт: unknown material,
  manual без λ, reference с ручными полями, невалидный интервал;
- число обращений к справочнику на один facade-вызов;
- air-pipe передаёт в domain-check пустой кортеж толщин;
- две проверки температуры;
- матрицу K (ниже);
- tank игнорирует `coefficients`;
- admin `ground_conductivity` не влияет на расчёт;
- climate/user K на recalc побеждает admin;
- admin preview без K берёт admin K только у pipe;
- `is_valid=false`, `results=null` при невалидном объекте;
- неокруглённый core vs округлённый pipe `model_dump`;
- indoor / outdoor / underground и 1–3 слоя.

### Матрица K

| Значение | Ожидаемое поведение сейчас |
|---|---|
| Пользовательское допустимое | применяется |
| Пользовательское `0` | передано; Pydantic/контракт отклоняет диапазоном |
| Admin допустимый, user/climate K есть | admin не применяется |
| Admin допустимый, user K нет | pipe: admin; tank: не используется |
| Admin `0`, user K нет | pipe: старый evaluator принимает `0` как override; новый путь отклонит диапазоном |
| `None` | pipe: профиль `1.1`; tank: ошибка обязательности |
| Нестандартный ключ (`ground_conductivity` и др.) | не создаёт теплового поведения |

Старый пакетный тест `primary=0` + `override=1.4` → `1.4` остаётся характеристикой **старого** API.

## Слайс 2 — типы

В библиотеке:

- `PipePreparationInput` / `TankPreparationInput`;
- `PreparedPipeCalculation` / `PreparedTankCalculation`;
- слой preparation может не иметь law;
- слой prepared содержит толщину, источник, обязательный `ConductivityLaw`,
  температурный интервал и данные межполевого контракта;
- отдельные environment-типы для воздуха и грунта.

High-level вызов:

```text
prepared input → validate → stop | calculate → проверить результат → success | failure
```

Инварианты outcome:

- нельзя вернуть успешный результат и блокирующие ошибки вместе;
- ошибка температуры слоя — failure, не поле внутри успеха;
- ожидаемые ошибки входа/конфига/справочника — `FormulaValidationReport`;
- `FormulaDomainError` только для NaN, inf и невозможных численных состояний.

Старые evaluators остаются совместимыми обёртками и не меняют семантику.

## Слайс 3 — коэффициенты и профиль

Backend выбирает источник. Библиотека нового пути не знает слов `primary`,
`admin`, `project`, `climate_policy`.

`CASE_1_PROFILE` остаётся источником `9.0`, `11.6`, `7.0`, `1.1`, `40 °C`.
Приложение может передать другой профиль; библиотека не знает его происхождения.

Реально используемый admin-ключ тепла: только `safety_factor`, и только как
fallback pipe. Ключи БД сами по себе не расширяют контракт.

## Слайсы 4–5 — переключение

Критерий: JSON результатов совпадает байт-в-байт с characterization, без новых
ключей. Сигнатуры `calc_pipe_heat_loss` / `calc_tank_heat_loss` сохраняются.

Pipe: обычный пересчёт, admin preview, прямой facade, импорт.  
Tank: cylindrical/rectangular, indoor/outdoor/underground, частичное заглубление,
Qдоп, стенка задана/не задана, все варианты изоляции.

## Слайс 6 — cleanup

Только после обоих переключений. Неудаляемое: `__all__`, shims, старые evaluators,
пока на них есть внешние/тестовые вызовы.

## Слайс 7 — trace

Не начинать, пока слайсы 4–5 не зелёные. Требует явного решения: меняем
JSON-контракт или нет.

## Proof

На каждом слайсе:

- focused pytest слайса;
- package tests `packages/heat-loss-core/tests`;
- backend formula/unit, затронутые Pydantic и service tests;
- `git diff --check`.

Перед слайсом 4 и после слайса 5:

- снять failing IDs полного backend suite в новый snapshot;
- сравнить множество с baseline этого каталога.

Незапущенное отмечать `NOT RUN`, не green.

## Следующий шаг

**NEXT = слайс 1.** Production-код не менять, пока characterization и baseline
snapshot не лежат в этом каталоге.
