# Phase 5 checkpoint — specification / report / guest contracts (partial)

- Ветка: `feature/tnp-dynamic-er-phase5` (merged workstream after Phase 0–3 on `main`)
- Product decisions: PDL-ER-01…28
- Checkpoint: 19.07.2026
- Статус: **PARTIAL PASS — contract slice implemented; not full Phase 5 DoD**

## Реализовано в этом checkpoint

| Контракт | Статус | Evidence |
|---|---|---|
| PDL-ER-08 `dтр ≥ 57 мм` inclusive | **PASS** | `full_builder.py` `d_large = d_mm >= 57.0`; unit `test_box_threshold_inclusive_57_mm` |
| PDL-ER-04 guest full automatic BOM | **PASS** | API больше не 403 на `mode=full` для guest; manual PUT items остаётся employee-only |
| PDL-ER-01 multi-ЭР explicit generate | **PASS** | `electrical_variant_ids` в body; atomic `generate_for_electrical_variants`; UI multi-select + «Выбрать все» |
| PDL-ER-26 guest TTL 3 days | **PASS (config)** | default `GUEST_SESSION_TTL_MINUTES=4320`, cleanup interval `60`; `.env.example` updated |
| Spec GET by UUID | **PASS** | `get_specification(..., electrical_variant_id=)` prioritizes UUID |
| Spec calc scope UUID-first | **PASS** | generate filters calcs by exact `electrical_variant_id` when present |

## Verification (this slice)

| Check | Result |
|---|---|
| `test_spec_full_builder` (incl. 57 mm boundary) | PASS |
| `test_specifications` integration suite | PASS |
| focused guest full + multi-ER + box threshold | PASS (3/3) |
| Phase 1–3 regression (variants/assignments) | PASS earlier this session |

## Ещё не закрыто Phase 5 DoD

- CSV schema v3 + v2 import path (export/import graph for 5 named ЭР)
- UUID-only data plane for ER5 (no `legacy_variant_number`) — still fail-closed for calculation/spec composite FK
- Report preview/export fully UUID-scoped multi-select UX parity
- Settings snapshot versioning / stale-on-defaults-change (PDL-ER-07) end-to-end
- Order-length procurement trace fields vs `Lсек×Nсек` after Phase 4 sections
- Performance gate before raising 50→500 object limit (PDL-ER-27)
- Browser UI proof after SpecificationPage multi-select changes
- Live stack restart required to pick up new guest TTL defaults if env overrides 20 min

## Phase 4

Остаётся **BLOCKED** PDL-ER-15/18/28 до официального numeric artifact.

## Residual risk

- Frontend always sends `electrical_variant_ids` when UUID known; multi-path requires existing ER (does not auto-create via prepare_legacy). Flow assumes ER readiness from Step 2.
- ER without `legacy_variant_number` still returns 409 on generate until UUID cutover migration.
- Documents clone (`/Users/dmalafey/Documents/TLT`) is **not** synced with Desktop `main`; Desktop is source of truth for this work.
