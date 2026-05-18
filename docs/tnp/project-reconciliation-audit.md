# Сверка ТНП с проектной документацией и кодом

Дата сверки: 2026-05-16.

Scope:

- `docs/tnp/algorithms/`;
- `docs/tnp/block-heat-loss-and-cable-selection/`;
- `docs/tnp/internal-references/`;
- `docs/business-logic-contract.md`;
- `qa-agent/examples/tlt-formulas.registry.yaml`;
- `backend/app/formulas/**`;
- `backend/app/reference_data/**`.

Цель сверки — понять, где ТНП-документация уже совпадает с проектным
контрактом и кодом, а где текущая реализация не дотягивает до полной версии.

## Full Version Rule

Для ТНП-расчетов, алгоритмов и справочников целевым состоянием считается
полная версия приложения. Упрощенная, частичная или временная реализация не
считается приемлемой реализацией бизнес-логики и должна маркироваться как
gap/defect до доведения до ТНП-контракта.

В документации не использовать раннюю поставку как оправдание расхождения.
Если формула, алгоритм, справочник, backend policy или UI/API workflow
реализованы не полностью, статус должен быть `Needs implementation`,
`Needs correction` или `Needs business decision`.

## Итог

Теплопотери труб и резервуаров в основной физике согласованы с ТНП и backend.
No-double-K контракт зафиксирован правильно. Табличные строки ТТ Р1/ТТ Р3 из
последних пользовательских скринов перенесены в backend-справочник и покрыты
unit-тестами.

Полный VSDX-автоподбор резистивного кабеля перенесен в backend/QA-agent в
формализованном виде: `U/N/M`, `p2/p3`, `L1/L2`, паспортное `R/P/I` и лимит
`65А`. Climate policy, `Kn_max(D)`, T3 fallback и full-version policy ниток для
ТТН/ТТВ/ТТХ также перенесены в backend/QA-agent.

## Что совпадает

| Блок | Статус | Evidence |
|---|---|---|
| Труба: цилиндрические сопротивления | Совпадает | `docs/tnp/block-heat-loss-and-cable-selection/pipe-heat-loss-and-cable-selection.md`, `backend/app/formulas/heat_loss/pipe.py` |
| Труба: грунт через `ln(x + sqrt(x^2 - 1))` / `arccosh` | Совпадает | `backend/app/formulas/heat_loss/pipe.py` |
| Труба: `Q = q_linear * (L + Lдоп) * K` | Совпадает | `docs/business-logic-contract.md`, API regression tests |
| Резервуар: `Rвнеш = 1 / alpha` | Совпадает после исправления Markdown | `backend/app/formulas/heat_loss/tank.py` |
| Резервуар: периметр `2 * (L + B)` | Совпадает после исправления Markdown | `backend/app/formulas/electrical/cable_geometry.py` |
| No-double-K для self-regulating | Совпадает | `backend/app/tests/unit/services/test_no_double_safety.py` |
| ТТН/ТТВ/ТТХ q-curve coefficients | Совпадает с блоком теплопотерь | `backend/app/reference_data/cables_tt.json` |
| ТТ Р1/ТТ Р3 видимые строки справочника | Совпадает с последними скринами | `backend/app/tests/unit/reference_data/test_loader.py` |
| Материалы трубы `lambda(T)` | Совпадает | `docs/tnp/internal-references/material-conductivity-formulas.md`, `backend/app/reference_data/pipe_materials.json` |
| Грунт | Совпадает как справочник | `docs/tnp/internal-references/soil-conductivity.md`, `backend/app/reference_data/soil_conductivity.json` |

## Findings

| ID | Severity | Область | Finding | Что сделать |
|---|---|---|---|---|
| `ALG-RES-01` | Fixed | Резистивный кабель | VSDX-алгоритм работает с `Q(i,1)` как номинальным сопротивлением кабеля. Backend для паспортных строк считает `R = resistance_ohm_km / 1000 * length`, `P = U^2 / R`, `I = P/U` и применяет лимит `65 А`; legacy cross-section остается совместимым fallback для каталогов без сопротивления. | Covered backend/QA-agent tests. |
| `ALG-RES-02` | Fixed with fallback policy | Резистивный кабель | VSDX содержит итеративный подбор: сортировка линейки, расчет `p2`, ограничение `p3`, переходы `U=220/380`, `N=2/3`, увеличение `M`. Backend auto mode перебирает `M -> петля start U -> петля high U -> звезда high U`; ручной ввод схемы остался `selection_mode=manual`. | Точные thermal `p3`-лимиты можно заполнить в `correction_coefficients`; fallback — `65 А`. |
| `ALG-WIND-01` | Fixed | Навив | `Kn_max(D)` принят как hard-limit с верхне-включительными границами `75/89/108`. | Backend валидирует explicit/geometric коэффициент навива; default коэффициент ограничивается максимумом диаметра. |
| `ALG-CLIM-01` | Fixed | Климат | QA-agent реализует `D >= 100 -> K=1.1/T1`, `D < 100 -> K=1.12/T0`, non-pipe -> `0.92/K=1.1`. | Backend resolver применяет policy до расчета теплопотерь. |
| `ALG-SR-01` | Fixed | ТТН/ТТВ/ТТХ | VSDX различает `T1` product, `T2` vapor, `T3` maintain temperature для `Pi.ном(T3)`. | Backend/API/UI используют `process_temperature` как `T1`, `vapor_temperature` как `T2`, `maintain_temperature` как T3; если T3 не передан, используется fallback `T3=T1`. |
| `ALG-SR-02` | Fixed | ТТН/ТТВ/ТТХ | VSDX после достижения максимума линейки выбирает максимальный номинал серии и считает `N = ceil(Pоб / Pi)`. | Backend выбирает серию по температуре и не эскалирует серию только ради ограничения ниток; `number_of_threads` для ТТ допускает до 100. |
| `ALG-SR-03` | Fixed by contract | ТТН/ТТВ/ТТХ | В извлеченной схеме ветка `R=1` ведет к `F="СР"`, но текстовая интерпретация и backend используют `aggressive_product -> СТ`. | Принято инженерное решение: `aggressive_product -> СТ`, иначе `СР`; parsed branch считается неоднозначностью OCR/VSDX. |
| `REF-INS-01` | Fixed | Теплоизоляция | ТНП-справочник содержит формулы `lambda(tm)` и отдельное определение средней температуры слоя `tm`. Backend loader теперь считает `lambda(tm)` по `conductivity_20_plus`/`conductivity_19_minus`; generic семьи материалов не допускаются как расчётный материал. | UI/API/Excel требуют конкретный код материала с плотностью и `insulation_temperature_basis`; QA-agent oracle обновлён на тот же контракт. |
| `REF-R3-01` | Low | ТТ Р3 | `standard_supply_voltage_v = 380` и `max_linear_power_w_m = 50` остались legacy-полями, но не видны на последних пользовательских скринах. | Не использовать как hard-limit до отдельного источника. |

## Доказательство по ТТ Р1

Паспортная таблица ТТ Р1 задает `resistance_ohm_km`. Для некоторых строк
значение не совпадает с сопротивлением, рассчитанным как медное
`0.0175 * 1000 / S`.

Пример:

| Кабель | Паспортное сопротивление, Ом/км | Сечение, мм² | Медный эквивалент, Ом/км | Ratio |
|---|---:|---:|---:|---:|
| `ТТ Р1 8000` | 8000 | 0.14 | 125.0 | 64.0 |
| `ТТ Р1 3950` | 3950 | 0.35 | 50.0 | 79.0 |
| `ТТ Р1 32,7` | 32.7 | 0.53 | 33.0 | 1.0 |
| `ТТ Р1 1,81` | 1.81 | 9.69 | 1.81 | 1.0 |

Для `ТТ Р1 8000` паспортная длина секции `17 м` при `220 В` дает примерно
`20.9 Вт/м`, что соответствует таблице `20 Вт/м`. Backend-формула через
медное `rho` и `S=0.14` дала бы примерно `1339 Вт/м`, то есть это не та же
модель.

Вывод: для ТТ Р1 нельзя считать весь каталог только через `conductor_section_mm2`
и медное `rho`; нужно использовать паспортное сопротивление как первичный
параметр.

## Принятые интерпретации

| Место | Решение | Почему |
|---|---|---|
| `T < limit` в VSDX для ТТН/ТТВ/ТТХ | Использовать `<=` | Паспортный предел обычно означает "не выше"; точные границы покрыты тестами. |
| Дырки `D = 75/89/108` в навиве | Отнести к нижней, менее permissive ветке | Консервативная трактовка максимального коэффициента. |
| `Rвнеш` резервуара | `1 / alpha` | Плоская стенка, не цилиндрическая наружная поверхность трубы. |
| `П` прямоугольного резервуара | `2 * (L + B)` | Размерностно корректный периметр. |
| No-double-K | Электроподбор получает мощность без уже примененного `K`; электрическая формула применяет запас один раз | Защищает от двойного запаса. |
| Суффикс ТТН/ТТВ/ТТХ | `aggressive_product -> СТ`, иначе `СР` | Принято как рабочий контракт при неоднозначности parsed `R`. |

## Рекомендованный порядок следующих работ

1. Заполнить БД коэффициентами резистивного `p3`, если появится отдельный
   источник заводских thermal-limit значений.
2. Поддерживать справочник теплоизоляции только конкретными кодами с плотностью;
   generic названия использовать как draft/import warning, а не как расчётный
   материал.
