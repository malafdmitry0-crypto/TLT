# 03. Расчёты и спецификация: end-to-end traceability

Baseline: `38f6bb3`. Формулы из PDF обозначены `PRIMARY_PDF`; PDL —
`APPROVED_PDL`; численные результаты кода/tests/browser — `OBSERVED`.

## Матрица `документация → backend → frontend → тест → результат`

| Контур | Документ | Backend | Frontend | Evidence/oracle | Текущий результат |
|---|---|---|---|---|---|
| Heat pipe | PDF-HEAT + formula docs | calculation service/formulas | flat form/table | live `q=15`, `Q=165`; formula tests | `PARTIAL PASS`, trace gap |
| ER assignment | PDF-ER + PDL-ER-09…13 | UUID variants/assignments | dynamic ER tabs | live PATCH/reload; integration | `PASS core` |
| Self-reg cable | PDF-ER-08…10, PDL-ER-02 | self-reg + commercial snapshot | electrical grid/report | live installed 10, final order 11, 200 W, 0.91 A | `PASS current case` |
| Sectioning | PDF стр. 47–49; PDL-ER-15/18…25/28 | source readiness=false, fail-closed | no fabricated section result | exclusion + source checkpoint | `BLOCKED_SOURCE / PASS fail-closed` |
| Cable BOM | PDL-ER-02 | commercial final priority | spec 11 m | 110/120 regression oracle | `CLOSED@38f6bb3` |
| Connector kits | PDF-BOM-02 | suppressed without sections; latent legacy path | no row in production partial | PDF 9/2→5; enabled-path probe | `BLOCKED + latent FAIL` |
| Repair kits | PDF-BOM-03 | hard-coded 150 m grouping | ordinary BOM row | 729/150→5 | `numeric PASS`, data-model gap |
| Glue | PDF-BOM-04 | connector+repair included; factor 0.14 | ordinary BOM row | old 8+7→3 PASS; 50-kit boundary 7 vs 8 | `OPEN boundary` |
| Glass tape | PDF-BOM-05 | installed length, one reserve; factor 0.0333334 | ordinary BOM row | old 100 m oracle→11 PASS; exact 30 m boundary→2 vs 1 | `OPEN boundary` |
| Aluminium tape | PDF-BOM-06 | factor 0.02 | ordinary BOM row | 729/50→15 | `numeric PASS`, explicit-source gap |
| Boxes | PDF-BOM-07, PDL-ER-35 | fail-closed; latent hard-coded bucket | excluded code visible after generation | d60/N5 row oracle | `BLOCKED + latent FAIL` |
| Grouping | PDF стр. 59, PDL-ER-38 | generated rows all `common` | selector cannot reconstruct types | pipe 11+tank22→common33 | `FAIL` |
| Partial persistence | PDL-ER-32/35/36/39 | generation_options + GET fields | header/banner/reload/report | 409/201/DB/reload | `PASS core`, export/detail gaps |
| Report | PDL-ER-05/39/40 | excludes stale, carries partial groups | HTML preview + print | live 200/screenshot/click | `PASS HTML`, print render unverified |

## 1. Теплопотери

Current browser payload/units:

- `outer_diameter_mm=108`, `wall_thickness_mm=4`;
- `pipe_length=10 m`;
- ambient/process `−20/+20 °C`;
- wind `5 m/s`, alpha `25 W/(m²·K)`;
- insulation `50 mm`, lambda `0.04 W/(m·K)`;
- range `−60…120 °C`.

Backend сохранил и UI перезагрузил `q=15.0 W/m`, `Q=165 W`. Это доказывает
единицы и current flow, но не является независимым полным heat oracle: persisted
result всё ещё не несёт исчерпывающие `formula_id`, formula version, data source
version и immutable input snapshot.

`business-formula-contracts.json` проверяет 5 широких contracts. Green
`contracts` 5/5 не означает, что section/full-BOM formulas зарегистрированы.

## 2. Подбор кабеля и длины

Current live chain:

```text
Q = 165 W
→ Самрег / ТЛТ-20 / 20 W/m
→ installed = 10.0 m
→ raw/final order = 11.0 m
→ P = 200 W
→ I = 0.91 A at 220 V
```

Power/current используют installed length, BOM использует final commercial
order. `full_builder.py:185-209` теперь проверяет
`commercial.required_order_length` раньше raw order.

Independent regression:

```text
installed = 100 m
raw order = 110 m
commercial.required_order_length = 120 m
expected/current BOM = 120 m
```

Прежний FA-03 `110 вместо 120` закрыт. UI/CSV всё ещё должны однозначно
подписывать installed/raw/final и сохранять их trace, но это FA-10, а не текущая
ошибка количества кабеля.

## 3. Секционирование

Literal PDF стр. 47–48:

```text
Lток = Iдоп / Iст.уд
Lогр = min(Lmax, Lток)
Nсек = ceil(Lтреб / Lогр)
Lфакт = Lсек × Nсек ≥ Lтреб
```

Также требуются одинаковые auto-sections и проверки длины, токов, мощности.
Официальные `Lmax`, `Iдоп`, прямой `Iст.уд` и rounding source отсутствуют.

Current `heating_sections_ready()` возвращает false
(`backend/app/formulas/specification/full_builder.py:90-95`). Builder добавляет
`SECTION_DATA_SOURCE_MISSING` (`:256-272`) и не формирует connector/K2i/box
rows. `num_circuits` остаётся внутри latent enabled path, но **не управляет
production section-dependent BOM сейчас**.

Статус: external `BLOCKED`, current safety `PASS fail-closed`.

Отдельно: PDF стр. 49 не предписывает дерево `объект → группы → секции`; старое
утверждение отозвано. После появления source надо доказать literal metrics и
status, а UI structure согласовать отдельно.

## 4. Соединительные и ремонтные комплекты

### Connector kits

`PRIMARY_PDF` требует выбрать один применимый kit и вычислить:

```text
LOW, Nсек=9, выбран КСН-2, 2 секции/комплект
ceil(9/2) = 5 шт.
```

В production connector rows отсутствуют корректно, потому что sections blocked.
При искусственном `heating_sections_ready=True` latent path всё ещё даёт
КСН-1=9 и КСН-2=18, а не один КСН-2=5. В `SpecificationOptions` нет explicit kit
choice/`sections_per_kit`.

Это не текущая emitted-BOM ошибка, а обязательный post-unblock defect.

### Repair kits

`ceil(total_cable_length_group / 150)` на oracle `729 m` даёт 5 и current code
совпадает. Однако 150 захардкожено (`full_builder.py:434-435`), а catalog не
несёт explicit `cable_length_per_kit`. Поэтому это numerical PASS, не полный
data-driven contract PASS.

## 5. Клей и ленты

### Glue

PDF:

```text
qty = ceil((connector_kits + repair_kits) / kits_per_unit), kits_per_unit=7
```

Current code включает и connector, и repair kits. Старый probe `8+7` теперь
даёт 3 — прежний finding закрыт.

Остаётся boundary defect: catalog хранит `package_factor=0.14`, а не exact `/7`.

```text
50 kits: current ceil(50 × 0.14) = 7
PDF:     ceil(50 / 7) = 8
```

### Glass tape

Current code использует installed length и применяет reserve один раз. Старый
oracle `installed=100 m`, `d=108 mm`, reel=30 m теперь даёт 11, а не 12 —
double-reserve defect закрыт.

Остаётся другой exact-boundary defect:

```text
exact tape length 30 m
current ceil(30 × 0.0333334) = 2
PDF:     ceil(30 / 30) = 1
```

### Aluminium tape

`729/50→15` совпадает. Но catalog выражает правило через `package_factor=0.02`,
а не explicit consumption/reel inputs. Это numerical PASS с trace/data-model
gap.

## 6. Junction boxes

PDF row-driven algorithm допускает несколько совпавших rows; каждая row имеет
свои conditions, divider, rounding и minimum, затем одинаковый code суммируется.

Production корректно fail-closed из-за отсутствующей matrix. При mocked
readiness latent path остаётся неверным:

```text
d=60, N=5, K1i=false
PDF oracle: СКВ1201=2 + СКВ1601=1
latent current: только СКВ1601=2
```

`source_mapping.py` проверяет наличие rows, но `_box_bucket` остаётся
hard-coded (`full_builder.py:170-182,368-380`).

## 7. Rгр и не-PDF позиции

- PDL-ER-31 разрешает Rгр только для явно зарегистрированных relationships.
  Legacy enabled path масштабирует connector counts без полного source mapping;
  в production sections blocked, поэтому риск latent.
- Warning label присутствует в current BOM, но его PDF-approval происходит из
  `DERIVED_INTERNAL` spreadsheet mapping; literal PDF §§7.9–7.15 сам это правило
  не доказывает.
- Literal PDF стр. 60 требует supplier if set; supplier отсутствует в
  `SpecificationItem`, API item и table.

## 8. Partial, grouping и persistence

### Partial round trip

Current generation сохраняет:

```json
{
  "is_partial": true,
  "skipped_objects": 0,
  "excluded_groups": [
    {"error_code": "BOX_EX_RGR_MATRIX_MISSING"},
    {"error_code": "SECTION_DATA_SOURCE_MISSING"}
  ]
}
```

Эти данные подтверждены 201 response, DB `generation_options`, GET/reload UI и
HTML report. Старое утверждение «toast — единственное место diagnostics» больше
неверно.

Остаток: per-object exclusion details не сохраняются как полный immutable
result; DOCX/XLSX diagnostics не доказаны.

### Default grouping

PDL/PDF требуют сначала считать typed sections. Current builder агрегирует cable
до разделения и всем generated accessories ставит `bom_section="common"`
(`full_builder.py:521,564`). Live 201 подтверждает all-common params.

Independent probe:

```text
pipe cable 11 m + tank cable 22 m, merge_identical=false
current: one common row 33 m
```

Это текущий `FAIL`, UI toggle его исправить не может.

## 9. Report totals и print

HTML report сейчас:

- scoped выбранным UUID ЭР;
- показывает installed 10.0 m в electrical row и order 11.0 m в summary;
- исключает stale specification;
- показывает `Неполная спецификация` и оба codes;
- доступен guest; print button вызывает `window.print()`.

Остатки: real print media/PDF не проверены, DOCX/XLSX diagnostics не доказаны,
raw UUID/status/material не локализованы. Report-unit subset имеет четыре
устаревших mock assertions к расширенной `_load_context` signature.

## 10. Что доказывают текущие tests

- full builder focused: 25/25;
- specification builder/service/API subset: 54/54;
- report integration/no-mixing: 16/16;
- Home/Specification/Report frontend: 25/25;
- full frontend Vitest: 181 files / 1056 tests;
- `contracts`: 5/5, но registry не покрывает весь full BOM;
- `formula-qa quick`: formula block green, затем 7 service-guard failures;
- lint/typecheck/build: red;
- report-service unit subset: 4 failures из-за signature expectation drift.

Зелёные focused tests доказывают текущие fixes, но полный BOM нельзя принять без
external sources, exact boundary oracles, typed grouping и strict live E2E.

