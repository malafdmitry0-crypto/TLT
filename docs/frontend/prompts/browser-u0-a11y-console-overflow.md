# Промпт: починить browser U0 (a11y + console + overflow)

**Статус:** executable residual (product acceptance)  
**Актуально на:** 2026-07-26  
**Не отключать gate’ы.** Цель — **зелёный** desktop browser seal, не ослабление checks.

**Binding evidence (что краснело):**  
[docs/audit/2026-07-26-agent-metrics-refresh/snapshot.md](../../audit/2026-07-26-agent-metrics-refresh/snapshot.md)  
**HEAD evidence:** `452ec99` (после него есть partial fix `5cecc4b` — **не считать закрытым без re-seal**).

**Product scope:** desktop `>=1000 px` (primary QA `1440×900`). Mobile `<1000` — out of scope.

---

## Копируй в агент

```text
Ты чинишь browser acceptance на frontend TLT. Gate’ы НЕ отключать и НЕ ослаблять.

## Что чинить (три независимых fail)

1) A11y (axe critical)
   - Было: aria-allowed-attr — aria-required="true" на неверном DOM
     (div[data-testid="placement-select"] и insulation temperature-basis Select shell).
   - Правило: aria-required / aria-invalid только на role=combobox (или native control),
     не на wrapper div.
   - Уже был partial fix: frontend/src/components/form-controls/TltSelect.tsx
     (перенос attrs на inner combobox) + unit FormControls.test.tsx.
   - Твоя работа: re-verify на live guest Heat; найти ЛЮБЫЕ оставшиеся critical;
     починить root cause (TltSelect / Ant Select wrappers / form-controls), не disable axe.

2) Console (0 warnings/errors на happy path)
   - Было на /workspace/heat-calc:
     "Instance created by `useForm` is not connected to any Form element.
      Forget to pass `form` prop?"
   - Partial fix: InsulationTemperatureRangeField forceRender + Form form={...}.
   - Твоя работа: открыть heat guest path, поймать ВСЕ console warn/error
     (не только useForm). Искать orphan Form.useForm() без смонтированного <Form form={...}>,
     static antd message/Modal (должен быть appMessage/appModal из @/feedback/appFeedback).
   - Не глотать warning через filter в тесте — чинить production code.

3) Overflow (page_overflow_px === 0)
   - Было: /workspace на 1000/1280/1440/1920 — FAIL overflow 2px.
   - Partial fix: workspace-page.css contain Row gutter + WorkspacePage class.
   - Твоя работа: re-measure /workspace на 4 desktop viewports; если >0 — найти
     элемент (Ant Row gutter, 100%+padding, min-width) и починить CSS owner файла.
   - Не «прятать» через overflow:hidden на body, если это маскирует layout bug
     без измерения scrollWidth.

## Жёсткие правила

- Читать frontend/AGENTS.md и docs/frontend/agent-development-standard.md.
- Один vertical slice: browser U0 seal (shared/layout/form-controls owner).
- Characterization first: unit/integration на TltSelect aria + form connect + workspace layout.
- Не трогать formulas/API/query keys/routes без необходимости.
- Не any / @ts-ignore / рост architecture baseline.
- Не отключать a11y/console/overflow gates, не повышать пороги, не skip в CI.
- Toast/confirm только appMessage/appModal.
- Desktop only; не чинить mobile 390 как product requirement.

## Порядок работы

Phase 0 — baseline (обязательно, на текущем HEAD, не на старом audit):
  1. git status; не трогать чужой WIP.
  2. Поднять frontend (docker :3003 или npm run dev — что принято в репо).
  3. Guest login happy path.
  4. Снять на 1440×900 (минимум) и ideally matrix 1000/1280/1440/1920:
     - / 
     - /workspace
     - /workspace/heat-calc
     - /ui-kit (sanity)
     Для каждого: page_overflow_px, console warn+error count, failed network.
  5. Desktop a11y (axe) guest Heat (и Electrical если успеешь): list critical/serious.
  6. Записать baseline в docs/audit/YYYY-MM-DD-browser-u0-seal/snapshot.md
     (HEAD, UTC, commands, raw counts). Если уже всё green — STOP, report PASS, no code.

Phase 1 — fix only red items from Phase 0:
  - A11y: fix combobox/required attrs; extend FormControls / relevant unit tests.
  - Console: connect form instances or destroy unused useForm; no static antd message.
  - Overflow: fix workspace (and any new overflow routes) in owner CSS; no global hacks.
  - Keep diffs small; one owner per file set.

Phase 2 — proof:
  - Focused unit tests for touched controls.
  - npm run test:agent-gates
  - Browser re-seal same matrix as Phase 0:
      overflow == 0 on all listed routes/viewports
      console warn+error == 0
      axe critical == 0 on guest Heat (serious: fix if cheap, else document residual)
  - Update audit snapshot: before/after table, PASS/FAIL.

## Definition of Done (все must)

- [ ] Не отключены и не ослаблены a11y / console / overflow gates
- [ ] /workspace overflow 0 px на 1000×768, 1280×800, 1440×900, 1920×1080
- [ ] /workspace/heat-calc: 0 console warnings/errors (guest, after load + light interact)
- [ ] Guest Heat: 0 axe critical
- [ ] test:agent-gates green
- [ ] audit snapshot with HEAD + evidence (screenshots or MCP report paths)
- [ ] Report: what was still red after 5cecc4b, what you fixed, residual if any

## Out of scope

- Full keyboard-operable product / WCAG AA everywhere
- Mobile <1000 a11y/layout
- DoD wall ≤120s
- Type-checked ESLint
- Disabling Kontur/Playwright acceptance checks

## Commands (adapt to local stack)

cd frontend
npm run agent:scope -- src/components/form-controls/TltSelect.tsx
npm run agent:scope -- src/pages/WorkspacePage.tsx
npm run test:agent-gates
# focused tests after edits, e.g.:
npx vitest run src/__tests__/unit/components/FormControls.test.tsx --project unit

# Browser: use Kontur/Playwright MCP or project harness against running app
# Measure overflow / console / a11y; do not mark done without live proof.
```

---

## Для человека (кратко)

| Симптом | Смысл | Fix, не disable |
|---|---|---|
| a11y red | кривой ARIA у Select | attrs на combobox / kit |
| console red | useForm / antd noise | подключить Form / appFeedback |
| overflow red | страница шире окна | CSS owner, gutter |

Partial code уже в `5cecc4b`. Промпт заставляет **переизмерить** и добить residual, а не «выключить проверки».
