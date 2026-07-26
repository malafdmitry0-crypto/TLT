# AF100-06 / -07 / -08 — детерминированный full proof и профиль

**Статус:** execution snapshot (не binding scorecard)
**UTC:** 2026-07-26T16:30–16:55Z
**HEAD на старте:** `6794dee` · branch `main`
**Host:** darwin 23.6.0 arm64 · Node v23.5.0 · npm 10.9.2 · quiet (посторонних прогонов нет)

Закрыты **AF100-06** (flake), **AF100-08** (профиль n≥3), **AF100-07**
(единственная каноническая команда — разблокирован цепочкой 06 → 08 → 07).

---

## 1. AF100-06 — два разных флейка, не один

### Флейк A — `ReportPage.export` (wall-clock кап)

`waitFor(..., { timeout: 15_000 })` — локальный кап строже suite-бюджета;
под `AGENT_DOD_UNIT_MAX_WORKERS=4` истекал до резолва экспорта.

Исправление: экспортный мок отдаёт deferred-промис, тест ждёт вызова и
резолва, in-flight состояние проверяется детерминированно. Assertions не
ослаблены — **11 до и 11 после**, локальных `timeout:` не осталось.

### Флейк B — `EnvironmentTeardownError` (обнаружен при приёмке 3/3)

Прогоны 2 и 3 первой тройки упали при **1134/1134 зелёных тестах**:

```
Test Files  266 passed (266)
Tests      1134 passed (1134)
Errors     1 error
→ FAIL test:unit exit=1 — terminating sibling
```

Причина: `useHeatCalcRouteShellEffects` делает idle-preload чанка визарда
(`import('@/components/wizard/ObjectWizard')`). Планирование отменяется при
unmount, но **уже начатый `import()` отменить нельзя** — если тест кончился
раньше, Vitest рвёт окружение и висящий импорт реджектится.

Исправление: `HeatCalcPage.test-utils.tsx` (общий harness 12 файлов) в
`afterEach` дожидается кэшированного промиса модуля. Ни один тест не удалён,
ни один timeout не поднят.

### Приёмка

| Проверка | Результат |
|---|---|
| focused stress `ReportPage.export` | **20/20** (первые 10 — под параллельным `test:unit`) |
| медленный прогон в стрессе | 2.76 s |
| full proof подряд | **3/3 PASS** |

## 2. AF100-08 — профиль на quiet host, n=3

| Прогон | gates | unit+integration (concurrent) | build:vite | total |
|---|---:|---:|---:|---:|
| 1 | 8.61 s | 135.70 s | 0.77 s | **145.08 s** |
| 2 | 8.81 s | 136.41 s | 0.78 s | **145.99 s** |
| 3 | 9.00 s | 135.93 s | 0.75 s | **145.68 s** |
| **p50** | **8.81** | **135.93** | **0.77** | **145.68** |

Разброс **< 1 s** против 149–283 s до фикса — сама нестабильность и была
источником «медленного» DoD, а не объём тестов.

**Long pole — concurrent unit+integration (93 % времени).** Внутри unit-фазы:
`setup ~35 s · import ~130 s · tests ~189 s` (сумма по воркерам) на 266 файлов,
то есть плата за per-file harness/import, а не за число воркеров. Отсюда
AF100-09+ должен снижать setup/import tax; увеличение `maxWorkers` и дальнейшее
дробление сценариев приёмкой не являются.

Для сравнения sequential-профиль того же orchestrator: 206.71 s.

## 3. AF100-07 — одно имя полного proof

| Источник | Было | Стало |
|---|---|---|
| `frontend/AGENTS.md` | «prefer dual-safe» | `test:agent-dod:dual-safe` |
| `agent-development-standard.md` §7.4 | dual-safe + «sequential fallback» | канон + явное «sequential — не acceptance» |
| `.github/workflows/ci.yml` | **`test:agent-dod`** | `test:agent-dod:dual-safe` |

Выбор обоснован профилем §2: dual-safe быстрее (145.7 против 206.7 s) и теперь
стабилен 3/3. `test:agent-dod` остаётся тем же `scripts/agent-dod.mjs` с другим
worker-профилем — для отладки, не для закрытия slice.

## 4. Guards

| Guard | Проверяет | Failure path |
|---|---|---|
| `canonicalDodCommand.architecture.test.ts` | CI, AGENTS и стандарт называют одну команду; скрипт ведёт к общему orchestrator | да — распознаёт CI с `test:agent-dod` как дрейф |

`test:s0-gates`: 76 → **80** тестов.

## 5. Воспроизведение

```bash
cd frontend
for i in $(seq 1 20); do npx vitest run --project integration \
  src/__tests__/integration/pages/ReportPage.export.test.tsx || echo "FAIL $i"; done
for n in 1 2 3; do npm run test:agent-dod:dual-safe; done
```

## 6. Осталось открытым

| Slice | Что нужно |
|---|---|
| AF100-09+ | снизить setup/import tax до p50 ≤120 s, PASS 3/3; по одному harness-owner на slice |
| AF100-10+, -11+ | inventory stateful >350 LOC и direct Ant |
| AF100-12 | production path → ближайшие tests при несовпадающем basename |
| AF100-13 | live U0 browser matrix 1000/1280/1440 |
| AF100-15, -16 | синхронизация доков и финальная приёмка на clean checkout |
