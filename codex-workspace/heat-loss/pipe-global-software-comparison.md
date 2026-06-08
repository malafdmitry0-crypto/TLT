# Теплопотери трубы: сравнение TLT с ведущими мировыми программами

Дата проверки: 2026-06-04.
Расчётное ядро TLT перепроверено против кода 2026-06-08: описание `pipe.py`
по-прежнему актуально.

Scope: только расчет теплопотерь трубопровода. Этот документ сравнивает текущий
TLT с публично описанными возможностями ведущих программ для heat tracing и
теплоизоляции. Это не численный benchmark: расчетные движки nVent, Thermon,
3E Plus, Rockassist и ArmaWin не запускались.

## Короткий Вывод

По физическому ядру TLT находится в правильном классе инженерных расчетов:

```text
многослойная цилиндрическая стенка
+ наружное сопротивление воздуха или грунта
+ температурная lambda изоляции
+ длина и локальные элементы
+ коэффициент запаса
```

Это совпадает с базовой инженерной логикой, которую используют мировые
программы для теплопотерь труб и подбора heat tracing.

Но ведущие мировые инструменты шире TLT:

- считают не только `q` и `Q`, но и подбирают реальные греющие кабели,
  компоненты, цепи, защиту, отчеты и BOM;
- привязаны к международным стандартам вроде ASTM C680, ISO 12241, VDI 2055;
- моделируют heat sinks: клапаны, фланцы, опоры, приводы, монтажные схемы;
- учитывают сертификацию изделий и hazardous area;
- часто считают surface temperature, sheath temperature, heat-up/cool-down или
  предупреждают, где нужен более сложный анализ.

Главный вывод: TLT уже близок к расчетному ядру по стационарным теплопотерям
трубы, но пока уступает промышленным системам по стандартам, компонентной
детализации, отчетности, safety/certification и surface/dynamic analysis.

## С Чем Сравниваем

Под "лучшими мировыми программами" здесь понимаются не ранжированные продукты,
а репрезентативные инструменты, которые широко используются или продвигаются
крупными поставщиками heat tracing и теплоизоляции.

| Инструмент | Профиль | Что важно для сравнения |
|---|---|---|
| nVent RAYCHEM / Chemelex TraceCalc Net / TraceCalc Pro | Heat tracing design для труб | Pipe heat loss, подбор кабеля, цепи, BOM, отчеты, heat sinks, стандарты сертификации. |
| Thermon CompuTrace Express / Design Suite | Heat tracing design | Проект, circuit, design, BOM, более сложный анализ в Design Suite, wind, hazardous area, heater family. |
| NAIMA / NIA 3E Plus | Расчет теплоизоляции | Heat loss/gain и surface temperature по ASTM C680. |
| ROCKWOOL Rockassist | Теплоизоляция process industry / marine / offshore | EN ISO 12241:2022, VDI 2055, VDI 4610, product proposals, CO2/cost aspects. |
| Armacell ArmaWin | Теплоизоляция | ISO 12241, VDI 2055-1, JIS A 9501, GB/T 8175, продукты Armacell и generic insulation. |

## Источники Сравнения

Внешние официальные источники:

- nVent / Chemelex TraceCalc Net Help:
  `https://raychemsoftware.nvent.com/TraceCalcNet/en-US/Help`
- nVent / Chemelex TraceCalc Pro registration page:
  `https://tracecalc.chemelex.com/`
- Thermon CompuTrace Express:
  `https://thermon.com/products/heat-trace/design-technology/computrace-express/`
- Thermon CompuTrace Design Suite user guide:
  `https://content.thermon.com/pdf/us_pdf_files/TMP0050-CompuTrace-Design-Users-Guide.pdf`
- NIA / NAIMA 3E Plus:
  `https://insulation.org/training-tools/3e-plus/`
- 3E Plus:
  `https://3eplus.org/`
- ROCKWOOL Rockassist:
  `https://www.rockassist.com/`
- Armacell ArmaWin flyer:
  `https://www.armacell.com/sites/default/files/2025/04/29/2025-04_EMEA_ArmaWin_Update_Flyer_EN_06.pdf`

Локальные источники TLT:

- `codex-workspace/heat-loss/pipe-algorithm.md`
- `codex-workspace/heat-loss/pipe-fields.md`
- `codex-workspace/heat-loss/pipe-source-traceability.md`
- `backend/app/formulas/heat_loss/pipe.py`
- `backend/app/schemas/calculation.py`
- `backend/app/services/calculation_service.py`
- `backend/app/services/project_object_params.py`

## Сравнение По Расчетному Ядру

| Критерий | TLT сейчас | Ведущие программы | Оценка |
|---|---|---|---|
| Цилиндрическая модель трубы | Есть: `R = ln(r_out/r_in)/(2*pi*lambda)` | Базовая модель heat loss для pipe heat tracing также строится на геометрии трубы, изоляции и сопротивлениях | TLT соответствует базовой физике. |
| Многослойная изоляция | Есть, 1..3 слоя | В insulation tools обычно поддерживается выбор материалов и толщин; глубина многослойности зависит от продукта | TLT достаточно силен для текущего ТНП-scope. |
| `lambda` изоляции по температуре | Есть `lambda(tm)` из локального справочника | 3E Plus и TraceCalc используют материал/K-values; Rockassist/ArmaWin используют стандартизованные подходы ISO/VDI/ASTM | TLT близок по идее, но не стандартизован как ASTM/ISO. |
| Наружный воздух и ветер | Есть `alpha = 11.6 + 7sqrt(v)` | TraceCalc запрашивает wind speed для outdoor; Thermon CompuTrace использует wind speed для pipe segment heat loss | Совпадает по концепции. |
| Indoor/outdoor | Есть `location` и `alpha=9` для indoor | TraceCalc отдельно выбирает indoor/outdoor; для outdoor просит wind speed, indoor корректируется как no wind | Совпадает по идее, но TLT имеет спорный `location_factor=0.9`. |
| Подземная труба | Есть `R_ground = arccosh(H/r)/(2*pi*lambda_gr)` | У heat tracing vendor tools публично основной акцент на pipe tracing; buried modeling зависит от продукта и setup | TLT имеет отдельную подземную ветку, это сильная часть для локального scope. |
| Safety factor | Есть `safety_factor`, climate policy `1.1/1.12` | TraceCalc описывает HL Safety Factor и рекомендует выше 10% для высоких температур | TLT имеет ТНП-логику, но не температурные рекомендации уровня TraceCalc. |
| Surface temperature | Сейчас `surface_temperature = null` | 3E Plus прямо заявляет расчет heat losses и surface temperatures по ASTM C680 | TLT слабее. |
| Dynamic heat-up/cool-down | Нет в теплопотерях трубы | Thermon CompuTrace имеет Heat Up / Cool Down analysis tabs | TLT слабее. |
| Internal temperature distribution | Нет | TraceCalc предупреждает, что не проверяет internal temperature distribution; для крупных диаметров это ответственность пользователя | TLT тоже не проверяет, но пока явно не предупреждает в результате. |

## Сравнение По Компонентам И Локальным Элементам

| Критерий | TLT сейчас | Ведущие программы | Что это значит |
|---|---|---|---|
| Локальные элементы | `num_local_elements * local_element_equiv_length` | TraceCalc отдельно учитывает valve, support, flange; для valves есть fixed adder tables и расчет typical valve/actuator; supports учитываются как heat sinks через fin effect | TLT проще. Для инженерной точности лучше перейти от одного `L_ekv` к типизированным heat sinks. |
| Клапаны | Только счетчик/общий эквивалент | TraceCalc различает типы клапанов и тяжелые/легкие варианты | У TLT возможна погрешность на арматуре. |
| Фланцы | Только счетчик/общий эквивалент | TraceCalc имеет отдельный flange adder design | У TLT нет детализации по диаметру/типу фланца. |
| Опоры | Только счетчик/общий эквивалент | TraceCalc рассматривает supports как heat sinks, в Thermon guide есть pipe supports / notched supports с fin model | TLT пока не моделирует опоры физически. |
| Weather barrier / cladding | Нет | CompuTrace учитывает weather barrier и emissivity в heat loss calculation | У TLT нет эмиссивности/покрытия. |

## Сравнение По Стандартам

| Направление | TLT сейчас | Мировые инструменты |
|---|---|---|
| Локальный ТНП-контракт | Сильная сторона: явно привязан к локальным DOCX/XLSX/VSDX и climate policy | Обычно не привязаны к этому ТНП. |
| ASTM C680 | Не заявлен | 3E Plus использует метод heat flow calculation из ASTM C680 для heat gain/loss и surface temperature. |
| ISO 12241 | Не заявлен | Rockassist заявляет EN ISO 12241:2022; ArmaWin заявляет ISO 12241. |
| VDI 2055 / VDI 4610 | Не заявлен | Rockassist и ArmaWin заявляют VDI 2055; Rockassist также VDI 4610. |
| Сертификация heat tracing | Не часть pipe heat loss | TraceCalc выбирает standards body US/CANADA/CENELEC для product certifications. |

Вывод: TLT хорошо документирован под локальный ТНП, но для международного
уровня нужен слой стандартов: ASTM C680 / ISO 12241 / VDI 2055 хотя бы как
режим сравнения или oracle.

## Сравнение По Отчетам И Производственному Workflow

| Возможность | TLT сейчас | Ведущие программы |
|---|---|---|
| Расчет `q` и `Q` | Есть | Есть. |
| Отчеты по входам/результатам | Частично через приложение и наши MD | TraceCalc Net имеет project summary line list, electrical line list, single line detail reports. |
| BOM | В TLT есть спецификационный контур, но это отдельно от pipe heat loss | Thermon CompuTrace Express генерирует quote-ready bill of materials; TraceCalc формирует BOM reports. |
| Автоподбор компонентов | Есть в электрическом контуре TLT, но не в самом pipe heat loss | Vendor tools автоматически подбирают heating cable, components, circuits. |
| Hazardous area / certifications | Не относится к текущему pipe heat loss | TraceCalc учитывает standards body и area classification; Thermon guide описывает area classification/AIT/T-rating. |
| Project import / line list | В TLT есть свои импорты/объекты | CompuTrace Design Suite поддерживает import from line list; TraceCalc работает с circuits/line types. |

## Где TLT Уже Силен

- Открытая и проверяемая формула в коде, без закрытого vendor engine.
- Четкая traceability: `первоисточник -> repo-MD -> код -> тесты`.
- Поддержка локального ТНП: DOCX/XLSX/VSDX, климатическое правило по диаметру,
  `lambda(tm)` из локального справочника.
- Подземная ветка трубы явно реализована.
- Многослойная изоляция 1..3 слоя.
- Расчет сохраняет диагностические сопротивления:
  `wall_resistance`, `insulation_resistance`, `external_resistance`,
  `thermal_resistance`.
- Можно объяснить результат инженеру через открытые Markdown-документы.

## Где TLT Уступает Ведущим Программам

1. Нет международного стандарта расчета как отдельного режима.

   Сейчас TLT считает по локальной ТНП-логике. Для сравнимости с 3E Plus,
   Rockassist и ArmaWin нужен хотя бы один режим/benchmark:

   ```text
   ASTM C680
   ISO 12241
   VDI 2055
   ```

2. Нет surface temperature.

   Для инженера это критично: температура наружной поверхности нужна для
   безопасности, ожогов, конденсации, контроля изоляции и сверки с insulation
   tools.

3. Локальные элементы слишком упрощены.

   Один `L_ekv` не заменяет отдельные модели:

   ```text
   valve
   valve with actuator
   flange pair
   pipe support
   welded shoe
   hanger
   ```

4. Нет cladding / weather barrier / emissivity.

   У CompuTrace weather barrier задает emissivity для heat loss calculation.
   В TLT наружное покрытие сейчас не участвует в теплопотерях трубы.

5. Нет динамики heat-up / cool-down.

   TLT считает стационарные потери. Thermon CompuTrace Design Suite публично
   описывает Heat Up / Cool Down analysis.

6. Нет явных warnings уровня commercial tools.

   Например:

   ```text
   крупный диаметр -> проверить внутреннее распределение температуры
   rigid insulation -> учесть место под кабель
   high temperature -> увеличить safety factor
   wet/poor insulation -> high safety factor не спасает
   ```

7. Нет полного международного certification workflow.

   Ведущие vendor tools учитывают standards body, approvals, hazardous area,
   area classification, T-rating, AIT и доступные product families.

## Почему Числа Могут Отличаться От nVent / Thermon / 3E Plus

Даже при одинаковой трубе и температуре результаты могут отличаться по причинам:

| Причина | Как влияет |
|---|---|
| Разные `lambda` материалов | Один и тот же материал может иметь другую табличную базу или температурную кривую. |
| Разные стандарты конвекции | TLT использует `11.6 + 7sqrt(v)`; ISO/ASTM/VDI могут давать другую внешнюю теплоотдачу. |
| Surface radiation / emissivity | В TLT отдельно не моделируется weather barrier/emissivity; vendor tools могут учитывать. |
| Heat sinks | TLT использует эквивалентную длину; TraceCalc/CompuTrace могут считать клапаны/опоры подробнее. |
| Safety factor | TLT применяет ТНП/climate policy; TraceCalc рекомендует разные safety factors для разных температурных уровней. |
| Indoor logic | У TLT есть спорный `location_indoor=0.9`; в первоисточнике такого отдельного множителя нет. |
| Ground model | Подземная ветка TLT есть, но vendor tools могут требовать другой setup или не делать прямой buried-pipe benchmark. |
| Product constraints | Vendor tools подбирают реальные кабели и могут округлять мощность/длину/цепи по каталогу. |

## Как Сделать Честный Численный Benchmark

Для настоящего сравнения нужны расчеты из внешних программ. Предлагаемый набор
golden cases:

| Case | Описание | Что сравнить |
|---|---|---|
| A | Наружная труба, без локальных элементов, `K=1`, ручная constant `lambda` изоляции | Чистый `q`, чтобы проверить физическое ядро. |
| B | То же, но `wind_speed=3 м/с` | Реакция на ветер и `alpha`. |
| C | Внутреннее размещение, без `location_factor` или с явным учетом | Отличить indoor alpha от дополнительного `K_разм`. |
| D | Два слоя изоляции | Суммирование цилиндрических сопротивлений. |
| E | Подземная труба `H=1.5 м`, `lambda_gr=1.5` | Грунтовая ветка. |
| F | Клапаны/фланцы/опоры | Сравнить TLT `L_ekv` против vendor heat sink adders. |
| G | Высокая температура `>150 °C` | Проверить safety factor policy и предупреждения. |

Для каждого case нужно фиксировать:

```text
input units
material lambda source
insulation lambda source
wind / ambient
safety factor
local elements policy
q W/m
Q W
surface temperature, если есть
warnings
selected cable / BOM, если есть
```

## Рекомендации Для Доведения TLT До Уровня Ведущих Инструментов

1. Добавить расчет `surface_temperature`.
2. Добавить режим benchmark по ASTM C680 или ISO 12241 для трубы.
3. Разделить локальные элементы на типы: valve, flange, support, actuator.
4. Добавить справочник heat sink adders или физические модели для опор/фланцев.
5. Добавить `weather_barrier`, `emissivity`, `cladding_material`.
6. Явно маркировать `location_indoor=0.9` как product policy или убрать до
   подтверждения.
7. Сузить или подтвердить `ground_conductivity=0.5..0.8`.
8. Добавить warnings:
   - large diameter / internal temperature distribution;
   - high temperature / safety factor;
   - unsupported insulation material;
   - rigid insulation / cable allowance;
   - wet or damaged insulation cannot be compensated by K alone.
9. Сделать benchmark sheet: TLT vs 3E Plus / TraceCalc / CompuTrace на 5-7
   одинаковых cases.
10. Для каждого численного сравнения хранить source package:
    screenshot/report внешней программы, входные данные, версию программы,
    дату расчета.

## Итоговая Оценка

| Область | Оценка TLT |
|---|---|
| Стационарная физика теплопотерь трубы | Хорошо, соответствует инженерному ядру. |
| Traceability и объяснимость | Сильнее многих закрытых vendor tools, потому что код и источники открыты локально. |
| Международные стандарты | Недостаточно: нет ASTM/ISO/VDI режима. |
| Компоненты и heat sinks | Упрощенно. |
| Surface/dynamic analysis | Недостаточно. |
| Industrial heat tracing workflow | Частично, но не на уровне TraceCalc/CompuTrace. |
| Локальная ТНП-пригодность | Сильная сторона. |

Практически: TLT можно использовать как локально объяснимое расчетное ядро для
ТНП-теплопотерь трубы. Чтобы сравниваться с мировыми программами не только по
логике, но и по точности, нужен отдельный benchmark на одинаковых входных
данных и режим расчета по международному стандарту.
