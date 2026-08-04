# Case 1 — browser/E2E regression protocol

- HEAD: `ca8805e`
- Recorded: `2026-08-03T23:46:04Z`
- Target: local Docker stack, frontend `http://127.0.0.1:3003`, API `http://127.0.0.1:8000`
- Product code changed: no
- Browser evidence: `kontur_playwright` isolated Chrome; repository Playwright with system Chrome
- Required viewports: MCP `1440x1000` and `390x844`; focused repository layout test uses its canonical desktop `1440x900` and mobile `390x844`

## Preflight

`docker compose ps` showed healthy `frontend`, `backend`, `db`, and `redis`; worker was running.

Mandatory browser smoke:

- `kontur_playwright browser_tabs(action=list)`: PASS, browser available.
- in-app browser bootstrap: unavailable with `privileged native pipe bridge is not available; browser-client is not trusted`; no fallback claim was made because `kontur_playwright` worked.

Static UI command:

```bash
/Users/dmalafey/.codex/plugins/cache/personal/kontur-ui-quality/0.1.0+codex.20260719195723/scripts/run-static-ui-checks.sh /Users/dmalafey/Desktop/TLT
```

Result: FAIL in frontend lint before browser acceptance:

- `frontend/src/pages/electrical/useElecCalcCableMarkOptions.tsx:43:3`: unused `ttCables`.
- `frontend/src/pages/electrical/useElecCalcCableMarkOptions.tsx:47:3`: unused `aggressiveProduct`.

## MCP state matrix

| State | Viewport | Result | Geometry / runtime evidence |
|---|---:|---|---|
| Home | 1440x1000 | PASS visually | Login card and all actions visible; screenshot captured. |
| Home | 390x844 | **FAIL** | `scrollWidth=475`, `clientWidth=390`, page overflow `+85 px`; all 6 action buttons span `x=-47..437`. |
| Guest help | 1440x1000 | **FAIL copy**, PASS geometry | No horizontal overflow; 1 visible control inside viewport. Runtime confirms stale claims “до 30 дней”, “до 50 на проект”, “Пользователь”, and “Создайте проект”. |
| Guest help | 390x844 | **FAIL copy**, PASS geometry | `scrollWidth=clientWidth=390`; no control outside viewport. Same stale copy. |
| Guest heat empty | 1440x1000 | PASS geometry | `scrollWidth=clientWidth=1440`; 47 visible controls, 0 outside. |
| Guest heat empty | 390x844 | **FAIL** | Page itself reports no horizontal scroll, but 13 visible controls are clipped/outside viewport, reaching `right=698`; examples: disabled “Пол”, Next, name, selects, insulation thickness, electrical inputs. |
| Electrical no-ER | 1440x1000 | PASS | Honest “ЭР пока нельзя создать”; 10 visible controls, 0 outside; no page overflow. |
| Electrical no-ER | 390x844 | PASS for reached empty state | Same honest readiness state; 10 visible controls, 0 outside; no page overflow. |
| Specification no-ER | 1440x1000 | PASS | Honest “ЭР ещё не создан”; navigation CTA visible; 10 controls, 0 outside. |
| Specification no-ER | 390x844 | PASS for reached empty state | 10 controls, 0 outside; no page overflow. |
| Electrical assigned calculation, desktop | **Handled failure reached** | Valid pipe and ER were created, assignment moved to Samreg, batch job accepted. First calculation correctly surfaced missing `steam_temperature_c`; after filling `T проп.=150` and `T3=80`, it correctly surfaced missing `winding_pitch_mm`. This proves the runtime error path, not a successful cable selection. |

Console/network across MCP scenarios:

- Console: 0 warnings, 0 errors (3 total informational messages).
- Observed dynamic requests: guest session `201`; project/electrical/specification reads `200`; electrical batch jobs `202`; electrical query reads `200`.
- No failed dynamic network request was observed.

## Focused repository Playwright

Layout command:

```bash
cd e2e
E2E_BASE_URL=http://127.0.0.1:3003 \
E2E_API_BASE=http://127.0.0.1:8000 \
PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
npx playwright test tests/layout-regression.spec.ts \
  --grep 'guest workspace flow has no layout regressions — (desktop|mobile)' \
  --reporter=list \
  --output=/private/tmp/tlt-case1-browser-e2e-2026-08-04/playwright-layout
```

Result: **1 passed, 1 failed** in 13.8 s.

- desktop `1440x900`: PASS across guest heat, electrical, specification, and report.
- mobile `390x844`: FAIL at guest heat before later routes. Six exact outside-viewport assertions were reported: “Пол”, object name, placement select, insulation-temperature-basis select, insulation-thickness wrapper, and insulation-thickness input.

Critical-path command:

```bash
cd e2e
E2E_BASE_URL=http://127.0.0.1:3003 \
E2E_API_BASE=http://127.0.0.1:8000 \
PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
npx playwright test \
  tests/elec-calculation.spec.ts \
  tests/phase5-specification-proof.spec.ts \
  tests/phase5-actionable-close.spec.ts \
  --grep '(после расчёта объекта показывает марку кабеля|5\.1 guest opens specification controls at desktop width|5\.13 CSV v3 export)' \
  --reporter=list \
  --output=/private/tmp/tlt-case1-browser-e2e-2026-08-04/playwright-critical
```

Result: **2 passed, 1 failed** in 9.3 s.

- PASS: specification controls open for initialized ER at desktop width (`5.1`).
- PASS: guest CSV v3 export → re-import trust roundtrip (`5.13`).
- FAIL before electrical calculation: shared `createCalculatedPipe` E2E setup expected `201` but received `422`. Exact response: `{"detail":"Forbidden pipe heat params: insulation_material, insulation_thickness"}`. The helper still posts removed legacy flat insulation keys instead of `insulation_layers`; this is harness drift and affects many heat/electrical specs. It does not by itself prove a production electrical formula defect.

The first non-escalated layout attempt was blocked by sandbox localhost policy (`connect EPERM 127.0.0.1:8000`); the command was rerun with localhost access and the result above is authoritative.

## Screenshots and traces

Repository screenshots:

- `home-desktop-1440x1000.png`
- `home-mobile-390x844-overflow.png`
- `guest-help-desktop-1440x1000.png`
- `guest-help-mobile-390x844.png`
- `guest-heat-empty-desktop-1440x1000.png`
- `guest-heat-empty-mobile-390x844-clipped.png`
- `electrical-empty-desktop-1440x1000.png`
- `electrical-empty-mobile-390x844.png`
- `specification-no-er-desktop-1440x1000.png`
- `specification-no-er-mobile-390x844.png`
- `electrical-input-required-desktop-1440x1000.png`

All are in this directory. Failure screenshot/video/trace bundles are under:

- `/private/tmp/tlt-case1-browser-e2e-2026-08-04/playwright-layout/`
- `/private/tmp/tlt-case1-browser-e2e-2026-08-04/playwright-critical/`

## Untested / not green

- Full E2E suite and full frontend DoD: NOT RUN.
- Populated specification output, preflight conflict modal, “Исправить” navigation/highlight, section placement, and honest per-section empty copy: NOT RUN in the browser.
- Successful electrical cable selection: NOT PROVEN because the shared E2E fixture is stale and the manual representative object stopped at the handled `winding_pitch_mm` validation.
- Electrical Glide DnD/keyboard, candidate selector, stale transitions, manual mark, cable options, per-row recalc, and max-5 ER lifecycle: NOT RUN.
- Guest UI-driven file download/upload roundtrip: NOT RUN; only the repository API-backed Playwright CSV v3 roundtrip passed.
- Loading, retry, forced network failure, long populated tables/identifiers, and concurrent guest load/NFR: NOT RUN.
- Mobile routes after heat in the repository layout spec are NOT RUN because the spec stops at the first heat-layout assertion; their no-ER empty states were covered separately by MCP.

## Regression decision

Browser/E2E status on the **recorded run** was **RED**.

### Errata 2026-08-04 (product platform — permanent)

**Мобильной версии нет.** См. `docs/frontend/viewport-policy.md` §0.

| Recorded finding | Acceptance status after errata |
|---|---|
| Home `390×844` overflow | **N/A** — not a release blocker |
| Guest heat `390×844` clipped controls | **N/A** — not a release blocker |
| Layout mobile `390×844` FAIL | **N/A** — out of case 1 contract |
| Desktop layout / critical paths | Still count toward gate |

**In-scope release issues from this slice (desktop / product):** stale guest-help copy (later fixed on `01bcdf4`), failing static lint, and a stale shared E2E pipe fixture that blocks broad electrical/heat regression. Desktop empty states were largely PASS.

Recalculated readiness (desktop-only):
[`../reassessment-desktop-only.md`](../reassessment-desktop-only.md).
