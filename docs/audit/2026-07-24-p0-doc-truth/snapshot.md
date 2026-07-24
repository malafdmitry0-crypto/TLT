# P0-DOC-TRUTH-01 — dated frontend snapshot

**Статус:** point-in-time evidence (не норматив, не очередь)

**Slice:** `P0-DOC-TRUTH-01`

**Captured at (UTC):** 2026-07-23T23:34:42Z  
*(wall clock on host was 2026-07-24 local; UTC date rolls back one day)*

## Environment

| Field | Value |
|---|---|
| HEAD | `2f6754d8873fa48da70bc6243948671442d12ce6` |
| HEAD subject | `docs(frontend): AF9-FEEDBACK/FINAL complete agent-friendly 9/10 plan` |
| Host | `dmitrys-MacBook-Pro.local` |
| OS | Darwin 23.6.0 arm64 |
| Node | v23.5.0 |
| npm | 10.9.2 |
| Working tree | dirty docs WIP present at capture; runtime TS/TSX of slice unchanged |

## Verification commands used for this snapshot

```bash
git rev-parse HEAD
git status --short
git log --oneline -15
git log --oneline -- frontend docs/frontend | head -20

# static production inventory (no test execution)
find frontend/src -type f \( -name '*.ts' -o -name '*.tsx' \) \
  ! -path '*/__tests__/*' ! -path '*/node_modules/*' | wc -l
find frontend/src/pages/electrical -type f \( -name '*.ts' -o -name '*.tsx' \) \
  ! -path '*/__tests__/*' | wc -l
find frontend/src -type f \( -name '*.ts' -o -name '*.tsx' \) \
  ! -path '*/__tests__/*' -exec wc -l {} + | awk '$1>500 {print}'

# baseline JSON reads
python3 - <<'PY'
# typeEscape / inlineStyle / coordinateLayout / antdPrimitive /
# importContext / complexity / cssImportant summaries
PY

# markdown link scan over docs/frontend/**
# git diff --check
```

**Not re-run for this docs-only slice:** full `test:agent-dod`, Electrical
timing matrix, browser matrix. Those remain residual proof for later slices.
Do not treat HEAD commit message «complete … 9/10» as acceptance evidence.

## Facts recalculated from the working tree

| Fact | Value | Source |
|---|---|---|
| Production TS/TSX files | 367 | `find frontend/src …` |
| Electrical production TS/TSX | 107 | `find …/pages/electrical` |
| Production files >500 LOC | 16 | `wc -l` inventory |
| `Record<string, any>` in `frontend/src` | 0 | content search |
| `as never` on Electrical presentation boundary | 16 | `ElecCalcWorkspace.tsx` + `ElecCalcWorkspaceParamsChrome.tsx` |
| Type-escape baseline total | 27 escapes / 10 files | `typeEscapeBaseline.json` |
| Inline-style baseline | 517 total (runtime 183 / static 214 / third-party 120) | `inlineStyleBaseline.json` |
| Coordinate-layout baseline | 117 | `coordinateLayoutBaseline.json` |
| Ant primitive baseline | 47 files / 112 primitive entries | `antdPrimitiveBaseline.json` |
| Direct Ant importers (production) | 129 | import scan |
| Import-context hotspot files | 5 (cap 20 for new files) | `importContextBaseline.json` |
| Complexity baseline files >500 | 16 (cap 500) | `complexityBaseline.json` |
| `!important` CSS baseline | 0 | `cssImportantBaseline.json` + CSS scan |
| Electrical integration owners | 7 use-case specs + harness modules | `src/__tests__/integration/pages/electrical/` |
| Active frontend queue document | `docs/frontend/refactor-backlog.md` | doc ownership rule |
| AF9 plan status after this slice | HISTORICAL pointer | `docs/frontend/agent-friendly-9-plan.md` |

## Contradiction fixed by this slice

| Before | After |
|---|---|
| `agent-friendly-9-plan.md` = `COMPLETE` with scores 8.6 / 9.1 / 9.2 | HISTORICAL pointer; scores removed from normative path |
| `refactor-backlog.md` = `ACTIVE` with pending acceptance | remains sole `ACTIVE` queue; residual slices explicit |
| Snapshot tables inside completed plan presented as current | dynamic metrics live only in this audit |
| Two implied «current» evaluations of the same initiative | one queue, no dual current score |

## Residual risks (FILE / EVIDENCE / OWNER / NEXT DECISION)

1. `frontend/src/__tests__/unit/architecture/*Ratchet*.ts` / fixture coverage and bidirectional stale-baseline checks still incomplete relative to claimed policy / architecture / `P1-GUARDRAIL-TRUTH-01`
2. `frontend/src/__tests__/integration/pages/electrical/*` / concurrent DoD timeout reports + focused owner ~48 s claim in residual plan / electrical-test / `P2-ELEC-FEEDBACK-01`
3. `ElecCalcWorkspace.tsx` + `ElecCalcWorkspaceParamsChrome.tsx` / 16× `as never` / electrical-presentation / `P3-ELEC-TYPE-BOUNDARY-01`
4. Large owners e.g. `useElecCalcWorkspaceModel.tsx`, `objectWizardUtils.ts`, `ElectricalAssignmentPanel.tsx` / >500 LOC + churn / feature owners / `P4-CONTEXT-REDUCTION-01` (one owner only)
5. Uncommitted docs WIP present at capture / `git status --short` on `docs/frontend/*` / docs / fold only P0-owned truth edits; do not reset foreign dirty files

## How to supersede this snapshot

Create a new `docs/audit/YYYY-MM-DD-<reason>/` directory. Do not edit numbers
here to «keep docs green». Normative documents must link to the latest audit
only when they need evidence, not copy live counters.
