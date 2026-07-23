# Frontend metrics baseline

**Дата:** 2026-07-23  
**Источник:** `wc -l` + `grep` после S0-lite factory setup.  
**Обновлять:** после заметных shell/CSS slices (или weekly).

## Shell / CSS LOC

| Path | LOC |
|---|---:|
| `frontend/src/pages/ElecCalcPage.tsx` | 1936 |
| `frontend/src/pages/HeatCalcPage.tsx` | 1046 |
| `frontend/src/pages/SpecificationPage.tsx` | 1005 |
| `frontend/src/styles.css` | 6777 |

```bash
wc -l frontend/src/pages/ElecCalcPage.tsx \
      frontend/src/pages/HeatCalcPage.tsx \
      frontend/src/pages/SpecificationPage.tsx \
      frontend/src/styles.css
```

## Inverted deps: `components` → `pages`

**Count: 3 files** (allowlisted in architecture test)

| File |
|---|
| `components/electrical/ElectricalCandidateFieldRenderer.tsx` |
| `components/electrical/ElectricalColumnFilterDropdown.tsx` |
| `components/layout/Sidebar.tsx` |

```bash
grep -rn "from '@/pages/" frontend/src/components --include='*.ts' --include='*.tsx' \
  | sed 's/:.*//' | sort -u
```

**Goal:** → 0 (shrink allowlist; do not grow).

## Architecture gate

```bash
cd frontend && npm run test:architecture
```

Baseline: **10 tests passed** (feature boundaries + wizard isolation) on 2026-07-23.

## UI kit parity e2e

```bash
cd e2e && E2E_BASE_URL=http://127.0.0.1:3003 npm run test:ui-kit-parity:chrome
```

Script added in S0-lite. Re-run after any form density / kit / heat dual-form CSS change.

## Targets (from rewrite-plan)

| Metric | Baseline | S1-ish | S2-ish | S3 DoD |
|---|---:|---:|---:|---:|
| ElecCalcPage | 1936 | — | &lt;1200 | ≤500 |
| HeatCalcPage | 1046 | −200…350 | ≤600 | ≤500 |
| SpecPage | 1005 | — | namespace | ≤500 |
| styles.css | 6777 | ≤6777 (freeze) | &lt;5000 | &lt;2500–3000 |
| inverted files | 3 | ≤3 | ≤2 | 0 |
