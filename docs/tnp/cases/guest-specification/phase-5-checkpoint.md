# Phase 5 checkpoint — specification / report / guest contracts (partial)

- Ветка: **local `main`** (по супер-промпту 19.07.2026; без feature-веток)
- Product decisions: PDL-ER-01…28
- Checkpoint: 19.07.2026 (обновлён в рабочей копии, **не закоммичен** до команды пользователя)
- Статус: **PARTIAL PASS — расширенный slice; not full Phase 5 DoD**

## Реализовано

| Контракт | Статус | Evidence |
|---|---|---|
| PDL-ER-08 `dтр ≥ 57 мм` inclusive | **PASS** | `full_builder.py`; unit boundary |
| PDL-ER-04 guest full automatic BOM | **PASS** | guest `mode=full` allowed; manual PUT 403 |
| PDL-ER-01 multi-ЭР generate + «Выбрать все» | **PASS** | API `electrical_variant_ids` + UI multi-select |
| PDL-ER-26 guest TTL 3 days | **PASS (config+live)** | defaults 4320/60; live stack TTL=4320 |
| Spec GET/generate UUID-first | **PASS** | service filters by `electrical_variant_id` |
| CSV schema v3 export | **PASS (uncommitted)** | `SCHEMA_VERSION=3`; sections `electrical_variants`, `electrical_assignments`, `electrical`/`specifications` с `variant_key` |
| CSV import v2+v3 | **PASS (uncommitted)** | v2 legacy slots preserved; v3 named ER graph; barrel→tank (PDL-ER-06) |
| project_io suite | **PASS (uncommitted)** | unit+integration green after v3 |

## Ещё не закрыто Phase 5 DoD

- UUID-only data plane для ЭР5 без `legacy_variant_number` (composite FK cutover)
- Report preview/export fully UUID without legacy slot
- Settings snapshots (PDL-ER-07) end-to-end
- Order-length vs Lсек×Nсек after Phase 4 sections
- Perf gate before 50→500 (PDL-ER-27)
- Browser UI proof multi-select + Playwright flow 1–17
- Commit на `main` — **только по команде пользователя**

## Phase 4

**BLOCKED** PDL-ER-15/18/28 — нет официального numeric artifact.

## Residual risk

- v3 import с ER без legacy slot и electrical/spec rows → ProjectImportError до UUID cutover
- Uncommitted working tree changes on Desktop `main`
- Documents clone не синхронизирован
