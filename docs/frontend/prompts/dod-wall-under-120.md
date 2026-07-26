# Промпт: DoD wall ≤120 s (full-cycle agent speed)

**Статус:** executable residual prompt (tooling / qa)  
**Актуально на:** 2026-07-26  
**Pending authority:** только [refactor-backlog.md](../refactor-backlog.md)  
**Score impact:** full-cycle agent-friendliness (сейчас ~**6,8 / 10** при wall ~**255 s**)

## Контекст (не выдумывай baseline)

| Сигнал | Live evidence |
|---|---|
| Canonical `npm run test:agent-dod` | **PASS ~255 s** (gates ~12 · concurrent suites ~235 · build ~7) |
| Long pole | **unit** (~235 s observed), integration ~171 s concurrent |
| Dual-safe best earlier | **~214 s** (`test:agent-dod:dual-safe`) — **ещё >>120** |
| Integration floor | concurrent suites alone often **≥170 s** |
| Gap to ≤120 | **≥~90–130 s** after best tooling levers |
| Scorecard | [agent-friendliness-live](../../audit/2026-07-26-agent-friendliness-live/snapshot.md) |
| Prior wall profile | [live-metrics-and-dod-wall](../../audit/2026-07-26-live-metrics-and-dod-wall/snapshot.md) |

**Hard fact:** workers / stagger / skip-arch / fast-build **недостаточны** для ≤120 s. Нужно **сокращать suite cost** (медленные файлы, setup tax, дубли) или **честно поднять product target** с evidence.

---

## Копируй в агент (master contract)

```text
Работай из корня текущего репозитория TLT.

SLICE_ID: DOD-WALL-PROFILE-01   # затем DOD-WALL-UNIT-01 / DOD-WALL-INT-01 / …
OWNER: tooling                 # profile/tooling; qa for suite shrink; docs for target raise
GOAL:
  Снизить wall-time канонического frontend Definition of Done
  (`npm run test:agent-dod` и/или `test:agent-dod:dual-safe`) так, чтобы
  median total wall ≤120 s на этом host, без потери coverage и без
  ослабления gates/ratchets/baselines. Если ≤120 s физически недостижим
  без вырезания coverage — доказать floor evidence и предложить product
  target raise (например ≤180 / ≤240) с цифрами.

USER_VISIBLE_SUCCESS:
  - Agent full-cycle feedback ближе к ≤120 s (или честный новый target).
  - Live scorecard full-cycle score улучшается vs 6,8 (при ≤120 → ~9,0;
    при ≤180 → ~8,2; при ≤240 → ~7,4 — см. frontend-agent-metrics.mjs).
  - Backlog/audit отражают PASS или BLOCKED с DECISION NEEDED.

ALLOWED_SCOPE (один slice = один owner):
  DOD-WALL-PROFILE-01 (tooling):
    - scripts/agent-dod.mjs, agent-dod-dual.mjs, agent-dod-profile.mjs
    - vite.config.ts worker env only if needed
    - docs/audit/YYYY-MM-DD-dod-wall-*/snapshot.md
    - NO production feature code; NO deletion of tests
  DOD-WALL-UNIT-01+ (qa):
    - только test files under frontend/src/__tests__/unit/**
    - optional pure test harness extract (0 it in harness)
    - same it titles/asserts; monolit split or setup extract only
  DOD-WALL-INT-01+ (qa):
    - frontend/src/__tests__/integration/** (+ elec-integration)
    - harness extract / scenario split only
  DOD-WALL-TARGET-01 (docs):
    - docs only: if evidence shows ≤120 unreachable, update product target
      in AGENTS.md / standard / metrics calibration with audit proof

NON_GOALS:
  - Не удалять и не skip-ать тесты «чтобы зелёнее/быстрее».
  - Не повышать architecture baselines, не ослаблять assertions.
  - Не менять production UX / formulas / API / query keys.
  - Не раздувать maxWorkers так, что dual DoD thrash (раньше workers=4
    concurrent unit+int давал regression).
  - Не объявлять ≤120 s closed на одном lucky run.

INVARIANTS:
  - test:agent-gates must stay PASS.
  - Full DoD must stay PASS (same suites, no silent exclusions beyond
    already-documented AGENT_DOD_SKIP_ARCH_IN_UNIT which only skips
    architecture/** already covered by gates).
  - Characterization: same it() titles for any scenario split.
  - One vertical slice / one owner / PR budget.

FOCUSED_PROOF:
  1) Profile before any production of speed claims:
       cd frontend
       npm run agent:dod:profile   # if present
       # else instrument / time:
       npm run test:agent-dod
       npm run test:agent-dod:dual-safe
     Capture: gates, unit wall, integration wall, build, total.
  2) Rank top-N slowest test files (vitest reporter or profile script).
  3) After each shrink slice: focused vitest on touched paths green.
  4) Full: npm run test:agent-dod  (≥2 runs preferred; record both walls).
  5) Metrics:
       node scripts/frontend-agent-metrics.mjs \
         --gates-status=pass --gates-seconds=<g> \
         --dod-status=pass --dod-seconds=<d> \
         --unit-tests=<n> --unit-seconds=<u> \
         --integration-tests=<n> --integration-seconds=<i> \
         --browser-status=not-run
  6) Audit snapshot with HEAD, host, n runs, before/after walls, top slow files.

UI_STATES: n/a (no visible UI).

WORK SEQUENCE
=============

### Phase 0 — PROFILE (обязательно первым, owner tooling)
SLICE_ID: DOD-WALL-PROFILE-01
1. git status --short; do not touch foreign WIP.
2. Recompute live walls (quiet host if possible):
   - baseline: npm run test:agent-dod
   - dual-safe: npm run test:agent-dod:dual-safe
3. Identify long pole (unit vs integration) and top 15 slow files.
4. Write docs/audit/YYYY-MM-DD-dod-wall-profile/snapshot.md with:
   - total / phase walls (n≥1, ideally n≥3)
   - top slow files + loc/it hints
   - decision tree: which suites can shrink vs harness extract vs target raise
5. Commit docs-only if profile-only; next contract = first shrink slice.

STOP after profile if user only asked for plan. Otherwise continue Phase 1.

### Phase 1 — UNIT SHRINK (largest lever if unit is long pole)
SLICE_ID: DOD-WALL-UNIT-01 (repeat UNIT-02… as needed)
OWNER: qa
Pick top slow unit file clusters (historically HeatCalcPage.* heavy scenarios,
api/client, large pure util tests). Prefer in order:
  a) harness extract reducing per-it setup (often best loc/it tax fix)
  b) scenario split only if monolit still large AND clusters are real
  c) shared mock factory thinning (do not break other suites)
Acceptance per slice:
  - focused green
  - no production change
  - measurable unit wall drop OR honest null result documented
  - test:agent-dod PASS; record new total wall

### Phase 2 — INTEGRATION SHRINK (if int is long pole or floor blocks ≤120)
SLICE_ID: DOD-WALL-INT-01…
OWNER: qa
ElecCalcPage* / ReportPage / Specification heavy mounts:
  - shared env already large — prefer fixture pure data + thinner env
  - do not multiply setup across more files without harness discipline
Acceptance: same as Phase 1 for integration wall.

### Phase 3 — TOOLING ONLY IF EVIDENCE SUPPORTS
SLICE_ID: DOD-WALL-TOOL-01
OWNER: tooling
Allowed experiments (measure n≥2 each, keep dual green):
  - unit workers 2 vs 4 vs 6 under SINGLE DoD only
  - int workers 1 vs 2
  - stagger ms
  - AGENT_DOD_FAST_BUILD already exists — keep if gates still typecheck
Forbidden:
  - skipping unit or integration entirely
  - permanently excluding non-arch test folders without product decision
  - raising timeouts instead of fixing slowness

### Phase 4 — CLOSE OR HONEST TARGET RAISE
If after Phases 1–3 best median still >120:
  SLICE_ID: DOD-WALL-TARGET-01
  OWNER: docs
  - Document measured floor (e.g. integration alone ≥170s ⇒ total ≤120 impossible
    without suite cut).
  - Propose product target: ≤180 or ≤240 with host note.
  - Update metrics calibration thresholds only if product accepts.
  - Do NOT fake ≤120.

If median ≤120 on n≥3 quiet runs:
  - mark residual closed in audit
  - recompute frontend-agent-metrics with dod-seconds
  - backlog: only if user opened pending; else docs audit only

GIT
===
- Conventional commits: test(frontend)/chore(frontend)/docs(frontend)
- Production/test commit then docs audit commit for backlog-driven slices
- Do not push unless user asks
- Do not commit foreign WIP

HARD STOPS
==========
- Full DoD red after change → fix or revert; no commit of red tree.
- thrash dual DoD (both red or wall worse) → reduce workers; do not ship.
- Need to drop coverage to hit 120 → STOP + DECISION NEEDED (target raise).
- Ambiguous which suite is long pole → re-profile, do not guess.

FINAL REPORT
============
- Baseline walls (canonical + dual-safe)
- Top slow files before/after
- Slices landed + commits
- Best median wall (n runs)
- Full-cycle score before → after (metrics script)
- Residual: still >120? target proposal? thrash risk?
- Next pending or EMPTY residual for wall
```

---

## Короткие follow-up промпты (после PROFILE)

### A — только unit long pole

```text
Прочитай docs/frontend/prompts/dod-wall-under-120.md.
Выполни только DOD-WALL-UNIT-01: возьми top-3 slowest unit files из
последнего profile audit, сократи wall (harness extract предпочтительнее
чем scenario fiction). Не трогай production. Focused green + test:agent-dod.
Audit before/after walls. STOP after one slice.
```

### B — только integration floor

```text
Прочитай docs/frontend/prompts/dod-wall-under-120.md.
Выполни DOD-WALL-INT-01 на самом медленном integration/elec-integration
файле: harness/setup extract first. Same it titles. Full DoD green.
Audit: int wall and total wall delta.
```

### C — честный target raise

```text
Прочитай docs/frontend/prompts/dod-wall-under-120.md Phase 4.
Собери n≥2 walls canonical + dual-safe. Если concurrent suites floor >120,
открой DOD-WALL-TARGET-01: audit + предложи ≤180 или ≤240; обнови docs
только после явного product OK в ответе. Не меняй suite.
```

---

## Acceptance checklist (slice done)

- [ ] Profile numbers from **this** tree (not stale audit alone)
- [ ] One owner, budget OK
- [ ] Focused proof green
- [ ] `npm run test:agent-dod` PASS; wall recorded
- [ ] Audit snapshot with HEAD / host / commands / before→after
- [ ] No coverage drop; no baseline raise
- [ ] Metrics script re-run with `--dod-seconds=`
- [ ] If ≤120 claimed: **n≥3** quiet runs median ≤120

## Known anti-patterns

1. «Ускорил» одним run 240→200 и объявил почти ≤120.  
2. maxWorkers=8 → thrash, wall worse.  
3. Skip flaky tests instead of fixing setup tax.  
4. Scenario-split harness 0-it file into fake scenarios.  
5. Changing product target silently without Phase 0 evidence.
