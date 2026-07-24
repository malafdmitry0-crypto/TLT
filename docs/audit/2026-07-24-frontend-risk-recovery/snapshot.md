# RISK recovery R1–R13 — pre-close / incomplete snapshot

**Status:** pre-close / incomplete working-tree evidence — **not final closure**

**Slice:** `RISK-CLOSE-01` (superseded for truth by `RISK-CLOSE-PROOF-01`)

**Final attempt:** see
[../2026-07-24-frontend-risk-recovery-final/snapshot.md](../2026-07-24-frontend-risk-recovery-final/snapshot.md)
(**BLOCKED** at production HEAD `4462374` — DoD red + browser matrix incomplete).

Do not treat numbers below as final acceptance. They were captured from a dirty
working tree before honest DoD/browser proof and are kept only as history.

**Captured (UTC):** 2026-07-24T06:27:22Z

## Environment

| Field | Value |
|---|---|
| HEAD (pre-close commit base) | `82851ba1601f82246e82353db78df3c9ee2f3f4e` |
| Host | dmitrys-MacBook-Pro.local |
| OS | Darwin 23.6.0 arm64 |
| Node | v23.5.0 |
| npm | 10.9.2 |
| Dirty at capture | yes — RISK recovery WIP in working tree |

## Acceptance recompute (working tree)

| Metric | Target | Fact |
|---|---|---|
| Production type escapes | 11 → 0 | **0** |
| Inline-style total | 520 → ≤496 | **496** |
| Static inline debt | 286 → ≤262 | **262** |
| ProjectsPage occurrences | 31 → 7 | **7** |
| Coordinate-layout total | 88 → ≤72 | **72** |
| heatcalc-side-form-layout.css coords | 51 → ≤35 | **35** |
| useHeatCalcPageModel imports/LOC | ≤23 / ≤440 | **23 / 256** |
| useElecCalcWorkspaceModel imports/LOC | ≤20 / ≤375 | **20 / 370** |
| Ant primitive baseline growth | none | **90** (unchanged vs P1 after) |

## Commands used

```bash
git rev-parse HEAD
npm run typecheck
npm run test:architecture
# focused RISK suites (see orchestration notes)
# agent-gates recommended; full agent-dod may flake under multi-agent load
```

## Slice outcomes (orchestrated)

| Slice | Status | Notes |
|---|---|---|
| RISK-HEAT-CHAR-01 | done | project isolation characterization; no production leak found |
| RISK-HEAT-SESSION-01 | done | useHeatCalcTableSessionController |
| RISK-ELEC-SESSION-01 | done | useElecCalcWorkspaceSessionController |
| RISK-TYPE-EVENT-CORE-01 | done | HeatCalcContextMenuTrigger |
| RISK-TYPE-EVENT-CELL-01 | done | EditableTableCell |
| RISK-TYPE-EVENT-GLIDE-01 | done | Glide adapter trigger |
| RISK-TYPE-NAME-API-01 | done | PipeNameFields/TankNameFields |
| RISK-TYPE-NAME-SYNC-01 | done | form sync without broad casts |
| RISK-TYPE-FORM-PROJECTION-01 | done | allow-listed projections |
| RISK-TYPE-WIZARD-REF-01 | done | WizardZoneBoundary branches |
| RISK-CSS-PROJECTS-01 | done | 24 static styles → CSS |
| RISK-CSS-CLIMATE-DEAD-01 | done | dead climate coordinates removed |
| RISK-CLOSE-01 | this audit | metrics recompute |

## Residual risks

```text
HeatCalc object editor form identity after project switch / not fully locked by CHAR suite / heat / optional characterization extend
Browser matrix Projects + Heat climate / no e2e screenshots this run / qa / manual 1000/1280/1440
ObjectWizard.tsx 29 imports / import-context baseline / wizard / next session extract outside this queue
useElecCalcWorkspaceDataPlane 22 imports / import-context / electrical / optional later
Full agent-dod under multi-agent load / intermittent timeouts / ci-host / re-run DoD idle before release
```

## Orchestration model preserved

session state · data/query state · editing state · presentation · effects

See backlog motivation section for invariants.
