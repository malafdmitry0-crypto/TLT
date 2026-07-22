# Frontend AGENTS.md

Короткий вход для UI/React задач. Детали: `docs/architecture/frontend-agent-architecture.md`.

## Стек

React 18 · Vite · TypeScript · Ant Design 5 · Zustand · TanStack Query v5 · Axios · Vitest/RTL · Playwright (e2e/)

## Слои (направление зависимостей)

```text
routes → pages/*Page (shell)
       → pages/<domain> (hooks + pure *Model)
       → components/<domain> | common | layout
       → api | store | domain | utils | types | config | constants
```

- `api/` — HTTP DTO и query keys, **без** UI-state.
- `store/` — только глобальное: auth, current project, ER selection, header.
- TanStack Query — серверное состояние.
- `domain/` — field registries (не формулы).
- Расчёты **не** на клиенте (`CALC-001`).

## Where to edit

| Задача | Первые файлы |
|---|---|
| Путь URL | `src/routes/routes.ts` |
| Тепло: страница/таблица/Excel | `pages/HeatCalcPage.tsx`, `pages/heatcalc/`, `components/heatcalc/`, `utils/heatCalc*` |
| Тепло: форма объекта | `components/wizard/` + `utils/objectWizardUtils.ts` (`UNIT-001`) |
| Электро: страница/ЭР/batch/candidates | `pages/ElecCalcPage.tsx`, `pages/electrical/` |
| Электро: presentational grids | `components/electrical/` |
| Спецификация | `pages/SpecificationPage.tsx`, `components/specification/` |
| Отчёт | `pages/ReportPage.tsx`, `components/reports/` |
| Auth / project | `hooks/useAuth.ts`, `store/*`, `api/auth.ts`, `api/projects.ts` |
| Admin | `pages/admin/`, `api/admin.ts` |
| Справочники client | `api/references.ts`, `api/referenceQueries.ts` |

Локальные правила:

- `src/pages/electrical/AGENTS.md`
- `src/pages/heatcalc/AGENTS.md`
- `src/components/wizard/AGENTS.md`

## Инварианты UI

| ID | Правило |
|---|---|
| `UNIT-001` | Форма мм → API м (`objectWizardUtils`) |
| `CALC-001` | Нет клиентских формул тепло/электро |
| `ER-001` | Scope ЭР = UUID; number только compatibility |
| `ER-002` | Spec/report с тем же UUID |
| `QK-001` | После mutation — точечный invalidate |
| `WIZ-001` | Islands wizard не пересекаются |

## Структура `src/` (факт)

```text
api/           HTTP + query keys
components/    UI (common, layout, heatcalc, electrical, wizard, …)
config/        feature flags, default JSON field layouts
constants/     labels, roles, object types
domain/        heat/electrical field registries
hooks/         cross-page hooks (auth, project, heat mutations, excel helpers)
pages/         route shells + feature namespaces heatcalc/ electrical/ admin/
routes/        ROUTES + ProtectedRoute
store/         zustand
types/         DTOs
utils/         pure helpers (prefix: heatCalc*, electrical*, objectWizard*)
__tests__/     unit + integration (зеркало областей)
```

## Зависимости — нельзя

| Запрет | Почему |
|---|---|
| `pages/heatcalc` ↔ `pages/electrical` | разные safe-split контуры |
| Shared god-hook Heat+Elec | скрытые регрессии |
| Import `components/*` → `pages/*` | inverted; legacy allowlist чистить |
| Новые string routes | только `ROUTES` |
| Править `InsulationLayersTable` «заодно» | protected island |

## Команды

```bash
cd frontend
npm run typecheck
npm test -- --run                                 # all vitest
npm test -- --run src/__tests__/unit/pages/heatcalc
npm test -- --run src/__tests__/unit/pages/electrical
npm run test:architecture                         # heat↔elec + wizard islands
npm run lint
```

Из корня: `make test-frontend`, `make lint-frontend`.

Layout/CSS-изменения: зелёный unit ≠ UI proof — см. `codex-docs/testing.md` (UI Proof Gate).

## God shells — как резать

| Shell | Namespace | Ledger / prompt |
|---|---|---|
| `HeatCalcPage.tsx` | `pages/heatcalc/` | `docs/playbooks/heatcalc-page-decomposition-prompts.md` |
| `ElecCalcPage.tsx` | `pages/electrical/` | `docs/playbooks/eleccalc-page-decomposition-prompts.md` |
| `SpecificationPage.tsx` | (пока flat) | extract pure models first |

Один safe-split slice за проход: characterization test → extract → focused suite → ledger.

## Тесты

| Изменение | Минимум |
|---|---|
| Pure `*Model.ts` | unit рядом в `__tests__/unit/pages/...` |
| Hook feature | unit hook + integration page если wire-up |
| Wizard island / CSS | `test:wizard-isolation` / `test:architecture` |
| Feature boundary heat↔elec | `test:architecture` |
| Route/guard | `routes` + ProtectedRoute tests |
| E2E flow | `e2e/tests/` (отдельный package) |
