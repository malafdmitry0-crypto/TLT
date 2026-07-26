# Frontend agent-friendliness — переоценка после AF100-09a/-09b/-09c

**Статус:** переоценка того же независимого аудита, теми же весами
**UTC:** 2026-07-26T23:06–23:15Z
**HEAD:** `5755ccd` · branch `main` · worktree **clean**
**Host:** darwin 23.6.0 arm64 · Apple M1 Pro · Node v23.5.0 · npm 10.9.2 · **не quiet** (load 3.9 → 7.2 за время прогонов)
**Предыдущая оценка:** [af-reassessment](../2026-07-26-af-reassessment/snapshot.md) — **9.0/10** @ `bb2c6cd`

Метод тот же: **исполнение** agent loop. Веса не менялись.

---

## 1. Оценка: 9.0 → **9.1**

| Область | Вес | Было | Стало | Основание (исполнено на `5755ccd`) |
|---|---:|---:|---:|---|
| Вход и документация | 15% | 9.4 | **9.4** | 8/8 core docs, 136 ссылок / 0 битых, canonical commands 2/2; backlog ↔ HEAD согласованы |
| Guardrails и архитектура | 20% | 9.6 | **9.7** | s0-gates 80 → **93+12 CSS**; +17 guard-тестов серии 09 (env-ветвление в графе, пре-бандл контракт, project layout, cacheDir) — каждый показан красным |
| Локальность и навигация | 10% | 9.0 | **9.0** | без изменений: max 397 LOC, ≥400 = 0, ≤300 — 89.8% |
| Скорость обратной связи | 15% | 8.2 | **8.6** | fast gate **10.13 → 7.37 s (−27%)**; full proof p50 145.7 → **128.4 s** (шумный хост); ≤120 s не доказан |
| Надёжность proof-петли | 20% | 9.2 | **9.3** | **12 подряд** dual-safe PASS на четырёх разных HEAD, включая смену окружения 87 файлов и пре-бандл двух проектов |
| Корректность агентского тулинга | 10% | 9.4 | **9.5** | `agent:scope` отвечает и по production, и по конфигам (`vite.config.ts` — был `unknown path`); emitted commands исполнимы |
| Browser/E2E доказуемость | 10% | 7.5 | **7.5** | `cd e2e && npx playwright test --list` → 125/34; live U0 по-прежнему **NOT RUN** |
| **Итого** | 100% | **9.0** | **9.1** | `0.15×9.4+0.20×9.7+0.10×9.0+0.15×8.6+0.20×9.3+0.10×9.5+0.10×7.5 = 9.10` |

Машинный коллектор на том же дереве: **8.61/10** (не видит исполнения:
browser/e2e-list `NOT RUN`, runtime args не переданы).

## 2. Что изменилось со времени 9.0

| Слайс | Дельта (парная, прогоны подряд) | Guard |
|---|---|---|
| 09a `aa9c3fa` | 87 DOM-free файлов → node: **−13.7 s** unit wall; gates −27% | env-ветвление в транзитивном графе |
| 09b `c20bdea` | antd пре-бандл для unit: import 87.7 → 33.4 s, **−26.6 s** wall | пре-бандл контракт, 4 red-demo |
| 09c `94572ca` | пре-бандл для integration: import 29.3 → 10.1 s, фаза **−8.4 s** | project layout, 4 red-demo |
| user `662b8e5`+ | diff-wide minimum proof; owner rule для конфигов | `agentChangedProof` в s0 |

Суммарно harness tax unit-проекта **185.0 → 95.3 s (−48 %)** при неизменных
test cases и `isolate: true` во всех проектах.

## 3. Исполненный loop (этот HEAD)

| Проверка | Результат |
|---|---|
| `agent:scope` production path | точные focused commands + browser profiles |
| `agent:scope` `vite.config.ts` | owner rule есть (в 09b был `unknown path`) |
| `test:agent-gates` | PASS **7.37 s** |
| `test:agent-dod:dual-safe` ×3 | **PASS 3/3**: 121.78 / 128.68 / 128.38 s |
| `cd e2e && npx playwright test --list` | 125 tests / 34 files |
| metrics collector | 8.61, dirty=0, битых ссылок 0 |

## 4. Что держит ниже 10

| Область | Что именно | Slice |
|---|---|---|
| Скорость | p50 **128.4 s** на шумном хосте против цели ≤120 s; quiet-host замер отсутствует | **AF100-09d (NEXT)** |
| Browser | live U0 matrix 1000/1280/1440 — единственный `NOT RUN` | AF100-13 |
| Локальность | 139 direct Ant imports; stateful 350–397 LOC не классифицированы | AF100-10+, -11+ |
| Финал | clean-checkout audit | AF100-16 |

Пока live browser U0 `NOT RUN`, статус `10/10` недостижим по §1 плана
независимо от взвешенной оценки.

## 5. Воспроизведение

```bash
cd frontend
npm run agent:scope -- src/pages/heatcalc/useHeatCalcObjectReorder.ts
npm run test:agent-gates                      # ~7.4 s
for n in 1 2 3; do npm run test:agent-dod:dual-safe; done
node ../scripts/frontend-agent-metrics.mjs
cd ../e2e && npx playwright test --list       # 125 / 34
```
