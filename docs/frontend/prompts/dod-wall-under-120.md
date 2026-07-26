# Промпт: DoD wall ≤120 s (full-cycle agent speed)

**Статус:** **CANONICAL executable residual** (tooling / qa)  
**Актуально на:** 2026-07-26  
**Pending authority:** только [refactor-backlog.md](../refactor-backlog.md)  
**Score impact:** full-cycle (live ~**6,8 / 10** при wall ~**214–278 s**)

## Пересечения (не дублируй)

| Уже сделано | Где | Не повторять |
|---|---|---|
| dual-safe levers (unitW=4, stagger=500, skipArch, fastBuild) | `package.json` `test:agent-dod:dual-safe`, `agent-dod.mjs` | «ещё workers» как sole plan |
| Live scorecard + first wall profile | [live-metrics-and-dod-wall](../../audit/2026-07-26-live-metrics-and-dod-wall/snapshot.md) | переписывать history baseline |
| Settings suite split (was #1 unit ~44s) | `HeatCalcPage.settings.{columns,view-layout,details-reset}.test.tsx` | split settings again |
| Slow file list (pre-settings-split) | [confusion-and-cycle](../../audit/2026-07-26-confusion-and-cycle-improvements/snapshot.md) | trust as absolute without re-profile |
| Confusion/policy/scope/Ant/state map | AGENTS, agent:scope, ant-ui-kit-strategy, state-ownership-map | out of scope for this prompt |

**Этот промпт = единственный** master contract для **DoD wall ≤120**.  
Другие chat drafts / informal S0–S6 lists **superseded** by this file.

---

## Live facts (re-measure in Phase 0; table is prior evidence)

| Сигнал | Prior evidence |
|---|---|
| Canonical `test:agent-dod` | ~**255 s** (scorecard host) |
| Dual-safe best | ~**214 s** total; concurrent suites often **≥170 s** |
| Long pole | **varies**: unit ~235s or int ~170–220s under concurrent |
| Gap to ≤120 | **≥~90–130 s** after tooling levers |
| Next unit candidates | `HeatCalcPage.inline-edit`, `.filters`, `.basics.object-type-chrome` |
| Next int candidates | `ElecCalcPage.glide-modals`, `.results-settings`, `.cable-meta.*` |

**Hard fact:** tooling levers alone **cannot** hit ≤120. Need **suite shrink** or **honest target raise**.

---

## Копируй в агент (master contract)

```text
Работай из корня репозитория TLT.

Прочитай:
  frontend/AGENTS.md
  docs/frontend/agent-development-standard.md
  docs/frontend/prompts/dod-wall-under-120.md   ← this file is SoT
  docs/frontend/pr-budget.md

GOAL:
  Median wall of `npm run test:agent-dod:dual-safe` ≤ 120 s on quiet host
  (n≥3), same coverage, no baseline raise, no skipped product asserts.
  Canonical `npm run test:agent-dod` must stay PASS; record both walls.
  If ≤120 impossible without coverage loss → DECISION NEEDED (≤180 / ≤240)
  with evidence; do not fake ≤120.

USER_VISIBLE_SUCCESS:
  - Full-cycle score rises toward ~9.0 only if p50 ≤120 (see metrics script).
  - Audit docs/audit/YYYY-MM-DD-dod-wall-profile/ then shrink audits.
  - Clear residual or CLOSED.

ALLOWED_SCOPE by phase (one owner per commit):
  DOD-WALL-PROFILE-01 (tooling):
    - run walls + duration profile only
    - docs/audit/YYYY-MM-DD-dod-wall-profile/snapshot.md
    - optional scripts/agent-dod-profile.mjs improvements
    - NO test deletion; NO production feature code
  DOD-WALL-UNIT-NN (qa):
    - frontend/src/__tests__/unit/** only
    - scenario split or harness extract; keep same it titles
  DOD-WALL-INT-NN (qa):
    - frontend/src/__tests__/integration/** (+ elec-integration)
    - harness/setup extract preferred over fiction splits
  DOD-WALL-TOOL-01 (tooling):
    - workers/stagger only if n≥2 proves win; no thrash
  DOD-WALL-TARGET-01 (docs):
    - only if floor proven >120 without coverage cut

NON_GOALS:
  - Delete/skip tests to look faster
  - Raise architecture baselines / weaken expect()
  - Product UX/API/formulas/query keys
  - Re-split HeatCalcPage.settings.* (already done)
  - Confusion/AF multi-hundred plans
  - maxWorkers thrash (unit+int both high without proof)

INVARIANTS:
  - test:agent-gates PASS after each slice
  - Full dual-safe DoD PASS; suites not removed
  - SKIP_ARCH_IN_UNIT only excludes architecture/** already in gates
  - FAST_BUILD vite-only only after gates typecheck
  - One vertical slice / PR budget
  - git status: no foreign WIP commits (agent-metrics-*.png etc.)

WORK SEQUENCE
=============

### Phase 0 — DOD-WALL-PROFILE-01 (обязательно первым)
OWNER: tooling
1. git status --short; ignore untracked agent-metrics screenshots; no foreign WIP.
2. cd frontend
   time npm run test:agent-dod
   time npm run test:agent-dod:dual-safe
   Capture phase lines from [agent-dod] summary.
3. Duration rank (if not just done on this HEAD):
   vitest unit (exclude architecture) + integration JSON → top 15 files.
4. Write docs/audit/YYYY-MM-DD-dod-wall-profile/snapshot.md:
   HEAD, host, n runs, canonical wall, dual-safe wall,
   unit vs int long pole, top slow files, decision:
   next = UNIT-01 | INT-01 | TARGET-01
5. Commit docs (+ profile tooling only if needed).
6. Continue Phase 1 without waiting for user unless STOP requested.

### Phase 1 — shrink (exactly one next slice after profile)
If unit long pole OR unit >> int under dual-safe:
  SLICE_ID: DOD-WALL-UNIT-01
  Pick #1 unit file not already split this initiative
  (prefer HeatCalcPage.inline-edit.test.tsx after settings split).
  Split by real describe clusters OR extract shared setup.
  Proof: focused vitest PASS + dual-safe once; record wall.
If int is long pole / floor blocks ≤120:
  SLICE_ID: DOD-WALL-INT-01
  Pick #1 integration file; harness extract first.
  Proof: focused int PASS + dual-safe once.

### Phase 2+ — repeat UNIT-02 / INT-02 while total p50 >120
Stop a phase when next file sum duration < ~12 s (diminishing returns)
or n≥2 dual-safe still >120 with clear floor document.

### Phase TOOL (optional)
Re-tune workers only with measured win; otherwise skip.

### Phase CLOSE
n≥3 dual-safe on quiet host:
  - p50 ≤120 → CLOSED audit + metrics --dod-seconds=
  - else → TARGET-01 proposal ≤180 or ≤240, DECISION NEEDED

GIT
===
- Conventional commits: docs|test|chore(frontend)
- No push unless asked
- Do not git add agent-metrics-*.png or foreign WIP

HARD STOPS
==========
- Red DoD → fix or revert before commit
- Wall worse after thrash → reduce workers
- Would drop coverage → STOP + DECISION NEEDED
- Ambiguous long pole → re-profile

FINAL REPORT
============
- Walls before/after each slice
- Top slow files
- Commits
- Best median dual-safe
- Score before→after if metrics re-run
- Residual / DECISION NEEDED
```

---

## Короткие follow-ups

### Только profile
```text
Прочитай docs/frontend/prompts/dod-wall-under-120.md.
Выполни только Phase 0 DOD-WALL-PROFILE-01. Audit + commit docs. STOP.
```

### Только unit after profile
```text
Прочитай docs/frontend/prompts/dod-wall-under-120.md и latest
docs/audit/*-dod-wall-profile/snapshot.md.
Выполни DOD-WALL-UNIT-01 на #1 unit file. One slice. Dual-safe once after.
```

### Только int floor
```text
Прочитай docs/frontend/prompts/dod-wall-under-120.md.
DOD-WALL-INT-01 на #1 integration file. Harness extract preferred.
```

### Target raise
```text
Phase CLOSE evidence shows floor >120. DOD-WALL-TARGET-01 only:
propose ≤180 or ≤240 with numbers; no suite cut without product OK.
```

---

## Acceptance checklist

- [ ] Profile from **this** HEAD (not stale alone)
- [ ] One owner per commit
- [ ] Focused green; dual-safe PASS; wall recorded
- [ ] No coverage drop; no baseline raise
- [ ] ≤120 claimed only with **n≥3** median
- [ ] Foreign WIP untouched
