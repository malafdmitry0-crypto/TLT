# SC-03 useWatch performance proof

Date: 2026-06-01

Scope: SC-03 HeatCalc page after replacing broad `Form.useWatch([])` subscriptions and unmounting the hidden object wizard.

Method:

- Browser: Playwright Chromium, desktop viewport `2048x1100`.
- Frontend: `http://127.0.0.1:3003`.
- API: `http://127.0.0.1:8000/api/v1`.
- Project: seeded guest project with 50 valid objects, 25 pipes and 25 tanks.
- Measurements: Playwright wall-clock interaction timings, browser Long Task API, and React commit counting through a DevTools hook installed before React boot.
- Raw report: `/private/tmp/tlt-sc03-usewatch-perf.json`.

Results:

| Action | Duration, ms | React commits | Long tasks |
|---|---:|---:|---:|
| Initial SC-03 load, 50 objects | 1754 | 31 | 7 |
| Type 8 chars into object name | 101 | 28 | 0 |
| Type 4 chars into pipe length | 232 | 31 | 0 |
| Hide wizard block and unmount form | 64 | 9 | 0 |
| Show wizard block and remount form | 212 | 22 | 1 |
| Switch to all objects table | 142 | 13 | 1 |
| Scroll large table | 92 | 4 | 0 |
| Switch back to pipe table | 238 | 34 | 2 |

Interpretation:

- Text/numeric input in the SC-03 form produced no browser long tasks in this run.
- Hidden wizard unmount is cheap and confirmed by the dedicated `hide wizard block unmount` action.
- The remaining long tasks are concentrated in initial load, remount, and table scope switches, not in per-keystroke input.

Residual risk:

- This is a single local run, not a trend baseline. Keep the same probe shape for future before/after comparisons.
- The React metric is commit count through the DevTools hook, not component-level render flamegraph timing.
