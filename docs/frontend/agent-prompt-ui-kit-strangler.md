# Промпт агента: UI kit strangler (реальный экран)

Копировать в agent mode. Цель — один safe-split slice, не big-bang.

---

## Полный промпт

```text
Ты senior frontend engineer в проекте TLT (React 18 + Vite + TS + Ant Design + Zustand + TanStack Query).

## Контекст
- UI kit УЖЕ есть: `frontend/src/components/ui-kit/`
  - Public API только из `@/components/ui-kit` (barrel `index.ts`)
  - Поля: CompactField, CompactFieldGrid, TltNumberField, TltSelect, TltTextField
  - Примитивы: TltButton, TltBadge, TltAlert, TltCard, TltEmptyState, TltSkeleton, TltTable, TltTabs
  - Витрина: `/ui-kit` → `pages/UIKitPage.tsx`
- Эталон плотности форм — HeatCalc dual-form SC-03:
  - control height 26px
  - label 8.5px / weight 600 / track 98px
  - number 12px, unit 9px, select value 9px
  - padding inline 3px, radius 2px
  - gaps: column 10px, row 4px
  - tracks: num 4rem, name 7.5rem, climate 8.75rem, tm 8rem
  - tokens: `--tlt-field-*`
- e2e parity: `e2e/tests/ui-kit-heatcalc-parity.spec.ts`
- Runtime Heat всё ещё: Ant Form + `heat-object-fields` island + `.inline-object-form`
- НЕ создавать второй kit / layout kit / shared abstraction Heat↔Elec
- Планы: `docs/frontend/README.md` и соседние md

## Цель этого прогона
Один safe-split slice: продвинуть UI kit на РЕАЛЬНЫЙ экран (не showcase), без смены бизнес-логики и API.

Primary target (выбери ОДИН):
A) HeatCalc form — секция geometry (или следующий немигрированный блок) → CompactField / CompactFieldGrid
B) Если A blocked: ElecCalc params/toolbar chrome на kit primitives (кнопки/alert), БЕЗ ER/batch логики

По умолчанию: A.

## Hard rules
1. git status --short в начале. Не трогай dirty unrelated files.
2. Не меняй формулы, API contracts, units (mm form → m API), ER UUID semantics.
3. Не трогай InsulationLayersTable / insulation CSS без явного запроса.
4. ui-kit не знает pages/heat/electrical.
5. components/* не импортирует pages/* (не расширяй allowlist).
6. heat ↛ electrical и наоборот.
7. styles.css — FREEZE: только delete/move; новые стили в ui-kit или Component.css.
8. Числа плотности только через var(--tlt-field-*).
9. Не mass-move в features/. Не rewrite ObjectWizard целиком.
10. Не коммить, если не просили.

## Budget (строго)
- max 1 page/shell file
- max 2 production helper/CSS files
- max 2 test files
- Если нужно больше — STOP и Recommended next slice

## Обязательный старт
1. docs/frontend/README.md, rewrite-plan.md, llm-friendly-style.md
2. frontend/src/components/ui-kit/index.ts + compact-fields.css
3. heat-object-fields.css + heatcalc form owner files
4. e2e/tests/ui-kit-heatcalc-parity.spec.ts
5. git status --short

## План
1. Characterization (RTL/unit + e2e parity).
2. Минимальный блок полей → CompactFieldGrid flow=columns maxRowsPerColumn=5
   controlWidth=var(--tlt-field-ctrl-*)
3. Сохрани Form names/values/validation, mm↔m, visibility matrix.
4. Не дублируй CSS; удали только явные дубли в styles.css если безопасно.
5. Proof:
   cd frontend && npm test -- --run src/__tests__/unit/components/UIKitLibrary.test.tsx
   + relevant heat tests
   cd e2e && E2E_BASE_URL=http://127.0.0.1:3003 PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
     npx playwright test tests/ui-kit-heatcalc-parity.spec.ts
   + focused heat form e2e if layout touched
6. E2E unavailable → blocked, not pass.

## DoD
- [ ] Реальный экран использует kit для slice
- [ ] Нет регрессии API/units/validation
- [ ] Parity e2e green (или blocked)
- [ ] styles.css не вырос
- [ ] Import new UI only from @/components/ui-kit
- [ ] Отчёт: files, migrated, proof, residual risk, next slice

## Anti-goals
- Не layout kit, не Glide→kit, не ElecCalc/Spec «заодно»
- Не rewrite styles.css, не ослаблять assertions

Начни с git status и чтения. Один slice. Stop if budget exceeded.
```

---

## Короткая версия

```text
/fix-focused. TLT frontend.

Goal: one strangler slice — migrate HeatCalc geometry fields to @/components/ui-kit
(CompactFieldGrid + CompactField + Tlt*), keep Form/API/units identical.

Rules: no InsulationLayersTable; no styles.css growth; no Heat↔Elec shared;
budget ≤1 shell + 2 prod + 2 tests; characterization first.
Read docs/frontend/*.md first.

Proof: UIKitLibrary tests + e2e ui-kit-heatcalc-parity + focused heat form if needed.
Report: changes, proof, next slice. No commit unless asked.
```
