# Frontend: архитектура, удобная для AI-агентов

**Актуально на:** 2026-07-22  
**Владелец:** frontend / multi-agent workflow  
**Связано:** `codex-docs/agent-readable-architecture.md`, `frontend/AGENTS.md`

## Цель

Агент должен за **≤10 минут** для любой UI-задачи:

1. найти точку входа (route → page → model/hook → API);
2. не трогать чужой остров/домен;
3. знать один канонический источник единиц/ER/расчётов;
4. запустить **одну** документированную команду проверки.

## Снимок текущего состояния (2026-07-22)

### Размер

| Область | Файлы | LOC (примерно) | Роль |
|---|---:|---:|---|
| `pages/` | 121 | ~25k | route shells + feature models/hooks |
| `components/` | 75 | ~14k | presentational UI |
| `utils/` | 33 | ~6.6k | pure helpers (часто domain-prefixed) |
| `hooks/` | 12 | ~1.9k | cross-page hooks |
| `api/` | 12 | ~1.8k | HTTP clients + query keys |
| `domain/` | 4 | ~1k | field registries (heat/electrical) |
| `types/` | 7 | ~1k | DTO / view types |
| `store/` | 4 | ~0.3k | Zustand (auth, project, variant, header) |

### God-route shells (после partial decomposition)

| Файл | LOC | Feature-namespace | Тесты unit |
|---|---:|---|---:|
| `pages/ElecCalcPage.tsx` | ~1936 | `pages/electrical/` (77 files) | ~73 |
| `pages/HeatCalcPage.tsx` | ~1046 | `pages/heatcalc/` (26 files) | ~21 |
| `pages/SpecificationPage.tsx` | ~1005 | (ещё flat) | мало |
| `components/wizard/ObjectWizard.tsx` | ~776 | islands + isolation | architecture gate |

Декомпозиция **уже начата** (safe-split ledgers в `docs/playbooks/*decomposition*`), но:

- route shells всё ещё оркестрируют слишком много;
- `utils/` — плоский dump с префиксами имён вместо папок;
- inverted dependency: `components/electrical/*` импортирует pure models из `pages/electrical/*` (~5 мест);
- нет публичных `index.ts` feature-границ;
- import boundaries enforced **только** для wizard islands;
- `frontend/CLAUDE.MD` устарел относительно `pages/electrical|heatcalc` и `domain/`.

### Что уже хорошо для агентов

| Паттерн | Где | Почему помогает |
|---|---|---|
| Pure `*Model.ts` | `pages/electrical/elecCalc*.ts` | легко unit-тестить без React |
| Colocated hooks | `pages/heatcalc/useHeatCalc*.ts` | задача локализуется в namespace |
| Wizard islands + FIX errors | `components/wizard/isolation/` | нарушение ловится тестом с actionable message |
| Domain field registry | `domain/heatCalcFields.ts` | единая схема полей таблицы/формы |
| Query keys module | `api/electricalQueryKeys.ts` | стабильные keys для invalidate |
| `ROUTES` single source | `routes/routes.ts` | нет magic path strings |
| Domain-prefixed utils | `utils/heatCalc*`, `utils/electrical*` | поиск `rg heatCalc` / `rg electrical` |

## Целевая модель (без массового move)

Полный переезд в `features/` **не делаем** одним PR. Сначала делаем границы **видимыми**, затем двигаем код только при работе над фичей.

```text
route (pages/*Page.tsx)
  → feature orchestration (pages/<domain>/use* + *Model)
    → api/* + query keys
    → presentational components/<domain>/
    → pure adapters (units, DTO) with tests
```

### Слои и разрешённые зависимости

```text
routes ──► pages (shell)
pages  ──► pages/<domain>  (models, hooks)
pages  ──► components/<domain>
pages  ──► hooks/  api/  store/  domain/  utils/  types/  config/  constants/

pages/<domain> ──► api/ store/ domain/ utils/ types/ config/ constants/
pages/<domain> ──► components/<domain>   (UI only)
pages/<domain> ✗ pages/<other-domain>
pages/<domain> ✗ components of other domain (кроме common/layout)

components/* ──► types/ constants/ utils/ domain/ form-controls/ common/
components/* ✗ pages/*          ← inverted; legacy exceptions documented
components/* ✗ api/* (предпочтительно; data через props)

api/* ──► types/ only (+ client)
store/* ──► types/ only
domain/* ──► types/ config/ constants/ (pure)
utils/* ──► types/ constants/ (pure; no React if name has Model/Engine)
```

### Feature islands (логические, не обязательно `features/`)

| Island | Route shell | Models/hooks | UI | Utils prefix |
|---|---|---|---|---|
| heat-loss | `HeatCalcPage.tsx` | `pages/heatcalc/` | `components/heatcalc/`, `wizard/` | `heatCalc*`, `objectWizard*` |
| electrical | `ElecCalcPage.tsx` | `pages/electrical/` | `components/electrical/` | `electrical*` |
| specification | `SpecificationPage.tsx` | (extract later) | `components/specification/` | — |
| reporting | `ReportPage.tsx`, `ReportWizardPage.tsx` | — | `components/reports/` | — |
| projects/auth | `HomePage`, `LoginPage`, `ProjectsPage` | `hooks/useAuth`, `useProject` | `layout/` | — |
| admin | `pages/admin/` | — | `components/admin/` | — |

Правило: **не** создавать shared abstraction между heat и electrical без отдельного finding (см. decomposition playbooks).

### Целевые файлы навигации (этап 1 — сейчас)

```text
AGENTS.md                              # корневой вход ≤150 строк
frontend/AGENTS.md                     # карта фронта + where-to-edit
frontend/src/pages/electrical/AGENTS.md
frontend/src/pages/heatcalc/AGENTS.md
frontend/src/components/wizard/AGENTS.md
docs/domains/heat-loss.md
docs/domains/electrical.md
docs/domains/specification.md
docs/domains/reporting.md
docs/architecture/frontend-agent-architecture.md  # этот файл
```

### Этап 2 — проверяемые границы (следующий)

1. Architecture test: `components/**` не импортирует `pages/**` (allowlist legacy).
2. Architecture test: `pages/electrical/**` не импортирует `pages/heatcalc/**` и наоборот.
3. Public barrel `pages/electrical/public.ts` (типы + pure models, которые UI имеет право брать) — по мере чистки inverted deps.
4. `make check-frontend-electrical` / `check-frontend-heat` — focused vitest globs.
5. Стабильные ID инвариантов (`UNIT-001`, `ER-004`) в тестах + доменных картах.

### Этап 3 — постепенные vertical slices

- Дальше резать `ElecCalcPage` / `HeatCalcPage` / `SpecificationPage` только safe-split slices.
- При касании модуля: вынести pure helper + characterization test + ledger update.
- Не переименовывать папки ради «красоты features/».

## Инварианты, которые агент обязан знать (frontend)

| ID | Правило | Где смотреть |
|---|---|---|
| `UNIT-001` | Форма: мм; API/формулы: м | `utils/objectWizardUtils.ts` |
| `CALC-001` | Расчёты только на backend | `api/calculations.ts`, services |
| `ER-001` | Публичный scope ЭР — UUID; number 1…5 — compatibility | `types/electricalVariant.ts`, electrical pages |
| `ER-002` | Spec/report scope = тот же UUID ЭР, что calc | `api/specifications.ts`, `api/reports.ts` |
| `AUTH-001` | Данные scoped по role/session; UI guard ≠ security | `store/authStore`, backend tests |
| `QK-001` | Mutation инвалидирует явные query keys | `api/electricalQueryKeys.ts` и аналоги |
| `WIZ-001` | Wizard islands не импортируют/не стилизуют друг друга | `components/wizard/isolation/` |

## Where to edit (быстрый индекс)

| Задача | Touch first | Do not |
|---|---|---|
| Поля теплоформы / layout heat fields | `HeatCalcObjectFieldsPanel` + CSS island | Insulation table «заодно» |
| Таблица слоёв изоляции | **только** по явному запросу | `InsulationLayersTable` |
| Таблица SC-03 / Excel mode | `pages/heatcalc/*`, `utils/heatCalc*`, `components/heatcalc/` | ElecCalc |
| UUID ЭР tabs / assignment | `ElectricalVariantTabs`, `ElectricalAssignmentPanel`, models | invent new slot model |
| Batch electrical / candidates | `pages/electrical/useElecCalc*`, pure models | duplicate backend formulas |
| Колонки electrical table | `utils/electricalTableColumns.ts` + renderers | hardcode columns in page |
| Query / filters electrical | `elecCalcQueryModel.ts` | ad-hoc request shape in JSX |
| API path / DTO | `api/*`, `types/*` | fetch outside `api/` |
| Route path | `routes/routes.ts` only | string literals |
| Глобальный auth/project | `store/*`, `hooks/useAuth` | localStorage ad-hoc |

## Метрики понятности

| Метрика | Цель |
|---|---|
| Стартовых docs для UI-задачи | ≤3 (`AGENTS.md` → `frontend/AGENTS.md` → domain/local) |
| Время до точки изменения | ≤10 мин |
| Источник истины на контракт | 1 |
| Focused check command per domain | 1 |
| Cross-domain imports heat↔electrical | 0 |
| components→pages imports | 0 (после allowlist cleanup) |

## Чего не делать

- Не писать ещё один полный пересказ `CLAUDE.MD`.
- Не mass-move в `features/` без изменения поведения.
- Не shared-utils между Heat и Elec «на будущее».
- Не править protected wizard islands без прямого запроса.
- Не дублировать формулы на клиенте.
- Не считать зелёный unit достаточным UI-proof для layout-изменений.
