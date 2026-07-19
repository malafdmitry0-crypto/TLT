# A4 release hygiene — residual outside ER slice

Date: 2026-07-19.

## Known residual (not fixed in actionable A pack)

1. **HeatCalc settings separator** — pre-existing frontend test failure
   (`HeatCalcPage.settings`) referenced in case README; outside dynamic-ER
   Phase 5 functional path. Track as general frontend fix.

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
