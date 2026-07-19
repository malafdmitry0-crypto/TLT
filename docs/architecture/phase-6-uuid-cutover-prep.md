# Phase 6 prep — UUID-only cutover inventory (A3.1–A3.3)

Date: 2026-07-19. Branch: local `main`.  
Status: **prep only** — no production cutover in this document.

## Goal (from super-prompt Phase 6)

- Remove authoritative `variant_number` / legacy slot bridge.
- All calculation/candidate/folder/specification/report/task writes keyed by
  `electrical_variant_id` only.
- Delete fixed СО1…СО4 arrays/labels and transitional adapters.
- Prove residual `rg` search is clean; run functional gates + DB invariants.
- One-way cutover with backup/restore point (PDL-ER-17).
- Raise object limit to 500 only after PDL-ER-27 wall-clock gate is green.

## Current expand-window state (after 0031)

| Area | State |
|---|---|
| Named ER lifecycle | UUID 1…5 (`MAX_ELECTRICAL_VARIANTS=5`) |
| Legacy slots | `_LEGACY_VARIANT_NUMBERS = range(1, 6)` |
| Calc/candidate/folder/spec CK | `variant_number` **1…5** |
| Composite FK | still ties `electrical_variant_id + project_id + variant_number` to `legacy_variant_number` |
| Pure UUID-only ER without slot | not required for write after ER5 expand; fifth ER has slot 5 |

## A3.1 Residual `variant_number` inventory (code owners)

Primary clusters (rg anchors):

1. **Models / DB checks**
   - `backend/app/models/electrical_calculation.py` — CK + composite FK
   - `backend/app/models/electrical_candidate.py`
   - `backend/app/models/electrical_candidate_folder.py`
   - `backend/app/models/specification.py` — composite FK
   - `backend/app/models/electrical_variant.py` — `legacy_variant_number` 1…5
2. **Services**
   - `electrical_variant_service.py` — `_LEGACY_VARIANT_NUMBERS`, copy graph
   - `calculation_service.py` — batch/manual still pass slot
   - `specification_service.py` — generate locks + upsert by slot unique key
   - `project_io_service.py` — CSV v2/v3 adapter
   - `report_service.py` — chapter resolution
3. **API schemas**
   - `schemas/calculation.py`, `schemas/report.py` — `ge=1, le=5`
   - query params `variant` / `variant_number` on calc/spec/report
4. **Frontend**
   - `useLegacyElectricalVariantContext` / ElecCalcPage adapters
   - Specification/Report pages still send UUID + legacy slot pair where required
5. **Tests**
   - integration suites asserting slots 1…4 historically; updated for 5 where cutover done

## A3.2 Cutover design sketch

1. **Backup point**: dump DB + tag git + record alembic head.
2. **Migration sequence**
   - Make `variant_number` nullable on calc/candidate/folder/spec **or** keep as
     denormalized cache filled from ER only for read compatibility.
   - Drop composite FK requiring `legacy_variant_number`.
   - Unique indexes: `(object_id, electrical_variant_id)` only (already present).
   - Drop/relax CK `variant_number <= 5` when column demoted.
3. **Write path**: all services resolve ER by UUID; refuse numeric-only writes.
4. **Read path**: temporary dual-read window optional; no dual-write after go-live.
5. **Frontend**: remove `legacyVariantNumber` from authoritative query keys;
   keep display-only if needed.
6. **Rollback**: restore dump only (no lossless downgrade after cutover).

## A3.3 Characterization tests to freeze before cutover

Must stay green before and after:

- create/copy/rename/activate/delete 5 ERs
- fifth ER graph copy (slot 5)
- assignment isolation between ERs
- specification generate multi-UUID atomic + preflight
- report multi-UUID chapters no-mixing
- CSV v3 export / v2 import adapter
- db-business-invariants.sql (slots 1…5)
- concurrent max-5 create

## Non-goals of this prep

- Implementing section Phase 4 formulas
- Filling Ex/Rгр matrix
- Raising product object limit to 500
- Corporate report template (PDL-ER-40)

## Exit criteria for starting Phase 6 execute

- [ ] A1 evidence pack green (e2e + post-UI invariants)
- [ ] A2.1 probe numbers recorded for N=50
- [ ] Explicit product go + backup point
- [ ] Characterization suite listed above green on cutover branch
