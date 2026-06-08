# Теплопотери: документация расчётного ядра

Набор документов по фактической реализации теплотехнического расчёта TLT —
трубопровод и резервуар. Источник истины для этих файлов — backend-код, а не ТЗ.
Сверка с первоисточниками вынесена в отдельные `*-source-traceability.md`.

Статус актуализации: **перепроверено против кода 2026-06-08, расхождений нет.**
Код теплопотерь (`pipe.py`, `tank.py`, `schemas/calculation.py`,
`project_object_params.py`, `calculation_service.py`) не менялся с момента
генерации документов (2026-06-03/04).

## Карта документов

Документы двух типов: **технические** для программиста/нейносети
(`*-algorithm.md`, `*-fields.md`, `*-source-traceability.md`,
`*-global-software-comparison.md`) и **инженерные** простым языком
(`*-engineer-explanation.md`, `*-engineer-input-output-guide.md`). Аудитория
каждого файла указана в колонке «Для кого / зачем».

### Трубопровод

| Файл | Основа | Для кого / зачем |
|---|---|---|
| `pipe-algorithm.md` | backend-код | Точное описание алгоритма: цепочка вызовов, preprocessing, defaults, формула, округления. |
| `pipe-fields.md` | схемы + service + формула | Все поля входа/результата с диапазонами и тем, где они реально используются. |
| `pipe-engineer-explanation.md` | backend-код | Объяснение расчёта простым языком для инженера. |
| `pipe-engineer-input-output-guide.md` | backend-код | Памятка: как читать входы, выходы и диагностические поля. |
| `pipe-source-traceability.md` | первоисточники + repo-MD + код | Откуда взято и чем отличается от первичных ТНП DOCX/XLSX. |
| `pipe-global-software-comparison.md` | TLT + публичные vendor sources | Качественное сравнение с nVent / Thermon / 3E Plus и др. |

### Резервуар

| Файл | Основа | Для кого / зачем |
|---|---|---|
| `tank-algorithm.md` | backend-код | Точное описание алгоритма, включая подземное разбиение `S_air/S_ground`. |
| `tank-fields.md` | схемы + service + формула | Все поля входа/результата с диапазонами. |
| `tank-engineer-explanation.md` | backend-код | Объяснение расчёта простым языком. |
| `tank-engineer-input-output-guide.md` | backend-код | Памятка по входам/выходам, частые ошибки ввода. |
| `tank-source-traceability.md` | первоисточники + repo-MD + код | Откуда взято и чем отличается от первоисточника. |
| `tank-global-software-comparison.md` | TLT + публичные vendor sources | Качественное сравнение с TraceCalc / Vessel Trace / BARTEC и др. |

## Ключевые инварианты (подтверждены кодом)

- `heat_loss_per_meter` (труба) и `heat_loss_per_m2` (резервуар) возвращаются
  **без** `safety_factor` и `location_factor`.
- `total_heat_loss` содержит `safety_factor` и `location_factor`;
  `q_additional` (резервуар) прибавляется **после** множителей.
- Подземная ветка включается по `burial_depth > 0`, а не по `placement`.
- Climate policy трубы: `D ≥ 100 мм → K=1.1, basis=t_0_92`;
  `D < 100 мм → K=1.12, basis=t_abs_min`. Резервуар: `K=1.1, basis=t_0_92`.
- `alpha = 11.6 + 7·√v` (улица, clamp 11.6…52), `9.0` (помещение).
  `wind_factor` применяется только к трубе.
- Defaults сохранённого объекта-трубы: `wall_thickness=0.004`,
  `pipe_material=carbon_steel`, `2+2+2` локальных элемента, `L_ekv=1.5` →
  по умолчанию `+9 м` к расчётной длине.

## Известные расхождения с первоисточниками (app policy / source gap)

Зафиксированы в `*-source-traceability.md` и требуют бизнес-решения:

- `location_indoor=0.9` / `location_outdoor=1.0` — отдельного `K_разм` в
  проверенных первичных DOCX/XLSX нет.
- `wind_factor` (труба) — нет в первоисточниках.
- `ground_conductivity` принимает `0.5..3.0`, первичная таблица — `0.8..3.0`.
- Толщина изоляции допускается `>0..500 мм`, рабочий диапазон ТНП — `10..500 мм`.
- `surface_temperature` пока всегда `null` (не рассчитывается).

## Примечание о scaffold-файлах

`codex-workspace/board.md`, `plan.md`, `tickets.md` — авто-сгенерированный
заготовочный board «Codex Core» (scope `local markdown board`, 2026-06-03) с
placeholder-тикетами. Они не относятся к теплотехнической документации и не
несут актуального контента; источником истины по теплопотерям являются файлы в
этой папке.
