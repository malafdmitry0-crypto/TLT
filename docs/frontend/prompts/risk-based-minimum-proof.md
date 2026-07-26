# Промпт: risk-based minimum proof для совокупного diff

**Статус:** executable implementation prompt (tooling / qa)  
**Актуально на:** 2026-07-27  
**Pending authority:** только [refactor-backlog.md](../refactor-backlog.md)  
**Policy source:** [frontend/AGENTS.md](../../../frontend/AGENTS.md) и
[agent-development-standard.md](../agent-development-standard.md)

## Цель

Устранить риск слишком узкого proof, не возвращая автоматический запуск всех
тестов.

Нормативный результат:

> Агент самостоятельно выбирает проверки, но не ниже рассчитанного
> risk-based minimum. Полный DoD запускается локально только по явному запросу
> пользователя.

Этот файл — implementation prompt, а не очередь и не новое место хранения
динамических метрик.

## Копируй в агент

```text
Работай из корня репозитория TLT.

Прочитай полностью:
  AGENTS.md
  frontend/AGENTS.md
  docs/frontend/agent-development-standard.md
  scripts/agent-scope.mjs
  релевантные architecture-тесты и npm scripts

Перед изменениями выполни `git status --short`. Не трогай и не коммить чужой
WIP. Выполняй один tooling/qa slice.

GOAL
====

Устранить риск слишком узкого proof, не возвращая автоматический запуск всех
тестов.

POLICY
======

1. Если пользователь явно указал проверки — выполнить именно их.
2. Если пользователь молчит — агент сам выбирает проверки, но не ниже
   автоматически рассчитанного risk-based minimum.
3. Агент может расширить minimum proof по своему решению.
4. Уменьшить minimum proof можно только по явному указанию пользователя;
   пропущенное отметить `NOT RUN`.
5. Полный `test:agent-dod:dual-safe` запускается исключительно по явному
   запросу пользователя.
6. Не отключать Vitest `isolate`.
7. CI full matrix не менять.

IMPLEMENTATION
==============

## 1. Анализ всего diff

Добавь режимы:

  npm run agent:scope -- --changed
  npm run agent:scope -- --changed --json

Они анализируют совокупность изменённых frontend-файлов, а не один файл.

Учитывай:

- staged и unstaged изменения;
- новые файлы;
- удалённые файлы;
- rename;
- изменения относительно подходящей git-базы;
- несколько owner-зон одновременно.

Не включай игнорируемые файлы и артефакты прогонов.

## 2. Blast-radius model

Для совокупного diff рассчитай:

- `local` — локальный файл или тест;
- `owner` — одна функциональная зона;
- `cross-owner` — shared-контракт или несколько owner-зон.

Результат обязан объяснять решение:

  risk: cross-owner
  changed_owners:
    - shared
    - heat
  affected_consumers:
    - heat
    - electrical
    - reports
  reasons:
    - shared API contract changed
    - three consumer zones detected

Не повышай risk без причины и не понижай неизвестный cross-cutting путь до
`local`.

## 3. Карта потребителей

Добавь централизованные машинно-проверяемые правила для:

- shared API;
- auth/session;
- routing;
- shared stores/state;
- feedback boundary;
- shared test setup/harness;
- Vite/Vitest config;
- package.json и lockfile;
- CI/test orchestration.

Для каждой области укажи потребителей и релевантные owner packs/gates. Не
размазывай карту по несвязанным условным операторам.

## 4. Minimum proof plan

`agent:scope --changed` должен возвращать:

  proof_level: cross-owner
  required:
    - точные focused tests
    - тесты затронутых потребителей
    - необходимые architecture gates
  optional:
    - дополнительные owner tests
    - browser proof
  full_dod:
    required: false
    policy: explicit-user-only

Все команды представляются структурированными `cwd + argv` и пригодны для
непосредственного исполнения.

Запрещены:

- prose вместо команды;
- несуществующие npm scripts;
- пустые test filters;
- плейсхолдеры;
- широкие globs без доказанной необходимости;
- автоматическое добавление full DoD;
- повтор одинаковых команд.

## 5. Проверка достаточности proof

Добавь команду:

  npm run agent:proof-check -- --changed --receipt <receipt.json>

Она должна:

- пересчитать content signature текущего diff;
- получить рассчитанный minimum proof;
- проверить подтверждение фактически выполненных команд;
- отклонить устаревший receipt;
- показать недостающие обязательные проверки;
- не считать `NOT RUN` зелёным;
- никогда не требовать full DoD без явного пользовательского контракта.

Если надёжно доказать запуск через обычный shell невозможно, добавь небольшой
wrapper, который:

1. запускает proof-команду через argv без shell interpolation;
2. сохраняет command, cwd, exit code и content signature;
3. пишет receipt в gitignored директорию, не в корень репозитория;
4. не принимает вручную проставленный `PASS` без исполнения.

Не создавай систему, основанную только на произвольном JSON от агента.

## 6. Fail-closed

Команда завершается ошибкой, если:

- файл не получил owner;
- owner неоднозначен;
- cross-owner consumer не имеет proof mapping;
- required command невалидна;
- receipt устарел;
- обязательная проверка отсутствует или завершилась ошибкой.

Неизвестный путь не должен молча получать `scoped`.

## 7. Документация

Синхронизируй:

- `frontend/AGENTS.md`;
- `docs/frontend/agent-development-standard.md`;
- package scripts;
- CLI help.

Не дублируй большие таблицы: выбери один source of truth, остальные документы
должны маршрутизировать к нему.

TESTS
=====

Сначала добавь characterization существующего поведения.

Покрой:

- один локальный production-файл;
- изменённый unit-тест;
- одну owner-зону;
- две owner-зоны;
- shared API с несколькими потребителями;
- test setup/harness;
- vite.config/package/lockfile;
- staged + unstaged + untracked;
- delete/rename;
- дедупликацию команд;
- неизвестный путь;
- ambiguous owner;
- invalid npm script;
- exact test path;
- устаревший receipt;
- failed command в receipt;
- отсутствие required proof;
- запрет implicit full DoD;
- content-signature cache;
- `isolate` остаётся включённым.

ACCEPTANCE
==========

Запусти минимально достаточный proof для tooling slice:

  node --check scripts/agent-scope.mjs
  node scripts/agent-scope.mjs --self-test
  node scripts/agent-scope.mjs --coverage
  node scripts/agent-scope.mjs --proof-check
  npm run test:agent-gates

Покажи минимум три примера `--changed --json`:

1. local;
2. owner;
3. cross-owner.

В этой задаче полный DoD и live E2E не запускать: отметить их `NOT RUN`.

FINAL REPORT
============

Верни:

- изменённые файлы;
- алгоритм определения risk;
- рассчитанный minimum proof;
- реально выполненные команды;
- `NOT RUN`;
- остаточные риски;
- подтверждение, что `isolate` включён;
- подтверждение отсутствия implicit full DoD;
- `git status --short`.

Коммить только собственный slice отдельным conventional commit. Не включай
чужой WIP и не push без явного запроса.
```

## Acceptance prompt-а

- [ ] Совокупный diff, а не только один путь
- [ ] Объяснимые `local / owner / cross-owner`
- [ ] Централизованная карта consumers
- [ ] Exact `cwd + argv`, без prose и плейсхолдеров
- [ ] Content-bound receipt, который нельзя подделать простым `PASS`
- [ ] Fail-closed для неизвестного/неполного proof
- [ ] Full DoD только explicit-user
- [ ] Vitest `isolate` остаётся включённым
- [ ] Чужой WIP не затронут
