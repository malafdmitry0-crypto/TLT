# Functional Accuracy Report

Scope: статический аудит backend и формул с приоритетом надежности и математической корректности  
Mode: `/audit-only`, no execution  
Status: **findings / needs verification**  
Date: 2026-07-18

## Executive summary

Статически подтвержден один критичный расчетный дефект: подбор резистивных
кабелей ТТ Р1/ТТ Р3 считает фактическую мощность и ток по холодному паспортному
сопротивлению `R20`, хотя первичные ТНП-формулы требуют сопротивление при рабочей
температуре. При `Tж=150 °C` backend может завысить доступную мощность на 54.6% и
признать недостаточный кабель подходящим.

Структура формул теплопотерь трубы и резервуара статически совпадает с текущим
business contract: коэффициент запаса применяется к итоговому потоку один раз,
а `Q_доп` резервуара добавляется после множителей. Однако полный численный oracle
для многослойной трубы, полного резервуара и спецификации в registry прямо
помечен `external_reference_required`; поэтому итог `pass` для расчетного контура
невозможен без последующего запуска golden/integration gates.

Воспроизводимость сохраненных результатов недостаточна: в JSON результатов нет
`formula_id`, версии формулы и снимка/версии примененных коэффициентов. Кроме
того, документированная история расчетов (`BR-DATA-02`) расходится с текущим
перезаписыванием `project_objects.results` и upsert электрорасчета.

Текущее рабочее дерево уже содержит незавершенные backend-изменения, включая
динамические electrical variants и модели расчетов. Аудит относится к текущему
состоянию worktree; эти изменения не модифицировались и не исполнялись.

## Docs checked

- `AGENTS.md`, `.agents/routing.yaml`, `.agents/roles/formula-oracle.md`
- `codex-docs/README.md`, `project-map.md`, `requirements-map.md`, `testing.md`
- `codex-docs/business-formula-contracts.json`
- `docs/business-logic-contract.md`
- `formules.md`, `coefficients.MD`, `docs/context/formulas-summary.md`
- `docs/playbooks/formula-validation-agent.md`
- `qa-agent/examples/tlt-formulas.registry.yaml`
- `docs/api.md`, `docs/analysis/business-rules.md`
- `docs/srs.md`, профильные `docs/srs/04-validation.md`,
  `05-functional-nonfunctional.md`, `06-test-program.md`
- `docs/tz-compliance.md`
- `docs/qa/business-logic-coverage.md`, `test-cases-objects.md`,
  `test-cases-electrical.md`
- `docs/analysis/resistive-temperature-tz-deviation.md`
- `docs/analysis/self-reg-current-voltage-tz-deviation.md`
- `docs/analysis/heat-loss-tz-deviations.md`
- релевантные `docs/tnp/**` ссылки, указанные business contract и registry

## Formula coverage matrix

| Formula ID / contract | Requirement | Backend | API/persistence | Frontend contract | Existing tests | Verdict |
|---|---|---|---|---|---|---|
| `pipe_heat_loss` | `Q=q·L_eff·K·K_разм`, без двойного `K` | `pipe.py:220-356`; service `2428-2464` | raw JSON в `project_objects.results`, без formula/version metadata | метры в API, UI-геометрия нормализуется до API | unit/property/service/integration refs есть | **confirmed structurally; full oracle missing** |
| `tank_heat_loss` | flat wall; `Q=(q·S)·K·K_разм+Qдоп`; underground split | `tank.py:198-327`; service `2438-2476` | raw JSON, без formula/version metadata | API в метрах | unit/property/integration refs есть | **confirmed structurally; full oracle missing** |
| `self_regulating_cable_selection` | P/Tmin/Tmax, auto threads, TT curve | `self_regulating.py:105-277,305-465` | upsert JSON + cable snapshot | payload/result types допускают flow | critical/property/service tests есть | **confirmed against app contract; voltage basis unresolved** |
| `resistive_cable_selection` | ТНП требует `R_T=R20·(1+α(Tж-20))` | `_rho_t` есть, но `_passport_power` и auto metrics используют `R20` | неверные P/I могут сохраняться как success | frontend доверяет backend result | tests закрепляют cold model | **confirmed defect** |
| `specification_from_electrical_variant` | выбранный CO и только успешные cable results | builders используют единый status helper | service/API фильтруют variant | `variant_number` передается | stale/error/unsupported tests есть | **confirmed structurally; accessory oracle missing** |

Machine-readable coverage неполон: `qa-agent/examples/tlt-formulas.registry.yaml`
содержит 31 formula/algorithm ID, тогда как
`codex-docs/business-formula-contracts.json` содержит только 5 агрегированных
контрактов. Это не обязательно означает 26 дефектов реализации, но нарушает
строгую проверяемость правила «каждая формула присутствует в contract matrix».

## Findings

### [P0] Резистивный подбор игнорирует температурную поправку в фактических P/I

- Confidence: **high / confirmed**.
- Business impact: при повышенной температуре backend завышает мощность и ток,
  может принять недостаточный ТТ Р1/ТТ Р3 и сформировать неверный результат,
  отчет и спецификацию.
- Requirement: `docs/analysis/resistive-temperature-tz-deviation.md:13-36` и
  `docs/business-logic-contract.md` (`tlt_resistive_temperature_correction_gap`)
  требуют учитывать `[1+0.0042·(Tж-20)]` в сопротивлении, от которого считаются
  фактические P/I.
- Implementation: `backend/app/formulas/electrical/resistive.py:79-80` считает
  `rho_T`, но `:246-270` строит `R`, P и I только из
  `resistance_ohm_km`, длины и напряжения. Та же cold model используется auto
  metrics (`:344-427`).
- Tests: `backend/app/tests/unit/formulas/test_resistive.py:113-126` ожидает
  `P=U²/R20`; oracle registry `:920-965` также закрепляет cold model. Это не
  независимый oracle относительно первичного ТНП.
- Reproduction input: ТТ Р3, `S=1.5 мм²`, `R20=11.667 Ом/км`, `L=1000 м`,
  `U=220 В`, `Tж=150 °C`, `Q=10000 Вт`, `line_1ph`.
- Expected: `factor_T=1+0.0042·(150-20)=1.546`;
  `source_total_power=8050.268 Вт`, margin `-1949.732 Вт` — вариант должен быть
  отклонен.
- Actual by static analysis: `_passport_power` не получает `process_temperature`;
  cold result `12445.714 Вт`, margin `+2445.714 Вт` — вариант может быть принят.
- Recommended fix: согласованно применять `R_T=R20·factor_T` в manual и auto
  metrics, QA oracle, reports and selection; либо документировать подписанную
  продуктовую политику cold model как отдельный метод расчета.
- Required focused test: golden для `Tж=5/20/60/150 °C`, проверка
  `P(T2)<P(T1)` при `T2>T1`, смена applicable→not applicable на примере выше,
  оба типа кабеля и все схемы подключения.
- Residual risk: затрагивает коммерческое ранжирование, 65 A limit, p2/p3,
  сохраненные результаты и уже сформированные документы.

### [P1] Сохраненный расчет нельзя воспроизвести по версии формулы и коэффициентов

- Confidence: **high**.
- Business impact: после изменения кода, коэффициентов или справочника нельзя
  доказать, какой именно методикой получен старый результат, и надежно отделить
  актуальные результаты от устаревших.
- Requirement: `AGENTS.md`, `codex-docs/testing.md` и
  `docs/analysis/business-rules.md:121-129,243-256` требуют traceability и
  снимок/аудит коэффициентов: `formula_id`, версия/источник, category и
  диагностический code.
- Implementation: `ProjectObject.results` и `ElectricalCalculation.results` —
  произвольные JSONB (`backend/app/models/project_object.py:65-69`,
  `electrical_calculation.py:83-94`). `try_recalculate` сохраняет чистый result
  напрямую (`calculation_service.py:990-1003`). Поиск по backend не нашел
  `formula_id`, `formula_version`, `coefficient_snapshot` или
  `coefficient_version`.
- Evidence: успешные result schemas (`calculation.py:322-359,469-486,578-600`)
  также не имеют этих полей. `error_code/category` присутствуют в основном у
  ошибок, но не обеспечивают версию успешной математики.
- Reproduction input: рассчитать объект с admin `safety_factor=1.1`, изменить
  коэффициент или формулу, затем открыть старый result.
- Expected: result содержит как минимум formula ID/version, значения и версию
  коэффициентов, источник каталога/reference data и timestamp методики.
- Actual by static analysis: остается только численный JSON и часть фактических
  полей; источник результата однозначно не восстанавливается.
- Recommended fix: добавить единый immutable `calculation_meta` в heat/electrical
  results и DB contract; включить его в report/spec traceability и stale policy.
- Required focused test: persistence/reload test, затем изменение коэффициента
  и проверка, что старый snapshot не меняется и диагностируется как old version.
- Residual risk: все существующие сохраненные результаты останутся legacy без
  достоверной версии.

### [P1] Документированная история расчетов расходится с overwrite/upsert моделью

- Confidence: **high**.
- Business impact: аудиторский след старых результатов теряется; невозможно
  установить результат, на основании которого ранее сформировали спецификацию
  или отчет.
- Requirement: `docs/analysis/business-rules.md:290-297` (`BR-DATA-02`) обещает
  INSERT новой записи и сохранение предыдущей истории.
- Implementation: heat result перезаписывается в одной строке объекта
  (`calculation_service.py:1000`); electrical results обновляются через upsert
  (`calculation_service.py:3100`), а API прямо документирует upsert по
  `(object_id, variant_number)` (`docs/api.md:204-208`).
- Reproduction input: выполнить два расчета одного объекта с разными параметрами.
- Expected: две immutable calculation revisions, связанные с отчетом/spec.
- Actual by static analysis: текущее поле `results` заменяет предыдущее значение.
- Recommended fix: либо реализовать revision/history table и связи артефактов,
  либо явно изменить BR-DATA-02 и описать ограниченную модель аудита. Для
  надежности формул предпочтительна immutable revision.
- Required focused test: два пересчета → две ревизии; отчет со старой ревизией
  остается воспроизводимым после нового расчета.
- Residual risk: существующие audit events не содержат полного численного
  snapshot/formula metadata и не заменяют историю расчетов.

### [P1] Большинство formula IDs отсутствуют в обязательной contract matrix

- Confidence: **high**.
- Business impact: contract gate может быть зеленым, не трассируя отдельные
  primitives и алгоритмы, включая climate, winding, TT curve, resistive Ohm law
  и grouping спецификации.
- Requirement: stop condition `AGENTS.md`: формула не принимается, если ее нет в
  `codex-docs/business-formula-contracts.json`.
- Implementation/evidence: registry содержит 31 ID; JSON contract содержит 5
  feature-level IDs. Например `tlt_alpha_outdoor`,
  `tlt_pipe_ground_resistance`, `tlt_tt_power_curve`,
  `tlt_resistive_passport_ohm_law` и `tlt_specification_grouping` не являются
  отдельными contract entries.
- Reproduction input: добавить/изменить один registry primitive, не меняя один
  из 5 feature entries.
- Expected: contract matrix показывает его docs/backend/API/UI/test chain.
- Actual by static analysis: granular drift может остаться скрытым внутри
  агрегированного feature contract.
- Recommended fix: расширить schema contract matrix до granular IDs либо явно
  ввести `formulaRefs[]` с автоматической проверкой полного множества registry.
- Required focused test: set equality между registry formula IDs и formula refs
  contract matrix, с allowlist для `not_implemented`.
- Residual risk: до исправления verdict по незатрассированным ID —
  `insufficient evidence`.

### [P1] База напряжения self-regulating тока не подтверждена паспортом

- Confidence: **high** для drift, **medium** для выбора правильного значения.
- Business impact: ток, суммарная нагрузка и будущий выбор защиты отличаются на
  4.55%; приемка по DOCX даст другое значение.
- Requirement: первичные DOCX дают `I=P/230`; текущий app contract использует
  паспортное напряжение строки каталога. Подробный unresolved decision:
  `docs/analysis/self-reg-current-voltage-tz-deviation.md:11-43,139-173`.
- Implementation: `self_regulating.py:249-264,446-462` берет voltage из строки
  каталога; встроенные каталоги используют `220 В`.
- Reproduction input: любой self-reg result с `P=2200 Вт`.
- Expected by DOCX: `I=9.565 А` при 230 В.
- Actual by current catalog policy: `I=10.000 А` при 220 В.
- Recommended fix: получить паспортный источник и разделить при необходимости
  `rated_voltage_v`, `power_curve_voltage_v`, `design_voltage_v`.
- Required focused test: catalog golden с подтвержденной voltage basis плюс
  report/spec persistence and reload.
- Residual risk: текущую формулу нельзя назвать ошибочной без паспорта, поэтому
  verdict — `needs business/source verification`, не `confirmed defect`.

### [P2] Коэффициент размещения меняет итоговый Q без первичного источника

- Confidence: **high**.
- Business impact: для indoor объектов теплопотери и требуемая мощность
  уменьшаются на 10% относительно результата без этой policy.
- Requirement: `docs/business-logic-contract.md` прямо маркирует
  `tlt_heat_loss_location_factor_source_gap` как pending business confirmation.
- Implementation: default `location_indoor=0.9` в
  `heat_loss/common.py:12-17`; применяется в `pipe.py:333-352` и
  `tank.py:261-307`; pipe→electrical переносит factor в
  `calculation_service.py:2461-2464`.
- Reproduction input: одинаковый расчет indoor/outdoor при прочих одинаковых
  условиях и ручном одинаковом alpha.
- Expected: зависит от отсутствующего продуктового решения.
- Actual by static analysis: indoor `Q=0.9·Q_outdoor`.
- Recommended fix: получить первоисточник/подпись policy; до этого сохранять
  source/version в result и явно показывать assumption.
- Required focused test: golden indoor/outdoor и end-to-end проверка, что factor
  применяется ровно один раз.
- Residual risk: 10% systematic delta для indoor portfolio.

### [P2] Полные heat/spec formulas не имеют независимого численного oracle

- Confidence: **high**.
- Business impact: unit/property tests могут сохранить внутренне согласованную,
  но неверную методику; regressions в связке сопротивлений, коэффициентов и
  catalog quantities не обязательно ловятся.
- Requirement: formula playbook требует независимый golden для каждой критичной
  функции.
- Evidence: registry помечает `tlt_pipe_heat_loss_full`,
  `tlt_tank_heat_loss_full` и `tlt_specification_grouping` как
  `external_reference_required` (`registry.yaml:229-260,459-488,1004-1017`).
- Static confirmation: primitive examples совпадают с кодом:
  `25·104.5·1.1=2873.75 Вт`; tank transfer
  `(1100/1.1)/50=20 Вт/м`. Это доказывает только primitive/order, но не полный
  инженерный расчет.
- Recommended fix: добавить сертифицированные примеры из DOCX/XLSX для полной
  трубы, полного резервуара и BOM, не копируя backend implementation.
- Required focused test: golden + boundary + metamorphic, включая 1/2/3 слоя,
  `H/r→1`, indoor/outdoor/underground, `Qдоп`, stale/unsupported/error totals.
- Residual risk: итоговые numerical outputs остаются `needs verification` до
  исполнения oracle gates.

### [P2] Допустимый диапазон теплопроводности грунта расходится с ТНП

- Confidence: **high**.
- Business impact: backend принимает `lambda_gr=0.5…0.799`, отсутствующие в
  документированном ТНП-диапазоне; это меняет подземные теплопотери.
- Requirement: `formules.md`/formula summary задают `0.8…3.0`; drift уже отмечен
  в `docs/analysis/business-rules.md:243-251`.
- Implementation: `backend/app/schemas/calculation.py:28` задает minimum `0.5`,
  используемый pipe и tank schemas.
- Reproduction input: underground object с `ground_conductivity=0.5`.
- Expected by TNP: validation error ниже 0.8.
- Actual by static analysis: schema принимает 0.5 и formula использует его.
- Recommended fix: подтвердить расширенный справочник грунтов или вернуть min
  0.8; не менять golden без источника.
- Required focused test: boundaries `0.5`, `0.799`, `0.8`, `3.0`, `3.001` для
  pipe/tank API и persistence.
- Residual risk: неизвестно, встречаются ли такие значения в сохраненных данных.

## Golden and boundary evidence

| Area | Static oracle | Boundary/metamorphic status |
|---|---|---|
| Pipe total primitive | `25 × 104.5 × 1.1 = 2873.75 Вт`; кодическая структура совпадает | property tests найдены; не запускались |
| Pipe no-double-K | service берет `q_linear × location`, electrical добавляет K | focused test найден; не запускался |
| Tank total primitive | `Q=q·S·K·K_разм+Qдоп`; `Qдоп` в коде после multipliers | tests найдены; не запускались |
| Tank no-double-K | `(1100/1.1)/50 = 20 Вт/м`; затем electrical K восстанавливает demand | focused test найден; не запускался |
| Resistive temperature | при 150 °C `factor_T=1.546`; cold model завышает P на 54.6% | отсутствует правильный golden; текущие tests закрепляют defect |
| Self-reg voltage | `2200/220=10 A`, DOCX `2200/230=9.565 A` | source decision отсутствует |
| Full pipe/tank/spec | registry требует external reference | insufficient evidence |

## Documentation drift

- `docs/tz-compliance.md:170-171` заявляет отсутствие некорректного счета и
  полное покрытие чистых формул, что несовместимо с подтвержденным resistive
  temperature issue и external-reference gaps.
- `docs/analysis/business-rules.md:290-297` обещает immutable calculation
  history, но текущие модели используют overwrite/upsert.
- `docs/analysis/business-rules.md:155-163` описывает упрощенный selection rule
  `power_per_meter × pipe_length ≥ total_heat_loss`, тогда как текущий app
  contract учитывает safety, winding, threads и temperature constraints.
- `backend/app/formulas/heat_loss/common.py:3-7` все еще называет формулы
  приближенными и ожидающими финальных формул, что противоречит актуальному
  business contract и создает риск неверной интерпретации source priority.

## Missing test coverage

- Correct hot-resistance golden для manual/auto ТТ Р1 и ТТ Р3.
- Persistence/reload assertions для formula ID/version и coefficient snapshot.
- Immutable history/revision behavior либо тест явно утвержденной overwrite
  policy.
- Set-equality gate registry ↔ business formula contracts.
- Независимые full-model golden fixtures для трубы, резервуара и полного BOM.
- Решение и golden по self-reg voltage basis.
- API boundary tests для `ground_conductivity=0.5/0.8` после бизнес-решения.

## Reliability and observability risks

- Успешные результаты не содержат диагностическую версию формулы; audit events
  записывают category/error code, но не полный calculation provenance.
- Изменение admin coefficients влияет только на будущие расчеты, однако старый
  result не хранит snapshot, что делает сравнение неоднозначным.
- `project_objects.results` и `electrical_calculations.results` — schemaless
  JSONB на уровне БД; обязательность provenance не защищена constraint/schema.
- Batch code использует chunking/keyset flow, поэтому явного full-scan finding в
  расчетном hot path статически не подтверждено. DB/performance evidence не
  запускалось.

## Files inspected

### Backend

- `backend/app/formulas/heat_loss/{common,insulation,pipe,tank}.py`
- `backend/app/formulas/electrical/{self_regulating,resistive,cable_geometry}.py`
- `backend/app/formulas/specification/{builder,full_builder}.py`
- `backend/app/electrical_result_status.py`
- `backend/app/services/calculation_service.py`
- `backend/app/schemas/calculation.py`
- `backend/app/api/v1/{calculations,calc_jobs}.py`
- `backend/app/models/{project_object,electrical_calculation,coefficient}.py`
- builtin cable/reference JSON files

### Frontend contract

- `frontend/src/api/calculations.ts`
- `frontend/src/types/calculation.ts`
- references from `HeatCalcPage.tsx`, `ElecCalcPage.tsx`, specification API/page

### Tests/oracles

- `backend/app/tests/unit/formulas/test_{pipe_heat_loss,pipe_properties,tank_heat_loss,resistive,self_regulating,self_regulating_critical,spec_builder}.py`
- `backend/app/tests/unit/services/test_{calculation_service_unit,no_double_safety}.py`
- relevant integration API test references
- `qa-agent/tests/{AlgorithmOracle,FormulaOracle}.test.ts`
- `qa-agent/examples/tlt-formulas.registry.yaml`

## Verification

- Code execution: **not run — prohibited by task**
- Tests: **not run — prohibited by task**
- Builds/linters/Docker/migrations/servers: **not run — prohibited by task**
- Static checks performed: read-only `git status`, `git diff --stat`, `rg`,
  `sed`, `nl`, `wc`; documentation-to-code-to-test trace; independent manual
  arithmetic for selected primitives.
- Result: **needs verification**. Static evidence is sufficient for findings,
  not for a passing release/formula gate.

## Residual risk

Численное поведение текущего worktree не исполнялось. Не доказаны DB
invariants, serialization/reload, concurrent upsert, report/spec output и
mutation resistance. Незавершенные dynamic electrical variant changes могут
изменить persistence semantics до момента запуска gates.

После стабилизации изменений рекомендуемый порядок:

1. Исправить или формально решить P0 resistive temperature contract и добавить
   независимый golden.
2. `scripts/formula-qa.sh quick` — pure formulas, no-double-K, boundary/property.
3. `scripts/formula-qa.sh full` — service/API/persistence/reload.
4. `scripts/codex-functional-audit.sh contracts` — расширенная contract matrix.
5. `scripts/codex-functional-audit.sh mutation` — критическое math core.
6. Релевантный Playwright user flow, затем
   `scripts/codex-functional-audit.sh db-invariants`.
7. `scripts/codex-functional-audit.sh business` для spec/report totals и
   variant propagation.
