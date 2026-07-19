# Phase 4 checkpoint — heating sections (local main)

- Ветка: **local `main`**
- Checkpoint: 19.07.2026
- Статус: **BLOCKED — external data deliverable**

## Product contract closed (semantics only)

| Item | Status | Notes |
|---|---|---|
| PDL-ER-15/18 section data source choice | DECIDED | official TLT catalog/method only |
| PDL-ER-19 incomplete catalog fail-closed | DECIDED | no defaults/interpolation |
| PDL-ER-20 Iдоп explicit | DECIDED | |
| PDL-ER-21 Iст.уд direct | DECIDED | no synthetic kпуск |
| PDL-ER-22 cold-start temperature key | DECIDED | |
| PDL-ER-23 voltage-scoped limits | DECIDED | |
| PDL-ER-24 rounding only from source | DECIDED | |
| PDL-ER-25 self-reg only | DECIDED | resistive keeps existing flow |

## Data blocker (not implementable without artifact)

Official numeric catalog / «Таблица Виктора» with:

- `Lmax` by mark × voltage × cold-start temperature
- `Iдоп` per mark × voltage
- direct `Iст.уд` A/m
- source-defined rounding rule
- version / page / row traceability

Registered in PDL-ER-28 as required deliverable. Existing PDF/XLSX do **not**
replace this artifact.

## Implementation status

- No production section algorithm using invented defaults.
- No Phase 4 formula contract registered in `business-formula-contracts.json`.
- BOM continues with legacy `num_circuits` as interim circuit count; true
  section lifecycle remains Phase 4 after data registration.

## Next when data arrives

1. Register formula/data contract with source/version.
2. Independent golden + boundary + metamorphic oracles.
3. Persist sections + hierarchical UI.
4. Formula QA + mutation evidence.
5. Re-open dependent BOM rules that need real section counts.
