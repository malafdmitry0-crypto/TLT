# Frontend agent speed and clarity metrics

**UTC:** 2026-07-25T23:18:55.350Z  
**Verified source HEAD:** `e7ebfc6` · branch `main` · worktree clean before this snapshot  
**Host:** dmitrys-MacBook-Pro.local · Darwin 23.6.0 arm64 · Node v23.5.0 · npm 10.9.2  
**Status:** **PASS** for static scan, fast gate, unit, integration, build and
Playwright discovery; Browser/E2E live run **NOT RUN**

Этот snapshot расширяет базовую шкалу отдельными метриками скорости feedback
loop и понятности дерева для coding agents. Баллы исходной шкалы здесь не
пересчитываются автоматически.

## Скорость для агента

| Метрика | Результат | Что показывает |
|---|---:|---|
| Static metrics collection | **230,4 мс** | стоимость read-only инвентаризации дерева |
| Fast gate | **10,82 с** | минимальный type/lint/architecture feedback |
| Full DoD | **289,28 с** | gates + unit + integration + production build |
| Fast gate / Full DoD | **3,7%** | короткий feedback существенно дешевле полного proof |
| Unit branch | **1 160 tests / 264,67 с** | **4,38 tests/s** |
| Integration branch | **168 tests / 185,73 с** | **0,90 tests/s** |
| Production build | **3 800 modules / 9,58 с** | **396,66 modules/s** |
| Playwright discovery | **125 tests / 0,88 с** | **142,05 tests/s** |

Unit и integration выполнялись параллельно. Общий wall-time тестовой волны
определила unit-ветка: **264,67 с** против **185,73 с** integration.

### Сравнение с предыдущим наблюдением

| Контур | Предыдущий snapshot | Сейчас | Изменение |
|---|---:|---:|---:|
| Fast gate | 8,37 с | 10,82 с | **+29,3%** |
| Full DoD | 266,77 с | 289,28 с | **+8,4%** |
| Unit | 250,58 с | 264,67 с | **+5,6%** |
| Integration | 157,13 с | 185,73 с | **+18,2%** |
| Build | 8,19 с | 9,58 с | **+17,0%** |

Это два одиночных запуска на меняющемся дереве, а не benchmark median.
Изменение нельзя объявлять performance-регрессией без нескольких warm runs на
одном commit и свободном host. Уже наблюдавшийся разброс gates внутри этой
сессии — **10,82 с** отдельно и **14,85 с** внутри DoD — подтверждает влияние
host load.

## Понятность для агента

### Вход и документация

| Метрика | Результат |
|---|---:|
| Required core entry docs present | **8/8** |
| Core entry docs LOC | **1 482** |
| Largest core entry doc | **373 LOC** |
| Relative links checked | **85** |
| Broken relative links | **0** |
| Canonical agent commands documented | **2/2** |

Проверялись:

- `frontend/AGENTS.md`;
- `docs/frontend/README.md`;
- `agent-development-standard.md`, `pr-budget.md`, `refactor-backlog.md`;
- `ui-kit.md`, `css-strategy.md`, `viewport-policy.md`.

### Стоимость production-контекста

| Метрика | Результат |
|---|---:|
| Production TS/TSX files | **436** |
| Production LOC | **62 589** |
| LOC median / p90 / p95 | **116 / 324 / 394** |
| Production files ≤300 LOC | **86,9%** |
| Production files ≥400 LOC | **19** |
| Production files ≥450 LOC | **0** |
| Production files >500 LOC | **0** |
| Max production file | **443 LOC** · `frontend/src/utils/heatCalcInlineEdit.ts` |
| Top-10 LOC concentration | **6,8%** |
| Imports median / p90 / max | **4 / 11 / 20** |
| Files with >20 imports | **0** |
| TODO/FIXME/HACK markers | **0** |

Низкая концентрация top-10 и нулевые bands ≥450 означают, что агенту редко
нужно открывать один доминирующий production-монолит. P95 **394 LOC** всё ещё
показывает заметный верхний хвост контекстов и остаётся полезным ratchet.

### Находимость тестов

| Метрика | Результат |
|---|---:|
| Unit/integration test files | **311** |
| Approximate declared tests including E2E | **1 444** |
| Production files with discoverable basename-matched test | **233/436 (53,4%)** |
| Architecture tests | **14** |
| Ratchet tests | **9** |
| E2E specs | **24** |
| Playwright tests discovered | **125** |

`basename-matched test` означает, что production-файл `Foo.ts(x)` можно найти
рядом с `Foo.test.ts(x)` или scenario-файлом `Foo.*.test.ts(x)`. Это метрика
навигации, а не coverage: публичный сценарий, page-level test или owner harness
может покрывать файл под другим именем.

Главный измеримый резерв понятности: **46,6%** production-файлов не имеют
теста, очевидно находящегося по basename. Улучшать это следует документацией
owner/harness и осмысленными scenario names, а не механическим созданием
пустых test-файлов.

## Исполняемые проверки

| Контур | Статус | Wall time | Результат |
|---|---|---:|---|
| `npm run test:agent-gates` | **PASS** | **10,82 с** | typecheck + lint + architecture/CSS |
| Gate внутри DoD | **PASS** | **15,03 с** | parallel gate wall **14,85 с** |
| Unit внутри DoD | **PASS** | **264,67 с** | 261 files / 1 160 tests |
| Integration внутри DoD | **PASS** | **185,73 с** | 34 files / 168 tests |
| Build внутри DoD | **PASS** | **9,58 с** | 3 800 modules |
| `npm run test:agent-dod` | **PASS** | **289,28 с** | полный frontend proof |
| `npx playwright test --list` | **PASS** | **0,88 с** | 125 tests / 24 files |
| Browser/E2E live run | **NOT RUN** | — | стек приложения не запускался |

## Команда пересчёта

```bash
node scripts/frontend-agent-metrics.mjs \
  --gates-status=pass --gates-seconds=10.82 \
  --dod-status=pass --dod-seconds=289.28 \
  --unit-tests=1160 --unit-seconds=264.67 \
  --integration-tests=168 --integration-seconds=185.73 \
  --build-modules=3800 --build-seconds=9.58 \
  --e2e-list-status=pass --e2e-list-tests=125 --e2e-list-seconds=0.88 \
  --browser-status=not-run

cd frontend
npm run test:agent-gates
npm run test:agent-dod

cd ../e2e
npx playwright test --list
```

## Ограничения

- Runtime speed — единичное наблюдение, не median и не performance gate.
- Static test count приблизительный; pass/fail берётся из исполняемых команд.
- Playwright discovery не является live browser proof.
- Snapshot относится к source HEAD `e7ebfc6`; его собственный docs commit будет
  следующим commit в истории.
