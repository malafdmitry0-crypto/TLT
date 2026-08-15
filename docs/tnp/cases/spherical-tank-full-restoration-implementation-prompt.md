# Задание: полностью вернуть сферический резервуар в Case 1

**Тип:** implementation, один неделимый vertical slice

**Версия задания:** 1.1

**Методическое решение:** утверждён путь B

**Конвейер:** Heat → Electrical → Specification

## 0. Зафиксированное решение — не переоткрывать

Пользователь подтвердил полный возврат сферического резервуара, включая
тепловой расчёт, электрический расчёт и спецификацию. Реализуй именно этот
контракт:

1. Heat: точная радиальная модель сферической оболочки.
2. Electrical layout: длина кабеля по площади сферического пояса
   `L = π·D·h/s`.
3. Electrical selector, секции и заказ: существующий стандартный TT-конвейер.
4. Specification: существующий общий tank-путь после готового Electrical.
5. Размещение сферы: только `indoor` и `outdoor`.
6. `underground` для сферы остаётся типизированно запрещённым.

Не предлагай путь A, не добавляй переключатель метода укладки и не возвращай
сферу только в Heat. Если один из трёх этапов не завершён, задача не завершена.

### Идентичности формул

- Heat сферы:
  - `formula_model = "tank_heat_loss_spherical_radial"`;
  - `formula_model_version = "4"`.
- Layout сферы:
  - `layout_formula_model = "tank_cable_layout_spherical_zone"`;
  - `layout_formula_version = "1"`.
- Существующие цилиндр/параллелепипед сохраняют
  `formula_model = "tank_heat_loss"`, version `"3"`.
- Общий TT selector/section contract
  `electrical-tt-v3-case1-r5` не меняй: он получает уже разрешённый
  `base_length_m`. Новую layout identity включи в tank layout provenance и
  тем самым в calculation fingerprint сферического результата.
- `layout_formula_model` и `layout_formula_version` добавляются **только** в
  spherical layout. Для cylinder/rectangular эти ключи должны отсутствовать,
  а не появиться с `null`/пустым значением: их serialized payload,
  calculation fingerprint и stale-state не должны измениться.

`v4` здесь — строковая версия исторического контракта радиальной Heat-формулы,
а не версия API, БД или электрического расчёта.

## 1. Роль и конечный результат

Ты implementation agent. На текущем HEAD верни `shape="spherical"` как
полноценную форму резервуара во всех рабочих каналах:

```text
UI / Excel / project file / seed
  → canonical object write contract
  → spherical Heat v4
  → spherical-zone base cable length v1
  → standard TT selection
  → equal sections and order length
  → Specification preflight and BOM
```

Definition of done:

- сферу можно создать и отредактировать в UI;
- валидную сферу можно импортировать из XLSX, CSV и project file;
- Heat возвращает радиальные сопротивления и model v4;
- Electrical не возвращает `ELECTRICAL_TANK_SHAPE_UNSUPPORTED`, вычисляет
  `base_length_m = πDh/s` и доходит до ready result;
- секции и заказ рассчитываются общим кодом;
- Specification строит tank BOM для готовой сферы;
- sphere `underground`, неизвестная форма и невалидный пояс отклоняются
  fail-closed;
- численные результаты и formula identity трубы, цилиндра и
  параллелепипеда не меняются;
- импорт, frontend, e2e и qa-agent больше не кодируют сферу как удалённую форму.

Не заканчивай работу отчётом о найденных стопорах: они уже исследованы. Нужны
production-изменения, тесты и end-to-end доказательство.

## 2. Перед началом

1. Прочитай корневой `AGENTS.md`.
2. До любой frontend-правки полностью прочитай `frontend/AGENTS.md` и
   `docs/frontend/agent-development-standard.md`.
3. Выполни `git status --short` и зафиксируй `git rev-parse --short HEAD`.
4. Не трогай чужой WIP, особенно существующие изменения в `answers/`, если они
   всё ещё присутствуют.
5. Прочитай ближайший production-код и тесты каждого изменяемого owner.
6. Старые коммиты изучай через `git show`; не делай blind cherry-pick и не
   откатывай текущую архитектуру.
7. Внутри одного vertical slice разрешены несколько локальных тематических
   коммитов: Heat core, Electrical/layout, I/O/frontend и final proof можно
   фиксировать отдельно. В каждый коммит добавляй только свои файлы. Не пушь и
   не открывай PR без отдельной просьбы пользователя.

Обязательные входы:

- `docs/audit/2026-08-15-spherical-tank-feasibility/snapshot.md`;
- `docs/tnp/cases/spherical-tank-feasibility-investigation-prompt.md`;
- Case 1, ред. 4 от 07.07.2026: стр. 25, §§6.13–6.14;
- `docs/tnp/cases/application-calculation-variables.md`;
- `docs/tnp/cases/electrical-input-contract-reconciliation.md`;
- `docs/audit/2026-08-02-heatcalc-tab-audit/slice-4-spherical-contract-report.md`;
- коммит `fa74cba` как источник Heat v4 и golden cases;
- коммит `921d347` как карта удалённых consumers и guards;
- текущая миграция `backend/alembic/versions/0044_remove_spherical_tanks.py`.

Коммиты — только историческая справка. После них Heat был вынесен в
`backend/packages/heat-loss-core`, поэтому формулу нужно встроить в текущие
core contracts, а не возвращать старый монолитный `tank.py`.

## 3. Непереговорные границы

### Делать

- один полный продуктовый slice со sphere-specific Heat и layout boundaries;
- использовать существующие поля `diameter`, `heating_height`, `laying_step`;
- сохранять текущие source priority и provenance Electrical;
- обновить все write/read/import/display/test consumers формы;
- добавить characterization и regression coverage для старых форм;
- оставить Specification shape-neutral.

### Не делать

- не использовать цилиндрическую длину `πDh/(2s)` для сферы;
- не использовать плоскую Heat-модель `S=πD²` для утверждённого пути B;
- не добавлять поле «метод укладки»;
- не придумывать underground-модель сферы;
- не подставлять высоту резервуара вместо `heating_height`;
- не задавать скрытые defaults для `heating_height` или `laying_step`;
- не округлять `πDh/s` до передачи в TT pipeline;
- не менять формулы цилиндра, параллелепипеда или трубы;
- не повышать общий TT formula version только из-за нового layout adapter;
- не откатывать и не редактировать смысл исторической миграции `0044`;
- не пытаться восстановить удалённые `0044` строки;
- не маскировать product gaps ослаблением assertions или удалением fail-closed
  тестов;
- не создавать вторую ACTIVE frontend-очередь и не менять
  `NEXT = AF100-09d` в refactor backlog.

Новая схема или data migration не нужны: форма хранится в JSON params. Миграция
`0044` остаётся исторически правильной и необратимой. После неё приложение
просто снова разрешает создавать новые валидные sphere-объекты.

## 4. Точный Heat-контракт сферы

### 4.1. Входы и геометрия

- `shape = "spherical"`;
- `diameter = D > 0`, м — наружный диаметр металлической стенки;
- `height`, `length`, `width` для сферы не требуются и запрещаются как
  несовместимая геометрия;
- `wall_thickness = δwall`, м, и `wall_lambda`, Вт/(м·К), задаются парой либо
  оба отсутствуют;
- `rwall_outer = D/2`;
- при заданной стенке `rwall_inner = D/2 − δwall > 0`;
- каждый слой изоляции начинается на наружном радиусе предыдущего слоя;
- хотя бы один слой изоляции и текущие temperature/material contracts
  сохраняются без ослабления;
- публичный input не получает обратно удалённый manual `alpha_vnesh`: применяй
  текущий profile/resolution contract.

Cross-field validation должна явно иметь spherical-ветку. Нельзя разрешить
`spherical` только в Literal, оставив общий `height` cast или fallback в
`RectangularTankGeometry`.

### 4.2. Коэффициент наружной теплоотдачи

```text
indoor:  α = 9 W/(m²·K)
outdoor: α = 11.6 + 7·sqrt(v) W/(m²·K)
```

Используй текущий `resolve_external_alpha`. Для outdoor сохраняется обязательная
скорость ветра и её provenance. Для sphere + underground добавь структурную
validation issue с кодом `spherical_tank_underground_unsupported` до
подготовки формулы. Не преобразовывай placement молча.

### 4.3. Радиальные сопротивления

Для стенки и каждого слоя:

```text
Rj = (1 / (4·π·λj)) · (1/rj_inner − 1/rj_outer)    [K/W]
```

Наружная поверхность и теплоотдача:

```text
Sbare  = 4·π·rwall_outer² = π·D²                  [m²]
Souter = 4·π·rins_outer²                          [m²]
Rext   = 1 / (α·Souter)                            [K/W]
Rtotal = Rwall + ΣRins,j + Rext                    [K/W]
Qbase  = (Tprocess − Tambient) / Rtotal             [W]
Qdesign = Qbase·K + Qadditional                    [W]
```

Полные сопротивления в K/W являются авторитетными. Compatibility-поля удельных
сопротивлений на bare area вычисляй только как производные:

```text
R''bare = Rtotal · Sbare                           [m²·K/W]
qbare_base = Qbase / Sbare                         [W/m²]
qbare_design = Qdesign / Sbare                     [W/m²]
qexternal_base = Qbase / Souter                    [W/m²]
```

Не складывай K/W и m²·K/W и не используй bare area в `Rext`.

### 4.4. Критический радиус

```text
rcritical = 2·λoutermost / α                       [m]
```

- использовать conductivity наружного, а не первого слоя;
- `rins_outer < rcritical` — fail-closed FormulaDomainError
  `sphere_below_critical_insulation_radius`;
- equality разрешена с устойчивым tolerance;
- details содержат числовые `outer_radius`, `critical_radius`,
  `outermost_conductivity`, `external_alpha` без разбора текста ошибки.

### 4.5. Результат

Sphere result должен содержать:

- `surface_area_bare`, `surface_area_outer`;
- `thermal_resistance_total`, `wall_resistance_total`,
  `insulation_resistance_total`, `external_resistance_total` в K/W;
- совместимые areal resistance fields в m²·K/W;
- `external_heat_flux_base`;
- `critical_insulation_radius`, `outer_insulation_radius`,
  `critical_radius_check_passed`;
- layer application records с `resistance_unit = "K/W"`;
- текущие temperatures, conductivities, units и source corrections;
- `formula_model = "tank_heat_loss_spherical_radial"`;
- `formula_model_version = "4"` — именно строка.

Для cylinder/rectangular остаются `tank_heat_loss` v3 и текущие areal units.
Добавление nullable radial fields в общий result schema не должно менять их
численные значения. Если serializer умеет исключать неприменимые поля, не
засоряй старые payload новыми `null`; если текущий общий контракт всегда
выдаёт nullable fields, зафиксируй additive change тестом.

### 4.6. Обязательный Heat golden

На чистом core boundary с уже разрешённым `α=15`:

```text
D = 2.0 m
wall_thickness = 0.01 m
wall_lambda = 45 W/(m·K)
insulation = 0.1 m, λ = 0.05 W/(m·K)
Tprocess = 100 °C
Tambient = 20 °C
K = 1.1
Qadditional = 0 W
```

Ожидания с `pytest.approx`:

```text
rins_outer                  = 1.1 m
rcritical                   = 0.006666666667 m
Sbare                       = 12.5663706144 m²
Souter                      = 15.2053084434 m²
Rwall                       = 0.000017862508 K/W
Rins                        = 0.144686311902 K/W
Rext                        = 0.004384433694 K/W
Rtotal                      = 0.149088608103 K/W
Qbase                       = 536.593647347 W
Qdesign                     = 590.253012081 W
qbare_base                  = 42.700765703 W/m²
qexternal_base              = 35.289889011 W/m²
critical_radius_check_passed = true
```

Это pure-core golden. На публичном API отдельно докажи current auto-alpha:
`indoor → 9`, `outdoor + v=0 → 11.6`. Не возвращай manual-alpha API ради
совпадения golden.

## 5. Точный Electrical layout-контракт

### 5.1. Входы

- `D` — тот же stored tank `diameter`, м; не наружный диаметр изоляции;
- `h = heating_height`, м — вертикальная высота сферического пояса;
- `s = laying_step`, м;
- `0 < h ≤ D` только для sphere;
- `0.1 ≤ s ≤ 0.4`, границы включены;
- `h` и `s` обязательны на object write/import boundary, как для других
  резервуаров;
- assignment/explicit overrides сохраняют текущий порядок источников, но
  sphere relation `h≤D` проверяется после окончательного разрешения `h`.

Единицы на границах фиксированы:

```text
frontend: diameter_mm [mm], heating_height [m]
frontend relation: 0 < heating_height <= diameter_mm / 1000
API/core: diameter [m], heating_height [m]
backend relation: 0 < heating_height <= diameter
```

Не сравнивай напрямую `heating_height=2` с `diameter_mm=2000` и не переноси
миллиметры в canonical Electrical input.

Методическое приближение пути B осознанное: физически кабель находится на
наружной поверхности изоляции, но `Lbase` считается по металлическому `D` из
карточки резервуара. Даже для толстой изоляции не заменяй его на
`D + 2·Σδins`; это было бы другой, неутверждённой формулой.

Не вводи отдельную Heat-высоту сферы. `height` и `heating_height` — разные
понятия; у sphere существует только второе.

### 5.2. Формула площади пояса

```text
R = D/2
Szone = 2·π·R·h = π·D·h                         [m²]
Lbase = Szone / s = π·D·h/s                     [m]
```

Используй `math.pi` и полную внутреннюю точность. Округление возможно только в
существующих result/serialization boundaries, не перед selector/sections.

Обязательный golden:

```text
D = 2.0 m, h = 1.0 m, s = 0.2 m
Lbase = 10π = 31.41592653589793 m
```

Boundary cases:

- `h = D` допустимо и даёт `Lbase = πD²/s`;
- `h <= 0` и `h > D` отклоняются;
- `s = 0.1` и `s = 0.4` допустимы;
- значения за границами шага отклоняются;
- missing/NaN/inf отклоняются текущим typed validation envelope;
- cylinder и rectangular продолжают считать старую формулу без численного
  изменения.

### 5.3. Точка вставки и provenance

Расширь sphere-веткой `compute_tank_cable_length`, но не подменяй shape на
`cylindrical`. `_tt_tank_layout` обязан передать `diameter`, разрешённые `h/s`
и получить `base_length_m`.

В `TankElectricalLayout`, `heat_snapshot.tank_layout` и `layout.tank` результата
для sphere сохрани:

```jsonc
{
  "shape": "spherical",
  "diameter_m": 2.0,
  "heating_height_m": 1.0,
  "laying_step_m": 0.2,
  "base_length_m": 31.41592653589793,
  "layout_formula_model": "tank_cable_layout_spherical_zone",
  "layout_formula_version": "1",
  "base_length_source": "object_layout",
  "input_sources": {
    "heating_height": "object_heat",
    "laying_step": "object_heat"
  }
}
```

Сохрани текущие варианты `explicit_request_layout`, `assignment_layout`,
`object_layout`, `mixed_layout`. Layout identity должна участвовать в
`calculation_fingerprint` через provenance; общий TT formula fingerprint r5 не
изменяется.

Sphere-only правило обязательно и для сериализации: не добавляй
`layout_formula_model`, `layout_formula_version` или sphere diameter keys в
cylinder/rectangular `heat_snapshot.tank_layout` и `layout.tank`, даже как
`None`. Characterization должен доказать, что их fingerprint и stale status не
изменились после добавления сферы.

Прямые formula/admin schemas с `SelfRegulatingTTParams.tank_shape` также должны
принимать `spherical` и использовать ту же единственную функцию геометрии.
Дублировать формулу в schema, service, frontend или qa-agent production oracle
нельзя.

## 6. Heat → Electrical → Specification

### 6.1. Передача нагрузки без двойного K

Сохрани текущий tank bridge:

```text
qinput = (Qdesign / Kheat) / Lbase                [W/m]
Prequired = qinput · Kelectrical                  [W/m]
```

При штатном `Kelectrical = Kheat`:

```text
Prequired = Qdesign / Lbase
Qdesign = Qbase·Kheat + Qadditional
```

То есть `Qadditional` не теряется и не умножается дважды. Добавь regression с
`K != 1` и `Qadditional > 0`, который проверяет равенство, а не только
положительность. Если explicit Electrical override даёт другой K, сохрани
текущее общее масштабирование `Kelectrical/Kheat`; не делай sphere-only
исключение.

### 6.2. Общий TT downstream

После `base_length_m` не добавляй shape branches:

```text
Prequired = qinput·K
Pcable·Knav·N >= Prequired, Knav = 1 for tank
Ltok = Idop / Istart_specific
Logr = min(Lmax, Ltok)
n = ceil(Lrequired / Logr)
Lfact >= Lrequired
Lorder = ceil(Lfact·1.10)
```

Должны сохраниться catalog authority, selection order, source priority,
equal-section contract, current/voltage checks, final gate и compatibility
aliases. Shape-specific логика заканчивается до `ResolvedElectricalInputs`.

### 6.3. Specification

Не добавляй сферическую формулу в Specification. Подтверди тестом, что:

- preflight принимает ready assignment с `object_type="tank"`;
- BOM берёт кабельную номенклатуру, `Lorder`, секции и аксессуары из общего
  Electrical result;
- presentation section остаётся `tank`;
- генератор не читает `params.shape` для расчёта количества;
- sphere с failed/stale Electrical остаётся заблокированной существующими
  readiness diagnostics.

## 7. Обязательные implementation slices

Порядок ниже задаёт зависимости, а не разрешает отдельный heat-only релиз.
Это один итоговый DoD на совокупный diff S0–S6. Внутри slice допустимы несколько
локальных коммитов и focused proof после каждого; полный backend/frontend/
qa-agent/e2e/browser gate выполняется один раз на финальном совокупном
состоянии. Ни один промежуточный коммит не является завершённым продуктовым
результатом сам по себе.

### S0 — characterization и regression seal

До production-правок:

- зафиксируй текущие численные goldens cylinder/rectangular Heat;
- зафиксируй текущие cylinder/rectangular cable lengths;
- зафиксируй `electrical-tt-v3-case1-r5` и section/order outputs;
- сохрани unknown-shape fail-closed test;
- найди все текущие assertions «sphere unsupported» и классифицируй: заменить
  на positive sphere coverage либо перенести rejection на действительно
  неизвестную форму `conical`.

### S1 — canonical Heat core

Основная зона:

- `backend/packages/heat-loss-core/src/heatcalc_heat_loss_core/tank.py`;
- `tank_contract.py`, `tank_validation.py`, `tank_formula.py`,
  `tank_evaluation.py`, public `api.py`/`__init__.py` при необходимости;
- package tests в `backend/packages/heat-loss-core/tests/`.

Добавь явную `SphericalTankGeometry`, spherical contract/dispatch, радиальные
K/W-сопротивления, critical-radius validation и model v4. Не помещай catalog,
Pydantic, FastAPI или русские presentation messages в чистый core.

### S2 — Heat application boundary

Проверь и согласуй:

- `backend/app/schemas/heat_loss.py`;
- `backend/app/formulas/heat_loss/tank.py` и `tank_preparation.py`;
- `backend/app/services/heat_contract.py`;
- `backend/app/services/project_object_params.py`;
- `backend/app/contracts.py`, `backend/app/schemas/json_shapes.py`;
- report serializers/templates и admin formula API.

Убери только запрет валидной сферы. Неизвестные формы по-прежнему получают
typed 422 с перечнем `cylindrical, rectangular, spherical`. Sphere underground
и несовместимая геометрия также дают 422 и не сохраняют/не мутируют объект.

### S3 — Electrical layout и canonical pipeline

Проверь и согласуй:

- `backend/app/formulas/electrical/cable_geometry.py`;
- `backend/app/formulas/electrical/self_regulating.py`;
- `backend/app/schemas/calculation.py`;
- `backend/app/services/calculation_service.py` — `_tt_tank_layout`,
  `_tt_object_heat_inputs`, provenance;
- `backend/app/services/electrical_tt_pipeline.py`;
- admin tank-cable endpoint и error guidance.

Результат S3 обязан проходить от sphere Heat result до ready TT, а не только
возвращать правильную длину из unit-функции.

### S4 — import/export, seeds, reports и Specification consumer proof

Проверь и согласуй:

- Excel/CSV aliases, parser и оба template generator в
  `excel_import_service.py`;
- `project_io_service.py` v2/v3 import и round-trip;
- `object_query_service.py` shape options/geometry display;
- `seeds.py` и seed tests;
- HTML/прочие отчёты, показывающие форму и Heat assumptions;
- Specification integration/preflight/BOM tests.

Excel aliases должны распознавать как минимум `spherical`, `сфера`, `шар`,
`сферический`. Сферический пример в XLSX и CSV обязан стать реально
импортируемым: добавь `heating_height` и `laying_step`, причём `h≤D`.
Подсказка шаблона должна сообщать требования `Диаметр`, `Высота обогрева` и
`Шаг укладки` и запрет underground.

`Высота обогрева` и `Шаг укладки` уже являются общими колонками резервуара в
XLSX/CSV. Не создавай их дубликаты или новые sphere-only имена: заполни те же
колонки в сферическом примере. Существующие строки и round-trip цилиндра/
параллелепипеда должны остаться без изменений; aliases формы не должны влиять
на разбор их геометрии.

Project-file import принимает валидную новую сферу. Старый sphere payload без
обязательных `h/s` не получает скрытых defaults: он атомарно отклоняется или
помечается невалидным строго по текущему import-контракту с указанием полей.
Добавь оба теста — positive valid round-trip и fail-closed incomplete payload.

Не меняй `0044` и её migration tests: они доказывают историческое удаление на
том шаге миграции, а не текущий supported-shape set.

### S5 — frontend

Это узкий feature slice, не refactor backlog item. Соблюдай `frontend/AGENTS.md`
и не создавай Heat ↔ Electrical deep imports.

Обязательное поведение:

- `shape.options` содержит `spherical` с русской меткой «Сферическая»;
- TS unions, labels, naming и display formatters знают форму;
- для sphere виден и обязателен `diameter_mm`;
- `height_mm`, `length_mm`, `width_mm` скрыты и не уходят в API;
- `heating_height` и `laying_step` видимы и обязательны;
- frontend cross-field validation проверяет именно
  `0 < heating_height ≤ diameter_mm/1000`, потому что форма хранит эти поля в
  разных единицах;
- `laying_step` остаётся в `[0.1, 0.4]` м;
- shape change очищает несовместимую геометрию, но не теряет совместимые
  `diameter/heating_height/laying_step`;
- sphere + underground не преобразуется молча: пользователь видит blocking
  field/form error, API остаётся вторым fail-closed boundary;
- `CableAlgorithmPanel.tankLayoutApplicable` включает sphere;
- confirm step, tables, assumptions/result panels и admin Heat/Tank Cable tabs
  корректно показывают сферу и её units;
- API↔form round-trip сохраняет `D/h/s` и не создаёт фиктивную `height`.

После любого изменения `frontend/src/config/heatcalc-fields.default.json`
синхронизируй производный контракт только штатным генератором. Из корня
репозитория:

```bash
python3 scripts/sync-heatcalc-field-contract.py
python3 scripts/sync-heatcalc-field-contract.py --check
```

Проверь `backend/app/generated/heatcalc_field_contract.py`. Если изменение
только в `shape.options` не меняет генерируемые keys/versions, файл обязан
остаться без diff. Если генератор реально меняет output, включи его в свой
slice. Не редактируй generated-файл вручную.

Не добавляй CSS без реальной необходимости. Если видимый UI меняется,
обязателен browser proof на desktop viewports из frontend policy.

### S6 — qa-agent, E2E и документы

- расширь `TltTankShape` значением `spherical`;
- sphere не должна тихо нормализоваться в cylinder;
- `AlgorithmOracle.tankCableLength` использует `πDh/s` и те же границы;
- добавь registry/example golden для Heat v4 и layout v1;
- в `e2e/tests/electrical-case1-p0-regression.spec.ts` замени assertion
  «sphere option отсутствует / sphere rejected» на полный positive path;
- расширь `e2e/tests/heat-tank-layout.spec.ts` либо создай один узкий
  sphere-focused spec без второго Playwright config;
- сохрани negative e2e/API proof для неизвестной формы и underground sphere;
- синхронизируй нормативные docs формулами без динамических totals;
- execution evidence положи в
  `docs/audit/YYYY-MM-DD-spherical-tank-restoration/snapshot.md`.

## 8. Обязательная тестовая матрица

### 8.1. Heat core

- manual golden из §4.6;
- indoor `α=9`, outdoor `v=0 → α=11.6`;
- стенка задана/не задана;
- несколько слоёв с последовательными радиусами;
- critical radius: below, exact boundary, float-near-boundary;
- conductivity критического радиуса берётся у наружного слоя;
- более толстая изоляция выше critical radius уменьшает `Qbase`;
- thin-shell convergence к плоской границе;
- `Qdesign=Qbase·K+Qadditional`;
- D required, H/L/W forbidden;
- underground forbidden;
- cylinder/rectangular characterization unchanged.

### 8.2. Electrical

- `D=2`, `h=1`, `s=0.2 → L=10π`;
- `h=D`, `h>D`, `h=0`, обе границы `s` и выход за них;
- frontend unit conversion: `diameter_mm=2000`, `heating_height=2` допустимо,
  `heating_height>2` отклоняется;
- direct `SelfRegulatingTTParams` и service resolver дают одну длину;
- object/assignment/explicit/mixed source provenance;
- layout model/version присутствуют в sphere result и calculation fingerprint,
  но полностью отсутствуют у cylinder/rectangular; их прежние fingerprints и
  stale-state не меняются;
- unknown shape остаётся typed unsupported;
- cylinder/rectangular cable geometry unchanged;
- nonzero `Qadditional` и `K` проходят bridge без двойного запаса;
- ready cable selection, section count, `Lfact`, `Lorder` и currents;
- global TT formula version/fingerprint r5 unchanged.

### 8.3. API, storage и I/O

- POST sphere indoor/outdoor → success + Heat v4;
- PUT shape cylinder↔sphere очищает несовместимые поля и пересчитывает;
- sphere underground → 422, persisted object/version unchanged;
- unknown shape → 422 с актуальным supported list;
- valid XLSX sphere и valid CSV sphere импортируются и рассчитываются;
- generated XLSX/CSV sphere examples сами импортируются, а cylinder/rectangular
  rows тех же шаблонов сохраняют прежний payload;
- valid project-file sphere round-trip сохраняет форму, inputs и готовность;
- incomplete legacy sphere без `h/s` fail-closed без defaults;
- seed идемпотентен и создаёт хотя бы одну готовую сферу через production
  service, не вручную собранный result JSON;
- migration `0044` tests остаются зелёными без изменения migration semantics.

### 8.4. Frontend

- option/labels/type guards;
- visibility и required rules;
- `h≤D` и underground blocking validation;
- form→API и API→form round-trip;
- incompatible geometry cleanup;
- `CableAlgorithmPanel` для sphere;
- Heat assumptions/result render radial fields и units;
- admin Heat и Tank Cable calculators используют те же contracts;
- текущие cylinder/rectangular tests не ослаблены.

### 8.5. Specification и end-to-end

Минимум один детерминированный сценарий должен пройти:

```text
создать spherical outdoor tank
  → получить Heat v4
  → назначить self-regulating TT
  → получить base_length = πDh/s
  → выбрать готовую марку
  → получить section plan и Lorder
  → сформировать Specification
  → увидеть cable/BOM items в tank section
```

Проверяй численные связи между шагами, а не только HTTP 200 и наличие текста.
В частности:

- Heat result model/version;
- `layout.tank.base_length_m` и layout model/version;
- `required_power_per_meter = Qdesign/Lbase` при одинаковом K;
- `Lfact ≥ Lrequired`;
- `Lorder = ceil(1.10·Lfact)` по текущей точности;
- Specification cable quantity совпадает с authoritative Electrical order
  length/действующим BOM contract.

## 9. Proof contract

Сначала запускай точные красные/focused tests, затем обязательные owner и
cross-owner gates. Незапущенное отмечай `NOT RUN`, а не green.

### Backend и формулы

Из корня:

```bash
scripts/formula-qa.sh full
make lint-backend
make test-backend
```

До полного backend-прогона допустим inner loop по точным файлам без coverage.
Обязательно включи focused suites для:

- standalone `heat-loss-core` tank contract/formula/evaluation;
- tank Heat facade/API/object write;
- cable geometry и Electrical TT calculation service/pipeline;
- Excel import/templates;
- project IO;
- Specification preflight/BOM/generation;
- seeds и reports.

### Frontend

Из `frontend/`:

```bash
npm run agent:scope -- <первый изменяемый frontend-файл>
npm run agent:scope -- --changed --json
npm run agent:proof-run -- --changed
npm run agent:proof-check -- --changed
```

Добавь focused Vitest files по фактическому diff. Выполни sync/check
`heatcalc_field_contract.py` из S5. Не запускай локальный
`test:agent-dod:dual-safe`, если пользователь отдельно не запросил полный DoD.

### QA-agent

Из корня:

```bash
npm --prefix qa-agent run typecheck
npm --prefix qa-agent run qa-agent:test
```

### E2E и browser QA

Playwright запускается только из `e2e/`. Сначала:

```bash
cd e2e
npx playwright test --list
npx playwright test tests/<sphere-focused-spec>.spec.ts --reporter=list
```

Используй фактическое имя созданного/расширенного focused spec. Не создавай
второй Playwright config во frontend.

Поскольку UI меняется, выполни state-driven browser proof. Если в среде
доступен repository skill `kontur-ui-quality:verify-kontur-ui`, используй его.
Если skill отсутствует, используй текущий `kontur_playwright`, in-app Browser
или focused Playwright из `e2e/` — в таком порядке по доступности. Если ни один
browser-capable runner недоступен, не имитируй доказательство: выполни доступные
static/focused checks и пометь browser-часть `NOT RUN` с точной причиной.

Обязательные состояния и размеры для реально доступного browser runner:

- `1000×768` — functional minimum;
- `1280×800` — full workspace;
- `1440×900` — primary QA;
- create/edit sphere;
- Heat success и underground error;
- переход в Electrical и ready result;
- Specification result;
- отсутствие horizontal overflow;
- console errors/warnings и failed network requests отсутствуют.

Скриншоты, traces и логи храни только в датированной audit-папке или
`/private/tmp`, не в корне репозитория.

## 10. Запрещённые shortcuts

- Добавить `spherical` только в `SUPPORTED_TANK_SHAPES` или Literal.
- Направить sphere в существующий `else → rectangular`.
- Передать sphere в cylinder branch `compute_tank_cable_length`.
- Скопировать `πDh/s` в несколько production-слоёв.
- Сделать `heating_height = diameter` либо `laying_step = 0.2` скрытым default.
- Считать высоту сферического пояса длиной дуги.
- Использовать наружный диаметр изоляции вместо stored `D` для layout.
- Вернуть manual `alpha_vnesh` в public API без отдельного решения.
- Разрешить underground, используя полную площадь сферы как air/ground split.
- Удалить typed unsupported tests вместо переноса их на unknown shape.
- Переписать правильный production contract ради старого rejection test.
- Вручную подделать Heat/Electrical/BOM result в seed или E2E fixture.
- Объявить Specification проверенной только потому, что в коде нет shape branch.
- Повысить architecture baselines, использовать `any`, `@ts-ignore`, broad
  casts или ослабленные assertions.

## 11. Финальный отчёт

В финальном ответе и dated snapshot укажи:

1. итог: проходит ли sphere весь Heat → Electrical → Specification путь;
2. фактический HEAD и список изменённых файлов по owner;
3. Heat model/version и layout model/version;
4. golden `D=2, h=1, s=0.2 → L=10π`;
5. доказательство сохранения `Qadditional` и отсутствия двойного K;
6. доказательство, что cylinder/rectangular/pipe не изменились численно;
7. import/project IO/seed outcomes;
8. Specification outcome и количественную связь с Electrical;
9. точные команды и результаты тестов;
10. browser states, viewports, console/network и пути артефактов;
11. честный список `NOT RUN` и остаточных рисков.

Задача считается завершённой только при полном вертикальном результате. Если
внешний каталог или среда блокирует end-to-end proof, не заменяй его unit-only
доказательством: исчерпай локальные canonical fixtures, затем зафиксируй точный
blocker и оставь незапущенное как `NOT RUN`.
