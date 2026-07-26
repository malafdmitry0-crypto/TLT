# Frontend agent-friendly 10/10

**Статус:** ACTIVE acceptance plan  
**Актуально на:** 2026-07-26  
**Очередь исполнения:** только [refactor-backlog.md](./refactor-backlog.md)

Этот документ определяет, что означает `10/10`, порядок достижения цели и
финальную приёмку. Он не является второй очередью: конкретный следующий slice,
его статус и commit фиксируются только в backlog.

## 1. Что означает 10/10

`10/10` — не округлённое среднее и не субъективное «код выглядит хорошо».
Фронтенд получает статус `10/10`, только если на одном clean HEAD выполнены все
hard gates:

| Область | Acceptance |
|---|---|
| Вход и truth | Из корня и `frontend/` существует один короткий entrypoint; нормативы не противоречат друг другу; одна current scorecard с текущим HEAD |
| Маршрутизация | 100% production `.ts/.tsx/.css` получают ровно одного owner; ambiguity/unowned = 0 |
| Focused proof | Для каждого owner выдаются только существующие copy-paste команды; автоматический тест исполняет каталог команд |
| Guardrails | Typecheck, lint `--max-warnings 0`, architecture/CSS ratchets и bundle budget зелёные; отсутствующий target обязан краснить gate |
| Full proof | Одна каноническая локальная/CI-команда; clean-tree PASS 3/3; flake = 0 |
| Скорость | Fast gate p50 ≤15 s; full DoD p50 ≤120 s на quiet host, n≥3; каждый замер хранит phase timings |
| Код и локальность | Production ≥400 LOC = 0; stateful/interactive >350 LOC классифицированы и оставлены только с доказанным cohesive owner |
| UI boundary | Каждый direct Ant import классифицирован; новый baseline только shrink-only; feature UI предпочитает public TLT UI-kit |
| Browser | Обязательная desktop state matrix зелёная на 1000×768, 1280×800 и 1440×900; axe, overflow, console и failed requests запечатаны |
| Воспроизводимость | Lockfiles/runtime pins согласованы; команды работают из документированного cwd; root не засорён runtime-артефактами |

Если хотя бы один hard gate красный или `NOT RUN`, итоговый статус не может быть
`10/10`, даже если взвешенная оценка округляется до десяти.

## 2. Инварианты программы

- Один slice — один owner и один наблюдаемый результат.
- Сначала characterization неисправного agent loop, затем исправление.
- Нельзя получать скорость удалением тестов, ослаблением assertions,
  увеличением timeout/baseline или пропуском обязательного proof.
- Нельзя дробить cohesive production-файл только ради LOC.
- Runtime UX, API/query/route semantics, formulas, units и ER UUID не меняются.
- Каждый tooling slice проверяет success path и намеренный failure path.
- Динамические цифры живут только в новом датированном audit snapshot.

## 3. Порядок выполнения

### Phase A — честный и исполнимый agent loop

| ID | Owner | Результат | Acceptance |
|---|---|---|---|
| AF100-01 | tooling | `agent:scope` имеет взаимоисключающие правила | Полный production inventory: unique 100%, ambiguous 0, unowned 0; coverage и self-test падают на искусственной ambiguity |
| AF100-02 | tooling | Точный каталог focused proof | Нет prose/glob-преобразований в shell-команды; все emitted commands существуют и проходят execution smoke |
| AF100-03 | tooling | Честный CSS gate | Все актуальные CSS ratchets перечислены/обнаруживаются; удалённый или переименованный target делает команду красной |
| AF100-04 | tooling | Рабочие hooks и root entrypoint | Ни один hook не ссылается на отсутствующий файл; root `AGENTS.md` маршрутизирует frontend/backend/e2e без ложных warning |
| AF100-05 | qa | Playwright имеет одну точку запуска | Документированная команда из документированного cwd листит все сценарии без second-copy crash |

### Phase B — надёжный и быстрый proof

| ID | Owner | Результат | Acceptance |
|---|---|---|---|
| AF100-06 | qa | Устранён flake `ReportPage.export` | Тест синхронизируется по событию/promise, не по запасному wall-clock; focused stress ≥20/20 green |
| AF100-07 | tooling | Выбрана одна каноническая DoD-команда | AGENTS, стандарт, package scripts и CI называют один orchestrator с одинаковой семантикой |
| AF100-08 | qa | Измерен реальный long pole | Phase profile на clean quiet host, n≥3; setup/import/test tax разделены; оптимизация до измерения запрещена |
| AF100-09+ | qa | Уменьшен повторный harness/setup tax | По одному harness-owner на slice; те же test cases/assertions; full DoD p50 ≤120 s и PASS 3/3 |

`AF100-09+` раскрывается в backlog после профиля: один найденный long pole —
один отдельный slice. Простое увеличение workers или дальнейший scenario fan-out
без снижения setup tax не является acceptance.

### Phase C — локальность production-кода

| ID | Owner | Результат | Acceptance |
|---|---|---|---|
| AF100-10+ | feature owner | Классифицированы stateful/interactive файлы >350 LOC | Для каждого файла: `keep` с cohesive-owner rationale либо отдельный characterization-first extract; ≥400 остаётся 0 |
| AF100-11+ | ui / feature owner | Direct Ant baseline становится объяснимым и shrink-only | Imports разделены на UI-kit internals, разрешённые adapters и feature debt; новые feature direct imports запрещены; миграции идут по одному owner |
| AF100-12 | tooling | Production → tests навигация детерминирована | Scope output возвращает точные ближайшие tests/harness даже когда basename отличается |

`AF100-10+` и `AF100-11+` — inventory-driven серии. Их нельзя превращать в
массовый multi-owner refactor. Новый под-slice добавляется в backlog только
после пересчёта текущего дерева и явного acceptance.

### Phase D — UI seal, hygiene и закрытие

| ID | Owner | Результат | Acceptance |
|---|---|---|---|
| AF100-13 | qa | Live browser U0 re-seal | State matrix × 3 viewports; axe/overflow/console/network green; артефакты привязаны к HEAD |
| AF100-14 | tooling | Репозиторий имеет чистый рабочий вход | Генерируемые screenshots/tmp/reports не лежат в root; нужные baselines имеют явного owner и путь |
| AF100-15 | docs | Устранён documentation drift | Backlog, AGENTS, стандарт, README и scorecard не спорят о queue/DoD/current HEAD |
| AF100-16 | qa | Независимая финальная приёмка | Новый clean checkout; весь agent loop исполнен без ручных обходов; все hard gates раздела 1 green |

## 4. Обязательные доказательства каждого slice

Минимальный порядок:

```text
agent:scope для затронутого файла
→ characterization/focused proof
→ test:agent-gates
→ canonical full DoD, если scope требует
→ browser profiles, если изменение видимо
```

Финальный `AF100-16` дополнительно обязан опубликовать:

- точный HEAD, runtime и host profile;
- inventory owner resolution;
- список и execution result emitted focused commands;
- три независимых full DoD wall measurements;
- browser state matrix и artifacts;
- raw metrics и формулу score;
- перечень `NOT RUN` — он должен быть пустым.

## 5. Не является целью

- переход всего frontend в новый `features/` namespace;
- нулевой direct Ant любой ценой;
- LOC-дробление без уменьшения контекста;
- mobile redesign — продуктовый контракт остаётся desktop `>=1000 px`;
- повышение baselines, timeout или worker count вместо устранения причины;
- переписывание стабильных feature tests ради единообразия имён.

## 6. Definition of complete

Программа закрывается только отдельным финальным docs commit после `AF100-16`.
В нём:

1. backlog получает `EMPTY QUEUE`;
2. current scorecard указывает финальный HEAD и `10.0/10`;
3. предыдущие scorecards явно помечены historical/superseded;
4. все acceptance раздела 1 имеют ссылки на исполнимое evidence;
5. отсутствуют открытые `BLOCKED`, `NOT RUN` и параллельные ACTIVE plans.
