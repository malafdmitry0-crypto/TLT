# God Components Safe Split Nightly Prompt

Этот prompt предназначен для ночного запуска Codex в агентском режиме. Цель -
подготовить безопасную декомпозицию одного выбранного god-component:
`HeatCalcPage` или `ElecCalcPage`, не меняя бизнес-поведение без доказательств.

## Как запускать

Скопируй блок ниже в Codex agent mode из корня репозитория.

```text
Работай в режиме /fix-focused, но максимально консервативно. Цель:
подготовить безопасное разделение одного выбранного god-component, не меняя
бизнес-поведение.

TARGET_PAGE:
- Выбери ровно один target для этого запуска: HeatCalcPage или ElecCalcPage.
- Если пользователь не указал target явно, выбери тот компонент, где первый
  безопасный slice требует меньшего diff и лучше покрывается существующими
  тестами.
- Второй компонент не редактируй и не покрывай новыми тестами в этом запуске;
  можно только кратко упомянуть его как out-of-scope в финальном отчете.

ВАЖНО:
- Сначала прочитай AGENTS.md и обязательные документы из него.
- Не делай широкий рефакторинг.
- Не переписывай архитектуру целиком.
- Не меняй формулы, expected/golden values, API-контракты или units без
  независимого источника правды.
- Не ослабляй assertions ради green tests.
- Не удаляй существующий код без доказательства, что он больше не используется.
- Не делай git commit.
- Если появляется риск сломать поведение, остановись и оформи finding.
- Если тест/Playwright/browser недоступен, это blocked, а не pass.

Scope:
1. Только TARGET_PAGE.
2. Только подготовка к безопасному split:
   - characterization tests;
   - выявление state clusters;
   - минимальное извлечение pure helper/hook/component только если есть
     тестовое покрытие;
   - доказательство, что UI/API поведение не изменилось.

Change budget:
- максимум 1 production module extracted;
- максимум 1 page file edited;
- максимум 2 test files edited;
- не создавать shared abstraction для Heat и Elec;
- не менять второй god-component;
- если нужно больше файлов, остановись и оформи next safe slice.

Обязательный старт:
Прочитай:
- codex-docs/README.md
- codex-docs/project-map.md
- codex-docs/requirements-map.md
- codex-docs/testing.md
- codex-docs/business-formula-contracts.json
- formules.md
- coefficients.MD
- docs/context/formulas-summary.md
- docs/playbooks/formula-validation-agent.md
- docs/api.md
- docs/analysis/business-rules.md
- docs/srs.md
- docs/tz-compliance.md
- relevant docs/qa/*

Затем через rg найди:
- TARGET_PAGE implementation
- API calls TARGET_PAGE
- hooks/services/helpers, которые они используют
- tests для выбранного heat/electrical flow
- Playwright/e2e tests
- formula contracts and result persistence paths

Перед любыми правками составь короткую карту:
Документация -> backend -> frontend -> tests

Phase 1: Audit and Safety Map
Составь таблицу только для TARGET_PAGE:
- файл и размер;
- количество useState/useEffect/useMemo/useCallback;
- API calls;
- calculation submit path;
- persistence/reload path;
- result rendering path;
- diagnostics/error path;
- modals/tabs/table/grid state;
- candidates/selection state;
- known tests.

Phase 2: Characterization Tests First
Добавь или усили focused tests, которые фиксируют текущее поведение TARGET_PAGE.
Не добавляй тесты для второго god-component.

Если TARGET_PAGE = HeatCalcPage, используй эти test cases:
- initial render без проекта/с проектом;
- загрузка существующих параметров;
- submit формирует payload в правильных units;
- результат расчета отображается без потери diagnostics;
- formula_id/source/version/error_code сохраняются или проходят через flow,
  если это предусмотрено контрактом;
- validation error не отправляет некорректный payload;
- backend error показывает UI error и не затирает старый валидный результат;
- successful save -> reload показывает тот же выбранный result;
- unsupported/outdated/error result не смешивается с successful result;
- ручное изменение input обновляет только ожидаемые derived fields;
- boundary values для ключевых расчетных параметров;
- metamorphic case: увеличение входного параметра, который должен монотонно
  увеличивать результат, действительно не уменьшает результат;
- snapshot/screenshot целевого viewport до refactor.

Если TARGET_PAGE = ElecCalcPage, используй эти test cases:
- initial render таблицы/строк;
- добавление строки;
- удаление строки;
- reorder/перемещение строки, если поддерживается;
- стабильные row ids после edit/reload;
- candidate selection меняет только выбранную строку;
- payload содержит правильные units;
- batch calculation частично успешен: successful/error/unsupported не
  смешиваются;
- validation errors привязаны к правильной строке;
- save -> reload сохраняет selected candidate;
- повторный submit идемпотентен для неизмененных данных;
- фильтры/поиск/пагинация candidates не ломают selection;
- diagnostics/error_code отображаются и сохраняются;
- large-ish table case: минимум 50-100 строк, проверить отсутствие очевидного
  full re-render/timeout, если есть существующая инфраструктура;
- screenshot before/after целевого viewport.

UI/layout checks:
- no horizontal scroll в рабочем сценарии;
- no text clipping;
- no overlapping controls;
- buttons not accidentally disabled;
- table/grid selection visible;
- error messages readable;
- screenshots before/after for any touched UI.

Backend/API checks, если flow затрагивается:
- payload shape;
- units;
- roles/errors;
- persistence;
- reload;
- DB invariants после UI сценария.

Phase 3: Minimal Refactor Only If Tests Pass
Если characterization tests для TARGET_PAGE добавлены и проходят, можно сделать
только один маленький refactor.

Preferred safe extraction order:
1. pure payload builder / mapper;
2. pure result normalizer;
3. validation helper;
4. small presentational component with props only;
5. narrow hook for one workflow.

Rules for extraction:
- Не меняй names/API shape без необходимости.
- Не объединяй Heat и Elec abstractions преждевременно.
- Не создавай один giant hook вместо giant component.
- Не протаскивай десятки props; если получается слишком много props,
  остановись и напиши finding.
- Один PR-sized vertical slice максимум.
- После extraction все tests должны пройти.
- Для UI changes обязательны screenshots before/after.

Suggested first extraction:
- For HeatCalcPage target: extract pure submit payload builder or result diagnostics
  normalizer.
- For ElecCalcPage target: extract pure row/candidate selection mapper or payload
  builder.
Выбери тот вариант, где меньше side effects и проще доказать неизменность
поведения.

Commands to run:
- rg-based discovery commands as needed.
- scripts/formula-qa.sh quick if formulas/calculation mapping touched.
- scripts/test.sh frontend for frontend tests.
- scripts/test.sh backend-unit or backend-int if backend/API persistence
  touched.
- relevant Playwright/e2e for touched user flow.
- scripts/codex-functional-audit.sh db-invariants after UI scenario if UI flow
  persists data.
- scripts/codex-functional-audit.sh layout if layout/UI touched.
- scripts/codex-functional-audit.sh contracts if formula/API/UI mapping
  touched.

Stop Conditions:
Stop and report blocked/needs verification if:
- docs and code disagree;
- no reliable test harness exists for the touched behavior;
- Playwright/browser screenshots are required but unavailable;
- expected/golden values would need changing without source of truth;
- refactor requires touching unrelated files broadly;
- extraction creates worse coupling or giant prop chains;
- required change exceeds the Change budget;
- persistence/reload cannot be verified;
- formula_id/version/source/error_code traceability cannot be verified where
  required.

Final report format:

Functional Accuracy Report
Scope: <TARGET_PAGE> safe split preparation
Docs checked:
- ...
Implementation found:
- Backend: ...
- Frontend: ...
- Tests: ...
Changes made:
- ...
Verification:
- Command: ...
- Result: pass/fail/not run
Screenshots:
- before: ...
- after: ...
Findings:
- ...
Residual risk:
- ...
Recommended next safe slice:
- ...
Out of scope:
- The other god-component was not changed in this run.
```

## Почему prompt ограничен

Для этих страниц опасен широкий запрос "раздели оба компонента": агент может
получить набор больших hooks вместо доказуемого улучшения. Этот prompt
заставляет выбрать один target, сначала зафиксировать поведение, затем делать
только один маленький vertical slice и явно останавливаться при нехватке
evidence.
