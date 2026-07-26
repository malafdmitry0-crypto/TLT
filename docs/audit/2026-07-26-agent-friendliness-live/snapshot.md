# Agent-friendliness live scorecard (post Track A+B)

**Status:** **PASS** (static + gates + DoD + e2e list)  
**UTC:** 2026-07-26  
**Owner:** tooling  

Live walls: gates **12.4s** · DoD **255.1s** · unit **1178** · int **168** · e2e list **125**.

Browser live run: **NOT RUN** (honest residual).

---

# Frontend agent-friendliness metrics

**UTC:** 2026-07-26T00:33:06.136Z  
**HEAD:** `452ec99` · branch `main` · worktree dirty (16)  
**Host:** dmitrys-MacBook-Pro.local · darwin 23.6.0 arm64 · Node v23.5.0 · npm 10.9.2  
**Scope:** current working tree; scores are the supplied expert calibration, raw metrics below are machine-collected evidence.

## Шкала

| Критерий | Оценка | Проверяемая опора |
|---|---:|---|
| Понятность входа и документации | **9,4** | docs/README/AGENTS + канонические команды |
| Запутанность, где меньше — лучше | **2,0** | prod≥400=0, max=397, test≥500=2 |
| Архитектурные границы | **9,3** | architecture/ratchet tests + gates |
| Локальность изменений | **9,4** | ≤300 89.8%, p90=301 |
| UI Kit на базе Ant | **8,8** | stories=14, barrel consumers=90 |
| Надёжность тестов и ratchets | **9,0** | ~1462 its, ratchets=9 |
| Скорость малого изменения | **9,0** | gates 12.4s |
| Скорость полного цикла | **6,8** | dod 255.1s |
| Browser/E2E доказуемость | **8,0** | browser=NOT-RUN; e2e-list=PASS |
| Воспроизводимость текущего дерева | **7,6** | dirty=16 |

**Сводная оценка:** **8,54 / 10**. Для обратного критерия «Запутанность» в среднем используется `10 − 2,0 = 8,0`.

## Сырые метрики

| Метрика | Значение |
|---|---:|
| Production TS/TSX files | **459** |
| Production LOC | **63616** |
| Production files ≥400 LOC | **0** |
| Production files ≥450 LOC | **0** |
| Production files >500 LOC | **0** |
| Max production LOC | **397 · `frontend/src/hooks/useHeatCalcNormalGlideController.ts`** |
| Production files with >20 imports | **0** |
| Max imports in production file | **20 · `frontend/src/main.tsx`** |
| UI-kit production modules | **6** |
| UI-kit stories | **14** |
| Production consumers of public UI-kit barrel | **90** |
| Production files importing Ant directly | **139** |
| Unit/integration test files | **336** |
| Architecture test files | **15** |
| Ratchet test files | **9** |
| Approximate declared test cases | **1462** |
| E2E spec files | **31** |
| Visual regression PNG baselines | **4** |
| Dated audit snapshots | **70** |
| Dirty worktree entries | **16** |

## Метрики скорости агента

| Метрика | Значение | Интерпретация |
|---|---:|---|
| Static metrics collection | **253.8 ms** | read-only tree scan |
| Fast gate / full DoD | **4.9%** | меньше = быстрее feedback относительно полного proof |
| Unit throughput | **5 tests/s** | 1178 tests / 235.39 s |
| Integration throughput | **0.98 tests/s** | 168 tests / 170.70 s |
| Build throughput | **520.55 modules/s** | 3800 modules / 7.30 s |
| Playwright discovery throughput | **83.33 tests/s** | 125 tests / 1.50 s |

## Метрики понятности для агента

| Метрика | Значение |
|---|---:|
| Required core entry docs present | **8/8** |
| Core entry docs LOC | **1504** |
| Largest core entry doc | **373 LOC** |
| Relative links checked in core docs | **114** |
| Broken relative links in core docs | **0** |
| Canonical agent commands documented | **2/2** |
| Production LOC median / p90 / p95 | **117 / 301 / 356** |
| Production files ≤300 LOC | **89.8%** |
| Top-10 production LOC concentration | **6.1%** |
| Imports per file median / p90 / max | **4 / 11 / 20** |
| Production files with discoverable named test | **240/459 (52.3%)** |
| TODO/FIXME/HACK markers in production | **0** |

Named-test discoverability — это поиск test-файла по basename production-файла,
а не утверждение о coverage. Низкое значение показывает стоимость навигации,
но не доказывает отсутствие теста через публичный сценарий или owner harness.


## Исполняемые проверки

| Контур | Статус | Wall time |
|---|---|---:|
| `npm run test:agent-gates` | **PASS** | 12.40 с |
| `npm run test:agent-dod` | **PASS** | 255.08 с |
| `npx playwright test --list` | **PASS** · 125 tests | 1.50 с |
| Browser/E2E live run | **NOT-RUN** | не запускалось |

## Воспроизводимость

| Артефакт | Есть |
|---|---:|
| `frontend/package-lock.json` | **yes** |
| `frontend/.env.example` | **yes** |
| `.nvmrc` | **yes** |
| `.node-version` | **yes** |
| `docker-compose.yml` | **yes** |
| `docker-compose.e2e.yml` | **yes** |
| `frontend/package.json#engines.node` | `^20.19.0 || ^22.13.0 || >=24.0.0` |

## Команда пересчёта

```bash
node scripts/frontend-agent-metrics.mjs \
  --gates-status=pass --gates-seconds=12.40 \
  --dod-status=pass --dod-seconds=255.08 \
  --unit-tests=1178 --unit-seconds=235.39 \
  --integration-tests=168 --integration-seconds=170.70 \
  --build-modules=3800 --build-seconds=7.30 \
  --e2e-list-status=pass --e2e-list-tests=125 --e2e-list-seconds=1.5 \
  --browser-status=not-run
```

## Ограничения интерпретации

- Баллы не выводятся автоматически из одного счётчика: они являются калиброванной оценкой, а raw metrics делают сравнение следующих запусков проверяемым.
- Количество test cases вычисляется статически и является приблизительным; source of truth для pass/fail — исполняемые контуры.
- Успешный `playwright --list`, наличие E2E specs и baseline не равны live browser proof. Без запуска на приложении Browser/E2E остаётся `NOT RUN`.
- Dirty worktree означает, что snapshot описывает текущее дерево, а не только commit `452ec99`.

