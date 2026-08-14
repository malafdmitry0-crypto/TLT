# Client feedback 09–20 — final verification snapshot

**Functional result:** **PASS — 12/12 пунктов закрыты целевыми regression guards и acceptance-проверками.**

**Repository gate:** **RED / PARTIAL** — full backend, full frontend, Storybook strict и общий E2E имеют подробно перечисленные failures; они не замаскированы как green.

**HEAD:** `85ef43c029051127adb91ec6178b74dc26962b18`

**Published:** `origin/main` = `85ef43c029051127adb91ec6178b74dc26962b18`

**AF UTC window:** `2026-08-14T20:01:12Z` — `2026-08-14T20:26:28Z`

**Worktree:** clean до full run, после full run и перед созданием этого snapshot.

## Environment

| Item | Value |
|---|---|
| Host | `dmitrys-MacBook-Pro.local`, macOS Darwin 23.6.0, arm64 |
| Host Node / npm | `v23.5.0` / `10.9.2` |
| Host Python | `3.14.6` |
| Docker / Compose | `29.6.2` / `v5.3.1` |
| Backend container | healthy, Python `3.11.16`, pytest `9.0.3` |
| Frontend container | healthy, Node `v20.20.2` |
| DB / Redis | PostgreSQL 16-alpine / Redis 7-alpine, healthy |

Full suites started on the same clean HEAD before the mid-run publication request.
The HEAD was then pushed, `origin/main` was verified equal to local HEAD, and the
remaining browser acceptance continued without code changes.

## Slice commits

| Slice | Commit | Outcome |
|---|---|---|
| Plan / prompts | `6757c6c` | committed |
| CFB-00 | `357b326` | E2E settings locator aligned |
| CFB-01 | `c8649cd` | pending generation context survives F5/ER route |
| CFB-02 | `cab2b29` | catalog selection survives confirmation |
| CFB-03 | `e486294` | zero-contributing ER is blocked, not confirmable |
| CFB-04 | `587b64c` | generation outcomes route to mutually exclusive UI states |
| CFB-05a | `e45ee76` | safe Russian generation diagnostics |
| CFB-05b | `85ef43c` | remaining user-visible backend jargon removed |
| CFB-06 | `d3ef296` | group update validates atomically |
| CFB-07 | `72ead1c` | opt-in non-clamping number drafts |
| CFB-08 | `a3f3bb9` | Heat range feedback blocks invalid mutation |
| CFB-09 | `ff9dbae` | structured Heat field errors use human labels |
| CFB-10 | `4de5a42` | coefficient PUT is update-only |

Two intervening Heat cleanup commits, `de99c45` and `a68b133`, are present in
the tested HEAD but are not CFB slices.

## Affected-scope proof

| Command | Exit | Result |
|---|---:|---|
| AF frontend focused, 9 exact files from `prompts.md` | 0 | **9 files / 136 tests PASS** |
| CFB-05b focused (`SpecPageChrome.kit` + options sync model) | 0 | **2 files / 41 tests PASS** |
| CFB-09 focused (formatter + canonical model + wizard integration) | 0 | **3 files / 45 tests PASS** |
| AF backend focused: preflight rules/service/readiness, generation service, group ops, persist-invalid guard | 0 | **52 PASS** |
| AF coefficient unit + API integration, `-k coefficient` | 0 | **11 PASS** |
| Ruff on all changed backend production paths | 0 | **PASS** |
| Standalone frontend production build | 0 | **PASS**, 3853 modules; existing chunk-size warning |

The affected CFB nodeids are not among the full-suite failures below.

## Full frontend gate

Command:

```text
cd frontend
npm run test:agent-dod:dual-safe
```

Result: **exit 1**, `112.80s`.

| Phase | Result |
|---|---|
| typecheck | PASS, 9.21s |
| lint | PASS, 8.47s |
| S0 agent tests | PASS, 27 files / 101 tests |
| CSS architecture | PASS, 4 files / 12 tests |
| unit | FAIL, 278 files passed; 5 failed / 1316 passed tests |
| integration | one failure emitted, then stopped by fail-fast |
| build inside orchestrator | NOT RUN because suites failed |

The exact quiet diagnostic rerun used the four failing files and reproduced
**6 failed / 19 passed** in 28.38s:

1. `HeatCalcPage.actions` — background progress text not found.
2. `HeatCalcPage.actions` — point recalculation enqueue mock had 0 calls.
3. `HeatCalcPage.actions` — all-objects enqueue mock had 0 calls.
4. `heatCalcInlineEdit.draft-errors` — expected `{}`, received required
   `wind_speed` error.
5. `heatCalcInlineEdit.layers-projection` — `DraftRowValidationError` during
   3→2 layer projection.
6. `ObjectWizardDependencies.layout-defaults` — still expects
   `max-ambient-temperature-input`, removed by the intervening
   `de99c45` cleanup.

The first five had already reproduced during earlier broad slice gates, but
there is no accepted dated baseline waiver for them. They remain open full-gate
failures. The sixth also reproduces outside dual-safe concurrency and is a stale
test contract, not a concurrency-only failure.

Standalone `npm run build` passed after the fail-fast orchestrator skipped its
build phase.

## Full backend gate

Command:

```text
docker exec \
  -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  -w /app heatcalc_backend \
  pytest app/tests --no-cov -q --tb=no --override-ini='addopts=' \
    --ignore=app/tests/integration/worker/test_worker_redis_live.py \
    --ignore=app/tests/integration/worker/test_worker_sigkill_live.py
```

Result: **exit 1**, `2396 passed / 10 failed / 1 skipped`, 266 warnings,
378.40s. A diagnostic rerun reproduced all 10 failures in 3.25s.

The ten nodeids exactly match the dated B0 comparison set in
[heat-loss application ownership](../2026-08-14-heat-loss-application-ownership/snapshot.md#b0-failed-comparison-set):

- one specification idempotency assertion (`422` expected, `409 selection_required` received);
- three electrical query-count assertions;
- four report-helper `Query object is not iterable` failures;
- two task-service async/lock expectation failures.

No new backend failure nodeid, setup error or collection error appeared.
The full suite is nevertheless RED; the historical comparison is attribution,
not a waiver.

The two excluded live-chaos files require a real Redis fault-injection/SIGKILL
environment and belong to `make test-worker-chaos`. They are **NOT RUN**.
`test_worker_fencing_live.py` was not excluded.

## Other global gates

| Gate | Exit | Result |
|---|---:|---|
| `npm run storybook:coverage:strict` | 1 | 16/18 (88.9%); missing `TltForm`, `TltModal` stories |
| `docker ... ruff check app` | 1 | 11 existing lint findings |
| `docker ... ruff format --check app` | 1 | 86 files would be reformatted |
| Kontur static precheck | 130 | stopped after >4m; lint/typecheck passed, broad Vitest repeated the same frontend failures |

No file was auto-fixed or reformatted during AF.

## E2E

Requested command from `e2e/` covered:

- `specification-case1-demo-catalog.spec.ts`;
- `specification-readiness-recovery.spec.ts`;
- `heat-object-actions.spec.ts`.

The sandbox attempt never executed product steps: Chrome failed at launch with
`SIGABRT` / `EPERM` (7 tests at 1ms). The single unsandboxed full rerun was
**exit 1: 6 passed / 1 failed** in 1.4m:

- all five Heat scenarios PASS;
- Case 1 Heat → Electrical → Specification PASS;
- readiness recovery timed out at line 175 because an existing
  `.ant-modal-wrap` intercepted the background `Сформировать` click.

One isolated unsandboxed readiness rerun then passed in 4.0s. Classification:
sequence/timing-sensitive E2E race, not a stable product failure. The combined
E2E command remains RED.

## Browser matrix

Screenshots from this AF are stored locally in the ignored directory
`tmp/2026-08-14-client-feedback-09-20/` (32 PNG files); no artifact from this
AF remains at repository root.

### Specification

- 1000×768 and 1440×900: selection-required, not-ready,
  unassigned-confirmation, ready and blocked/catalog-fallback states.
- 1280×800 and 1920×1080: ready, blocked, selection, confirmation and generated
  terminal states on final HEAD.
- Every modal capture had exactly one visible dialog, no page/dialog overflow,
  unclipped title/catalog/action, and no visible `/backend|SPEC_|contributing/i`.
- Focused action matched the state: generate, recalculate, apply selection or
  confirm exclusion.
- Final network chain:
  1. selection request: empty catalog selections, confirm=false;
  2. apply request: `browser:er2:connection → browser-item-b`, confirm=false;
  3. confirmation request: the same selection, confirm=true;
  4. response: generated with `object-browser-unassigned` excluded.
- Variant and options stayed identical across the three requests, including
  `L_K2i_m="0"` and `R_gr="1"`.
- Current navigation console: 0 warnings/errors; all fixture routes and pending
  storage were removed after proof.
- Residual: focus falls back to `BODY` after the generated modal closes.

### Heat

- 1440×900, 1280×800 and 1000×768: D=12 / wall=6 persisted invalid; visible
  `Толщина стенки`, no raw `wall_thickness`, correct focus,
  `aria-invalid` and `aria-describedby`.
- Page-level overflow was absent at all three viewports; only the expected local
  Glide grid scroll remained.
- Blank existing insulation thickness showed `Толщина ИЗ: Укажите значение` and
  caused no new object mutation.
- Group update with ambient `999` retained the draft, showed
  `Максимальное значение — 70`, disabled Apply and caused no mutation.
- Earlier range acceptance also verified `-71`/`71` remain visible, use the
  canonical minimum/maximum messages and do not submit until corrected.
- API requests used for the final state were successful; no failed API request.
- Residual console signal: one Ant/Vite dependency warning logged as error,
  `There may be circular references`; no uncaught exception or request failure.

Mobile/tablet below 1000 px: **N/A** by the initiative contract.

## Verdict for feedback items 9–20

| № | Verdict | Evidence |
|---:|---|---|
| 9 | PASS | Versioned project+ER session context, F5/ER round-trip guard, safe missing-context recovery; final focused tests PASS |
| 10 | PASS | Below-min draft remains visible, canonical min message, invalid submit blocked |
| 11 | PASS | Above-max draft remains visible, canonical max message, invalid submit blocked |
| 12 | PASS | Persist-invalid contract preserved; wall field and summary use `Толщина стенки`, raw id absent |
| 13 | PASS — expected behavior | Blank insulation is a local required guard; no mutation |
| 14 | PASS | Partial ER selection→confirmation→generated chain preserves catalog selections |
| 15 | PASS | Zero-contributing/new ER is blocked with recovery, not sent through a non-working confirmation path |
| 16 | PASS | Known backend reason is fully Russian; mixed-English input does not reach DOM |
| 17 | PASS | Machine codes remain in API control flow but are not rendered; backend jargon removed |
| 18 | PASS | Selection, confirmation, blocked and generated states have isolated diagnostics and one relevant dialog |
| 19 | PASS | Invalid group update is 422/all-or-nothing at API boundary; UI range guard sends no mutation |
| 20 | PASS | Unknown coefficient PUT is 404 with unchanged count and no success audit/cache invalidation |

## Residual / next slices

AF did not change production or tests. Follow-up work should be separate:

1. Repair or formally baseline the five reproducible Heat unit failures.
2. Remove the stale `max-ambient-temperature-input` integration assertion.
3. Fix the readiness E2E modal timing race so the combined 7-test command is green.
4. Resolve the ten documented backend B0 failures.
5. Add `TltForm` and `TltModal` stories.
6. Address global backend Ruff/format debt.
7. Investigate the Ant circular-reference console warning and restore focus after
   the generated modal closes.

No claim is made that the repository-wide release gate is green. The narrower
client-feedback acceptance is green and is backed by focused tests, API guards,
E2E evidence and the desktop browser matrix above.
