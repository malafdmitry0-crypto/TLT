# Slice 4 — точная модель сферического резервуара

Дата проверки: 2026-08-02

Статус: **PASS**

Начальный HEAD Slice 4: `c1e00c0`

HEAD перед финальным коммитом: `43d97ae`

Между началом Slice 4 и интеграцией в `main` параллельно вошли четыре чужих
коммита электротехнической зоны. Они сохранены как есть и не входят в diff,
тестовый охват или staging Slice 4. После замеченной конкуренции за общий Git
index итоговый staged diff повторно сверен с HEAD `43d97ae`.

## Границы

Выполнено только для теплопотерь сферического резервуара:

- отдельная точная стационарная радиальная модель сферических оболочек;
- строгая область применимости по критическому радиусу;
- канонические exact-result поля и единицы `К/Вт`;
- shape-aware API, таблица, панель допущений и HTML-отчёт;
- блокировка `spherical + underground`;
- formula, schema, service, API, report и frontend regression tests.

Не изменялись:

- сиды, миграции и содержимое БД;
- электротехнический расчёт, кабели и спецификация;
- формулы цилиндрического и прямоугольного резервуаров;
- legacy aliases, fallback-чтение и обратная совместимость.

## Зафиксированная физика

Для стены и каждого слоя изоляции используется полное сопротивление
сферической оболочки:

```text
Rsphere = 1 / (4πλ) × (1/rinner − 1/router)       [К/Вт]
```

Радиусы слоёв строятся последовательно. Наружная теплоотдача относится к
реальной наружной поверхности изоляции:

```text
router = rwall_outer + Σ thickness_i
Souter = 4πrouter²
Rexternal_total = 1 / (alpha_vnesh × Souter)     [К/Вт]
Rtotal = Rwall_total + ΣRlayer_total + Rexternal_total
Qbase = (Tprocess − Tambient) / Rtotal            [Вт]
Qdesign = Qbase × safety_factor + q_additional    [Вт]
```

Критический радиус вычисляется по теплопроводности **наружного** слоя:

```text
rcritical = 2 × conductivity_outermost / alpha_vnesh_applied
router >= rcritical
```

При `router < rcritical` результат не создаётся, API возвращает код
`sphere_below_critical_insulation_radius` и числовой контекст `router`,
`rcritical`, `conductivity_outermost`, `alpha_vnesh_applied`.

Для математического равенства применён только численный допуск
`rel_tol=1e-12`, `abs_tol=1e-12`. В разрешённом диапазоне это примерно
`10⁻¹²…1,65×10⁻¹¹ м`: существенно меньше миллиметрового шага входных данных и
не допускает физически значимое под-критическое состояние. Отдельный тест
фиксирует неблагоприятный float-случай `0,05 + 0,005` против
`2 × 0,275 / 10`.

## Размерностный gate

| Величина | Размерность | Способ получения |
|---|---:|---|
| `Rwall_total` | К/Вт | сферическая оболочка стены |
| `Rlayer_total` | К/Вт | сферическая оболочка слоя |
| `Rexternal_total` | К/Вт | `1/(αSouter)` |
| `Rtotal` | К/Вт | сумма только полных сопротивлений |
| `Sbare`, `Souter` | м² | площадь сферы |
| `external_heat_flux_base` | Вт/м² | `Qbase/Souter` |
| `heat_loss_per_m2_bare_*` | Вт/м² | `Q*/Sbare` |
| `Qbase`, `Qdesign`, `q_additional` | Вт | полные мощности |
| `α` | Вт/(м²·К) | ручное значение или правило размещения |
| `λ` | Вт/(м·К) | ручное или справочное значение слоя |
| `safety_factor` | 1 | применяется ровно один раз |

Эквивалентные areal-поля для сопоставления вычисляются через `Sbare`, но не
участвуют повторно в формуле. Shape-aware потребители сферы читают только
`*_resistance_total`; цилиндрическая и прямоугольная ветки продолжают читать
`*_resistance_areal_bare`.

## Ручной golden

Вход: `diameter=2 м`, стена `0,01 м / 45 Вт/(м·К)`, один слой
`0,1 м / 0,05 Вт/(м·К)`, `α=15 Вт/(м²·К)`, `100/20 °C`, `K=1,1`,
`q_additional=0 Вт`.

| Контрольная величина | Значение |
|---|---:|
| `rwall_inner` | 0,99 м |
| `router` | 1,1 м |
| `rcritical` | 0,006666666667 м |
| `Sbare` | 12,5663706144 м² |
| `Souter` | 15,2053084434 м² |
| `Rwall_total` | 0,000017862508 К/Вт |
| `Rinsulation_total` | 0,144686311902 К/Вт |
| `Rexternal_total` | 0,004384433694 К/Вт |
| `Rtotal` | 0,149088608103 К/Вт |
| `Qbase` | 536,593647347 Вт |
| `Qdesign` | 590,253012081 Вт |
| `Qbase/Sbare` | 42,700765703 Вт/м² |
| `Qbase/Souter` | 35,289889011 Вт/м² |

Тест сравнивает значения до округления. Дополнительно проверены два
последовательных слоя `1,0→1,1 м` и `1,1→1,3 м`, плоский предел тонкой
оболочки, отсутствие стены, монотонность выше критического радиуса и порядок
`Qbase × K + q_additional`.

## API и браузер

Через реальную форму создан объект `S4 Sphere QA` (`POST /objects → 201`).
Payload сохранил `shape=spherical`, `diameter=2 м`, стену `0,01 м`, слой
`0,1 м` и не отправил `height`, `length`, `width`. Ответ API:

- `is_valid=true`;
- `formula_model=tank_heat_loss_spherical_radial`, version `4`;
- `thermal_resistance_total=0,13390172487212001 К/Вт`;
- `surface_area_outer=15,205308443374602 м²`;
- `total_heat_loss_base=597,4530953682806 Вт`;
- `total_heat_loss_design=657,1984049051088 Вт`.

Этот браузерный пример использует справочную `λ=0,0555` и автоматическую
`α=18,6`, поэтому его числа ожидаемо отличаются от ручного golden с
`λ=0,05`, `α=15`.

| Viewport | Состояние | Результат |
|---:|---|---|
| 1440×900 | sphere outdoor + сохранённая строка | только diameter; overflow отсутствует |
| 1280×800 | sphere outdoor | только diameter; overflow отсутствует |
| 1000×768 | sphere outdoor | адаптивный режим; overflow отсутствует |
| 1000×768 | sphere underground | видимая блокирующая ошибка; overflow отсутствует |

После чистого браузерного прогона: `console errors=0`, `warnings=0`; API-запросы
успешны. На ширине 1000 px отображается штатное предупреждение о рекомендуемой
ширине 1280 px.

Артефакты:

- [sphere 1440×900](./slice-4-browser/slice4-sphere-1440x900.png)
- [sphere 1280×800](./slice-4-browser/slice4-sphere-1280x800.png)
- [sphere 1000×768](./slice-4-browser/slice4-sphere-1000x768.png)
- [unsupported underground](./slice-4-browser/slice4-sphere-underground-error-1000x768.png)

## Проверки

- spherical formula tests после финального float-fix: **10/10 passed**;
- расширенный backend formula/schema/service/report/API набор: **53/53 passed**;
- точечный report render после исправления обеих веток: **1/1 passed**;
- `scripts/formula-qa.sh quick`: passed после финального исправления;
- frontend focused tests: **26/26 passed**;
- frontend `typecheck`, `lint`, `build`: passed;
- `scripts/sync-heatcalc-field-contract.py --check`: passed;
- `ruff check` по Python-файлам Slice 4: passed;
- `git diff --check` по Slice 4: passed.

Во время сведения найдены и закрыты два дефекта:

1. HTML-отчёт имеет две render-ветки; exact `RΣ` сначала попал только в одну.
   Обе ветки теперь используют shape-aware сопротивление.
2. Сырое сравнение float могло отклонить математическое равенство критическому
   радиусу. Добавлены машинный допуск и неблагоприятный regression case.

## Исходные документы

| Файл | SHA-256 |
|---|---|
| `1_Кейс_«Расчёт_спецификации_для_неавторизованных_пользователей» (1).pdf` | `5bf9a5f12f1ea609e7889f12dbbf4dbc24be8653258ea0e65f3d691d19fc978d` |
| `Расчет_спецификации_трубы_самрег29_05_26.xlsx` | `a230bbebff01a460df143063a871dc6bb6ab79e4da62d81131cd83abfe351d8d` |
| `теплопротери в резервуарах 30.04.docx` | `bfbf2aa5400611ea90f0fa9410eedc5c86b5075f39c33c3085b70d458709f7bb` |
| `теплопротери в трубопроводах 30.04.docx` | `b57b2467f9ea525a91199e4c387aa44ce33b30c541e13e6d8e0c775320d20672` |

Исходные документы не изменялись.
