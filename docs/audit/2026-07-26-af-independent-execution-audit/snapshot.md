# Frontend agent-friendliness — независимый аудит исполнением

**Статус:** independent audit, **НЕ binding card**
(binding остаётся [2026-07-26-agent-metrics-binding](../2026-07-26-agent-metrics-binding/snapshot.md), 8.3/10 @ `a9b4cb3`)
**UTC:** 2026-07-26T15:20–15:45Z
**HEAD:** `ae5effb` · branch `main` · **worktree dirty (22)** — WIP split тестов не закоммичен
**Host:** darwin 23.6.0 arm64 · Node v23.5.0 · npm 10.9.2
**Метод:** не пересчёт статики, а **запуск** документированного agent loop и проверка,
что каждая обязательная команда делает то, что обещает.

---

## 1. Оценка

| Область | Вес | Оценка | Основание (исполнено) |
|---|---:|---:|---|
| Вход и документация | 15% | **8.5** | 12/12 документированных `npm run` существуют; 0 broken links; CI = `test:agent-dod`; но нет root-entrypoint и расхождение AGENTS ↔ стандарт по каноничному DoD |
| Guardrails и архитектура | 20% | **9.3** | ESLint `[Arch:*]` с `FIX:`; 12 ratchets; prod: `any` 0, `@ts-ignore` 0, `eslint-disable` 3, ≥400 LOC 0 |
| Локальность и навигация | 10% | **8.8** | median 116 / p90 301 LOC; ≤300 89.8%; max imports 20; named-test discoverability 51.9% |
| Скорость обратной связи | 15% | **7.5** | gates **7.9–16.1 s** (3 замера); полный DoD **206.7 s**; цель ≤120 s открыта |
| **Надёжность proof-петли** | 20% | **5.5** | `test:agent-dod:dual-safe` — **FAIL 2/2** на чистом дереве |
| **Корректность агентского тулинга** | 10% | **5.5** | `agent:scope` падает на **69/476** prod-файлов; hook ссылается на несуществующий скрипт |
| Browser/E2E доказуемость | 10% | **6.5** | 125 тестов / 34 spec листятся за 1.6 s из `e2e/`; из `frontend/` discovery **крэшится**; U0 re-seal NOT RUN |
| **Итого** | 100% | **7.4 / 10** | `0.15×8.5 + 0.20×9.3 + 0.10×8.8 + 0.15×7.5 + 0.20×5.5 + 0.10×5.5 + 0.10×6.5 = 7.44` |

Расхождение с binding 8.3 — не спор о статике (она подтверждается), а следствие того,
что здесь **исполнены** тулинг и proof-петля, а не только пересчитаны счётчики.

---

## 2. Что подтвердилось как сильное

| Факт | Замер |
|---|---|
| Fast gate быстрый и зелёный | `test:agent-gates` PASS, wall **7.87 / 13.03 / 16.14 s** |
| Diagnostics ESLint написаны для агента | каждое правило = `[Arch:CODE] … FIX: <действие>` |
| Type-escape реально нулевой | prod `src/`: `as any`/`: any` **0**, `@ts-ignore`/`@ts-expect-error` **0** |
| Размер файлов под контролем | prod ≥400 LOC **0**, max **397** (`useHeatCalcNormalGlideController.ts`) |
| Документация не врёт про команды | 12/12 `npm run` из AGENTS+docs существуют в `frontend/` или `e2e/package.json` |
| Local == CI | `.github/workflows/ci.yml` запускает тот же `npm run test:agent-dod` |
| Навигация по метрикам однозначна | `docs/frontend/README.md` → binding card; 5 score-документов, 5 помечены superseded |
| Канонический DoD зелёный | `npm run test:agent-dod` **PASS**, total wall **206.71 s** (gates 7.87 + suites 191.89 + build 6.95) |

---

## 3. Дефекты, найденные исполнением

### D1 — `test:agent-dod:dual-safe` красный 2/2 на чистом дереве (blocker петли)

| Прогон | Условия | Результат | Wall |
|---|---|---|---:|
| 1 | под параллельной нагрузкой | **FAIL** `ReportPage.export` → «клик по PDF триггерит exportReport» | 283.3 s |
| 2 | машина свободна | **FAIL** `ReportPage.export` → «фиксирует UUID и имя ЭР…» | 149.3 s |
| 3 | `test:agent-dod` (канон, workers 2/2) | **PASS** | 206.7 s |
| 4 | файл изолированно | **PASS** 2/2 теста | 7.4 s |

Корень: `src/__tests__/integration/pages/ReportPage.export.test.tsx:52,103` — `waitFor(..., { timeout: 15_000 })`
жёстко привязан к wall-clock, а dual-safe поднимает unit до `maxWorkers=4` параллельно с integration.
Побочный эффект: `[agent-dod] FAIL test:integration — terminating sibling` убивает уже почти
досчитанный unit-прогон, т.е. флейк стоит полного цикла.

Последствие для агента: AGENTS.md рекомендует dual-safe как основной pre-commit proof, а стандарт §9
говорит «полный gate красный → `blocked`». Дисциплинированный агент останавливается на зелёном коде.

### D2 — `agent:scope` падает на 14.5% prod-файлов

Обязательный первый шаг (`AGENTS.md`: «run first on the file you touch»).
Прогон по всем 476 prod `.ts/.tsx`: **OK 407 · ambiguous 69**.

```
$ npm run agent:scope -- src/hooks/useHeatCalcNormalGlideController.ts
agent:scope: ambiguous path: hooks/useHeatCalcNormalGlideController.ts
matches: heat-pages(heat), hooks(shared)
Fix rule order/specificity in scripts/agent-scope.mjs
```

Провал бьёт ровно по самым спорным зонам: `src/utils/heatCalc*`, `src/utils/electrical*`,
`src/hooks/*`, `src/types/specification.ts` — там, где owner и нужен. Самый большой prod-файл репозитория
не маршрутизируется.

Дополнительно: для shared-зоны `recommended_commands` неисполним —
`npx vitest run path-matched unit under src/__tests__/unit/components --project unit --project integration`
не команда, а фраза.

### D3 — PostToolUse hook даёт ложную тревогу на каждый Write/Edit

`.claude/settings.json` → `if ! scripts/sync-docs.py --check; then ⚠️ Docs drift`.
Файла `scripts/sync-docs.py` в репозитории **нет** (`scripts/` содержит 23 других файла).
Отсутствующий скрипт → ненулевой exit → условие всегда истинно → агент получает
«⚠️ Docs drift — запусти scripts/sync-docs.py» после **каждой** правки и отправляется искать несуществующий инструмент.

### D4 — Playwright discovery крэшится из `frontend/`

```
frontend $ npx playwright test --list   → Error: Requiring @playwright/test second time … Total: 0 tests
e2e $      npx playwright test --list   → Total: 125 tests in 34 files (1.6 s)
```

`frontend/playwright.config.ts` имеет `testDir: '../e2e/tests'`, но `e2e/` держит собственный
`node_modules/@playwright/test`. AGENTS.md велит агенту работать из `frontend/`, а рабочая
E2E-команда живёт только в `e2e/` (упомянута один раз, в стандарте §7.4).

### D5 — `css:architecture` молча недорабатывает

`package.json` → `vitest run …/cssArchitectureRatchet.architecture.test.ts …/cssImportantRatchet…`.
Первый файл удалён текущим WIP (разбит на `.freeze` / `.metrics-fixtures` / `.responsive-order`).
Vitest при нескольких фильтрах, где хотя бы один совпал, **не падает**: `Test Files 1 passed`, exit 0.
Одиночная ссылка на удалённый файл даёт exit 1 — то есть маскирует именно комбинация.
Сами ratchets ещё выполняются через `test:s0-gates` (glob по каталогу), поэтому это не дыра в покрытии,
а зелёный сигнал от команды, которая проверила половину заявленного.

### D6 — шум в корне репозитория

96 записей в корне, из них **62 закоммиченных PNG-скриншота** (`heat-ui-*`, `phase2-*`, `tlt-recheck-*`),
плюс отслеживаемый `tmp/` на 258 файлов и 8 `.md`/`.txt`-артефактов прогонов.
Ни `AGENTS.md`, ни `CLAUDE.md`, ни `README.md` в корне нет — агент, стартующий с корня
монорепо (backend / frontend / e2e / qa-agent), не имеет входа и первым делом видит свалку артефактов.

### D7 — два нормативных документа расходятся о каноничном DoD

`agent-development-standard.md` §7.4: «`npm run test:agent-dod` … Не собирай альтернативную
"полную" команду».
`frontend/AGENTS.md`: «Prefer dual-safe concurrent orchestrator: `test:agent-dod:dual-safe`».
Иерархия формально разрешает конфликт в пользу AGENTS.md — и это ведёт агента к красной команде (D1).

---

## 4. Приоритет исправлений

| # | Действие | Эффект |
|---|---|---|
| 1 | Убрать wall-clock зависимость в `ReportPage.export.test.tsx` (fake timers / mock export promise) либо снять `maxWorkers=4` в dual-safe | зелёная pre-commit петля |
| 2 | Правила специфичности в `scripts/agent-scope.mjs`: `hooks/` и `utils/` по префиксу имени → feature-owner | 69 файлов возвращаются в маршрутизацию |
| 3 | Починить или удалить PostToolUse hook в `.claude/settings.json` | минус одна ложная тревога на каждую правку |
| 4 | Обновить `css:architecture` под новые имена файлов | честный зелёный |
| 5 | Root `AGENTS.md` (3 строки: где что + `cd frontend`), `e2e/` как место запуска Playwright | вход с корня |
| 6 | `git rm --cached *.png` в корне + `.gitignore` | −62 файла шума |
| 7 | Синхронизировать §7.4 стандарта с AGENTS.md | одна каноничная команда |

---

## 5. Команды воспроизведения

```bash
cd frontend
npm run test:agent-gates                        # 7.9–16.1 s, PASS
npm run test:agent-dod                          # 206.7 s, PASS
npm run test:agent-dod:dual-safe                # 149–283 s, FAIL (ReportPage.export)
npx vitest run --project integration src/__tests__/integration/pages/ReportPage.export.test.tsx  # 7.4 s, PASS
for f in $(find src -name '*.ts*' | grep -v __tests__); do node ../scripts/agent-scope.mjs "$f"; done
npx playwright test --list                      # crash; работает только из ../e2e
cd .. && node scripts/frontend-agent-metrics.mjs
```

Незапущенное: live browser U0 re-seal (остаётся открытым и в binding card).
