# Сверка качества парсинга ТНП-алгоритмов

Дата сверки: 2026-05-16.

Цель: отдельно проверить, насколько хорошо распаршены VSDX/PDF-алгоритмы и
достаточно ли они отражены в основной документации проекта.

## Scope

- `docs/tnp/algorithms/climate.md`
- `docs/tnp/algorithms/winding.md`
- `docs/tnp/algorithms/self-regulating-pipe-selection.md`
- `docs/tnp/algorithms/resistive-selection.md`
- `docs/business-logic-contract.md`
- `docs/qa/business-logic-coverage.md`
- `qa-agent/docs/tlt-formula-algorithm-inventory.md`
- `qa-agent/examples/tlt-formulas.registry.yaml`
- `backend/app/formulas/electrical/**`

## Итог

Парсинг дает полезную и проверяемую основу, но его нельзя считать полностью
достаточным источником истины для всех алгоритмов.

| Алгоритм | Качество парсинга | Отражение в основном контракте | Остаточный риск |
|---|---|---|---|
| Климат и коэффициент запаса | Хорошее: без предупреждений и inferred edges | Отражен как `tlt_climate_safety_factor` | Backend policy resolver реализован; риск остается только в полноте климатического справочника |
| Максимальный коэффициент навива | Хорошее: без предупреждений и inferred edges | Отражен как `tlt_max_winding_coefficient` | Границы `75/89/108` неявные в схеме; приняты верхне-включительно и enforced в backend |
| Саморегулирующийся ТТН/ТТВ/ТТХ для труб | Среднее: основная ветка труб распаршена, но есть 6 inferred loop edges и `См. следующий лист` для не-труб | Отражен: series limits, T3, нитки full-version и суффикс закреплены контрактом | Остаточный риск — только parsed ambiguity `R=1 -> СР`, закрытая инженерным решением |
| Резистивный подбор | Среднее: структура перебора распаршена без inferred edges, но `p2/p3/L1/L2` остались текстовыми расчетными узлами | Частично реализован: базовый passport `R/P/I/65А` есть | Полный deterministic oracle по длинам секций, `U/N/M`, `L1/L2` еще нужен |

## Детальная оценка

### `ALG-CLIM`: климат

Распаршено достаточно хорошо для реализации deterministic oracle:

- ветка трубопровода отделена от не-труб;
- правило `D >= 100 -> K=1.1, T=T1`;
- правило `D < 100 -> K=1.12, T=T0`;
- fallback к климатической БД для отсутствующих `T0/T1/T`;
- для не-труб используется холодная пятидневка `0.92` и `K=1.1`.

Отражено в основной документации:

- `docs/business-logic-contract.md`: `tlt_climate_safety_factor`;
- `docs/qa/business-logic-coverage.md`: covered;
- `qa-agent/docs/tlt-formula-algorithm-inventory.md`: TNP Climate Rule.

Backend resolver применяет policy автоматически: труба `D >= 100` получает
`K=1.1/T1`, труба `D < 100` получает `K=1.12/T0`, не-трубы получают
`K=1.1/T_0.92`.

### `ALG-WIND`: максимальный коэффициент навива

Распаршено хорошо, но сама схема не закрывает граничные точки `D = 75`, `89`,
`108`. В QA-agent принято консервативное заполнение: верхняя граница входит в
предыдущий диапазон.

Отражено в основной документации:

- `docs/business-logic-contract.md`: `tlt_max_winding_coefficient`;
- `docs/qa/business-logic-coverage.md`: covered;
- `qa-agent/docs/tlt-formula-algorithm-inventory.md`: TNP Max Winding Coefficient.

Backend проверяет explicit/geometric `Kn` как hard-limit. Для неявного default
коэффициент ограничивается максимумом диаметра, чтобы старые payload без явного
навива не нарушали policy.

### `ALG-SR`: ТТН/ТТВ/ТТХ

Распаршено частично достаточно:

- температурная лестница `ТТН -> ТТВ -> ТТХ` читается;
- формула мощности `Pi.ном(T3)=Q(i,1)*T3+Q(i,2)` читается;
- перебор номиналов до `Pi(T3) >= Pоб` читается;
- расчет ниток `N = ceil(Pоб / Pi.ном(T3))` читается;
- ветка не-труб ведет в `См. следующий лист`, которого в текущем parsed Markdown
  нет.

Ограничения парсинга:

- 6 loop edges восстановлены как inferred target;
- VSDX различает `T1`, `T2`, `T3`; backend/API отражает это как
  `process_temperature`/`vapor_temperature`/`maintain_temperature`; при
  отсутствии T3 применяется совместимый fallback `T3=T1`;
- ветка `R=1 -> F="СР"` конфликтует с доменной трактовкой
  `aggressive_product -> СТ`;
- схема выбирает максимальный номинал серии и считает `N`, backend следует
  этому full-version правилу без искусственного `threads <= 3`.

Отражено в основной документации:

- `docs/business-logic-contract.md`: temperature limits covered;
- `docs/tnp/project-reconciliation-audit.md`: fixed policy по `N` и suffix;
- `qa-agent/docs/tlt-formula-algorithm-inventory.md`: backend/current algorithm.

Что остается помнить: ветка `R=1 -> СР` помечена как неоднозначность OCR/VSDX,
а рабочий контракт закрепляет `aggressive_product -> СТ`.

### `ALG-RES`: резистивный подбор

Распаршено структурно:

- входная кабельная линейка `Q(i,j)`;
- `Q(i,0)` обозначение, `Q(i,1)` номинальное сопротивление;
- сортировка по `Q(i,1)` по убыванию;
- расчет `L1/L2`;
- начальные `U=220`, `N=2`, `M=1`;
- ветки `U=220/380`, `N=2/3`, увеличение `M`;
- ограничение `p3` по максимально допустимой температуре жилы и току `65 А`;
- выбор кабеля с выводом `Q(i,0)`, схемы, напряжения, тока и количества схем.

Ограничение парсинга: формулы `p2`, `p3`, `L1`, `L2` остались в виде текстовых
узлов, без самостоятельной развернутой математической спецификации. Поэтому
текущий parsed документ достаточен для архитектуры алгоритма, но недостаточен
для полного oracle без дополнительных таблиц и инженерной формализации.

Отражено в основной документации:

- `docs/business-logic-contract.md`: `tlt_resistive_selection_algorithm_full`
  и `tlt_tt_r1_resistance_based_power`;
- `docs/tnp/project-reconciliation-audit.md`: `ALG-RES-01/02`;
- `docs/qa/business-logic-coverage.md`: базовая паспортная часть covered,
  полный VSDX-подбор still `Needs implementation`.

QA-agent имеет deterministic oracle для базовой паспортной части
`R=resistance_ohm_km/1000*L`, `P=U²/R`, `I=P/U`, `I<=65А`. Для полной версии
остается главный gap: полный VSDX oracle по длинам секций и перебору `U/N/M`.

## Что считать источником истины

1. Parsed Markdown фиксирует извлеченную структуру VSDX/PDF.
2. `docs/business-logic-contract.md` фиксирует текущий бизнес-контракт.
3. `docs/tnp/project-reconciliation-audit.md` фиксирует расхождения с кодом.
4. QA-agent registry/oracles должны доказывать численную корректность только там,
   где алгоритм формализован deterministic образом.
5. Для саморегулирующегося и резистивного алгоритмов LLM/парсер не закрывает
   спорные места сам по себе; нужны business decision или формализация oracle.
