# Functional Accuracy Report

**Scope:** PDF «1 Кейс — Расчёт спецификации для неавторизованных
пользователей», guest workflow, backend/API, frontend/UI, specification BOM,
persistence, security boundaries и существующие tests. Режим `/audit-only`.

**Итоговый статус:** **FAIL — Needs correction + Needs business decision.**

Код приложения и тестов не изменялся. Созданы только этот отчёт, нормализованные
Markdown-требования и evidence-артефакты.

## Краткий вывод

В приложении работает базовый контур:

```text
guest session → auto-project → object → heat calculation
              → fixed СО1…СО4 → basic specification → HTML report
```

Но документ описывает другую доменную и процессную модель:

```text
one local temporary project → readiness gate → dynamic ЭР1…ЭР5
→ unassigned/system assignment → equal heating sections
→ one/many ER specifications → new data-driven BOM
```

Главные отличия нельзя устранить переименованием элементов интерфейса. В
текущей схеме нет сущности именованного ЭР, assignment объекта системе внутри
ЭР, нагревательных секций, multi-ЭР wizard и каталожной модели нового BOM.

Кроме расхождения с новым PDF найден отдельный критический дефект уже
действующего guest-контракта: спецификация формируется без единого успешного
электрического расчёта. Это воспроизведено через UI и подтверждено API-ответом.

## Docs checked

Обязательные и профильные источники:

- `AGENTS.md`, `.agents/routing.yaml`, `.agents/roles/functional-accuracy.md`;
- `codex-docs/README.md`, `project-map.md`, `requirements-map.md`, `testing.md`,
  `business-formula-contracts.json`, `functional-accuracy-agent.md`;
- `formules.md`, `coefficients.MD`, `docs/context/formulas-summary.md`,
  `docs/playbooks/formula-validation-agent.md`;
- `docs/api.md`, `docs/analysis/business-rules.md`,
  `docs/business-logic-contract.md`, `docs/context/full-version-rule.md`;
- `docs/srs.md`, `docs/srs/`, `docs/tz-compliance.md`;
- guest SRS `docs/srs/ui/guest/` и релевантные `docs/qa/`;
- существующие cross-check reports
  `docs/analysis/tnp-1-case-gap-vs-implementation.md` и
  `docs/analysis/tnp-1-case-frontend-change-assessment.md`.

Приоритет источников взят из `docs/business-logic-contract.md:3-16`. Поэтому
PDF редакции 4 от 07.07.2026 рассматривается как новый предлагаемый контракт,
а не как разрешение автоматически заменить утверждённые формулы XLSX от
29.05.2026. Внутренние противоречия PDF перечислены в
[pdf-requirements.md](pdf-requirements.md#внутренние-противоречия-pdf).

## PDF parsing

Исходный файл:
`ТНП/1_Кейс_«Расчёт_спецификации_для_неавторизованных_пользователей» (1).pdf`.

- 81 страница A4;
- SHA-256:
  `5bf9a5f12f1ea609e7889f12dbbf4dbc24be8653258ea0e65f3d691d19fc978d`;
- текст извлечён с layout, все 81 страницы отрендерены и просмотрены;
- PDF не размечен тегами, не содержит форм, JavaScript или шифрования;
- атомарные требования PDF-GUEST/NFR/HEAT/ER/SPEC/BOM оформлены в
  [pdf-requirements.md](pdf-requirements.md), постраничная навигация — в
  [pdf-page-index.md](pdf-page-index.md).

Ключевые визуальные фрагменты PDF:
[исходные данные](assets/pdf/page-21-input-ui.png),
[электрический расчёт](assets/pdf/page-35-electrical-ui.png),
[секции](assets/pdf/page-49-section-ui.png),
[спецификация](assets/pdf/page-56-specification-ui.png).

## Implementation found

### Backend

- guest auth/session: `backend/app/api/v1/auth.py:67-108`,
  `backend/app/services/auth_service.py:38-64`;
- `X-Session-Id`, touch/isolation: `backend/app/core/dependencies.py:79-121`;
- лимиты 1 project / 50 objects / TTL 20 min:
  `backend/app/core/config.py:71-80`;
- project ownership/isolation:
  `backend/app/services/project_service.py:94-130,444-468`;
- electrical persistence:
  `backend/app/models/electrical_calculation.py:13-55`,
  `backend/app/services/calculation_service.py:1260-1293,1398-1426`;
- specification endpoints/service:
  `backend/app/api/v1/specifications.py:28-133`,
  `backend/app/services/specification_service.py:36-276`;
- guest basic builder: `backend/app/formulas/specification/builder.py:20-109`;
- employee full builder:
  `backend/app/formulas/specification/full_builder.py:19-289`;
- specification persistence:
  `backend/app/models/specification.py:14-45`.

### Frontend

- guest entry: `frontend/src/pages/HomePage.tsx:17-139`;
- freely clickable four-step header:
  `frontend/src/components/layout/Sidebar.tsx:53-98`;
- guest project upload/download:
  `frontend/src/components/layout/ProjectMenu.tsx:60-76,100-134`;
- fixed variants: `frontend/src/store/calculationVariantStore.ts:4-35`;
- specification behavior/UI:
  `frontend/src/pages/SpecificationPage.tsx:359-539`,
  `frontend/src/components/specification/SpecTable.tsx:24-61`;
- report preview: `frontend/src/pages/ReportPage.tsx:106-221`.

### Tests

Положительное существующее покрытие включает guest auth/isolation, unit tests
basic/full builders, regeneration/grouping, stale после object/heat mutation,
variant separation, units save/reload и basic guest report restrictions.

Критический дефект аксессуаров закреплён как ожидаемое поведение:

- `backend/app/tests/unit/formulas/test_spec_builder.py:82-102,155-172`;
- `backend/app/tests/unit/services/test_specification_service_unit.py:121-155,184-215`.

Нет focused tests:

- objects present + zero successful electrical → empty specification;
- ordinary electrical change → stale/regenerated specification;
- employee cannot mutate another employee's specification;
- multi-ЭР/assignment/sections (соответствующей модели нет);
- PDF BOM oracles и boundaries;
- strict TTL expiry до periodic cleanup;
- full guest UI flow `entry → UI object → electrical → spec → report → reload`.

## Verification

Полный журнал команд и артефактов: [verification-log.md](verification-log.md).

Ключевые результаты:

| Command / scenario | Result |
|---|---|
| `scripts/formula-qa.sh quick` | PASS, но новый PDF BOM не зарегистрирован. |
| `scripts/codex-functional-audit.sh docs` | PASS. |
| `scripts/codex-functional-audit.sh contracts` | PASS: 5 текущих contracts; PDF-BOM-01…07 отсутствуют. |
| `scripts/codex-functional-audit.sh db-invariants` после UI | PASS: 11 checks, 0 violations. |
| Focused backend spec/auth/security с `--no-cov` | PASS; warnings о JWT key 23 bytes. |
| Та же focused-команда с global coverage gate | Assertions pass, command FAIL: targeted subset 44.23% < repository 85%. |
| Frontend typecheck / build | PASS / PASS. |
| Frontend lint | FAIL: `_omit` unused в `projectStore.test.ts:49`. |
| Full frontend unit/integration | FAIL: 926 pass, 1 fail (`HeatCalcPage.settings.test.tsx:321`); focused rerun также fail. |
| Playwright: spec/report/project CSV/layout | PASS: 18/18 после sandbox rerun. |
| Playwright accessibility gate | PASS: 6/6; guest spec/report этим gate не покрыты. |
| Live Chromium, 1440×1000 / 390×844 | Выполнено; business/UI failures ниже. |

## Findings

### F-01 — Blocker: ложная спецификация без electrical calculation

**Requirements:** PDF-SPEC-03; текущий guest SRS
`docs/srs/ui/guest/04-screen-workspace-specification.md:79-138`.

**Expected:** без хотя бы одного успешного electrical result specification
пустая; failed/stale/unsupported не превращаются в закупочные позиции.

**Actual:** service считает все project objects
(`specification_service.py:139-149`), а basic builder добавляет шесть accessory
types по `object_count` независимо от successful calculations
(`builder.py:89-104`). `skipped_objects` остаётся 0.

**Live reproduction:** guest → создать одну трубу → не выполнять electrical →
открыть Specification → нажать `Сформировать`.

`POST /specifications/{project}/generate?variant=1` вернул 201 и позиции УЗО,
КЗ, КС, лента, датчик и терморегулятор:
[API response](evidence/api/guest-audit-spec-generate-response-body.json).

UI до запроса правильно предупреждал о необходимости шага 2
([empty](assets/ui/guest-audit-spec-empty-desktop.png)), но после запроса
показывает ложный результат
([result](assets/ui/guest-audit-spec-without-electrical-desktop.png)). Отчёт
повторяет эти позиции рядом с `Электротехнический расчёт (0)`
([report](assets/ui/guest-audit-report-desktop.png)).

**Impact:** ложный закупочный документ и отчёт; пользователь не видит
неполноту. **Status:** `Needs correction`.

### F-02 — Blocker: основная доменная модель PDF отсутствует

**Requirements:** PDF-ER-01…16, PDF-SPEC-01…06.

PDF требует dynamic named ЭР1…ЭР5, create/copy/rename/delete, per-ER
`Нераспределённые / Самрег / Резистив / Скин`, assignment, equal heating
sections и multi-ЭР spec wizard. Текущая модель — fixed integer slots 1…4:

- frontend constant `[1,2,3,4]`:
  `frontend/src/store/calculationVariantStore.ts:4-12`;
- DB check `variant_number 1..4`:
  `backend/app/models/electrical_calculation.py:13-55`;
- fixed UI selector:
  `frontend/src/pages/SpecificationPage.tsx:515-536`.

Live electrical screen показывает СО1…СО4 и плоскую таблицу:
[screenshot](assets/ui/guest-audit-electrical-empty-desktop.png).

**Impact:** не реализован центральный workflow документа, а specification не
может быть трассирована к выбранным именованным ЭР/секциям. **Status:**
`Needs implementation`, после принятия нового contract.

### F-03 — Blocker / business decision: новый BOM несовместим с текущим

Действующий contract `docs/business-logic-contract.md:84-94` основан на старом
XLSX. Новый PDF меняет semantics:

- connector kits: выбрать один и `ceil(N/sections_per_kit)`; код добавляет
  `-1=N×R` и дополнительно `-2=N×R×2` (`full_builder.py:156-161,198-208`);
- glue: PDF учитывает connector + repair kits; код repair исключает и применяет
  approximate `×0.14` (`full_builder.py:233`);
- boxes: PDF data-driven all matching rows, per-row rounding/divider/min и
  `d≥57`; код выбирает одну hardcoded bucket, `ceil(N/3)`, `d>57`
  (`full_builder.py:82-94,170-181`);
- `Nсек` в builder фактически равен `num_circuits`
  (`full_builder.py:19-21,134`), то есть количеству ниток, а не реальных секций;
- exact 30 m glass tape даёт 2 rolls из-за `0.0333334`, а PDF требует 1.

Точные read-only команды, inline inputs и outputs:
[formula-probes.md](formula-probes.md).

Guest вообще не может вызвать full builder: `mode=full` →403
(`api/v1/specifications.py:70-77`). PDF-BOM-01…07 отсутствуют в
`business-formula-contracts.json` и deterministic QA registry.

**Impact:** новые PDF количества не воспроизводятся, но массовая замена current
golden запрещена без утверждения source-of-truth. **Status:**
`Needs business decision`, затем `Needs correction/implementation`.

### F-04 — High / security: employee может изменить чужую specification

Specification POST/PUT используют read-level `get_project_basic`
(`backend/app/api/v1/specifications.py:63-68,115-120`). Для employee read guard
разрешает user-owned projects (`project_service.py:444-450`), в то время как
write guard запрещает чужое (`project_service.py:457-468`). Следовательно,
employee может regenerate/replace items чужого employee/admin project.

Negative specification ownership test отсутствует; existing security tests
проверяют project/object boundaries. **Impact:** cross-owner integrity breach.
**Status:** `Needs correction`.

### F-05 — High: electrical mutation не делает specification stale

Direct calculate, cable select, variants select и batch сохраняют новый
electrical result, но не вызывают specification stale/regeneration
(`calculation_service.py:1260-1293,3502-3537,3720-3958`). Stale tests покрывают
object/heat/delete, но не смену электрического результата.

**Impact:** закупочная specification может иметь `is_stale=false` после смены
кабеля. Это нарушает PDF-SPEC-06 и текущий смысл stale. **Status:**
`Needs correction`.

### F-06 — High: readiness gate существует только в тексте UI

`Sidebar` всегда выполняет `navigate(e.key)`
(`frontend/src/components/layout/Sidebar.tsx:91-98`). На specification UI
показывает правильное предупреждение, но `Сформировать` остаётся активной
(`SpecificationPage.tsx:369-379,485-502`).

Live flow прошёл heat → electrical → specification → report без successful
electrical. **Impact:** пользователь обходит документированный workflow и
доходит до F-01. **Status:** `Needs correction`.

### F-07 — High: guest lifecycle расходится и с PDF, и с текущим guest SRS

PDF: TTL 3 дня; текущий code: 20 минут + periodic cleanup 10 минут. Header не
показывает TTL и expiry modal. После 401 frontend молча создаёт новую session и
project (`frontend/src/api/client.ts:116-130,200-216`), что скрывает потерю
контекста. Session + auto-project создаются двумя commits; delete project не
создаёт новый auto-project; expired row может быть «оживлён» до cleanup.

**Impact:** непредсказуемая потеря/замена временного проекта. Требуется сначала
решение `3 дня vs 20 минут` и DB/session storage policy.

**Status:** `Needs business decision + correction`.

### F-08 — High / UI: populated Heat screen нечитаем на 390×844

Программная проверка обнаружила:

- page horizontal scroll: document 393 px при viewport 390 px;
- labels/units 9 px;
- clipped `мм`, `шт`, `°C`, `м/с`, `Вт/мК`;
- desktop columns сжаты до посимвольных переносов.

Evidence: [screenshot](assets/ui/guest-audit-heat-populated-mobile.png) и
[geometry](evidence/layout/guest-audit-heat-mobile-geometry.json).

Specification mobile не имеет page overflow, report помещает широкую таблицу
во внутренний scroll; однако Heat core workflow непригоден на mobile. Если
mobile не поддерживается, это должно быть явно закреплено с понятным min-width
screen. **Status:** `Needs business decision / correction`.

### F-09 — High: fixed variant не является backend active state

Выбор СО хранится только в client Zustand/local storage. Project/model/API не
имеют `active_variant`; backend принимает caller-supplied `variant`. Поэтому он
не может обеспечить ровно один active СО, server reload persistence или запрет
generation по неактивному variant. Это расходится с текущими FR-58/US-G-32 и
ещё сильнее — с dynamic ER PDF.

Дополнительно specification endpoints принимают arbitrary int без `ge/le`, а
table specification не имеет DB range check; `variant=99` способен сохраниться.
**Status:** `Needs correction`.

### F-10 — High: initial Heat/Elec query errors маскируются под empty

Heat data model извлекает data/isFetching без `isError/error/refetch`
(`useHeatCalcObjectsDataModel.ts:188-248,424-450`), electrical page аналогично
(`ElecCalcPage.tsx:262-301,1181-1263`). После окончательного 5xx пользователь
может увидеть «объекты не добавлены» или пустую таблицу.

Specification/report имеют error/retry и реализованы лучше. **Impact:** ложное
пустое состояние и риск повторных действий. **Status:** `Needs correction`.

### F-11 — Medium: import project UI не обеспечивает atomic user contract

`ProjectMenu` начинает import сразу после выбора файла
(`ProjectMenu.tsx:60-76`). Нет filename, предупреждения о замене, confirm и
явного сообщения «текущий проект не изменён» при parse error, хотя текущий SRS
это требует (`docs/srs/ui/guest/06-csv-flows.md:94-171`). E2E закрепляет прямой
upload через hidden input.

Backend может быть атомарным, но пользовательское доказательство error/no-wipe
отсутствует. **Status:** `Needs correction`.

### F-12 — Medium: report contract и traceability неполны

Положительное: guest видит HTML preview, export PDF/DOCX/XLSX скрыт. Проблемы:

- PDF противоречив по доступности guest report;
- current guest SRS требует browser print, `window.print`/кнопка отсутствуют;
- live report включает ложные accessories при electrical count 0;
- specification items не содержат `formula_id`, source/version, выбранную
  catalog row или diagnostic code.

**Status:** `Needs business decision + correction`.

### F-13 — Medium: документационный contract сам расходится

До реализации PDF нужно устранить как минимум:

- current SRS: один TLT/один СО vs четыре cable types/СО1…СО4;
- mineral cable promised vs explicit unsupported;
- один auto-project vs API/QA сценарии дополнительного проекта;
- active СО auto-regeneration vs manual regeneration;
- PDF: generate all ЭР vs selected ЭР;
- PDF: order length vs actual section length;
- PDF: manual sections prohibited vs «учитывать manual composition»;
- object taxonomy и guest report ambiguity.

Полный список: [pdf-requirements.md](pdf-requirements.md#внутренние-противоречия-pdf).

**Status:** `Needs business decision`.

## Положительное evidence

- Guest session/project isolation в основном реализована.
- Object save и heat result persisted/reloaded в live flow.
- UI mm→API m conversion доказан request body.
- Electrical calculations имеют unique `(object_id, variant_number)` и DB
  range check 1…4.
- Guest full BOM correctly blocked по текущему SRS.
- Specification GET/generate/save передают variant consistently для current
  fixed-slot model.
- Specification/report имеют loading/error/retry лучше, чем Heat/Elec.
- `formula-qa quick`, current contract matrix, DB invariants, typecheck и build
  прошли.

Эти green checks не компенсируют blockers: они доказывают внутреннюю
согласованность части текущего продукта, а не соответствие новому PDF.

## Статус продуктовых решений после аудита

18.07.2026 пользователь утвердил [Product Decision Log](product-decisions.md):

- dynamic ЭР1…ЭР5 **заменяют** СО1…СО4;
- specification генерируется по одному или нескольким явно выбранным ЭР;
- guest получает full BOM, но не ручное редактирование позиций;
- закупочный cable quantity использует order length с резервом 10% и
  коммерческим округлением; `Lsection×Nsection` хранится отдельно;
- секции напрямую не редактируются;
- guest report — HTML preview + browser print, без server exports;
- MVP types: `pipe`/`tank`, `Бочка` — синоним ёмкости;
- settings — project defaults + per-generation snapshot;
- boundary коробок — `dтр ≥ 57 мм`.

Открытыми остаются:

1. Новый PDF 07.07 полностью заменяет или только дополняет старый XLSX BOM
   29.05 для остальных формул комплектов/клея/лент/коробок?
2. Допустимо ли временное хранение guest project/session в PostgreSQL?
3. TTL: 3 дня или 20 минут; какое поведение при expiry/recovery?
4. Mobile — поддерживаемый workflow или официальный min-width ≥1280 px?

Утверждённые решения требуется зарегистрировать отдельными formula/workflow
contracts с IDs, source/version, golden и boundary oracles. Не утверждённые
формулы нельзя менять массовой заменой expected values.

## Residual risk

- Не проверены Firefox, Opera и Яндекс Browser.
- Не выполнены performance/load boundaries 500 objects, 5 ER и 30 секунд.
- Не проверен реальный TTL expiry на протяжении 20 минут/3 дней.
- Не выполнен destructive import failure scenario с повреждённым full-state
  файлом; соответствующий формат ещё не определён.
- Не доказана audit-event completeness при DB/audit partial failure.
- PDF box table не задаёт исполнимые значения Ex/Rгр для каждой строки; новый
  oracle неполон.
- UI after-screenshots исправленного поведения отсутствуют, поскольку пользователь
  запретил изменения кода; текущий audit status остаётся FAIL, не acceptance.

## Final result

```text
Документация -> код backend -> код frontend -> тесты -> фактический результат
PDF target       partial/different  partial/different  incomplete  FAIL
Current guest SRS backend bug       misleading gate   encodes bug  FAIL
```

Приложение нельзя принять как соответствующее PDF «1 Кейс». Для текущего
продукта сначала необходимо исправить F-01, F-04, F-05 и F-06; для реализации
нового PDF — утвердить решения выше и планировать отдельное изменение доменной
модели, UI и formula contracts.
