# AF100 — исполнительный план slices

**Статус:** implementation notes, **не очередь**
Маршрутизация `pending` и статусы — только в [refactor-backlog.md](../refactor-backlog.md).
Acceptance — только в [agent-friendly-10-plan.md](../agent-friendly-10-plan.md).
Здесь: корневая причина, конкретное изменение, команда приёмки и запреты для каждого slice.

**Опорный аудит:** [2026-07-26-af-independent-execution-audit](../../audit/2026-07-26-af-independent-execution-audit/snapshot.md)
**Перепроверено на:** HEAD `abb070a`, 2026-07-26

Каждый slice ниже закрывается только вместе с guard из
[плана §2.1](../agent-friendly-10-plan.md) и определением зелёного из §2.2:
исправление без машинной проверки, показанной красной на сломанном входе,
не является `done`.

---

## 0. Состояние находок на `abb070a`

| Дефект аудита | Slice | Статус (перемерено) |
|---|---|---|
| `agent:scope` ambiguous на 69/476 | AF100-01 | **закрыт** `e7ed259` — sweep 538/538 unique, fail 0 |
| `recommended_commands` содержат prose вместо argv | AF100-02 | открыт |
| `css:architecture` ссылается на удалённый файл, exit 0 | AF100-03 | открыт — подтверждён на `abb070a` |
| PostToolUse hook → отсутствующий `scripts/sync-docs.py` | AF100-04 | открыт |
| Нет root entrypoint (`AGENTS.md`/`README.md` в корне) | AF100-04 | открыт |
| `npx playwright test --list` из `frontend/` → 0 тестов | AF100-05 | открыт — подтверждён |
| `dual-safe` FAIL 2/2 (`ReportPage.export`) | AF100-06 | открыт |
| Расхождение AGENTS ↔ стандарт о каноничном DoD | AF100-07 | частично: доки сошлись на dual-safe, **CI по-прежнему `test:agent-dod`** |
| 62 PNG + `tmp/` в корне | AF100-14 | открыт |

---

## 1. Порядок: AF100-06 — NEXT (зафиксировано в backlog)

Backlog **NEXT = AF100-06** (не AF100-02). SoT: [refactor-backlog.md](../refactor-backlog.md).

Причина: стандарт §7.4 объявил `test:agent-dod:dual-safe` предпочтительным
agent path, а команда падает **2/2** на чистом дереве (`ReportPage.export`).
Каждый slice с `full_dod_required: true` обязан вставать в **`blocked`** по
§9, пока dual-safe красный. **Запрет:** закрывать любой slice ссылкой на
dual-safe PASS, пока AF100-06 `pending`.

Нормативная цепочка (hard blocks в таблице backlog):

```text
AF100-06 (flake)  →  AF100-08 (профиль)  →  AF100-07 (канонизация)  →  AF100-09+ (скорость)
```

| Стрелка | Block label |
|---|---|
| 06 → 08 | 08 blocked by 06 |
| 06+08 → 07 | 07 blocked by 06, 08 |
| 08 → 09+ | 09+ blocked by 08 (и 06) |

Канонизировать команду (07) до флейка (06) — закрепить красный CI.
Оптимизировать (09+) до профиля (08) — запрещено планом §2.

Phase A (02–05): parallel OK, **not NEXT**, не трогают runtime.

---

## 2. AF100-06 — `ReportPage.export` deterministic · owner `qa`

**Корневая причина.** `src/__tests__/integration/pages/ReportPage.export.test.tsx:52,103` —
`waitFor(..., { timeout: 15_000 })`. Это локальный wall-clock кап **строже**, чем
`testTimeout: 60_000` из `vite.config.ts`. Под `AGENT_DOD_UNIT_MAX_WORKERS=4`
integration делит CPU с unit, 15 s истекают до резолва экспорта. Изолированно
файл проходит за 7.4 s; в двух dual-safe прогонах упали **разные** тесты одного
файла — это нагрузка, а не логика.

**Изменение.** Убрать локальный кап и синхронизироваться по событию:
экспортный мок отдаёт deferred/promise, тест ждёт его резолва либо ждёт
пост-экспортного состояния через `findBy*`. Управление таймаутом остаётся у
suite-уровня.

Удаление избыточного 15 s капа **не является** «повышением timeout» в смысле
§2 плана: суммарный бюджет теста не растёт, снимается более строгий дубль.
Заменять `waitFor` на `sleep`, `retry`, `--retry=1` или поднимать `testTimeout`
выше 60 s — запрещено.

**Приёмка.**
```bash
cd frontend
npx vitest run --project integration src/__tests__/integration/pages/ReportPage.export.test.tsx --repeat 20   # 20/20
npm run test:agent-dod:dual-safe                                                                             # PASS
```

**Побочный slice-кандидат (не в этом запуске).** `[agent-dod] FAIL … terminating sibling`
убивает почти досчитанный unit-прогон: один флейк стоит полного цикла. Предложить
отдельным tooling-slice — дать обеим ветвям досчитаться и печатать сводку по обеим.

---

## 3. AF100-02 — исполнимый каталог focused proof · owner `tooling`

**Корневая причина.** В части правил `scripts/agent-scope.mjs` поле focused-тестов
хранит человеческую фразу, и она же интерполируется в `recommended_commands`:

```
npx vitest run path-matched unit under src/__tests__/unit/components --project unit --project integration
```

**Изменение.** Разделить поля жёстко: `focusedProof.argv` — массив реальных argv
(пути/флаги, ничего кроме); `notes` — свободный текст, который **никогда** не
попадает в командную строку. Все зоны получают argv; при отсутствии точного
пути правило отдаёт ближайший существующий каталог, а не описание.

**Приёмка.** Новый тест-каталог, исполняющий emitted-команды для всех правил:
каждый путь из argv существует на диске; каждый `npm run X` есть в
`frontend/package.json` или `e2e/package.json`; smoke-запуск не падает на
разборе аргументов. Плюс намеренный failure path — правило с несуществующим
путём делает тест красным.

---

## 4. AF100-03 — fail-closed CSS gate · owner `tooling`

**Корневая причина.** `frontend/package.json:22` перечисляет
`cssArchitectureRatchet.architecture.test.ts` (удалён при split на `.freeze` /
`.metrics-fixtures` / `.responsive-order`) и `cssImportantRatchet…`. Vitest при
нескольких фильтрах, где совпал хотя бы один, **не падает**: `Test Files 1 passed`,
exit 0. Одиночная ссылка на удалённый файл даёт exit 1 — маскирует именно комбинация.

**Изменение.** Не расширять glob «на всякий случай», а сделать gate fail-closed:
`scripts/css-architecture-gate.mjs` резолвит targets по явному манифесту/glob,
проверяет, что каждый ожидаемый target существует, и только затем запускает vitest.
Отсутствующий или переименованный файл → exit 1 с именем пропавшего target.

**Приёмка.** Временно переименовать один ratchet-файл → `npm run css:architecture`
красный с указанием файла; вернуть имя → зелёный. Число исполняемых ratchets в
выводе совпадает с манифестом.

---

## 5. AF100-04 — живые hooks и root entrypoint · owner `tooling`

**Корневая причина A.** `.claude/settings.json` → PostToolUse:
`if ! scripts/sync-docs.py --check …; then ⚠️ Docs drift`. Файла нет →
ненулевой exit → условие истинно **всегда** → после каждой правки агент
получает предупреждение и отсылку к несуществующему инструменту.

**Изменение A.** Удалить блок. Реализовывать `sync-docs.py` не нужно: контроль
дрейфа документации закрывается AF100-15 и gates, а «предупреждение без
проверяющего» — чистый шум. Если позже понадобится реальный контроль — это
отдельный slice с собственным acceptance.

**Корневая причина B.** В корне монорепо (`backend/`, `frontend/`, `e2e/`,
`qa-agent/`) нет ни `AGENTS.md`, ни `README.md`; вход есть только у `frontend/`.

**Изменение B.** Короткий root `AGENTS.md` (~20 строк): что где лежит, куда идти
за frontend-контрактом (`frontend/AGENTS.md`), где запускается E2E (`e2e/`), и
правило «динамические счётчики — только в `docs/audit/YYYY-MM-DD-*/`».
Дублировать frontend-правила в корне нельзя — только маршрутизация.

**Приёмка.** Guard-тест: распарсить все `command` из `.claude/settings*.json`,
вытащить repo-relative пути скриптов, проверить существование. Тест краснеет,
если hook снова начнёт ссылаться на отсутствующий файл.

---

## 6. AF100-05 — одна точка запуска Playwright · owner `qa`

**Корневая причина.** `frontend/playwright.config.ts` имеет `testDir: '../e2e/tests'`,
а у `e2e/` собственный `node_modules/@playwright/test`. Загружаются две копии
runner'а → `Requiring @playwright/test second time` → `Total: 0 tests`.
Из `e2e/` та же команда листит 125 тестов в 34 файлах за 1.6 s.

**Изменение.** Удалить `frontend/playwright.config.ts` (предварительно убедиться,
что на него не ссылаются npm scripts, CI и `scripts/*.mjs`). `e2e/` остаётся
единственным домом Playwright. В `frontend/AGENTS.md` добавить одну строку с
рабочей командой и cwd.

**Приёмка.** `cd e2e && npx playwright test --list` → 125/34; из `frontend/`
команда либо отсутствует, либо не крэшится — «0 tests без ошибки» приёмкой не считается.

---

## 7. AF100-07 — одна каноническая DoD-команда · owner `tooling` · **после 06 и 08**

**Текущее расхождение.** Стандарт §7.4 и AGENTS.md сошлись на
`test:agent-dod:dual-safe` (sequential — fallback), но `.github/workflows/ci.yml:27`
запускает `npm run test:agent-dod`. Локальный «канон» и CI — разные orchestrator'ы,
причём предпочтительный локально сейчас флейкует.

**Изменение.** После зелёного 06 и профиля 08 выбрать один orchestrator и
привести к нему доки, npm scripts и CI. Если dual-safe остаётся победителем —
CI переводится на него; если профиль покажет, что выигрыш по времени не стоит
чувствительности к нагрузке — каноном становится sequential, а dual-safe
удаляется, а не остаётся «вторым равноправным путём» (стандарт §7.3).

**Приёмка.** `grep` по AGENTS/стандарту/`package.json`/CI даёт ровно одно имя
полной команды; 3/3 clean PASS этой командой.

---

## 8. AF100-08 → AF100-09+ — скорость · owner `qa`

**Что уже измерено** (`abb070a`-соседний HEAD, host не quiet):

| Прогон | Wall | Результат |
|---|---:|---|
| `test:agent-dod` sequential | 206.7 s | PASS (gates 7.9 + suites 191.9 + build 7.0) |
| `test:agent-dod:dual-safe` | 149.3 s | FAIL (флейк) |
| `test:agent-gates` | 7.9–16.1 s | PASS ×3 |

Unit-фаза изнутри: `setup 33 s · import 127 s · tests 184 s` на 266 файлов —
long pole это **per-file setup/import tax**, а не число воркеров. Отсюда 09+
должен идти в сторону удешевления harness/setup, а не `maxWorkers` и не
дальнейшего дробления сценариев (прямо запрещено §5 плана).

**AF100-08 приёмка.** `npm run agent:dod:profile` на quiet host, n≥3, с
раздельными setup/import/test таймингами и зафиксированным HEAD. Оптимизации
до этого замера — вне scope.

---

## 9. Phase D — hygiene, browser, закрытие

| Slice | Изменение | Приёмка |
|---|---|---|
| AF100-14 | `git rm --cached` 62 корневых PNG и отслеживаемый `tmp/` (258 файлов), `.gitignore` на артефакты прогонов; нужные visual baselines переезжают под явного owner в `e2e/` | `git ls-files` в корне не содержит runtime-артефактов; baseline-тесты зелёные с новых путей |
| AF100-13 | Live U0 re-seal: state matrix × 1000/1280/1440 | axe/overflow/console/network green, артефакты привязаны к HEAD |
| AF100-15 | Синхронизация backlog / AGENTS / стандарта / README / scorecard | ни один документ не называет другой current-HEAD и другую каноничную команду |
| AF100-16 | Независимая приёмка на clean checkout | все hard gates §1 плана green, список `NOT RUN` пуст |

---

## 10. Общие запреты для всех slices

- Скорость не покупается удалением тестов, ослаблением assertions, ростом
  timeout/baseline/workers или пропуском proof.
- Tooling-slice чинит инструмент, но не найденный им feature debt.
- Один запуск — один `pending` и один owner; `done` ставится только после
  focused proof (и full DoD, если scope требует).
- Цифры этого файла — снимок на `abb070a`; перед slice они пересчитываются из
  текущего дерева, а новые попадают в датированный audit snapshot, не сюда.
