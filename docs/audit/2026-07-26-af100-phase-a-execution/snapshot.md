# AF100 Phase A + AF100-14 — исполнение и приёмка

**Статус:** execution snapshot (не binding scorecard)
**UTC:** 2026-07-26T16:10–16:25Z
**HEAD на старте:** `54f2929` · branch `main`
**Host:** darwin 23.6.0 arm64 · Node v23.5.0 · npm 10.9.2
**Опорный аудит:** [af-independent-execution-audit](../2026-07-26-af-independent-execution-audit/snapshot.md)

Закрыты slices **AF100-02, -03, -04, -05, -14**. Каждый — с guard по
[плану §2.1](../../frontend/agent-friendly-10-plan.md), показанным красным на
сломанном входе.

**Не закрыт:** AF100-06 — в момент работы файл `ReportPage.export.test.tsx`
был занят WIP другой сессии; по стандарту §9 чужой WIP не трогаем.

---

## 1. Что изменено

| Slice | Изменение | Файлы |
|---|---|---|
| AF100-03 | `css:architecture` → fail-closed gate: резолвит группы ratchet-файлов, падает с именем пропавшей группы | `frontend/scripts/css-architecture-gate.mjs`, `+.d.mts`, `package.json` |
| AF100-04 | Удалён PostToolUse hook на несуществующий `scripts/sync-docs.py`; добавлен root `AGENTS.md` (маршрутизация) | `.claude/settings.json`, `AGENTS.md` |
| AF100-05 | Удалён `frontend/playwright.config.ts` — Playwright живёт только в `e2e/`; cwd задокументирован | `frontend/playwright.config.ts` (del), `frontend/AGENTS.md` |
| AF100-14 | 70 артефактов прогонов из корня → `docs/audit/2026-07-26-root-artifact-sweep/artifacts/`; `tmp/` (259 файлов) untracked + `.gitignore` | root, `.gitignore` |
| AF100-02 | Guard на исполнимость emitted-команд (сам фикс приехал в `54f2929`) | новый architecture-тест |

## 2. Guards, оставшиеся в дереве

| Guard | Проверяет | Failure path показан |
|---|---|---|
| `cssArchitectureGate.architecture.test.ts` | `css:architecture` указывает на fail-closed gate; все группы резолвятся | да — группа с пропавшим файлом и группа с `min+99` |
| `agentEntrypoints.architecture.test.ts` | пути скриптов во всех hook-командах существуют; root `AGENTS.md` маршрутизирует; ровно один Playwright config | да — распознаёт `scripts/sync-docs.py` как отсутствующий |
| `repoRootHygiene.architecture.test.ts` | в корне нет tracked артефактов; allowlist корневых файлов; `AGENTS.md` отслеживается | да — **поймал реальный пропуск**: `AGENTS.md` не был в индексе |
| `agentScopeCommands.architecture.test.ts` | emitted-команды: нет prose, npm-скрипты существуют, path-фильтры что-то матчат | да — prose-маркер и несуществующий фильтр |

Итого +18 тестов; `test:s0-gates` вырос 58 → 76.

## 3. Измерения

| Проверка | До | После |
|---|---|---|
| `npm run css:architecture` | `Test Files 1 passed` (2 теста), exit 0 при удалённом target | **4 файла / 12 тестов**; удалённый ratchet → **exit 1** с именем группы |
| `npx playwright test --list` из `frontend/` | crash `Requiring @playwright/test second time` | ошибка без crash, exit 1; рабочая точка — `e2e/` (125 тестов / 34 файла) |
| PostToolUse hook | предупреждение на каждую правку, скрипт отсутствует | hook удалён; все оставшиеся hook-скрипты существуют |
| Tracked файлов в корне | 84 (70 артефактов) | **14**, все — конфигурация |
| Tracked `tmp/` | 259 файлов | 0 (файлы остались на диске) |
| Root entrypoint | нет | `AGENTS.md` |
| `npm run test:agent-gates` | PASS 9.1–16.1 s | **PASS 9.5 s** (typecheck 7.8 · lint 6.9 · s0 9.5 · css 2.1) |

Проверка exit-кодов gate:
```
GATE_EXIT_MISSING=1     # ratchet-файл убран
GATE_EXIT_RESTORED=0    # возвращён
```

## 4. Воспроизведение

```bash
cd frontend
npm run test:agent-gates
npx vitest run src/__tests__/unit/architecture/agentEntrypoints.architecture.test.ts \
               src/__tests__/unit/architecture/repoRootHygiene.architecture.test.ts \
               src/__tests__/unit/architecture/cssArchitectureGate.architecture.test.ts \
               src/__tests__/unit/architecture/agentScopeCommands.architecture.test.ts
cd ../e2e && npx playwright test --list
```

## 5. Осталось открытым

| Slice | Почему |
|---|---|
| AF100-06 | файл занят WIP другой сессии; нужен focused stress ≥20/20 + full proof 3/3 |
| AF100-07 | по нормативной цепочке — после 06 и 08; CI сейчас `test:agent-dod`, доки — dual-safe |
| AF100-08, -09+ | профиль на quiet host n≥3, затем harness-работа до p50 ≤120 s |
| AF100-10+, -11+, -12, -13, -15, -16 | inventory / browser / docs / финальная приёмка |
