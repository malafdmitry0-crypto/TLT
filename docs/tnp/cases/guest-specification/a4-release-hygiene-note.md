# A4 release hygiene — residual outside ER slice

Date: 2026-07-19 (updated after HeatCalc settings fix).

## Fixed

1. **HeatCalc settings separator** — obsolete test expected section-resize
   handles removed in wide/side layout (`sectionResizeEnabled=false`,
   `ObjectWizardWidePanel` without `.form-col-resize-handle`). Test updated to
   assert no section separators on top placement; side-form resize remains
   covered by sibling test. `HeatCalcPage.settings.test.tsx` **11/11 green**.

## Still residual (not ER / not blocking Phase 5 evidence)

2. **Dependency security / Alembic metadata drift** — repository-level gates
   outside super-prompt Phase 5 code path. Run full `scripts/security-scan.sh`
   and alembic heads check before production release.

3. **Cross-browser** — Playwright project is chromium-only; Firefox/WebKit not
   in CI projects. Optional smoke remains open.

## Done in A pack that reduces release risk

- DB invariants expanded for ER slots 1…5 and settings_version
- Guest TTL 3d cleanup tests
- Corrupt/manual CSV guest reject tests
- Phase 5 e2e proof pack green (9/9)
- HeatCalc settings unit tests green
