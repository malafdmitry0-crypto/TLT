# Исполняемые промпты: границы температуры окружающей среды

Каждый блок ниже — отдельный agent run и отдельный commit. Слайсы не
склеивать. Перед запуском передай агенту общий префикс и ровно один блок.
План и продуктовые решения: [plan.md](plan.md).

Если пользователь отдельно запретил commit, задал другой proof-контракт или
изменил продуктовый смысл, его указание имеет приоритет.

---

## Общий префикс для всех слайсов

    Работай из корня /Users/dmalafey/Desktop/TLT.

    Прочитай полностью:
    1. корневой AGENTS.md;
    2. answers/05-ambient-temperature-bounds/README.md;
    3. answers/05-ambient-temperature-bounds/plan.md;
    4. для frontend-слайса — frontend/AGENTS.md,
       docs/frontend/agent-development-standard.md,
       docs/frontend/pr-budget.md и docs/frontend/viewport-policy.md;
    5. ближайший production-код и существующие тесты своего owner.

    Используй обязательные skills по фактической зоне: react-workflow для
    React/TypeScript, python-workflow для FastAPI/Python, spreadsheets для
    XLSX/CSV, pdf для PDF и verify-kontur-ui для видимого UI proof.

    До изменений:
    - git status --short;
    - git rev-parse HEAD;
    - не трогай, не форматируй и не добавляй в commit чужой WIP;
    - если WIP пересекает ALLOWED_SCOPE, остановись с
      FILE / EVIDENCE / DECISION NEEDED;
    - для каждого frontend production path выполни из frontend:
      npm run agent:scope -- <path>.

    Один запуск = один SLICE_ID, один owner, одна причина изменения, один
    commit. Characterization first: сначала тест, красный на исходном
    поведении, затем минимальный production patch. Не ослабляй assertions, не
    используй any, @ts-ignore, широкие casts, baseline increase или новый
    compatibility path.

    Постоянные инварианты:
    - ambient_temperature сохраняет технический ключ и остаётся единственной
      температурой воздуха, входящей в формулы;
    - max_ambient_temperature — необязательные ручные метаданные;
    - max_ambient_temperature не добавлять в heat-owned registries, formula
      schemas, formula results, climate policy и electrical formulas;
    - не добавлять default 30 °C и Alembic migration;
    - не менять Climate.xlsx, climate.json, формулы, units и golden results;
    - max >= min проверяется только когда максимум заполнен; равенство допустимо;
    - underground pipe: воздушные поля N/A; tank сохраняет воздушные поля;
    - mobile/tablet ниже 1000 px вне acceptance;
    - E2E запускать только из e2e/;
    - полный npm run test:agent-dod:dual-safe не запускать без отдельного
      прямого запроса пользователя;
    - незапущенная проверка = NOT RUN, не PASS.

    Перед commit:
    - выполнить focused proof из slice prompt;
    - для frontend diff выполнить npm run agent:scope -- --changed --json,
      затем рассчитанные agent:proof-run и agent:proof-check;
    - git diff --check;
    - просмотреть полный diff и git status --short;
    - добавлять только адресные файлы slice, не использовать git add .;
    - commit только после зелёного обязательного proof.

    Финальный отчёт:
    Slice / behavior before→after / files / focused proof /
    calculated proof / browser states+viewports / console+network /
    NOT RUN / residual risk / commit.

---

## ATB-00 — закрепить изоляцию расчётного ядра

    SLICE_ID: ATB-00
    OWNER: heat/backend
    PRECONDITION: нет.
    GOAL: машинно доказать, что max_ambient_temperature является
    нерасчётными метаданными, сохраняется рядом с heat-параметрами и не меняет
    результат pipe/tank.

    ALLOWED_SCOPE:
      backend/app/tests/unit/services/test_heat_contract.py
      backend/app/tests/unit/services/test_heat_loss_ownership_characterization.py
      при необходимости один ближайший characterization test pipe/tank

    NON-GOALS:
      production-код, frontend, object query, import/export, report,
      формульные schemas/core, migrations, climate.

    CHARACTERIZATION:
    1. Добавь явные assertions, что max_ambient_temperature отсутствует во всех
       HEAT_OWNED, deprecated и forbidden heat registries.
    2. Докажи, что replace_heat_owned_params сохраняет существующий максимум и
       принимает его явное изменение как non-heat metadata.
    3. Докажи, что canonical params сохраняют максимум, а StoredPipeHeatParams
       и StoredTankHeatParams его не содержат.
    4. Для валидного pipe и tank сравни результат расчёта с одинаковыми
       входами: без максимума и с ним. Dict результата должен совпасть целиком.
    5. Если любой пункт требует production-изменения, остановись: это нарушение
       ожидаемой архитектурной границы, а не разрешение менять ядро.

    FOCUSED_PROOF, cwd=root:
      docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend \
        pytest --no-cov -q \
        app/tests/unit/services/test_heat_contract.py \
        app/tests/unit/services/test_heat_loss_ownership_characterization.py
      scripts/formula-qa.sh quick
      git diff --check

    ACCEPTANCE:
    - test-only diff;
    - одинаковые formula results с максимумом и без него;
    - formula-qa quick green.

    COMMIT:
      test(heatcalc): ATB-00 guard ambient maximum metadata boundary

---

## ATB-01 — backend persistence и object query

    SLICE_ID: ATB-01
    OWNER: heat/backend
    PRECONDITION: ATB-00 committed.
    GOAL: необязательный max_ambient_temperature переживает create, update,
    recalc и query, не становясь heat-owned input.

    ALLOWED_SCOPE:
      backend/app/services/object_query_service.py
      backend/app/services/project_object_params.py
      backend/app/schemas/json_shapes.py
      backend/app/tests/integration/api/test_objects.py
      backend/app/tests/integration/api/test_object_query.py
      backend/app/tests/unit/services/test_project_object_params.py
      backend/app/tests/unit/services/test_object_query_service_unit.py
      backend/app/services/project_service.py — только если красный
        characterization докажет реальную потерю поля

    NON-GOALS:
      migrations, defaults, heat_contract registries, formula schemas,
      climate, frontend registry, Excel/CSV/report.

    CHARACTERIZATION:
    1. Создай pipe с max_ambient_temperature, прочитай его обратно.
    2. Измени расчётный heat-параметр и выполни штатный recalc; максимум должен
       сохраниться.
    3. Явно обнови максимум числом, затем null; обе операции должны быть
       наблюдаемы в ответе.
    4. Зафиксируй текущий FAIL object-query capabilities/field projection.
    5. Повтори для tank хотя бы на одном integration path.
    6. API должен отклонять non-number, non-finite, значение вне −70…70 и
       max < min с field-aware ошибкой; null остаётся допустимым.

    IMPLEMENTATION:
    - Добавь max_ambient_temperature в pipe/tank object-query field definitions
      как number в °C.
    - Добавь JSON-number SQL resolver для sort/filter.
    - Добавь отдельную metadata-валидацию maximum на object boundary. Не
      включай поле в StoredPipeHeatParams/StoredTankHeatParams.
    - Если json shape содержит явный перечень params, добавь optional field.
    - Не добавляй backend default.
    - Не меняй generic project service, если существующий JSON merge уже
      проходит characterization.
    - Удали assertion, закрепляющий отсутствие поля, только заменив его
      положительным контрактом.

    FOCUSED_PROOF, cwd=root:
      docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend \
        pytest --no-cov -q \
        app/tests/integration/api/test_objects.py \
        app/tests/integration/api/test_object_query.py \
        app/tests/unit/services/test_project_object_params.py \
        app/tests/unit/services/test_object_query_service_unit.py \
        app/tests/unit/services/test_heat_contract.py
      scripts/formula-qa.sh quick
      git diff --check

    ACCEPTANCE:
    - create/update/recalc/query round-trip green;
    - null очищает значение без default;
    - max остаётся вне formula input;
    - миграций нет.

    COMMIT:
      feat(heatcalc): ATB-01 expose ambient maximum metadata

---

## ATB-02a — типизированный form↔API round-trip

    SLICE_ID: ATB-02a
    OWNER: heat/frontend
    PRECONDITION: ATB-01 committed.
    GOAL: frontend-модель читает и записывает max_ambient_temperature без
    потери значения; UI пока не меняется.

    ALLOWED_SCOPE:
      frontend/src/utils/objectWizardUtils.ts
      frontend/src/utils/objectWizardApiToFormMappers.ts
      frontend/src/utils/objectWizardFormMappers.ts
      frontend/src/__tests__/unit/utils/objectWizardUtils.pipe-form-api.test.ts
      frontend/src/__tests__/unit/utils/objectWizardUtils.tank-form-api.test.ts
      frontend/src/__tests__/unit/utils/objectWizardUtils.form-roundtrip.test.ts

    NON-GOALS:
      компоненты формы, field registry, labels, table, inline projection,
      backend, CSS, Excel/report.

    CHARACTERIZATION:
    1. API→form: сохранённый максимум сейчас теряется.
    2. Form→API: заполненный максимум сейчас отсутствует в params.
    3. Blank maximum должен давать null/отсутствие по действующему clear
       contract, но никогда default 30.
    4. Pipe underground должен отправлять null для очистки; tank underground
       сохраняет число.

    IMPLEMENTATION:
    - Добавь optional max_ambient_temperature в PipeFormValues и TankFormValues.
    - Проведи поле через API→form и form→API.
    - Сохрани текущие mm↔m преобразования и все остальные params без изменений.
    - Не используй broad spread неизвестных form keys вместо явного mapping.

    FOCUSED_PROOF, cwd=frontend:
      npm run test:run -- \
        src/__tests__/unit/utils/objectWizardUtils.pipe-form-api.test.ts \
        src/__tests__/unit/utils/objectWizardUtils.tank-form-api.test.ts \
        src/__tests__/unit/utils/objectWizardUtils.form-roundtrip.test.ts
      npm run typecheck
      npm run agent:scope -- --changed --json
      npm run agent:proof-run -- --changed
      npm run agent:proof-check -- --changed
      git diff --check

    ACCEPTANCE:
    - pipe/tank read/write round-trip green;
    - underground semantics покрыты;
    - никакого видимого UI или CSS diff.

    COMMIT:
      feat(frontend): ATB-02a preserve ambient maximum form data

---

## ATB-02b — видимые min/max в форме

    SLICE_ID: ATB-02b
    OWNER: heat/frontend
    PRECONDITION: ATB-02a committed.
    GOAL: пользователь видит и редактирует отдельно minimum и maximum, а UI
    явно сообщает, что maximum справочный.

    ALLOWED_SCOPE:
      frontend/src/config/heatcalc-fields.default.json
      frontend/src/components/wizard/steps/TemperatureEnvironmentStep.tsx
      frontend/src/domain/heatCalcFieldRules.ts
      frontend/src/__tests__/unit/utils/heatCalcFieldRules.test.ts
      frontend/src/__tests__/integration/components/ObjectWizardDependencies.placement-visibility.test.tsx
      frontend/src/__tests__/integration/components/ObjectWizardDependencies.validation-highlight.test.tsx
      backend/app/generated/heatcalc_field_contract.py — только generated output

    NON-GOALS:
      table renderer/inline projection, electrical UI, CSS redesign,
      backend persistence/query, Excel/report, climate, formulas.

    CHARACTERIZATION:
    1. Зафиксируй, что доступен один control с общей подписью.
    2. Зафиксируй отсутствие max-ambient-temperature-input.
    3. Зафиксируй текущую валидацию ambient/process, чтобы она не изменилась.

    IMPLEMENTATION:
    - Переименуй пользовательские labels ambient_temperature в «Минимальная
      температура окружающей среды» и короткие варианты с min.
    - Добавь registry field max_ambient_temperature для pipe/tank:
      number, °C, −70…70, step 0.1, optional, без default.
    - В этом слайсе добавь поле только в form registry/sections. Не включай его
      в table registry/default_visible до ATB-03a.
    - Description/tooltip: «Справочное значение; в текущем расчёте не
      используется».
    - Покажи HeatFormField для maximum рядом с minimum.
    - Hide оба воздушных поля для underground pipe; tank не скрывать.
    - Добавь cross-field validation max >= min только при заполненном maximum.
    - Dependencies должны перевалидировать обе границы при изменении любой.
    - Не добавляй CSS, пока существующая form anatomy работает.
    - Соблюди действующий top-level registry version contract, но не меняй
      table.settings_version: table catalog меняется только в ATB-03a.
    - Перегенерируй backend contract только штатной командой:
      python3 scripts/sync-heatcalc-field-contract.py

    FOCUSED_PROOF, cwd=frontend:
      npm run test:run -- \
        src/__tests__/unit/utils/heatCalcFieldRules.test.ts \
        src/__tests__/integration/components/ObjectWizardDependencies.placement-visibility.test.tsx \
        src/__tests__/integration/components/ObjectWizardDependencies.validation-highlight.test.tsx
      npm run typecheck
      npm run lint
      npm run agent:scope -- --changed --json
      npm run agent:proof-run -- --changed
      npm run agent:proof-check -- --changed

    GENERATED_CHECK, cwd=root:
      python3 scripts/sync-heatcalc-field-contract.py --check
      git diff --check

    BROWSER_PROOF:
    - Используй Kontur Playwright MCP.
    - Viewports: 1000×768, 1280×800, 1440×900.
    - States: new pipe outdoor, existing pipe manual minimum, pipe underground,
      tank outdoor, tank underground, empty maximum, invalid max < min.
    - Проверь labels, keyboard focus, error text, clipping/overflow,
      console errors/warnings и failed network requests.

    ACCEPTANCE:
    - два однозначных accessible controls;
    - maximum optional и без default;
    - invalid max < min блокирует save;
    - current process/minimum behavior не изменён.

    COMMIT:
      feat(frontend): ATB-02b show ambient temperature bounds

---

## ATB-02c — сохранить maximum в inline form projection

    SLICE_ID: ATB-02c
    OWNER: heat/frontend
    PRECONDITION: ATB-02b committed.
    GOAL: открытие строки в inline form и сохранение другого поля не удаляет
    ранее сохранённый max_ambient_temperature.

    ALLOWED_SCOPE:
      frontend/src/utils/heatCalcInlineFormProjection.ts
      frontend/src/__tests__/unit/utils/heatCalcInlineFormProjection.temperature-bounds.test.ts
        — новый focused test
      frontend/src/__tests__/unit/utils/heatCalcInlineEdit.layers-projection.test.ts

    NON-GOALS:
      table registry/renderer/settings, видимая форма, backend, CSS,
      Excel/report.

    CHARACTERIZATION:
    1. Pipe record с maximum проходит table record→form projection и сейчас
       теряет поле.
    2. Повтори для tank.
    3. Неизвестный ключ по-прежнему должен отбрасываться explicit allowlist.

    IMPLEMENTATION:
    - Добавь max_ambient_temperature в pipe/tank projection allowlists.
    - Не заменяй allowlist broad object spread.
    - Не меняй остальные form keys, defaults и mapping semantics.

    FOCUSED_PROOF, cwd=frontend:
      npm run test:run -- \
        src/__tests__/unit/utils/heatCalcInlineFormProjection.temperature-bounds.test.ts \
        src/__tests__/unit/utils/heatCalcInlineEdit.layers-projection.test.ts
      npm run typecheck
      npm run agent:scope -- --changed --json
      npm run agent:proof-run -- --changed
      npm run agent:proof-check -- --changed
      git diff --check

    ACCEPTANCE:
    - pipe/tank maximum переживает projection;
    - неизвестные keys всё ещё отбрасываются;
    - production diff ограничен одним helper.

    COMMIT:
      feat(frontend): ATB-02c preserve ambient maximum in inline form

---

## ATB-03a — heat-таблица и сохранённые настройки

    SLICE_ID: ATB-03a
    OWNER: heat/frontend
    PRECONDITION: ATB-02c committed.
    GOAL: maximum виден по умолчанию в heat-таблице, а существующий
    пользовательский порядок/ширины колонок не сбрасываются.

    ALLOWED_SCOPE:
      frontend/src/types/calculationHeat.ts
      frontend/src/pages/heatcalc/heatCalcColumnRenderers.tsx
      frontend/src/utils/heatCalcTableColumnNormalizeModel.ts
      frontend/src/config/heatcalc-fields.default.json — только table visibility
        и labels согласованного поля
      frontend/src/__tests__/unit/pages/heatcalc/heatCalcColumnRenderers.test.tsx
      frontend/src/__tests__/unit/utils/heatCalcTableColumns.test.ts
      backend/app/generated/heatcalc_field_contract.py — только generated output

    NON-GOALS:
      filter/sort UI, confirmation step, electrical table, backend query,
      form mapping/validation, CSS, Excel/report, полный reset preferences.

    CHARACTERIZATION:
    1. Поле отсутствует в ProjectObject params typings и renderer map.
    2. Table-column test явно ожидает отсутствие maximum.
    3. Сохранённый layout текущей версии не содержит новую column в columns
       snapshot и поэтому не показывает её.
    4. Сохранённый layout с уже известной, но скрытой column должен продолжать
       уважать явный hidden state.

    IMPLEMENTATION:
    - Добавь optional maximum в frontend params type.
    - Реализуй numeric render/copy по существующему температурному паттерну.
    - Добавь table registry entry и сделай колонку default-visible для pipe и
      tank/all. До ATB-03b оставь sortable/filterable выключенными.
    - Underground pipe отображает прочерк.
    - Не добавляй maximum в electrical column registry.
    - Не повышай table.settings_version: это сбросит весь пользовательский
      layout.
    - Top-level registry version обнови по действующему source-of-truth
      контракту отдельно от table.settings_version.
    - В normalizeTableColumnSettings добавь generic catalog-evolution rule:
      default-visible column добавляется в visibleOrder только если её key
      отсутствует в raw columns snapshot. Если raw columns уже содержит key,
      отсутствие в visibleOrder означает осознанно hidden и сохраняется.
    - Тест доказывает сохранение существующих order/width/hidden settings и
      добавление только новой maximum column.
    - Перегенерируй backend contract штатным script.

    FOCUSED_PROOF, cwd=frontend:
      npm run test:run -- \
        src/__tests__/unit/pages/heatcalc/heatCalcColumnRenderers.test.tsx \
        src/__tests__/unit/utils/heatCalcTableColumns.test.ts
      npm run typecheck
      npm run agent:scope -- --changed --json
      npm run agent:proof-run -- --changed
      npm run agent:proof-check -- --changed

    GENERATED_CHECK, cwd=root:
      python3 scripts/sync-heatcalc-field-contract.py --check
      docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend \
        pytest --no-cov -q app/tests/integration/api/test_user_preferences.py
      git diff --check

    BROWSER_PROOF:
    - 1000×768 constrained, 1280×800 full, 1440×900 primary.
    - Колонки min/max видимы и различимы.
    - Локальный table scroll допустим; page-level overflow запрещён.
    - Custom order/width переживает reload; новая maximum появляется один раз.
    - После явного hide и reload maximum остаётся скрытой.
    - Console/network seal clean.

    COMMIT:
      feat(frontend): ATB-03a display ambient maximum in heat table

---

## ATB-03b — sort/filter и confirmation parity

    SLICE_ID: ATB-03b
    OWNER: heat/frontend
    PRECONDITION: ATB-03a committed.
    GOAL: maximum ведёт себя как числовая температурная колонка в настройках,
    сортировке и фильтрах; confirmation показывает обе границы.

    ALLOWED_SCOPE:
      frontend/src/utils/heatCalcPageUtils.ts
      frontend/src/components/wizard/steps/ConfirmStep.tsx
      frontend/src/config/heatcalc-fields.default.json — только включение
        sortable/filterable для согласованной maximum column
      frontend/src/__tests__/unit/utils/heatCalcPageUtils.test.ts
      frontend/src/__tests__/unit/pages/HeatCalcPage.settings.columns.test.tsx
      frontend/src/__tests__/unit/components/wizard/ConfirmStep.temperature-bounds.test.tsx
        — новый focused test

    NON-GOALS:
      registry redesign, backend, form mapping/validation, electrical table,
      CSS, Excel/report.

    CHARACTERIZATION:
    1. Column filter model не классифицирует maximum как number.
    2. Confirmation summary показывает только minimum.
    3. Existing minimum sort/filter/summary остаётся контрольной веткой.

    IMPLEMENTATION:
    - Добавь maximum в numeric column set без изменения query keys.
    - Включи sortable/filterable в существующей table entry.
    - Настройки колонок должны показывать разные min/max labels.
    - Confirmation показывает maximum только при непустом значении.
    - Для underground pipe maximum не показывается.
    - Не вводи новый shared helper, если достаточно локальных существующих
      presentation contracts.

    FOCUSED_PROOF, cwd=frontend:
      npm run test:run -- \
        src/__tests__/unit/utils/heatCalcPageUtils.test.ts \
        src/__tests__/unit/pages/HeatCalcPage.settings.columns.test.tsx \
        src/__tests__/unit/components/wizard/ConfirmStep.temperature-bounds.test.tsx
      npm run typecheck
      npm run agent:scope -- --changed --json
      npm run agent:proof-run -- --changed
      npm run agent:proof-check -- --changed
      git diff --check

    BROWSER_PROOF:
    - 1280×800 и 1440×900.
    - Column settings search находит отдельно minimum и maximum.
    - Range filter 0 не трактует как empty.
    - Sort asc/desc корректно размещает empty values по действующему контракту.
    - Confirmation не обрезает labels; console/network clean.

    COMMIT:
      feat(frontend): ATB-03b align ambient maximum table controls

---

## ATB-04 — Excel и project CSV round-trip

    SLICE_ID: ATB-04
    OWNER: heat/interchange
    PRECONDITION: ATB-01 и ATB-02b committed.
    GOAL: экспорт, шаблон и импорт различают minimum/maximum и остаются
    совместимыми со старыми файлами.

    ALLOWED_SCOPE:
      backend/app/services/excel_import_service.py
      backend/app/services/project_io_service.py
      backend/app/tests/unit/services/test_excel_import_helpers.py
      backend/app/tests/integration/api/test_import_excel.py
      backend/app/tests/unit/services/test_project_io_helpers.py
      backend/app/tests/integration/api/test_project_io.py
      один существующий XLSX fixture только при доказанной необходимости

    NON-GOALS:
      formula/core, climate workbook, UI, report, schema migration,
      переименование внутренних ключей.

    CHARACTERIZATION:
    1. Экспорт сейчас содержит только общий T° среды.
    2. Импорт явного максимума сейчас игнорирует его.
    3. Project CSV round-trip не сохраняет maximum.
    4. Зафиксируй ноль, пустую ячейку, отрицательное значение и max < min.

    IMPLEMENTATION:
    - Новые канонические заголовки:
      «Мин. T° окр. среды» и «Макс. T° окр. среды».
    - Старые aliases «T° среды», «Т° среды», «температура среды» продолжают
      означать minimum.
    - Добавь aliases старого исторического maximum header, если они уже были
      публичными.
    - Empty maximum не получает 0/30; числовой 0 сохраняется.
    - Invalid max < min возвращает field-aware import error и не меняет формулу.
    - Project CSV сохраняет optional maximum без обязательного schema bump.
      Если bump действительно нужен, остановись с доказательством совместимости.
    - Export→import должен вернуть те же params и те же heat results.

    FOCUSED_PROOF, cwd=root:
      docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend \
        pytest --no-cov -q \
        app/tests/unit/services/test_excel_import_helpers.py \
        app/tests/integration/api/test_import_excel.py \
        app/tests/unit/services/test_project_io_helpers.py \
        app/tests/integration/api/test_project_io.py
      scripts/formula-qa.sh quick
      git diff --check

    ARTIFACT_PROOF:
    - Используй spreadsheets skill и его штатный render/recalc workflow.
    - Проверь созданный XLSX визуально: headings, widths, number formats,
      empty/zero/negative values.
    - Временные артефакты не оставляй в корне.

    ACCEPTANCE:
    - старый файл импортируется как раньше;
    - новый min/max round-trip без потери;
    - расчётный результат неизменен.

    COMMIT:
      feat(heatcalc): ATB-04 round-trip ambient bounds in project files

---

## ATB-05 — границы в HTML/PDF-отчёте

    SLICE_ID: ATB-05
    OWNER: reports
    PRECONDITION: ATB-01 committed.
    GOAL: пользовательский отчёт раздельно показывает minimum и maximum,
    не утверждая, что maximum участвовал в расчёте.

    ALLOWED_SCOPE:
      backend/app/reports/templates/report.html
      ближайший report presentation helper только при необходимости
      backend/app/tests/integration/api/test_reports.py
      backend/app/tests/integration/api/test_report_no_mixing.py
      backend/app/tests/unit/api/test_reports_helpers.py

    NON-GOALS:
      formula/core, report calculation values, UI form/table, Excel/CSV,
      изменение состава ER.

    CHARACTERIZATION:
    1. Все релевантные pipe/tank sections сейчас имеют одну ambient column.
    2. Empty value и numeric zero должны различаться.
    3. Underground pipe не должен показывать stale air maximum.

    IMPLEMENTATION:
    - Замени неоднозначный heading на minimum и добавь соседний maximum.
    - Maximum number форматируется тем же температурным formatter.
    - Empty/N/A выводится прочерком, zero — 0.
    - Для maximum добавь краткую legend/note «справочное, в расчёте не
      используется», если table context без неё создаёт двусмысленность.
    - Обнови все повторяющиеся canonical report sections, не только первый.
    - Не меняй formula result columns и итоговые мощности.

    FOCUSED_PROOF, cwd=root:
      docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend \
        pytest --no-cov -q \
        app/tests/integration/api/test_reports.py \
        app/tests/integration/api/test_report_no_mixing.py \
        app/tests/unit/api/test_reports_helpers.py
      git diff --check

    VISUAL_PROOF:
    - Используй pdf skill.
    - Сгенерируй HTML/PDF для pipe и tank с заполненным maximum, пустым
      maximum, zero и underground pipe.
    - Отрендери страницы в PNG и проверь headings, clipping, wrapping,
      column alignment и отсутствие наложений.
    - Временные файлы — в /private/tmp или датированной audit-папке.

    COMMIT:
      feat(reports): ATB-05 show ambient temperature bounds

---

## ATB-QA — сквозная регрессия и browser seal

    SLICE_ID: ATB-QA
    OWNER: qa
    PRECONDITION: ATB-03b, ATB-04 и ATB-05 committed.
    GOAL: доказать на одном HEAD полный пользовательский round-trip и
    неизменность расчётов. Production-код не менять.

    ALLOWED_SCOPE:
      e2e/tests/ambient-temperature-bounds.spec.ts
      при необходимости один ближайший e2e helper с тем же owner
      docs/audit/<current-date>-ambient-temperature-bounds/snapshot.md
      docs/audit/<current-date>-ambient-temperature-bounds/browser/*

    NON-GOALS:
      frontend/src, backend/app production, исправление посторонних baseline
      failures, документация ответа клиенту, mobile CSS.

    E2E CONTRACT:
    1. Создать outdoor pipe: minimum из климата, maximum пуст.
    2. Ввести maximum, сохранить, закрыть, открыть снова.
    3. Убедиться, что обе колонки видны по умолчанию.
    4. Проверить max < min: доступное сообщение и отсутствие save.
    5. Проверить max = min: допустимо.
    6. Перевести pipe в underground: воздушные controls скрыты, table/report
       показывают N/A.
    7. Проверить tank outdoor и tank underground: maximum сохраняется.
    8. Сравнить heat result до/после изменения только maximum — все formula
       values идентичны.
    9. Export/import одного объекта сохраняет обе границы.

    FOCUSED_PROOF, cwd=e2e:
      PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
      E2E_BASE_URL=http://127.0.0.1:3003 \
        npx playwright test \
        tests/ambient-temperature-bounds.spec.ts \
        --reporter=list
      npx playwright test --list tests/ambient-temperature-bounds.spec.ts

    CALCULATION_PROOF, cwd=root:
      scripts/formula-qa.sh quick
      docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend \
        pytest --no-cov -q \
        app/tests/unit/services/test_heat_contract.py \
        app/tests/integration/api/test_object_query.py \
        app/tests/integration/api/test_import_excel.py \
        app/tests/integration/api/test_reports.py

    FRONTEND PROOF, cwd=frontend:
      npm run agent:scope -- --changed --json
      Выполни рассчитанный required proof для E2E/test-only diff.
      Full dual-safe — NOT RUN, если пользователь не запросил явно.

    BROWSER MATRIX:
    - Kontur Playwright MCP, 1000×768, 1280×800, 1440×900.
    - States: empty, filled, invalid, reopened, underground pipe, tank.
    - Проверить geometry, локальный table overflow, focus order, accessible
      names, console errors/warnings, failed network requests.
    - Mobile/tablet — N/A.

    SNAPSHOT:
    - Запиши HEAD, UTC time, environment, точные команды и результаты.
    - Динамические counts/timings только в snapshot.
    - Не копируй их в plan, README или нормативные документы.

    COMMIT:
      test(e2e): ATB-QA seal ambient temperature bounds

---

## ATB-DOC — закрыть answers и методическую трассировку

    SLICE_ID: ATB-DOC
    OWNER: docs
    PRECONDITION: ATB-QA committed и green snapshot существует.
    GOAL: документация сообщает клиенту реализованный контракт и не обещает
    участия maximum в формулах.

    ALLOWED_SCOPE:
      answers/05-ambient-temperature-bounds/README.md
      answers/05-ambient-temperature-bounds/screenshots/*
      answers/heat-loss-quality-tz-assessment.md
      answers/README.md
      docs/tech-debt.md
      answers/05-ambient-temperature-bounds/plan.md — только статус/ссылки

    NON-GOALS:
      production/test code, формулы, climate methodology, ACTIVE frontend
      backlog, правка динамических counts вне audit snapshot.

    IMPLEMENTATION:
    - Статус README: реализовано на точном commit из ATB-QA.
    - Готовый ответ клиенту пишет:
      minimum участвует в расчёте; maximum виден, редактируется и справочный.
    - Замени baseline screenshots на актуальные desktop screenshots формы и
      heat-таблицы. Не используй mobile evidence.
    - В assessment отметь закрытие traceability gap max_ambient_temperature,
      не пересчитывая и не копируя динамический score в нормативный текст.
    - В tech-debt закрой вопрос видимости/хранения. Оставь отдельным открытым
      вопрос климатического максимума/формулы тёплого периода.
    - Не утверждай, что formula использует maximum.
    - Ссылки на plan, prompts и QA snapshot должны быть рабочими.

    PROOF, cwd=root:
      rg -n \
        "не принимаем|верхняя граница появится вместе|max_ambient_temperature" \
        answers/05-ambient-temperature-bounds \
        answers/heat-loss-quality-tz-assessment.md \
        docs/tech-debt.md
      scripts/codex-functional-audit.sh docs
      git diff --check

    MANUAL REVIEW:
    - README не противоречит Case page 23/27 и climate algorithm.
    - Все screenshots соответствуют текущему HEAD и desktop viewport.
    - Нет новых dynamic totals/timings вне dated audit snapshot.
    - docs/frontend/refactor-backlog.md не изменён.

    COMMIT:
      docs(answers): ATB-DOC close ambient temperature bounds
