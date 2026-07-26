# Промпт: test files LOC cap ≤350 (ceiling 400)

**Статус:** executable residual prompt (qa / architecture)  
**Актуально на:** 2026-07-26  
**Pending authority:** [refactor-backlog.md](../refactor-backlog.md) only if user opens queue  
**Related:** [split-large-tests-by-scenario](./split-large-tests-by-scenario.md), [dod-wall-under-120](./dod-wall-under-120.md)

## Goal

Все файлы в `frontend/src/__tests__/**` и `e2e/tests/**` (`.ts`/`.tsx`):

| Cap | Meaning |
|---|---|
| **Target** | **≤350 LOC** per file (agent-comfortable open cost) |
| **Ceiling** | **≤400 LOC** absolute — nothing may remain above 400 after program |
| **Ideal** | suites ≤300 when cheap |

Не цель: вырезать coverage, skip tests, ослабить asserts/baselines.

## Live seed inventory (>350 LOC) — recompute at start

At open (~2026-07-26), **24** files >350. Re-run inventory before every slice.

### Priority A — suites / e2e journeys (scenario or journey split)

| LOC | its | Path | Suggested action |
|---:|---:|---|---|
| 461 | 16 | `unit/api/client.test.ts` | area clusters (auth / errors / retry / headers…) |
| 458 | 20 | `unit/utils/heatCalcInlineEdit.test.ts` | draft / validate / apply clusters |
| 445 | 10 | `integration/pages/SpecificationPage.test.tsx` | page scenarios |
| 429 | 16 | `e2e/tests/cable-business-flows.spec.ts` | journey split |
| 426 | 8 | `unit/pages/HeatCalcPage.inline-edit.test.tsx` | sub-scenario split |
| 404 | 11 | `e2e/tests/heat-excel-mode.spec.ts` | journey split |
| 401 | 6 | `unit/…/useElecCalcCandidateMutationFlow.test.tsx` | harness extract first if loc/it high |
| 396 | 4 | `unit/pages/HeatCalcPage.project-isolation.test.tsx` | harness + thin suites |
| 396 | 2 | `e2e/tests/ui-kit-heatcalc-parity.spec.ts` | journey/helpers extract |
| 385 | 16 | `unit/utils/heatCalcPageUtils.test.ts` | pure util clusters |
| 384 | 7 | `…/HeatCalcNormalGlideGrid.selection.test.tsx` | scenario sub-split |
| 384 | 5 | `…/HeatCalcNormalGlideGrid.painting-edit.test.tsx` | scenario sub-split |
| 382 | 3 | `…/ElecCalcPage.candidates.display.test.tsx` | setup extract → ≤350 |
| 379 | 11 | `…/useObjectWizardFormSync.test.tsx` | clusters |
| 377 | 4 | `…/headers-scroll.headers-filter-sort.test.tsx` | further split if still >350 |
| 372 | 7 | `…/useHeatCalcObjectsDataModel.query-scope.test.tsx` | sub-clusters |
| 370 | 6 | `…/useElecCalcCableSelectionMutationFlow.test.tsx` | harness extract |
| 365 | 8 | `…/ElecCalcPage.glide-modals.test.tsx` | scenario split |
| 365 | 5 | `…/HeatCalcNormalGlideGrid.rendering.test.tsx` | sub-split |
| 356 | 7 | `…/useElectricalVariantSelection.lifecycle.test.tsx` | thin to ≤350 |

### Priority B — ratchet / helpers (NOT fake scenario-split)

| LOC | Path | Action |
|---:|---|---|
| **709** | `cssArchitectureRatchet.helpers.ts` | split pure modules by concern (scan / classify / report); keep gate cohesive |
| 450 | `cssArchitectureRatchet.architecture.test.ts` | thin gate; move fixtures to helpers modules ≤350 each |
| 405 | `dependencyRatchet.architecture.test.ts` | helpers extract |
| 350 | `inlineStyleRatchet.helpers.ts` | already at 350 — keep ≤350 |

### Priority C — single long e2e flow

| LOC | its | Path | Action |
|---:|---:|---|---|
| **598** | 1 | `e2e/tests/heat-form-layout-split.spec.ts` | extract helpers/page objects; optionally split steps into shared helpers so **file ≤350** (or 2 journey files if natural breakpoints without changing flow) |

---

## Classification rules

| Kind | Policy |
|---|---|
| **suite** (`it`/`test` present) | Prefer **scenario split** if ≥2 clusters; else harness extract |
| **harness / helpers** (0 tests) | Split by use-case modules; barrel re-export OK; **no** fake `it`s |
| **architecture-ratchet** | Keep one gate entry; extract scanners/fixtures to helpers ≤350 |
| **e2e** multi-it | Journey split by user flow / area |
| **e2e** 1 long it | Helpers/page-object extract first; split only if real phase boundaries |

---

## Copy-paste master contract

```text
Работай из корня текущего репозитория TLT.

SLICE_ID: TEST-CAP-INV-01   # then TEST-CAP-SUITE-01… / TEST-CAP-HELP-01… / TEST-CAP-E2E-01…
OWNER: qa                   # architecture for ratchet helpers only
GOAL:
  Every test-related file under frontend/src/__tests__/** and e2e/tests/**
  is ≤350 LOC (absolute ceiling 400). No coverage loss. Same it/test titles
  and asserts for suite moves.

USER_VISIBLE_SUCCESS:
  - Inventory: count(files LOC >350) → 0; count(LOC >400) → 0.
  - Agent open cost reduced; optional DoD wall side-benefit (not required).
  - Audit with before/after ranking.

ALLOWED_SCOPE (one slice = one primary file family, one owner):
  - Target test files + new scenario/helper modules they spawn
  - Max budget: see docs/frontend/pr-budget.md (≤2 test helper files per slice
    if treating helpers as production-like; prefer ≤3 new scenario files
    per monolit for clarity)
  - NO production feature code
  - NO package.json dependency churn
  - NO architecture baseline raise / assertion weaken

NON_GOALS:
  - Delete or skip tests to hit LOC
  - Merge unrelated suites
  - Refactor production "while here"
  - Claim EMPTY residual without recompute inventory

INVARIANTS:
  - Same it(...) / test(...) titles and behavioral asserts
  - Harness files register 0 tests
  - Naming: <Subject>.<scenario>.test.tsx | <Subject>.helpers.ts |
            e2e <area>.<journey>.spec.ts
  - Monolit removed after move (no dead duplicate)
  - Characterization first if behavior is subtle (copy titles, run green before)

FOCUSED_PROOF:
  - npx vitest run <paths> --project unit|integration|elec-integration
  - e2e: npx playwright test --list on touched specs (live run if env ready)
  - After each slice: inventory script (below) — touched files ≤350
  - After wave: full npm run test:agent-dod if many suites moved

UI_STATES: n/a unless e2e live proof required for touched journey.

══════════════════════════════════════
WORK SEQUENCE
══════════════════════════════════════

### 0) Inventory (every session start)
```bash
cd frontend
python3 - <<'PY'
from pathlib import Path
import re
files=[]
for root in [Path('src/__tests__'), Path('../e2e/tests')]:
  for p in root.rglob('*'):
    if p.suffix not in {'.ts','.tsx'} or 'node_modules' in p.parts: continue
    t=p.read_text(encoding='utf-8', errors='ignore')
    loc=t.count('\n')+(0 if t.endswith('\n') or not t else 1)
    its=len(re.findall(r'^\s*(?:it|test)(?:\.(?:each|skip|todo|only))?\s*\(', t, re.M))
    if loc>350:
      files.append((loc, its, str(p)))
files.sort(reverse=True)
print(f'OVER_350={len(files)} OVER_400={sum(1 for l,_,__ in files if l>400)}')
for loc,its,path in files:
  print(f'{loc:4d} its={its:2d}  {path}')
PY
```
If OVER_350==0 and OVER_400==0 → STOP success, write close audit.

### 1) Pick one file (largest suite first, then e2e, then helpers)
Order:
  1. suite with LOC>400
  2. suite with LOC>350
  3. e2e multi-it >350
  4. helpers/ratchet >350
  5. e2e single-it >350 (helpers extract)

### 2) Split strategy
SUITE:
  - Group its by describe/cluster name
  - Each child file ≤350 (prefer ≤300)
  - Shared setup → *.harness.ts / *.fixtures.ts with 0 tests
E2E multi-it:
  - One journey per file; shared fixtures in *.helpers.ts
E2E 1-it long:
  - Extract page object / steps helpers; keep 1 it OR split only at natural UI phases
RATCHET/HELPERS:
  - Extract pure functions by concern; gate file stays the entry ≤350
  - Do not invent scenarios

### 3) Proof + LOC gate
  - focused tests green
  - wc -l on new + remaining owner files: each ≤350 (≤400 hard fail)
  - delete monolit

### 4) Commit
  test(frontend): TEST-CAP-… split <name> to ≤350
  docs audit optional per slice or one wave close audit

### 5) Repeat until inventory clean

══════════════════════════════════════
GIT / HARD STOPS
══════════════════════════════════════
- git status --short: skip foreign WIP
- Do not push unless asked
- STOP if: need to drop coverage; ambiguous ownership; DoD red after suite move
  and cannot fix in 2 attempts → revert slice
- Never leave a file >400 "for later" in the same wave without user OK

══════════════════════════════════════
FINAL REPORT
══════════════════════════════════════
- OVER_350 / OVER_400 before → after
- Table: each split file before LOC → after files + LOC
- Focused proof + agent-dod if run
- Residual: any file 351–400 (must be 0 at program end; temporary only mid-wave)
- Next largest if incomplete
```

---

## Short launches

### Inventory only

```text
Прочитай docs/frontend/prompts/test-file-loc-cap-350.md.
Только Phase 0 inventory: список LOC>350 и LOC>400. Не меняй код.
```

### One suite slice

```text
Прочитай docs/frontend/prompts/test-file-loc-cap-350.md.
Возьми самый большой suite >350, split до ≤350 (ceiling 400).
Same it titles. Monolit delete. Focused vitest green. Commit.
```

### Helpers / ratchet

```text
Прочитай docs/frontend/prompts/test-file-loc-cap-350.md.
Возьми cssArchitectureRatchet.helpers.ts (~709): разбей на pure modules
≤350, gate зелёный, 0 tests in helpers. Commit.
```

### Full wave until clean

```text
Прочитай docs/frontend/prompts/test-file-loc-cap-350.md.
Пока OVER_350>0: один файл за slice, suites first, then e2e, then helpers.
После волны: inventory OVER_350=0 OVER_400=0 + npm run test:agent-dod.
Audit docs/audit/YYYY-MM-DD-test-loc-cap-350/snapshot.md.
```

---

## Acceptance (program complete)

- [ ] `OVER_350 == 0` and `OVER_400 == 0` on live inventory
- [ ] No skipped/deleted its for LOC games
- [ ] Focused proofs green; DoD green if wave ≥3 suite moves
- [ ] Audit snapshot with HEAD + ranking before/after
- [ ] Harness files still 0 tests

## Anti-patterns

1. One 600 LOC file → two 300 with **duplicated** setup (use harness).  
2. Scenario-split a ratchet gate into incoherent half-gates.  
3. Claiming done while helpers 709 remain (helpers **count**).  
4. e2e 1-it 598 left as "not a monolit" — **still must be ≤350**.  
5. Raising cap back to 500 after hard work.
