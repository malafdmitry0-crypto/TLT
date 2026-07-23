# Frontend TLT: план достижения agent-friendly 9/10

**Статус:** COMPLETE

**Актуально на:** 2026-07-24

**Текущая рабочая оценка:** 8.6/10 автономно; 9.1/10 при обязательном входе
через документацию; guardrails — 9.2/10

**Цель:** не менее 8.5/10 автономно и 9.0/10 в guided workflow без redesign и
изменения бизнес-контрактов

> Electrical recovery (`AF9-ELEC-REG-01`) и последующие checklist items
> закрыты. Исторический recovery snapshot `46/57 failed` больше не baseline.

Этот файл — конечный checklist одной инициативы, а не второй общий стандарт и
не библиотека task prompts. Постоянные правила находятся в
[стандарте](./agent-development-standard.md), размер slice — в
[PR budget](./pr-budget.md), шаблон выполнения — в
[мастер-промпте](./agent-refactor-prompt.md), а автономная очередь —
в [refactor-backlog.md](./refactor-backlog.md).

При явной команде выполнить этот план берётся один первый незакрытый пункт с
учётом зависимостей. Для каждого пункта используется мастер-промпт с его
`SLICE_ID`; соседний cleanup в тот же slice не добавляется.

## 1. Проверенный snapshot

Это point-in-time evidence текущего рабочего дерева, а не новый норматив.
Числа пересчитываются в `AF9-FINAL`; старый snapshot не используется как
baseline для повышения лимитов.

| Область | Состояние на 2026-07-24 (AF9-FINAL) |
|---|---|
| Fast gate | `npm run test:agent-gates` — green ×2 (~16 s ≤ 30 s) |
| Unit | 223 files / 1067 tests — green |
| Electrical integration | 7 owners / 57 tests — green ×2 (~43 s ≤ 90 s) |
| Full integration / DoD | `test:agent-dod` green ×2 (~185–216 s ≤ 5 min) |
| Production TS/TSX | 367 файлов; 107 находятся в `pages/electrical` |
| Крупные production-файлы | 16 файлов больше 500 LOC |
| Dependency architecture | allowlists пусты; cycles — 0 |
| CSS | 9047 LOC; `!important` — 0; raw colors вне tokens — 0 |
| Direct Ant usage | 126 production importers (ratchet shrink-only) |
| Ant primitive ratchet | shrink-only baseline green |
| Public UI-kit barrel | Heat unsaved + Electrical compare actions on kit |
| JSX inline styling | 517 classified occurrences (runtime/static/third-party); shrink-only gate |
| Coordinate-based layout | 117 classified heat/wizard coords; shrink-only gate |
| Container queries | 0 |
| Непрозрачные shell props | 0 `Record<string, any>` на AF9 shell targets |
| Broad casts | 27 production escapes; type-escape ratchet shrink-only |
| Electrical presentation input | 6 consumer-owned groups (`core/table/candidate/catalog/settings/modals`) |
| Electrical model context | `useElecCalcWorkspaceModel.tsx` 32 imports (import-context hotspot) |
| Test topology | 223 unit specs; integration + elec-integration projects; Storybook 10 |
| Electrical integration hotspot | 7 specs ≤700 LOC + setup env; no 4k monolith |
| CI | `frontend-dod` + demo `user-flows` jobs present |
| TypeScript artifact | `tsconfig.tsbuildinfo` untracked (`*.tsbuildinfo` ignored) |

Residual risks (FILE / EVIDENCE / OWNER / NEXT DECISION):

1. `ReportPage.test.tsx` / intermittent export wait under load / report /
   keep focused re-run on flake, do not weaken assertion.
2. Browser matrix evidence beyond architecture constants + existing e2e
   viewport specs / `viewportLayoutMatrix.json` + e2e heat layout /
   frontend / optional dedicated Playwright matrix run for release.
3. 16 files >500 LOC / complexity ratchet / owners / continue extraction
   outside AF9 only when product slice requires.

Оценка разделена намеренно:

- **autonomous** — насколько безопасно действовать по репозиторию без устного
  контекста;
- **guided** — насколько безопасно действовать после чтения обязательного
  entrypoint и стандартов;
- **guardrails** — насколько хорошо автоматические проверки запрещают
  незаметный возврат уже закрытого долга.

## 2. Что должно измениться

| Направление | Сейчас | Критерий 9/10 |
|---|---|---|
| Correctness signal | fast gate green при красном Electrical contract | один обязательный DoD локально и в CI |
| Контекст тестов | один Electrical spec около 4058 LOC | use-case specs до 700 LOC с общим harness |
| Props и presentation contracts | `Record<string, any>`, broad casts, 58-field input | explicit consumer-owned contracts без escape casts |
| Локальная понятность | production-файл может иметь 32 imports | новый контекст ограничен; старый только уменьшается |
| UI policy | ratchet есть, но выбранные простые Ant primitives остаются | два узких migrations уменьшают baseline |
| CSS/layout policy | запреты на `!important` и raw colors исполняются; inline и coordinate debt не классифицированы | machine-checkable shrink-only policy |
| Runtime proof | отдельные browser audits есть, матрица не связана с финальной приёмкой | единая matrix на `1000/1280/1440/1920` CSS px |
| Feedback time | монолитный integration spec медленный | focused ≤30 s; полный frontend DoD ≤5 min |

## 3. Приоритетный checklist

### P0 — вернуть правдивый зелёный сигнал

- [x] **AF9-ELEC-REG-01 — закрыть Electrical regression.** (`93144a6`)

  Typed `WorkspacePresentationSource` (no `any`); presentation wiring restored.
  Proof 2026-07-24: `ElecCalcPage` 57/57 ×2; integration 168/168; unit 1067;
  agent-gates + build green. Browser matrix residual → AF9-QA later.

- [x] **AF9-CI-01 — сделать full frontend DoD обязательным CI job.**

  Job `frontend-dod` in `.github/workflows/ci.yml` runs
  `cd frontend && npm run test:agent-dod` as the only DoD step.

- [x] **AF9-CI-02 — включить repository user flows в demo CI.**

  `build-and-smoke` runs `scripts/codex-functional-audit.sh user-flows` after
  layout + accessibility against the demo stack.

### P1 — сделать тестовый feedback локальным и быстрым

- [x] **AF9-TEST-HARNESS-01 — выделить общий Electrical integration harness.**

  Test-only slice: общие render/setup, query/store reset, API fixtures и
  user helpers получают именованные контракты. Каждый helper/fixture файл
  ≤500 LOC; production не меняется; все 57 tests сохраняют прежние assertions.

- [x] **AF9-TEST-SPLIT-01 — разделить `ElecCalcPage.test.tsx` по use cases.** (`46c24ca`)

  Только после harness. Семь owners:

  1. shell, variants и polling;
  2. main table, pagination, batch и copy;
  3. catalog, recalculation и manual selection;
  4. candidate folders и candidate table;
  5. results и settings;
  6. Glide и modal actions;
  7. cable metadata, source label и inline editing.

  Acceptance: имена и смысл всех 57 cases сохранены, assertions не ослаблены,
  каждый spec ≤700 LOC, любой focused spec ≤30 s, все Electrical integration
  specs ≤90 s на текущем QA host в двух последовательных запусках.

- [x] **AF9-TEST-NOISE-01 — локализовать ожидаемый ErrorBoundary noise.** (`7a50a4b`)

  Ожидаемый `console.error` подавляется только внутри тестов, которые намеренно
  проверяют error boundary. Глобальный mock console и фильтрация неизвестных
  ошибок запрещены; unexpected console output продолжает падать.

### P2 — сузить типовой и dependency context

- [x] **AF9-TYPE-HEAT-TOOLBARS-01 — типизировать `HeatCalcPageToolbarsProps`.**

  Заменить `Record<string, any>` на explicit data/events contract; не
  переносить Heat behavior и не добавлять broad casts.

- [x] **AF9-TYPE-HEAT-OVERLAYS-01 — типизировать `HeatCalcPageOverlaysProps`.**

  Разделить modal state и events явными props; сохранить focus, close и
  unsaved-changes semantics.

- [x] **AF9-TYPE-SPEC-CHROME-01 — типизировать `SpecPageChromeProps`.**

  Props-in/events-out без `any`, нового feature barrel или изменения
  generate/export workflow.

- [x] **AF9-TYPE-ELEC-MODALS-01 — типизировать `ElecCalcWorkspaceModalsProps`.**

  Выполнять только после `AF9-ELEC-REG-01`; сохранить modal lifecycle,
  selection identity и recalculation semantics.

- [x] **AF9-ELEC-CONTRACT-01 — разделить Electrical presentation input.**

  Плоский 58-field source заменить шестью consumer-owned группами:
  `core`, `table`, `candidate`, `catalog/recalculation`, `settings`, `modals`.
  На границе mapper/assembly не остаётся `any`, `as never` или
  `as unknown as`; query, UUID, persistence и calculation semantics неизменны.

- [x] **AF9-CONTEXT-GATE-01 — добавить import-context ratchet.**

  Для нового production-файла предел — 20 imports. Файлы выше предела получают
  точный shrink-only baseline: добавление import или stale завышенный limit
  падает с `FILE / CURRENT / LIMIT / FIX`.

- [x] **AF9-TYPE-GATE-01 — запретить новый type escape debt.**

  Architecture gate отклоняет новые `as unknown as`, `as never`,
  `@ts-ignore` и локальное отключение `no-explicit-any`. Допустимы только
  зарегистрированные third-party adapters с owner/reason; baseline не растёт
  и удаляет stale entries.

- [x] **AF9-ARTIFACT-01 — убрать TypeScript build artifact из Git.**

  `frontend/tsconfig.tsbuildinfo` перестаёт отслеживаться, соответствующий
  pattern игнорируется, а typecheck/build не оставляют dirty tree.

### P3 — сделать UI и layout policy исполняемой

- [x] **AF9-INLINE-01 — классифицировать JSX inline styling.**

  Все текущие 491 occurrences распределить без mass rewrite:
  `runtime geometry`, `third-party adapter`, `static debt`. Результат —
  reviewable machine-readable baseline с owner и reason, а не ещё один prose
  allowlist.

- [x] **AF9-INLINE-02 — включить shrink-only AST gate.**

  Новый статический `style`/`styles` в production запрещён. Разрешены
  документированные runtime geometry и CSS custom properties; stale entries
  удаляются, общий baseline не растёт.

- [x] **AF9-INLINE-03 — убрать первый static inline island из `FormulasPage`.**

  Один owner, без redesign: перенести только классифицированные static styles в
  component-owned CSS и удалить соответствующие baseline entries в том же
  slice.

- [x] **AF9-LAYOUT-01 — классифицировать coordinate-based layout.**

  Разобрать 84 occurrences по owner и назначению: structural shell,
  third-party grid adapter или domain-field placement. Не объявлять всё debt
  только по совпадению строки.

- [x] **AF9-LAYOUT-02 — запретить новые координаты доменных полей.**

  PostCSS/architecture gate отклоняет новые `grid-row`, `grid-column`, `order`,
  layout-dependent `:has()` и child-index selectors для form fields.
  Structural shell и зарегистрированный vendor adapter проверяются отдельными
  узкими правилами.

- [x] **AF9-LAYOUT-03 — мигрировать одну Heat form section.**

  Один independently testable section переходит на semantic flow и
  form-layout primitives; старые координаты удаляются в том же slice.
  Проверяется также узкий container/resizable pane, а не только viewport.

- [x] **AF9-UI-02 — мигрировать Heat unsaved-change actions на UI-kit.**

  Только `HeatCalcUnsavedChangesModals` и ближайший test: прямой Ant `Button`
  заменяется существующим public UI-kit API. Accessible names, loading,
  disabled, focus и modal geometry сохраняются; primitive baseline уменьшается.

- [x] **AF9-UI-03 — мигрировать Electrical compare actions на UI-kit.**

  Только `ElecCalcCandidateCompareBar` и ближайший test; выполнять после
  `AF9-ELEC-REG-01`. Сохранить keyboard/focus и candidate behavior, уменьшить
  primitive baseline, не добавлять feature props в UI-kit.

- [x] **AF9-VIEWPORT-01 — закрепить глобальную layout regression matrix.**

  App shell и затронутые Heat/Electrical/Specification workflows проверяются
  при `1000×768`, `1280×800`, `1440×900`, `1920×1080` CSS px. `390×844` и
  `768×1024` запускаются только для responsive/mobile slices и не заменяют
  desktop proof. Assertions покрывают geometry, overflow, clipping, focus,
  console и failed requests по [viewport policy](./viewport-policy.md).

### P4 — доказать итог, а не объявить его

- [x] **AF9-FEEDBACK-01 — удержать feedback budget.** (`c575dce` + measured)

  На текущем QA host два последовательных запуска: fast gate ≤30 s
  (~15.9 / ~15.6 s), полный `test:agent-dod` ≤5 min (~215.8 / ~185.3 s).
  Tests не удалялись и не переводились в необязательные ради метрики.

- [x] **AF9-FINAL — провести независимую приёмку 9/10.**

  Docs-only audit с текущего HEAD пересчитывает все значения раздела 1.
  Acceptance одновременно:

  - targeted Electrical, integration и full DoD green дважды;
  - CI green для DoD, user flows, layout и accessibility;
  - dependency allowlists, cycles, `!important` и raw colors остаются нулевыми;
  - type/import/inline/layout/UI-kit ratchets не выросли и не имеют stale
    entries;
  - обязательная browser matrix имеет geometry/overflow/focus/console/network
    evidence;
  - autonomous score ≥8.5 и guided score ≥9.0 по той же методике;
  - каждый остаточный риск имеет `FILE / EVIDENCE / OWNER / NEXT DECISION`.

  План `COMPLETE`. Recovery prompt остаётся в `docs/frontend/` как historical
  evidence (или может быть перенесён в archive отдельным docs slice).

## 4. Порядок выполнения

```text
AF9-ELEC-REG-01
  ├─→ AF9-CI-01 ─→ AF9-CI-02
  ├─→ AF9-TEST-HARNESS-01 ─→ AF9-TEST-SPLIT-01 ─→ AF9-TEST-NOISE-01
  ├─→ AF9-TYPE-ELEC-MODALS-01 ─→ AF9-ELEC-CONTRACT-01
  └─→ AF9-UI-03

Heat/Spec type slices ────────────────┐
AF9-CONTEXT-GATE-01 / TYPE-GATE-01 ──┤
AF9-INLINE-01 ─→ INLINE-02 ─→ INLINE-03
AF9-LAYOUT-01 ─→ LAYOUT-02 ─→ LAYOUT-03
AF9-UI-02 ────────────────────────────┤
AF9-ARTIFACT-01 / VIEWPORT-01 ───────┤
                                      └─→ AF9-FEEDBACK-01 ─→ AF9-FINAL
```

Несвязанные owners могут планироваться независимо, но один агентский запуск
всё равно выполняет один vertical slice. Electrical production files не
изменяются параллельно с recovery. Gate slice не «исправляет» найденный feature
debt массово: он фиксирует truthful shrink-only baseline, а burn-down идёт
следующими owner slices.

## 5. Контракты будущих slices

Изменение этого документа не меняет runtime API. Планируемая форма внутренних
интерфейсов:

- shell props — explicit named data/events, без `Record<string, any>`;
- Electrical presentation input — шесть consumer-owned групп вместо плоского
  объекта на десятки зависимостей;
- test harness — именованные scenario builders и state reset, без hidden
  global state;
- dynamic geometry — typed CSS custom properties либо зарегистрированный
  adapter; статическое оформление принадлежит component CSS;
- form layout — semantic DOM flow; viewport отвечает за workspace, container
  отвечает за reflow вложенной формы.

Во всех slices неизменны публичные HTTP payloads, routes, query
keys/invalidation, formulas, units, permissions, тексты workflow и ER UUID
semantics. Их изменение требует отдельной продуктовой задачи и не считается
частью agent-friendly initiative.

## 6. Как запускать пункт без копирования prompt

1. Выбрать первый незакрытый `SLICE_ID` с выполненными dependencies.
2. Открыть [мастер-промпт](./agent-refactor-prompt.md).
3. Подставить цель, точный owner, acceptance и invariants из одного пункта
   checklist.
4. Пересчитать его локальные before-метрики; snapshot выше не использовать как
   разрешение повысить baseline.
5. Выполнить characterization, focused proof, полный DoD и browser proof,
   которые требует стандарт.
6. После production commit обновить checkbox и before→after отдельным
   docs-only commit по стандартному backlog protocol.

## 7. История уже выполненных работ

Эта таблица сохраняет происхождение текущей архитектуры, но не является
очередью и не содержит повторных prompts.

| Исторический slice | Результат | Commit / статус |
|---|---|---|
| QG-01 | EditableTableCell token backgrounds | `a42fd2a` |
| QG-02 | ReportPage green ×3, production не менялся | доказательство без commit |
| QG-03 | `test:agent-dod` | `5352636` |
| DEP-01 | `@ant-design/cssinjs` объявлен напрямую | `945fa04` |
| ARCH-01 | truthful shrink-only complexity | `2018f1c` |
| LINT-01 | flat ESLint, 0 errors/warnings | `0a2dc72` |
| CMP-01 | Electrical model ≤400 и presentation map | `7b235e3`; acceptance повторно открыта из-за regression |
| CMP-02 | Specification form-state extract | `7b235e3` |
| UI-01 | Ant primitive policy ratchet | `7b235e3` |
| UI-02/03 | была добавлена только policy; migrations не выполнялись | pending выше |
| CSS-01 | `elec-workspace.css` 1001→604 + summary island | `7b235e3` |
| CSS-02 | Heat field chrome split core/residual | `7b235e3` |
| QA/FINAL | прежняя приёмка аннулирована красным integration | выполнить заново |

## 8. Что не требуется для 9/10

- переписывать frontend или менять framework;
- массово переносить код в новый namespace;
- убрать все прямые импорты Ant Design;
- оборачивать complex vendor widgets ради метрики;
- сделать каждый production-файл меньше 300 LOC;
- внедрять новую styling technology;
- выполнять redesign или менять пользовательские сценарии.

9/10 означает, что агент быстро находит owner, меняет ограниченный контекст,
получает правдивый локальный и CI feedback и не может незаметно вернуть закрытый
долг.
