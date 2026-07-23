# Однодневный план переписывания фронта

> Архив: завершённый сценарий планирования. Не использовать как активную очередь.

**Актуально на:** 2026-07-23  
**Срок:** один непрерывный агентный прогон, ориентир 6–10 часов wall-clock.  
**Команда:** 4 одновременно активных агента — максимум текущего окружения.

## Цель

За один день привести текущий frontend к целевой структуре, сохранив backend,
API, расчётную логику и пользовательское поведение.

Это не человеческий календарный проект и не оценка в спринтах. Агенты работают
параллельно, регулярно интегрируют изменения и используют существующие models,
hooks, API clients и tests как основу.

## Что сохраняем

- backend и API contracts;
- auth, permissions и stores;
- расчётные pure models;
- существующие Heat/Electrical/Specification сценарии;
- Ant Design, Glide и текущий UI Kit;
- существующие тесты как behavior specification.

## Что переписываем

- page shells и ownership;
- границы `app/shared/ui/domains`;
- feature views и orchestration;
- inverted `components → pages` imports;
- глобальный CSS и feature scoping;
- публичный UI entry;
- тестовые и архитектурные gates.

Не совмещаем работу с redesign, изменением API или расчётных формул.

## Команда

| Агент | Зона записи |
|---|---|
| A0 — Integrator | общие contracts, routes, config, merge, полный proof |
| A1 — Platform/UI/CSS | app/shared/ui, UI Kit, tokens, shell, CSS architecture |
| A2 — Heat/Spec | Heat, Specification, Report и их focused tests |
| A3 — Electrical | Electrical models/hooks/views и focused tests |

После завершения platform A1 забирает Projects/Admin/Help. A0 не выполняет
широкие feature-изменения, пока интегрирует параллельные ветки работы.

## Правила параллельной работы

- один writer на файл;
- `App.tsx`, routes, `main.tsx`, package/config меняет только A0;
- `styles.css` меняет только A1;
- A2 не касается Electrical, A3 не касается Heat/Spec;
- каждые 60–90 минут — законченный интегрируемый slice;
- нельзя оставлять старую и новую реализацию активными одновременно;
- focused tests запускает владелец; полный контур запускает A0;
- найденная регрессия исправляется сразу, а не переносится в backlog.

## Расписание

### 00:00–00:30 — baseline и раздача ownership

A0:

- фиксирует текущий `git status`;
- запускает быстрые architecture/focused gates;
- составляет карту общих файлов;
- замораживает границы записи.

Остальные агенты параллельно строят inventories своих зон.

### 00:30–02:30 — первый проход

A1:

- выделяет tokens/base/layout;
- закрепляет UI Kit public entry;
- добавляет CSS architecture gate;
- убирает новые зависимости от глобального CSS.

A2:

- делает Heat thin shell;
- разделяет orchestration и views;
- переносит Heat feature CSS владельцам.

A3:

- фиксирует Electrical model/view boundary;
- устраняет `components → pages`;
- начинает разрез `ElecCalcPage`.

A0:

- добавляет общие dependency gates;
- интегрирует slices по мере готовности;
- не допускает конфликтующих contracts.

### 02:30–04:30 — второй проход

A1:

- переносит shell/Projects/Admin/Help;
- удаляет точные CSS-дубли;
- сокращает `styles.css`.

A2:

- завершает Heat;
- переписывает Specification/Report shells;
- проверяет screen/print contracts.

A3:

- завершает Electrical orchestration;
- разделяет table/candidate/batch flows;
- исправляет Electrical tests.

A0:

- обновляет routes/public barrels;
- удаляет orphan imports и adapters;
- постоянно запускает typecheck и architecture tests.

### 04:30–06:30 — интеграция

Все агенты работают по defect queue:

- build/typecheck/lint;
- unit/integration;
- cross-domain imports;
- missing exports и cycles;
- CSS overlaps и specificity;
- console/network errors.

A0 управляет очередью и остаётся единственным владельцем общих файлов.

### 06:30–08:00 — браузерный proof

Проверяются:

- login и role routing;
- Heat empty/populated/save/error;
- Electrical selection/candidate/batch/error;
- Specification normal/stale/print;
- Projects/Admin;
- UI Kit;
- supported desktop viewport, overflow и console.

Исправления распределяются владельцам доменов.

### 08:00–10:00 — резерв

Используется только на:

- падения полного test suite;
- Electrical/Glide/Excel регрессии;
- print и permission defects;
- clean-checkout повторную проверку.

Новый scope в резерв не добавляется.

## Definition of Done за день

- lint, typecheck, build, architecture, unit и integration проходят;
- обязательные e2e/smoke состояния проходят;
- `components → pages` отсутствуют;
- Heat/Electrical/Specification не импортируют друг друга;
- большие pages стали shells, orchestration вынесена;
- UI Kit — единый публичный form entry;
- feature CSS scoped и принадлежит owner-компонентам;
- `styles.css` не содержит вынесенных дублей и больше не растёт;
- старые adapters и orphan CSS удалены;
- console/network/print проверки не показывают новых регрессий;
- итог повторён на интегрированном рабочем дереве.

## Приоритет при нехватке времени

1. Поведение и зелёный полный контур.
2. Domain boundaries и thin shells.
3. Electrical.
4. Heat и Specification.
5. CSS extraction.
6. Физический `git mv` и косметическое переименование.

Если физический перенос директорий не помещается, архитектура фиксируется
barrels/gates, а mass rename не блокирует результат.

## Итог

```text
Wall-clock:       6–10 часов
Активные агенты:  4
Модель работы:    3 domain workers + 1 integrator
Стратегия:        reuse logic/API, переписать boundaries/views/CSS
Единица работы:   интегрируемый slice каждые 60–90 минут
```
