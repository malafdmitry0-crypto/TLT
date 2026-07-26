# Frontend agent-friendliness — diff-wide minimum proof

**Status:** **CURRENT BINDING**  
**UTC:** 2026-07-26T23:04Z  
**Source HEAD:** `662b8e5` (`feat(tooling): enforce diff-wide minimum proof`)  
**Branch:** `main` · worktree **clean**  
**Host:** darwin 23.6.0 arm64 · Node v23.5.0 · npm 10.9.2  
**Supersedes:** [ESLint/Vite cache seal](../2026-07-27-eslint-cache-agent-friendliness/snapshot.md)

## 1. Итог

| Представление | До | После |
|---|---:|---:|
| Экспертная agent-friendly оценка | **9.3/10** | **9.5/10** |
| Машинный коллектор | **8.67/10** | **8.71/10** |
| Запутанность, меньше лучше | **2.0/10** | **2.0/10** |
| Fast gate | 8.42–9.03 s | **7.12 s** |
| Diff-wide proof sufficiency | prompt only | **implemented + guarded** |

Машинный score не моделирует главное изменение — обязательный minimum proof,
consumer blast radius и content-bound receipts — поэтому экспертная оценка
остаётся итоговой.

## 2. Экспертная оценка

| Область | Вес | Score | Основание |
|---|---:|---:|---|
| Вход и документация | 15% | **9.8** | единый changed-flow в AGENTS/стандарте; exact CLI |
| Guardrails и архитектура | 20% | **9.8** | fail-closed self-test; 31 architecture tests; gates PASS |
| Локальность и навигация | 10% | **9.2** | whole-diff owner routing; p90 301 LOC; named-test discoverability 51.9% |
| Скорость обратной связи | 15% | **9.5** | semantic minimization; gate 7.12 s; full DoD не скрытый default |
| Надёжность proof-петли | 20% | **9.8** | required minimum, consumers, signed receipt, stale/missing/failed rejection |
| Корректность агентского тулинга | 10% | **9.8** | staged/unstaged/untracked/delete/rename; exact cwd+argv; base diff |
| Browser/E2E доказуемость | 10% | **7.5** | discovery PASS; live browser U0 NOT RUN |
| **Итого** | **100%** | **9.5** | `0.15×9.8 + 0.20×9.8 + 0.10×9.2 + 0.15×9.5 + 0.20×9.8 + 0.10×9.8 + 0.10×7.5 = 9.465` |

## 3. Что реализовано

- `agent:scope -- --changed [--json] [--base <ref>]` анализирует весь diff.
- Учитываются staged, unstaged, untracked, delete и rename.
- Rename сохраняет старого и нового owner в blast radius.
- Risk: `local`, `owner`, `cross-owner`.
- Централизованная consumer-карта покрывает shared API, auth/session, routing,
  shared state, feedback, test harness, frontend tooling и CI orchestration.
- Required/optional proof хранится как exact `cwd + argv`.
- Semantic minimization не запускает architecture test повторно, если его уже
  полностью покрывает `test:agent-gates`.
- Full DoD никогда не добавляется автоматически:
  `required=false`, `policy=explicit-user-only`.
- `agent:proof-run` исполняет только разрешённые команды через argv без shell.
- Receipt связан с content signature и подписан локальным HMAC-ключом.
- `agent:proof-check` отклоняет ручную замену PASS, stale signature,
  missing/failed command и несовпадающий manifest.
- Receipts хранятся только под ignored `.agent-proof/`.
- `isolate` остаётся включённым во всех Vitest projects.

Локальный HMAC — tamper-evident механизм, а не security boundary против
процесса с полным доступом к машине.

## 4. Исполненный proof

| Проверка | Результат |
|---|---|
| `node --check` для трёх agent scripts | **PASS** |
| `agent-proof --self-test` | **PASS**, 29 checks |
| Реальный временный git-fixture | **PASS**: staged/unstaged/untracked/delete/rename |
| Local / owner / cross-owner examples | **PASS** |
| Shared API consumer plan | **PASS**, 5 consumers, 7 deduped required commands |
| Test harness plan | **PASS**, gates + integration |
| Vite/package/lock plan | **PASS**, tooling consumer mapping |
| Unknown / ambiguous / missing consumer | **FAIL-CLOSED** |
| Invalid npm script / unmatched test filter | **FAIL-CLOSED** |
| Stale / missing / failed / edited receipt | **FAIL-CLOSED** |
| Focused architecture guard | **PASS**, 1 file / 2 tests |
| `agent:scope --self-test` | **PASS** |
| `agent:scope --coverage` | **PASS**, unowned=0, multi-owner=0 |
| `agent:scope --proof-check` | **PASS**, 19/19 |
| Receipt-bound `test:agent-gates` | **PASS**, 7.12 s |
| S0/architecture | **PASS**, 27 files / 100 tests |
| CSS architecture | **PASS**, 4 files / 12 tests |
| Committed diff `--base 2a3cd86` | **PASS**, same content signature and receipt |
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
| Воспроизводимость дерева | **8.8** — clean |
| **Adjusted average** | **8.71/10** |

Сырые опорные значения:

- production TS/TSX: **462** файлов / **63 671** LOC;
- ≥400 / ≥450 / >500 LOC: **0 / 0 / 0**;
- max production LOC: **397**;
- production ≤300 LOC: **89.8%**;
- architecture / ratchet tests: **31 / 12**;
- approximate declared tests: **1 507**;
- E2E: **34** specs / **125** discovered tests;
- core docs: **8/8**, 136 links, **0** broken;
- named-test discoverability: **240/462 = 51.9%**;
- direct Ant imports: **139**;
- static collection: **200.9 ms**.

## 6. Остаточные ограничения

1. Live browser U0 остаётся `NOT RUN`.
2. Quiet-host full-cycle p50 ≤120 s ещё не подтверждён.
3. Consumer registry статический: новый shared boundary требует явного mapping,
   иначе planner должен упасть fail-closed.
4. Named-test discoverability остаётся 51.9%.
5. Direct Ant imports остаются 139.

Полный DoD и live browser нельзя считать зелёными: оба контура в этой оценке
имеют статус `NOT RUN`.
