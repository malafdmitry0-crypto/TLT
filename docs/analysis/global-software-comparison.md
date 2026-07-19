# TLT и внешние инженерные инструменты: качественное сравнение

**Статус:** консолидированный исследовательский срез 2026-06-08.

Это не численный benchmark и не подтверждение эквивалентности продуктов.
Внешние возможности и версии необходимо повторно проверить по официальным
источникам перед публикацией или закупочным решением.

## Scope

Исторический обзор сопоставлял TLT с репрезентативными heat-tracing и
insulation tools: nVent/Chemelex TraceCalc, Thermon CompuTrace/Vessel Trace,
BARTEC Heloc Pro, NIA/NAIMA 3E Plus, ROCKWOOL Rockassist и Armacell ArmaWin.

Сравнение отвечает только на вопрос, какие классы инженерных возможностей
следует проверять. Оно не заменяет независимый расчёт на одинаковых входах.

## Сильные стороны TLT

- Открытая локальная цепочка `ТНП -> Markdown -> код -> тесты`.
- Прозрачные steady-state модели труб и резервуаров.
- Температурная `lambda(tm)` конкретных материалов изоляции.
- Многослойная изоляция и явная подземная ветка трубы.
- Разделение воздушной/грунтовой площади резервуара.
- Диагностические сопротивления и возможность объяснить результат.
- Связанный контур heat loss -> cable selection -> specification/report.

## Основные функциональные разрывы

| Область | TLT | Типичный более широкий industrial scope |
|---|---|---|
| Международный oracle | Локальный ТНП | ASTM C680, ISO 12241, VDI 2055/4610 или vendor-certified методика |
| Surface temperature | Не является доказанным результатом | Расчёт поверхности для ожогов, конденсации и проверки изоляции |
| Динамика | Steady-state holding losses | Heat-up/cool-down, freezing/stationary-media analysis |
| Локальные элементы трубы | Общая эквивалентная длина | Отдельные valve/flange/support/actuator heat sinks |
| Детали резервуара | Идеализированная форма + явный `Q_additional` | Крыша, днище, люки, патрубки, опоры, мосты холода |
| Radiation/cladding | Не выделены отдельным доказанным контрактом | Emissivity, weather barrier, cladding/material surface model |
| Hazardous/certification | Частичный продуктовый контур | Area classification, approvals, T-rating/AIT, product families |
| Производственный workflow | Проекты, расчёты, BOM и отчёты | Circuit/line-list design, quote-ready BOM, certification reports |

## Почему числа могут различаться

- разные material/K-value datasets и температурные интерполяции;
- разные модели convection/radiation и wind;
- разные boundary conditions для грунта;
- упрощённая геометрия и heat sinks;
- разные safety-factor и product-selection policies;
- vendor rounding, circuit limits и catalog constraints;
- спорные app policies TLT, например отдельный `location_indoor=0.9`.

## Минимальный независимый benchmark pack

Для каждого кейса фиксируются версия инструмента, source package, входные
единицы, material data, `q`, `Q`, surface temperature, warnings и выбранные
product/BOM результаты.

| Case | Объект | Цель |
|---|---|---|
| P1 | Наружная труба, constant lambda, `K=1`, без fittings | Чистое физическое ядро |
| P2 | Та же труба с ветром | Реакция `alpha`/wind |
| P3 | Внутренняя труба | Отделить indoor convection от дополнительного factor |
| P4 | Двухслойная труба | Суммирование сопротивлений |
| P5 | Подземная труба | Ground boundary/model |
| P6 | Труба с клапанами/фланцами/опорами | Эквивалентная длина против heat-sink model |
| T1 | Цилиндрический резервуар на воздухе | Площадь и steady-state loss |
| T2 | Прямоугольный резервуар | Геометрия и сопротивления |
| T3 | Частично подземный резервуар | Разделение air/ground surfaces |
| T4 | Резервуар с явным `Q_additional` | Граница основной модели и деталей оборудования |

## Критерий доказанного сравнения

Фраза «TLT соответствует внешнему инструменту» допустима только после golden
comparison на одинаковых входах с сохранённым отчётом внешнего инструмента,
версиями справочников и объяснёнными отклонениями. До этого корректный вывод:

> TLT имеет прозрачное локальное steady-state ядро, но международная
> стандартизация, surface/dynamic analysis и детальный industrial workflow не
> доказаны.

## Источники исходного исследования

В историческом обзоре использовались официальные vendor/product pages и guides:

- `https://raychemsoftware.nvent.com/TraceCalcNet/en-US/Help`
- `https://thermon.com/products/heat-trace/design-technology/`
- `https://content.thermon.com/pdf/us_pdf_files/TMP0050-CompuTrace-Design-Users-Guide.pdf`
- `https://bartec.com/products-solutions/product-finder/product-detail/heloc-pro`
- `https://insulation.org/training-tools/3e-plus/`
- `https://www.rockassist.com/`
- `https://www.armacell.com/en-US/armawin`

Локальная проверка TLT должна начинаться с
`docs/business-logic-contract.md`, `docs/tnp/correctness-review.md`, формульного
кода и независимых тестовых oracle, а не с этого качественного обзора.
