# DoD wall profile + shrink wave

**Status:** **PARTIAL** — dual-safe **PASS · 147.34 s**; target ≤120 still open  
**UTC:** 2026-07-26  
**HEAD:** `1141bff` (+ prior U0 `5cecc4b`, docs `bc800c2`)  
**Owner:** tooling / qa  
**Host:** local macOS, Node 23.5.0 (outside engines; gates green)

## Phase 0 — dual-safe wall (n=1 this run)

Command: `cd frontend && npm run test:agent-dod:dual-safe`

| Phase | Wall |
|---|---:|
| `test:agent-gates` | **8.25 s** |
| unit + integration concurrent (max of children) | **138.20 s** |
| unit observed | **117.78 s** (263 files · 1134 tests) |
| integration observed | **138.20 s** (39 files · 168 tests) ← **long pole** |
| `build:vite` (FAST_BUILD) | **0.89 s** |
| **TOTAL** | **147.34 s** |

### Prior evidence (same day)

| Run | Total | Note |
|---|---:|---|
| dual-safe best pre-wave | ~214 s | settings split + dual-safe levers |
| metrics refresh card | 214–230 s | residual ≥94 s to ≤120 |
| **this profile** | **147 s** | −~67 s vs 214; residual **~27 s** to ≤120 |

Hard fact remains: tooling levers alone were insufficient; suite shrink + settings split moved the needle.

## Shrink / LOC slices landed this session

| Slice | Result |
|---|---|
| U0 a11y | `TltSelect` puts `aria-required` on `[role=combobox]` not Ant shell |
| U0 useForm | range modal `forceRender` + `destroyOnHidden=false` |
| U0 overflow | `heatcalc-content` `min-width:0; overflow-x:clip` (workspace CSS ratchet-safe) |
| LOC client | `client.test.ts` 461 → helpers + guest-recovery + network-idempotency (≤290) |
| LOC inlineEdit util | 458 monolit → 3 scenarios + helpers (≤161) |
| monolit delete | `heatCalcInlineEdit.test.ts` removed |

## Remaining to ≤120 (decision tree)

Long pole = **integration ~138 s**. Unit concurrent ~118 s.

Next if continuing:

1. **DOD-WALL-INT-01** — harness extract on slowest int files  
   (historically `ElecCalcPage.glide-modals`, `results-settings`, `cable-meta.*`)
2. **DOD-WALL-UNIT-01** — split `HeatCalcPage.inline-edit` (~29 s pre-settings profile; still 426 LOC)
3. Re-profile after each slice; stop claiming ≤120 without n≥3 median on quiet host
4. If floor after int+unit shrink still >120 with no coverage cut → **DOD-WALL-TARGET-01** propose ≤180

## LOC cap residual

After this wave, **22** test files still **>350** (was 24). Ceiling **>400** still includes:

- `cssArchitectureRatchet.helpers.ts` **709**
- `heat-form-layout-split.spec.ts` **598**
- several 400–450 suites/e2e

Program prompt: `docs/frontend/prompts/test-file-loc-cap-350.md`.

## Acceptance

- [x] Profile on this HEAD with dual-safe numbers
- [x] dual-safe PASS
- [ ] p50 ≤120 (n≥3) — **not met** (147 single run)
- [x] No coverage drop; monolit splits keep same `it` titles
- [x] Foreign WIP not committed

## Residual

**OPEN:** wall **147 s** vs **120 s** (gap ~27 s); full LOC cap incomplete; browser re-seal of U0 not re-run (Docker daemon unavailable this session).
