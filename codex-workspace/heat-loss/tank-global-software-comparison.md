# Теплопотери резервуара: сравнение TLT с ведущими мировыми программами

Дата проверки: 2026-06-04.
Расчётное ядро TLT перепроверено против кода 2026-06-08: описание `tank.py`
по-прежнему актуально.

Scope: только расчет теплопотерь резервуара. Это качественное сравнение текущей
модели TLT с публично описанными возможностями ведущих программ heat tracing и
теплоизоляции. Это не численный benchmark: внешние расчетные движки не
запускались.

## Короткий Вывод

По стационарному расчетному ядру TLT находится в правильном классе:

```text
плоская стенка резервуара
+ площадь поверхности
+ изоляция с lambda(tm)
+ наружная теплоотдача или грунт
+ коэффициент запаса
+ Q_доп
```

Это соответствует базовой инженерной логике расчета теплопотерь резервуаров.
Публичные материалы vendor/software рынка также описывают потери через
конструкцию, изоляцию, конвекцию и внешние условия.

Но лучшие мировые инструменты шире:

- считают surface temperature и insulation thickness по ASTM/ISO/VDI;
- поддерживают tank/vessel heat tracing workflows, реальные кабели, цепи,
  компоненты, hazardous area, BOM и отчеты;
- учитывают стандарты, product catalogs, certification и ограничения монтажа;
- чаще дают warnings, отчеты, экономику, CO2 и/или нормативные классы;
- могут моделировать больше деталей резервуара, чем текущий `Q_доп`.

Главный вывод: TLT достаточен как открытое локальное ТНП-ядро для стационарных
теплопотерь резервуара, но пока уступает промышленным системам по стандартам,
детализации vessel/tank workflow, surface-temperature analysis, отчетности и
сертификационному контуру.

## С Чем Сравниваем

| Инструмент | Профиль | Что важно для резервуаров |
|---|---|---|
| nVent RAYCHEM TraceCalc Pro | Heat tracing design | Публичная спецификация заявляет pipe и vessel tracing systems, self-regulating/power-limiting/series cables, circuit/components/reporting. |
| Thermon CompuTrace / Vessel Trace | Heat tracing design | У Thermon есть отдельный `CompuTrace - Vessel Trace (VT)`; generic Design Suite user guide при этом явно выводит tank/vessel heating за рамки конкретного Design Suite. |
| BARTEC Heloc Pro | Heat tracing design | Публичное описание заявляет расчет heat loss и design для pipelines and tanks, подбор компонентов, IEC и NEC/CEC. |
| NAIMA / NIA 3E Plus | Insulation performance | Heat loss/gain и surface temperature для piping/equipment по ASTM C680; публичные материалы 2026 упоминают vessels и tank shells. |
| ROCKWOOL Rockassist | Technical insulation | EN ISO 12241:2022, VDI 2055:2008, VDI 4610, product proposals, cost/CO2 aspects. |
| Armacell ArmaWin | Technical insulation | Insulation thickness, surface temperature, heat flow, flowing/stationary media, freezing time, economic insulation thickness. |

## Внешние Источники Сравнения

Официальные или vendor-linked источники, использованные для качественного
сравнения:

- Thermon Design Technology:
  `https://thermon.com/product-categories/heat-trace/design-technology/`
- Thermon CompuTrace Design Suite User Guide:
  `https://content.thermon.com/pdf/us_pdf_files/TMP0050-CompuTrace-Design-Users-Guide.pdf`
- nVent RAYCHEM TraceCalc Pro data sheet:
  `https://www.nvent.com/sites/default/files/acquiadam_assets/2020-12/Raychem-DS-H57021-TraceCalcPro-EN.pdf`
- nVent RAYCHEM Design Tools:
  `https://www.nvent.com/en-ca/raychem/resources/design-tools`
- BARTEC Heloc Pro:
  `https://bartec.com/products-solutions/product-finder/product-detail/heloc-pro`
- NIA / NAIMA 3E Plus:
  `https://insulation.org/training-tools/3e-plus/`
- NIA / Insulation Outlook article on 3E Plus:
  `https://insulation.org/io/articles/naimas-technical-tools-3e-plus-and-3e-estimator/`
- ROCKWOOL Rockassist:
  `https://www.rockassist.com/`
- ROCKWOOL Technical Insulation tools:
  `https://rti.rockwool.com/en/tools-and-documentation/tools/`
- Armacell ArmaWin:
  `https://www.armacell.com/en-US/armawin`

Локальные источники TLT:

- `codex-workspace/heat-loss/tank-algorithm.md`
- `codex-workspace/heat-loss/tank-fields.md`
- `codex-workspace/heat-loss/tank-source-traceability.md`
- `backend/app/formulas/heat_loss/tank.py`
- `backend/app/schemas/calculation.py`
- `backend/app/services/calculation_service.py`
- `backend/app/services/project_object_params.py`
- `backend/app/tests/unit/formulas/test_tank_heat_loss.py`

## Сравнение По Расчетному Ядру

| Критерий | TLT сейчас | Ведущие программы | Оценка |
|---|---|---|---|
| Теплопотери через стенку и изоляцию | Есть: `q = ΔT / (R_wall + R_ins + R_ext)` | Базовая модель tank/vessel heat loss также строится на heat flow через конструкцию, изоляцию и наружную теплоотдачу | TLT соответствует базовой физике. |
| Площадь резервуара | Есть цилиндр, прямоугольный резервуар, сфера | Vendor tools обычно имеют tank/vessel objects или equipment/tank-shell calculations | TLT покрывает базовые формы, но без деталей крыши/днища/аппарата. |
| Многослойная изоляция | Есть 1..3 слоя | Insulation tools обычно позволяют выбирать материалы/толщины; возможности зависят от продукта | TLT достаточен для текущего ТНП-scope. |
| `lambda(tm)` | Есть локальный справочник `lambda(tm)` | 3E Plus/Rockassist/ArmaWin используют стандартизованные material/K-values и нормативные методики | TLT силен локальной traceability, слабее международной стандартизацией. |
| Наружный воздух и ветер | Есть `alpha = 11.6 + 7sqrt(v)` | Heat tracing tools учитывают outdoor/wind; insulation standards могут использовать другие корреляции | Совпадает по концепции, но не ASTM/ISO/VDI oracle. |
| Помещение | Есть `alpha = 9.0` и `location_factor=0.9` | Обычно indoor/outdoor задаются условиями теплоотдачи; отдельный `0.9` не подтвержден локальным первоисточником | `alpha` логичен, `location_factor` остается source gap. |
| Подземная часть | Есть split `S_air/S_ground`, `R_ground = h/lambda_gr` | Vendor tools могут поддерживать tank/vessel cases, но buried tank modeling публично раскрыт хуже и зависит от продукта | TLT имеет простую прозрачную модель, но требует benchmark. |
| `Q_доп` | Есть ручная добавка | Vendor tools обычно детализируют fittings/components/heat sinks или дают проектный workflow | TLT проще, но позволяет инженеру явно добавить неучтенные потери. |
| Surface temperature | Нет | 3E Plus и ArmaWin публично заявляют surface temperature; Rockassist работает по ISO/VDI insulation performance | TLT слабее. |
| Heat-up / cool-down / dynamics | Нет в теплопотерях резервуара | Некоторые heat tracing suites имеют более широкий design/analysis workflow; insulation tools могут считать stationary media changes/freezing | TLT считает только steady-state holding losses. |

## Сравнение По Tank/Vessel Workflow

| Возможность | TLT сейчас | Ведущие программы |
|---|---|---|
| Heat loss `Q` | Есть | Есть. |
| Подбор реального кабеля для резервуара | Есть в отдельном электрическом контуре TLT, но теплопотери сами по себе только считают `Q` | TraceCalc Pro, Thermon Vessel Trace и BARTEC Heloc Pro ориентированы на полный heat tracing design. |
| Длина укладки на резервуаре | Есть через электрический контур: геометрия укладки, высота обогрева, шаг | Vendor tools обычно связывают heat loss, cable family, circuit, components и монтаж. |
| Компоненты | Спецификационный контур есть отдельно | Vendor tools формируют connection kits, controllers, sensors, termination kits, mounting accessories, BOM. |
| Hazardous area / certificates | Не часть теплопотерь | BARTEC/nVent/Thermon workflows публично ориентированы на industrial/hazardous/certification context. |
| Отчеты | Есть приложение/локальные docs, но не vendor-style пакет | Vendor tools заявляют design reports, line lists, BOM или reporting systems. |
| Стандарты | Локальный ТНП | ASTM C680, ISO 12241, VDI 2055/4610, IEC/NEC/CEC в зависимости от инструмента. |

## Где TLT Уже Силен

- Формула открыта и проверяема в коде.
- Есть traceability `первоисточник -> repo-MD -> код -> тесты`.
- Локальная ТНП-модель резервуара реализована прямо: `R_внеш`, площади,
  подземное разбиение, `Q_доп`.
- `lambda(tm)` изоляции взята из локального справочника и проверяется по
  температурному диапазону.
- Есть диагностические поля результата:
  `wall_resistance`, `insulation_resistance`, `external_resistance`,
  `ground_resistance`, `alpha_vnesh`, `air_surface_area`, `ground_surface_area`.
- Есть unit-тесты на площади, ручной расчет `q`, подземное разбиение,
  коэффициенты, `Q_доп` и монотонность.

## Где TLT Уступает Ведущим Программам

1. Нет режима ASTM C680 / ISO 12241 / VDI 2055.

   Для международного benchmark нужен независимый стандартный oracle. Сейчас
   TLT привязан к локальному ТНП, а не к ASTM/ISO/VDI.

2. Нет расчета температуры наружной поверхности.

   Для резервуаров это важно для безопасности, ожогов, конденсации,
   проверки изоляции и сопоставления с insulation tools.

3. Нет детальной модели резервуара.

   Текущая модель использует общую площадь и ручной `Q_доп`. Не выделяются:

   ```text
   днище
   крыша
   люки
   патрубки
   штуцеры
   опоры
   лестницы/площадки
   тепловые мосты
   ```

4. Нет динамики продукта.

   Не считается прогрев до температуры, охлаждение, freezing time, тепловая
   емкость продукта, перемешивание и стратификация.

5. Нет cladding / emissivity / radiation model как отдельного слоя.

   Наружная теплоотдача сведена к `alpha`; покрытие, эмиссивность и излучение
   отдельно не управляются.

6. Нет полного certification/BOM workflow внутри теплопотерь.

   Vendor tools связывают heat loss с real product families, components,
   approvals, hazardous area и отчетами.

7. Нет публично доказанного численного benchmark.

   В `P-TANK-VAR` есть сравнение с `tscalc`, `BARTEC` и
   `obogrev-kabel.ru/calculators/`, но нет полного набора входов. Это нельзя
   считать строгим benchmark.

## Почему Числа Могут Отличаться От Vendor Tools

| Причина | Как влияет |
|---|---|
| Разные стандарты теплоотдачи | TLT использует `11.6 + 7sqrt(v)`; ASTM/ISO/VDI могут давать другое `alpha`. |
| Разные базы материалов | `lambda` изоляции может отличаться по производителю, стандарту и температурной интерполяции. |
| Radiation/emissivity | TLT не выделяет излучение и покрытие; insulation tools могут учитывать. |
| Tank geometry details | TLT считает идеализированный цилиндр/параллелепипед/сферу; vendor workflow может учитывать аппаратные детали. |
| Heat sinks | TLT использует `Q_доп`; vendor tools могут моделировать компоненты или монтажные особенности. |
| Safety factor | TLT применяет локальный `K`; vendor tools могут использовать product/design-specific recommendations. |
| Подземная модель | TLT использует `h/lambda_гр`; другие программы могут применять другие boundary conditions. |
| Product constraints | Vendor tools округляют по реальным кабелям, цепям, зонам, монтажным наборам и ограничениям. |

## Как Сделать Честный Численный Benchmark

Для корректного сравнения с nVent/Thermon/BARTEC/3E Plus/Rockassist/ArmaWin
нужен фиксированный benchmark pack:

```text
1. Одинаковые входы:
   форма, размеры, Tж, Tос, изоляция, lambda, ветер, K, Qдоп.

2. Одинаковые material data:
   либо ручная lambda, либо явно выбранные материалы с одинаковыми K-values.

3. Одинаковый режим:
   steady-state holding losses, без heat-up.

4. Отдельные cases:
   цилиндр на воздухе,
   прямоугольный резервуар на воздухе,
   частично подземный цилиндр,
   помещение,
   ручной alpha.

5. Метрики:
   q, Q без K, Q с K, surface temperature если внешний инструмент ее дает,
   warnings/differences.
```

До такого benchmark корректнее говорить:

```text
TLT совпадает с локальным ТНП и имеет прозрачное расчетное ядро.
С мировыми программами он сопоставим по базовой steady-state heat-loss идее,
но не доказан численно и уступает по стандартам, surface temperature,
детализации tank/vessel workflow и отчетности.
```
