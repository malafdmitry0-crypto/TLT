# Case 1 regression recovery — desktop browser/E2E report

**Дата:** 2026-08-04
**HEAD:** `01bcdf47117cd0bee235e96eed3dd1f29d6e1603`
**Scope:** desktop only (`>=1000 px`); mobile/tablet — `N/A`
**Browser gate:** **GREEN**

## Static preflight

Перед browser acceptance выполнен обязательный UI wrapper:

```bash
/Users/dmalafey/.codex/plugins/cache/personal/kontur-ui-quality/0.1.0+codex.20260719195723/scripts/run-static-ui-checks.sh \
  /Users/dmalafey/Desktop/TLT
```

Результат: lint PASS, typecheck PASS, 345/345 Vitest files и 1475/1475 tests
PASS, production build PASS.

## Desktop layout proof

```bash
E2E_BASE_URL=http://127.0.0.1:3000 \
E2E_API_BASE=http://127.0.0.1:8000 \
PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
npx playwright test tests/layout-regression.spec.ts \
  --grep '(public pages have|guest workspace flow has) no layout regressions — desktop' \
  --reporter=list
```

Результат: **2 passed (11.9 s)**.

- public pages, desktop — PASS;
- guest workspace flow, desktop — PASS.

## Critical business paths

```bash
E2E_BASE_URL=http://127.0.0.1:3000 \
E2E_API_BASE=http://127.0.0.1:8000 \
PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
npx playwright test \
  tests/elec-calculation.spec.ts \
  tests/phase5-specification-proof.spec.ts \
  tests/phase5-actionable-close.spec.ts \
  --grep '(после расчёта объекта показывает марку кабеля|5\.1 guest opens specification controls at desktop width|5\.13 CSV v3 export)' \
  --reporter=list
```

Финальный результат: **3 passed (15.8 s)**.

| State/path | Результат |
| --- | --- |
| ЭР1: create → project Iдоп → assign Самрег → recalculate → mark/length/power/current | PASS |
| Guest specification controls at desktop width | PASS |
| Guest CSV v3 export → re-import | PASS |

Electrical path теперь использует текущий lifecycle ЭР, canonical heat inputs и
authoritative TT catalog. Legacy ожидания СО1 и `ТЛТ-100` удалены как stale.

## Manual browser evidence

Проверенные desktop states:

- Home, `1440×1000`;
- Guest Help, `1440×1000`;
- Guest Heat empty state, `1440×1000`;
- автоматический layout pack дополнительно покрывает desktop profiles из
  repository policy.

Console на достигнутом guest state: 0 warnings, 0 errors. Динамические запросы
завершились 2xx; failed requests не зафиксированы.

Screenshots:

- [`home-desktop-1440x1000.png`](./home-desktop-1440x1000.png)
- [`guest-help-desktop-1440x1000.png`](./guest-help-desktop-1440x1000.png)
- [`guest-heat-empty-desktop-1440x1000.png`](./guest-heat-empty-desktop-1440x1000.png)

## Mobile decision

Пользователь явно подтвердил, что мобильной версии нет. Поэтому viewport
`390×844`, mobile screenshots и mobile Playwright legs не входят в acceptance,
не создают blocker и не учитываются в итоговом GREEN.

## Artifacts и NOT RUN

Финальные Playwright artifacts сохранены вне корня репозитория:

- `/private/tmp/tlt-case1-regression-recovery-2026-08-04/playwright-layout-desktop`
- `/private/tmp/tlt-case1-regression-recovery-2026-08-04/playwright-critical-final`

Полный Playwright suite не запускался. Финальный browser verdict относится к
desktop layout pack и трём перечисленным критическим business paths.
