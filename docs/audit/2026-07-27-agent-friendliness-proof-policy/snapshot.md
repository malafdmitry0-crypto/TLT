# Frontend agent-friendliness — binding assessment after proof-policy change

**Status:** **CURRENT BINDING**  
**UTC:** 2026-07-26T22:37Z  
**Source HEAD:** `0167963` (`docs(frontend): make full DoD explicitly opt-in`)  
**Branch:** `main`  
**Host:** darwin 23.6.0 arm64 · Node v23.5.0 · npm 10.9.2  
**Supersedes:** [AF reassessment @ bb2c6cd](../2026-07-26-af-reassessment/snapshot.md)

Оценка относится к committed policy в `0167963`. Во время сбора в worktree
было три чужих незакоммиченных frontend-файла; они не вошли в policy commit.
Коллектор честно учитывает dirty worktree в воспроизводимости.

## 1. Итог

| Представление | Оценка | Назначение |
|---|---:|---|
| Экспертная, по весам предыдущего независимого аудита | **9.2/10** | итоговая agent-friendly оценка |
| Машинный коллектор | **8.67/10** | воспроизводимая статическая опора |
| Запутанность, меньше лучше | **2.0/10** | контекст и размер production-файлов |

### Экспертная оценка

| Область | Вес | Score | Основание |
|---|---:|---:|---|
| Вход и документация | 15% | **9.6** | explicit user contract имеет приоритет; full DoD имеет одно имя и только opt-in |
| Guardrails и архитектура | 20% | **9.6** | gates PASS; 29 architecture tests; 12 ratchets; production ≥400 LOC = 0 |
| Локальность и навигация | 10% | **9.0** | owner routing unique; p90 301 LOC; named-test discoverability остаётся 51.9% |
| Скорость обратной связи | 15% | **9.2** | default gate 7.81 s; полный локальный цикл больше не скрытый default |
| Надёжность proof-петли | 20% | **9.0** | agent выбирает proof; CI сохраняет full matrix; риск слишком узкого выбора остаётся |
| Корректность агентского тулинга | 10% | **9.6** | 19/19 proof rules; unowned=0; multi-owner=0; implicit full DoD запрещён self-test |
| Browser/E2E доказуемость | 10% | **7.5** | discovery 125/34 PASS; live browser U0 NOT RUN |
| **Итого** | **100%** | **9.2** | `0.15×9.6 + 0.20×9.6 + 0.10×9.0 + 0.15×9.2 + 0.20×9.0 + 0.10×9.6 + 0.10×7.5 = 9.15` |

## 2. Что дала новая proof-policy

- Явные команды пользователя исполняются буквально.
- Когда пользователь молчит, агент выбирает минимально достаточный proof по
  изменённому поведению и риску.
- `agent:scope` рекомендует точные команды, но не расширяет прогон самовольно.
- Локальный `test:agent-dod:dual-safe` запускается только по явному запросу.
- CI остаётся владельцем полной merge/release матрицы.
- Незапущенная проверка получает `NOT RUN`, а не зелёный статус.
- `isolate` не отключён.

Практический эффект: обычный локальный feedback на измеренном запуске занял
**7.81 s**. Последний полный proof после AF100-09b занимал
**129.21–179.29 s** на загруженном хосте; он не является текущим acceptance
замером, но показывает порядок устранённого ожидания. Quiet-host p50 ≤120 s
по-прежнему не подтверждён.

## 3. Машинные оценки

| Критерий | Score |
|---|---:|
| Понятность входа и документации | **9.4** |
| Запутанность, меньше лучше | **2.0** |
| Архитектурные границы | **9.3** |
| Локальность изменений | **9.4** |
| UI Kit на базе Ant | **8.8** |
| Надёжность тестов и ratchets | **9.2** |
| Скорость малого изменения | **9.4** |
| Скорость полного цикла | **6.8** — текущий full DoD NOT RUN |
| Browser/E2E доказуемость | **8.0** — discovery PASS, live NOT RUN |
| Воспроизводимость текущего дерева | **8.3** — dirty=3 |
| **Adjusted average** | **8.67/10** |

## 4. Сырые метрики

| Метрика | Значение |
|---|---:|
| Production TS/TSX files | **462** |
| Production LOC | **63 671** |
| Production files ≥400 / ≥450 / >500 LOC | **0 / 0 / 0** |
| Max production LOC | **397** · `frontend/src/hooks/useHeatCalcNormalGlideController.ts` |
| Production files ≤300 LOC | **89.8%** |
| LOC median / p90 / p95 | **116 / 301 / 354** |
| Production files with >20 imports | **0** |
| Imports median / p90 / max | **4 / 11 / 20** |
| UI-kit modules / stories | **6 / 17** |
| Public UI-kit barrel consumers | **91** |
| Direct Ant imports | **139** |
| Unit/integration test files | **360** |
| Architecture / ratchet test files | **29 / 12** |
| Approximate declared tests | **1 501** |
| E2E specs / discovered tests | **34 / 125** |
| Named-test discoverability | **240/462 = 51.9%** |
| Core entry docs present | **8/8** |
| Core docs LOC / largest | **1 758 / 373** |
| Core relative links / broken | **134 / 0** |
| TODO/FIXME/HACK in production | **0** |
| Static collection wall | **191.7 ms** |

## 5. Исполненный proof

| Проверка | Результат |
|---|---|
| `node --check scripts/agent-scope.mjs` | **PASS** |
| `node scripts/agent-scope.mjs --self-test` | **PASS**, включая запрет implicit full DoD |
| `node scripts/agent-scope.mjs --coverage` | **PASS**, unowned=0, multi-owner=0 |
| `node scripts/agent-scope.mjs --proof-check` | **PASS**, 19/19 |
| `npm run test:agent-gates` | **PASS**, 7.81 s; 25 files / 94 tests; CSS 4 / 12 |
| `cd e2e && npx playwright test --list` | **PASS**, 125 tests / 34 files, 0.78 s |
| `npm run test:agent-dod:dual-safe` | **NOT RUN** — пользователь не запрашивал |
| Live Browser/E2E | **NOT RUN** |

## 6. Остаточные риски в порядке влияния

1. **Дискреционный proof может быть слишком узким.** Защита: точные
   `agent:scope` рекомендации, обязательный честный отчёт и full matrix в CI.
2. **Live browser U0 не перепроверен.** Это удерживает Browser/E2E на 7.5.
3. **Quiet-host full-cycle budget ≤120 s не подтверждён.** Текущая политика
   убирает его из default loop, но не доказывает физическое ускорение CI.
4. **Named-test discoverability 51.9%.** Почти половина production-файлов не
   находится по basename; owner routing компенсирует это не полностью.
5. **139 прямых Ant imports.** UI-kit migration остаётся незавершённой.
6. **Документационный вход растёт:** 1 758 LOC в восьми core docs. Ссылки
   целы, но дальнейшее дублирование правил ухудшит время ориентации.

## 7. Команда пересчёта

```bash
node scripts/frontend-agent-metrics.mjs \
  --gates-status=pass --gates-seconds=7.81 \
  --dod-status=not-run \
  --e2e-list-status=pass --e2e-list-tests=125 --e2e-list-seconds=0.78 \
  --browser-status=not-run
```

Полный DoD и live browser нельзя считать зелёными: оба контура в этой оценке
имеют статус `NOT RUN`.
