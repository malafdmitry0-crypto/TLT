# Frontend agent-friendliness — ESLint/Vite cache seal

**Status:** **CURRENT BINDING**  
**UTC:** 2026-07-26T22:49Z  
**Source HEAD:** `eaa9c1c` (`fix(frontend): exclude Vite cache from lint gates`)  
**Branch:** `main`  
**Host:** darwin 23.6.0 arm64 · Node v23.5.0 · npm 10.9.2  
**Supersedes:** [proof-policy assessment](../2026-07-27-agent-friendliness-proof-policy/snapshot.md)

Оценка относится к committed fix `eaa9c1c`. Во время сбора в worktree
оставались три чужих AF100-09c файла; они не вошли в fix commit и учтены
машинным коллектором как dirty worktree.

## 1. Итог

| Представление | До исправления | После |
|---|---:|---:|
| Экспертная agent-friendly оценка | **8.6/10** | **9.3/10** |
| Машинный коллектор | **8.63/10** | **8.67/10** |
| Запутанность, меньше лучше | **2.0/10** | **2.0/10** |
| Fast gate | **FAIL**, 1 803 generated-code errors | **PASS 2/2**, 8.42 / 9.03 s |

Машинный score растёт мало, потому что его формула не штрафует сам `FAIL`
достаточно сильно и продолжает учитывать full DoD/live browser как `NOT RUN`,
а worktree как dirty. Экспертная оценка учитывает устранение
воспроизводимого дефекта agent loop.

## 2. Экспертная оценка

| Область | Вес | Score | Основание |
|---|---:|---:|---|
| Вход и документация | 15% | **9.7** | proof-policy + executable risk-based minimum prompt |
| Guardrails и архитектура | 20% | **9.7** | новый ESLint API guard; gates PASS 2/2; 30 architecture tests |
| Локальность и навигация | 10% | **9.0** | unique owner routing; p90 301 LOC; named-test discoverability 51.9% |
| Скорость обратной связи | 15% | **9.4** | warm-cache gates 8.42 / 9.03 s |
| Надёжность proof-петли | 20% | **9.2** | generated cache больше не меняет результат lint; CI full сохраняется |
| Корректность агентского тулинга | 10% | **9.7** | `eslint.config.js` теперь tooling-owned; 19/19 proof rules; implicit full запрещён |
| Browser/E2E доказуемость | 10% | **7.5** | discovery 125/34 PASS; live browser U0 NOT RUN |
| **Итого** | **100%** | **9.3** | `0.15×9.7 + 0.20×9.7 + 0.10×9.0 + 0.15×9.4 + 0.20×9.2 + 0.10×9.7 + 0.10×7.5 = 9.265` |

## 3. Дефект и защита

Vitest dependency optimizer создаёт `frontend/.vite/deps`. Git уже игнорировал
`.vite/`, но ESLint flat config не наследует `.gitignore`; поэтому
`eslint . --max-warnings 0` начинал проверять vendor bundles и падал
1 803 ошибками.

Исправление:

- `.vite/**` добавлен в глобальный `ignores` ESLint;
- executable architecture guard вызывает
  `ESLint.isPathIgnored()` для будущего `.vite/deps/generated-vendor.js` и
  source map;
- тот же guard доказывает, что `src/main.tsx` не скрыт;
- `agent:scope` маршрутизирует `frontend/eslint.config.js` к tooling-owner.

Characterization до исправления: **FAIL**, `isPathIgnored(...) = false`.
После исправления тот же тест: **PASS**.

## 4. Исполненный proof

| Проверка | Результат |
|---|---|
| Focused ESLint generated-artifact guard | **PASS**, 1/1 |
| `npm run test:agent-gates`, уже существующий `.vite` | **PASS**, 8.42 s |
| Повторный `npm run test:agent-gates`, тот же кэш | **PASS**, 9.03 s |
| Typecheck | **PASS** |
| S0/architecture | **PASS**, 26 files / 97 tests |
| CSS architecture | **PASS**, 4 files / 12 tests |
| `agent:scope --self-test` | **PASS** |
| `agent:scope --coverage` | **PASS**, unowned=0, multi-owner=0 |
| `agent:scope --proof-check` | **PASS**, 19/19 |
| `agent:scope --json frontend/eslint.config.js` | **PASS**, owner=tooling |
| Playwright discovery | **PASS**, 125 tests / 34 files |
| Full `test:agent-dod:dual-safe` | **NOT RUN** — пользователь не запрашивал |
| Live Browser/E2E | **NOT RUN** |

## 5. Машинные метрики

| Критерий | Score |
|---|---:|
| Понятность входа и документации | **9.4** |
| Запутанность, меньше лучше | **2.0** |
| Архитектурные границы | **9.3** |
| Локальность изменений | **9.4** |
| UI Kit на базе Ant | **8.8** |
| Надёжность тестов и ratchets | **9.2** |
| Скорость малого изменения | **9.4** |
| Скорость полного цикла | **6.8** — NOT RUN |
| Browser/E2E | **8.0** — discovery PASS, live NOT RUN |
| Воспроизводимость дерева | **8.3** — три чужих WIP-файла |
| **Adjusted average** | **8.67/10** |

Сырые опорные значения:

- production TS/TSX: **462** файлов / **63 671** LOC;
- ≥400 / ≥450 / >500 LOC: **0 / 0 / 0**;
- max production LOC: **397**;
- production ≤300 LOC: **89.8%**;
- architecture / ratchet tests: **30 / 12**;
- approximate declared tests: **1 505**;
- E2E: **34** specs / **125** discovered tests;
- core docs: **8/8**, 135 links, **0** broken;
- named-test discoverability: **240/462 = 51.9%**;
- direct Ant imports: **139**.

## 6. Остаточные ограничения

1. Risk-based `--changed`, blast-radius и content-bound receipts пока описаны
   prompt-ом, но ещё не реализованы.
2. Live browser U0 остаётся `NOT RUN`.
3. Quiet-host full-cycle p50 ≤120 s не подтверждён.
4. Named-test discoverability остаётся 51.9%.
5. Три чужих AF100-09c файла делают текущий worktree dirty.

Полный DoD и live browser нельзя считать зелёными: оба контура в этой оценке
имеют статус `NOT RUN`.
