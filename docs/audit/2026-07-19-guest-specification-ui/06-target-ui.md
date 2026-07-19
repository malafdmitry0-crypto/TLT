# 06. Рекомендуемый целевой UI

Этот документ — **RECOMMENDATION**, а не новый SRS. Он не используется как
источник finding без отдельной ссылки на `PRIMARY_PDF`, `APPROVED_PDL` или
`NORMATIVE_SRS`.

Особенно: конкретное дерево `объект → группы → секции` **не является прямым
требованием PDF стр. 49**. Ранняя формулировка отозвана.

## Границы контракта и дизайна

| Обязательная семантика | Не утверждённая форма представления |
|---|---|
| partial/stale/blocked не маскируются success | цвет, placement и точный component |
| section-dependent rows исключаются без source | table, disclosure, cards или tree |
| required section/object metrics после расчёта | hierarchy и nesting levels |
| preflight показывает objects и groups до mutation | modal, drawer или inline step |
| supplier отображается, если указан | порядок/ширина column |
| guest browser print; warnings не теряются | кнопка/иконка и print typography |
| default pipe/tank/common grouping | tabs, sections или grouped table |

## Общий принцип

На каждом шаге normal UI должен отвечать:

1. Какие данные нужны сейчас?
2. Какой результат доказан?
3. Что исключено, устарело или не поддерживается?
4. Что сделать для исправления?

Formula/catalog/source details полезны в раскрываемой диагностике. Их наличие не
обязывает показывать `PDL-*`, raw UUID и enum в основной задаче.

Рекомендуемая единая vocabulary:

```text
Не начато · Требует данных · Рассчитано · Неполный результат
Устарело · Ошибка · Неподдерживается
```

## 1. Старт

Literal PDF стр. 16 задаёт два user choices. Консервативный UI:

```text
Расчёт систем электрообогрева

[ Начать без регистрации ]
Временный проект хранится 3 дня после последней активности.
Скачайте файл, если хотите сохранить его дольше.

[ Войти с паролем ]
```

Перенос admin entry после login — рекомендация. Live countdown — тоже
рекомендация; обязательны строгий expiry contract и понятное recovery.

## 2. Теплопотери

Оставить доказанный flat form, но визуально отделить:

- primary inputs: object type/name, geometry, temperatures, insulation;
- secondary settings: fittings, manual lambda/alpha, source/service metadata;
- primary action `Добавить и рассчитать` / `Сохранить и пересчитать`;
- result summary `q`, `Q`, status/error, units.

PDF стр. 28 требует не создавать invalid object. Если продукт выбирает draft
rows, сначала нужен approved supersession с отдельным draft status и downstream
rules.

## 3. Электрорасчёт

### Основной слой

- selected named ER и compact lifecycle actions;
- assignment `Нераспределённые / Самрег / Резистив`;
- mark/reason;
- installed length и final order length с разными labels;
- power/current и calculation status.

### Пока section source отсутствует

UI должен передать уже действующий fail-closed факт, например:

```text
Секции не рассчитаны
Нет утверждённых Lmax / Iдоп / Iст.уд для этой марки и температуры.
Зависимые позиции спецификации будут исключены.
```

Точная формулировка — recommendation; обязательная семантика следует из PDL
fail-closed decisions.

### После регистрации section source

Показать literal required metrics PDF стр. 47–49:

- mark и required/factual total length;
- count of equal sections;
- one-section length, voltage, start/working current, power;
- aggregate currents/power;
- validation status/reason.

`Table`, expandable row, cards или tree должны быть выбраны отдельным UI
решением и проверены на populated/error states. Прямой editor section
length/count не добавлять по PDL-ER-03.

## 4. Спецификация

### Preflight

Текущий modal надо исправить так, чтобы он не сводил groups к object count:

```text
ЭР1
Пропущено объектов: 0
Исключено групп: 2

Коробки Ex/Rгр — нет утверждённой матрицы
Нагревательные секции — нет утверждённого каталога

[Отмена] [Сформировать неполную спецификацию]
```

Обязательная behavior:

- один immutable revision/token для preflight и generation;
- одинаковые options на обеих стадиях;
- objects/groups всех selected ER видны до atomic mutation;
- total не может быть 0 при двух excluded groups.

### Result

Current persistent partial banner — правильная основа. Дополнить:

- default typed sections `Трубопроводы / Ёмкости / Общие` из backend;
- optional merge только после typed calculation;
- columns: category, name, mark, nomenclature code, supplier, supply unit,
  quantity, source/status;
- internal codes под `Диагностика`, а в основной warning — human copy;
- guest auto-only; employee manual controls disabled for stale.

`mode=full` не показывать пользователю как гарантию полноты. Статус определяется
`partial/excluded_groups`.

## 5. Отчёт и печать

Сохранить current guest HTML preview и кнопку печати. Рекомендуемый normal view:

```text
Отчёт по проекту                         [Печать]
ЭР: [ЭР1] [Выбрать все]
```

Report должен явно различать:

- inputs/units;
- heat results;
- installed и final order cable length;
- section metrics либо explicit unavailable reason;
- specification rows;
- partial/stale/unsupported diagnostics.

Raw project UUID/enum можно оставить в diagnostic appendix. Это usability
recommendation, не буквальный PDF prohibition.

Print acceptance — не только наличие `window.print()`:

- navigation/actions скрыты;
- warnings остаются;
- tables не режутся по горизонтали;
- page breaks и repeated headers проверены реальным print-preview/PDF;
- narrow interactive limitation не переносится на print output.

## Что оставить, что изменить

| Элемент | Рекомендация | Основание |
|---|---|---|
| Flat heat form | оставить, сгруппировать primary/advanced | current core работает; layout UX |
| Pipe/tank scopes | оставить | current taxonomy/PDL |
| Named UUID ER | оставить | approved current lifecycle |
| Assignment tabs | оставить | scoped workflow |
| Direct section editor | не добавлять | PDL-ER-03 |
| Basic/full switch | не добавлять | PDL-ER-29 |
| Persistent partial warning | оставить | PDL + current proof |
| Preflight total `0` | исправить | current data/UI mismatch |
| Grouping selector | оставлять только с backend typed rows | PDL-ER-38 |
| Supplier | добавить nullable field/column | literal PDF стр. 60 |
| Guest print | оставить, завершить render proof | PDL/SRS |
| `PDL-*`, UUID, enum in normal copy | перенести в diagnostics/локализовать | recommendation |
| Narrow warning | оставить, убрать internal jargon | PDL-ER-30 + recommendation |

## Definition of Done для последующего UI fix

- current defect имеет before screenshot; fix — after screenshot;
- populated/partial/stale/error/modal states на 1440×1000 без clipping,
  overlap, disabled-control defects и page horizontal scroll;
- preflight UI assertions сверяют object count **и** group count/codes;
- generation payload/options, DB persistence, reload и report проверены вместе;
- exact independent BOM boundary oracles не заменены обновлением golden;
- real print-preview/PDF проверен визуально;
- lint, typecheck, build, formula quick и strict guest E2E green;
- любые изменения section presentation сначала зафиксированы отдельным product
  decision, а не приписаны PDF.

