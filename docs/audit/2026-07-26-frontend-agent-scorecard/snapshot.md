# Frontend agent-friendliness metrics

**UTC:** 2026-07-25T23:09:39.539Z  
**HEAD:** `a71a27e` · branch `main` · worktree dirty (6 entries at collection time)  
**Host:** dmitrys-MacBook-Pro.local · Darwin 23.6.0 arm64 · Node v23.5.0 · npm 10.9.2  
**Status:** **PASS** for static metrics, fast gate, unit, integration and build; live Browser/E2E **NOT RUN**  
**Scope:** current working tree; scores are the supplied expert calibration, raw
metrics below are machine-collected evidence.

## Шкала

| Критерий | Оценка | Проверяемая опора |
|---|---:|---|
| Понятность входа и документации | **9,4** | docs/README/AGENTS + канонические команды |
| Запутанность, где меньше — лучше | **3,0** | LOC и import-context |
| Архитектурные границы | **9,3** | architecture/ratchet tests + gates |
| Локальность изменений | **8,2** | размер production-контекстов |
| UI Kit на базе Ant | **8,7** | kit modules/stories + public barrel usage |
| Надёжность тестов и ratchets | **9,0** | test inventory + исполняемые gates |
| Скорость малого изменения | **9,2** | wall time `test:agent-gates` |
| Скорость полного цикла | **6,8** | wall time `test:agent-dod` |
| Browser/E2E доказуемость | **8,0** | specs/baselines; live run отдельно |
| Воспроизводимость текущего дерева | **7,8** | lockfiles/toolchain/worktree state |

**Сводная оценка:** **8,34 / 10**. Для обратного критерия
«Запутанность» в среднем используется `10 − 3,0 = 7,0`.

## Сырые метрики

| Метрика | Значение |
|---|---:|
| Production TS/TSX files | **434** |
| Production LOC | **62 471** |
| Production files ≥400 LOC | **20** |
| Production files ≥450 LOC | **0** |
| Production files >500 LOC | **0** |
| Max production LOC | **444** · `frontend/src/pages/electrical/useElecCalcElectricalColumnRenderers.tsx` |
| Production files with >20 imports | **0** |
| Max imports in production file | **20** · `frontend/src/main.tsx` |
| UI-kit production modules | **6** |
| UI-kit stories | **9** |
| Production consumers of public UI-kit barrel | **87** |
| Production files importing Ant directly | **156** |
| Unit/integration test files | **311** |
| Architecture test files | **14** |
| Ratchet test files | **9** |
| Approximate declared test cases | **1 444** |
| E2E spec files | **24** |
| Playwright tests discovered by config | **125** |
| Visual regression PNG baselines | **4** |
| Dated audit snapshots before this snapshot | **35** |
| Dirty worktree entries at collection time | **6** |

## Исполняемые проверки

| Контур | Статус | Wall time | Результат |
|---|---|---:|---|
| `npm run test:agent-gates` | **PASS** | **8,37 с** | typecheck + lint + 15 S0 files / 57 tests + 2 CSS files / 12 tests |
| `npm run test:agent-dod` | **PASS** | **266,77 с** | gates + unit + integration + production build |
| Unit branch inside DoD | **PASS** | **250,58 с** | 261 files / 1 160 tests |
| Integration branch inside DoD | **PASS** | **157,13 с** | 34 files / 168 tests |
| Production build inside DoD | **PASS** | **8,19 с** | 3 798 modules transformed |
| `npx playwright test --list` | **PASS** | **1,33 с** | 125 tests / 24 files |
| Browser/E2E live run | **NOT RUN** | — | приложение/стек в этом аудите не запускались |

`test:agent-dod` показал измеряемое узкое место полного цикла: на этом запуске
wall-time определила unit-ветка (**250,58 с**), а не integration
(**157,13 с**).

## Воспроизводимость

| Артефакт | Есть |
|---|---:|
| `frontend/package-lock.json` | **yes** |
| `frontend/.env.example` | **yes** |
| `.nvmrc` | **yes** |
| `.node-version` | **yes** |
| `docker-compose.yml` | **yes** |
| `docker-compose.e2e.yml` | **yes** |
| `frontend/package.json#engines.node` | `^20.19.0 \|\| ^22.13.0 \|\| >=24.0.0` |

## Команды

```bash
node scripts/frontend-agent-metrics.mjs \
  --gates-status=pass --gates-seconds=8.37 \
  --dod-status=pass --dod-seconds=266.77 \
  --e2e-list-status=pass --e2e-list-tests=125 --e2e-list-seconds=1.33 \
  --browser-status=not-run

cd frontend
npm run test:agent-gates
npm run test:agent-dod

cd ../e2e
npx playwright test --list
```

## Ограничения интерпретации

- Баллы не выводятся автоматически из одного счётчика: это калиброванная
  оценка, а raw metrics делают сравнение следующих запусков проверяемым.
- Количество test cases вычисляется статически и является приблизительным;
  source of truth для pass/fail — исполняемые контуры.
- Успешный `playwright --list`, наличие E2E specs и baseline не равны live
  browser proof. В этом snapshot Browser/E2E честно остаётся `NOT RUN`.
- Dirty worktree означает, что snapshot описывает текущее дерево, а не только
  commit `a71a27e`.
