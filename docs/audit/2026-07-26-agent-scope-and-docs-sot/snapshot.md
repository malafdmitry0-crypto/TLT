# Plan + fix: agent:scope uniqueness + docs SoT

**Status:** **PASS** (SCOPE-01..04 + DOCS-01..03)  
**UTC:** 2026-07-26  
**Prior HEAD:** `f4d7242`  
**Owners:** tooling + docs  

## Diagnosis (agreed)

1. **`agent:scope` coverage is false green** — only unowned (`length===0`); multi-owner (e.g. `useHeatCalcNormalGlideController` → heat + shared) not in gate. Self-test uses `hits[0]` only.
2. **Focused proof strings are broken** — `focusedTests` globs stripped with `replace(/\*\*/g,'')` → e.g. `src/__tests__//specification*`.
3. **Doc drift** — EMPTY QUEUE + ACTIVE motivation; README scorecard @ `a9b4cb3`; AGENTS focused+gates vs standard «always full DoD» + canonical `test:agent-dod`.
4. **Wall / harness** — residual (not this slice): setup extract, not more monolit fan-out.
5. **production→tests registry** — residual after scope focused argv is stable.
6. **Browser re-seal** — residual when Docker up.

## Slice plan (this PR)

| ID | Work | Done when |
|---|---|---|
| **SCOPE-01** | Coverage reports **unowned + multi-owner**; exit 1 if either non-empty | `--coverage` fails on heat∩shared until rules fixed |
| **SCOPE-02** | Domain catch-alls exclude domain paths so one owner per production file | CLI resolves heat hooks/utils; no multi-owner sample |
| **SCOPE-03** | Self-test: unique owner + all fixture paths; feedback path = current `appFeedback.ts` | `--self-test` green |
| **SCOPE-04** | `focusedProof`: exact `npm`/`npx` commands or concrete paths — **no `**` strip** | JSON `recommended_commands` + `focused_proof` usable |
| **DOCS-01** | Backlog: retire ACTIVE motivation; residual note → process/historical | No «ACTIVE» under EMPTY |
| **DOCS-02** | README scorecard → current binding HEAD | Points at live metrics / latest audit |
| **DOCS-03** | Standard §7.4 aligns with AGENTS: gates + dual-safe when `full_dod_required` | One proof ladder |

## Out of scope (next)

- Harness extract for DoD ≤120  
- Full production→tests machine registry file  
- Live browser seal  

## Proof (landed)

```bash
node scripts/agent-scope.mjs --self-test   # PASS — unique owners + clean recommended_commands
node scripts/agent-scope.mjs --coverage   # PASS — unowned=0 multi-owner=0
node scripts/agent-scope.mjs frontend/src/hooks/useHeatCalcNormalGlideController.ts  # heat unique
node scripts/agent-scope.mjs --json frontend/src/pages/specification/useSpecificationPageModel.ts
# focused_proof.argv exact paths, no ** strip
```

### Rule fixes summary

- Domain catch-alls no longer dual-claim: hooks, utils/domain, api/*, styles (feature CSS → feature owner).
- `focusedProof: { cwd, argv }[]` + `buildRecommendedCommands` without `**` mangle.
- Coverage gate: unowned **and** multi-owner.

### Docs

- Backlog: ACTIVE motivation → historical; Track A/B = Closed.
- README: no fixed 8.3 @ old HEAD.
- Standard §7.4 = AGENTS proof ladder (scope → focused → gates → dual-safe when required).

## Residual next

1. Harness extract for DoD ≤120 (not more monolit fan-out).
2. Optional machine registry production-file → tests (can build on focused_proof).
3. Live browser seal when Docker up.
