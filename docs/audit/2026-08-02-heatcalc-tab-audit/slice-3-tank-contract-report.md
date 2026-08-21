# Slice 3 — цилиндрический и прямоугольный резервуары

Дата проверки: 2026-08-02.

## Граница слайса

Выполнен полный вертикальный путь только для теплопотерь цилиндрического и
прямоугольного резервуаров: UI → mapper → API/stored schema → project params →
formula adapter → формула → results → таблица/отчёт/Excel.

Не входят в Slice 3:

- точная радиальная формула сферического резервуара (Slice 4);
- очистка старых записей/сидов (Slice 5);
- изменение электротехнического расчёта, выбора кабеля и спецификации.

Сферическая форма сохранена в UI и канонической схеме. Формула Slice 3 явно
останавливает её кодом `spherical_tank_formula_deferred_to_slice_4`, чтобы не
выдать плоскую модель за физически точный расчёт.

## Итоговый физический контракт

- Воздушная ветка использует площадные сопротивления:
  `Rwall = wall_thickness / wall_lambda`,
  `Rinsulation = Σ(thickness / conductivity)`,
  `Rexternal = 1 / alpha_vnesh`.
- Ручной `alpha_vnesh` имеет приоритет. Автоматически: indoor = 9 Вт/(м²·К),
  outdoor и воздушная часть underground = `11,6 + 7 × sqrt(wind_speed)`.
  Отсутствующий ветер не трактуется как нулевой.
- Частично заглублённый резервуар разделён на `Sair` и `Sground`; воздушная
  ветка использует `ambient_temperature`, грунтовая — `ground_temperature`.
- Для грунтовой ветки `Rground = tank_buried_height / ground_conductivity`.
- Итог: `Qdesign = Qbase × safety_factor + q_additional`; дополнительная
  нагрузка не умножается повторно на коэффициент запаса.
- Единственный хранимый источник изоляции — `insulation_layers` (1–3 слоя).
- `tank_buried_height` имеет отдельный смысл и не смешивается с трубным
  `pipe_centerline_depth`/UI-полем `burial_depth`.
- `volume` остаётся нетепловым метаданным объекта, сохраняется при heat update
  и не попадает в формулу.

Контрольные значения:

- цилиндр d=2 м, h=3 м: S=8π=25,132741 м²;
- при Rwall=0,02, Rinsulation=2, Rexternal=0,1 и ΔT=100 К:
  Qbase=1185,506662 Вт, Qdesign при K=1,2 и Qдоп=50 Вт = 1472,607994 Вт;
- прямоугольный резервуар 4×2×3 м при заглублении 1 м:
  Sair=32 м², Sground=20 м², Qbase=2144,354597 Вт,
  Qdesign=2623,225517 Вт для того же K и Qдоп.

## Контракт данных

Stored/API-модель запрещает legacy heat keys и поля другой формы. При смене
формы несовместимая геометрия удаляется. При переходе из underground очищаются
грунтовые параметры. Явное `q_additional: 0` сохраняется как ноль.

Канонические heat-owned поля резервуара:

- `shape`, `diameter`, `height`, `length`, `width`;
- `wall_thickness`, `wall_lambda`;
- `placement`, `ambient_temperature`, `ground_temperature`,
  `tank_buried_height`, `ground_conductivity`;
- `wind_speed`, `alpha_vnesh`, `safety_factor`, `q_additional`;
- `insulation_temperature_basis`, `insulation_layers` и provenance-поля.

## Выполненные проверки

- финальный Slice 3 acceptance: 15 тестов — green;
- формула/schema/Excel focused suite: 196 тестов — green;
- backend API/service suites create/update/calculate/query/report — green;
- tank query/report focused suite: 14 тестов — green;
- frontend focused suite: 12 файлов, 79 тестов — green;
- frontend typecheck, lint и production build — green;
- синхронизация generated field contract — green;
- `git diff --check` — green;
- полный frontend test run: 1397 тестов прошли; 7 repository architecture
  gates остаются красными по уже существующим нарушениям вне Slice 3;
- `make lint-backend`: `ruff check app` green, но repository-wide
  `ruff format --check app` остаётся красным (63 файла в текущем baseline,
  включая часть затронутых файлов). Этот gate не объявляется зелёным.

## Браузерная проверка

Проверены состояния формы резервуара и отсутствие горизонтального overflow:

| Viewport | Состояние | Результат |
|---|---|---|
| 1000×768 | underground + rectangular | длина/ширина/высота, отдельные температуры воздуха и грунта, высота заглубления видимы; overflow отсутствует |
| 1280×800 | outdoor + cylindrical | диаметр/высота и ветер видимы, грунтовые поля скрыты; overflow отсутствует |
| 1440×900 | spherical option | сферическая форма присутствует, в геометрии только диаметр; overflow отсутствует |

Доказательства находятся в `slice-3-browser/`.

Пробный неполный submit дал ожидаемый HTTP 422, после заполнения объект создан
с HTTP 201. В общей browser-session также воспроизводится существующее
React-предупреждение о дублированном ключе справочника грунта
`suglinok:1300:8`; оно не вызвано изменением ключей списка в Slice 3 и вынесено
за его границы.
