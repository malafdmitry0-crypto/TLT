# Case 1 regression recovery — snapshot

**Дата:** 2026-08-04
**Стартовый HEAD:** `ca8805e4447f82ebe55a731b0a23c84255a46dda`
**Проверенный HEAD:** `01bcdf47117cd0bee235e96eed3dd1f29d6e1603`
**Scope:** desktop-only; mobile/tablet — `N/A` по явному решению пользователя
**Итог recovery gate:** **GREEN**

Во время работы в ветку параллельно вошли `a591516` (SPEC-P0-a), `64e5c2c`
(SPEC-P0-b) и `01bcdf4` (GUEST-COPY). Поэтому owner packs, обязательный
frontend static wrapper и desktop E2E были повторены уже на `01bcdf4`, а не
только на исходном HEAD.

## Классификация исходных регрессий

| Зона | Класс | Причина и исправление |
| --- | --- | --- |
| Project IO E9 | Stale test | Legacy `self_regulating` / `ТЛТ-*` обязан импортироваться soft-stale. Обновлено устаревшее ожидание без изменения production-контракта. |
| Idempotency | Harness drift | Setup не создавал активный ЭР/каталог и отправлял неканонический payload спецификации. Fixture приведён к `variant_ids` + canonical options; blocked outcome проверяется как сохраняемый. |
| Manual cable / project IO | Harness drift | Fixture не задавал обязательные heat inputs и проектный Iдоп. Setup дополнен, production validation сохранена. |
| F5 generation | Stale test / transaction contract | Status-row `blocked`/`conflict` должен переживать rollback savepoint, а частичные BOM items/snapshot — нет. Assertions приведены к действующему контракту. |
| TT options hooks | Contract drift | Удалены legacy arguments; manual options остаются object-scoped и приходят с backend. |
| 220 V expectations | Stale test | Действующий норматив — 230 V. Исправлены ожидания, production-контракт не ослаблялся. |
| Object Wizard block | Product regression | Возвращён блок «Подбор спецификации» в default dependency layout. |
| Frontend architecture gates | Architecture debt | Убраны page-to-page зависимости, крупные CSS/модели разделены, inline baseline уменьшен, новый долг не разрешён. |
| Specification concurrent changes | Product/architecture regression | Модель таблицы перенесена в domain, route model отделён от page, page model снова укладывается в LOC gate, Generate блокируется во время pending workflow. |
| Guest Help | Contract drift | Текст согласован с guest contract: 3 дня, до 500 объектов, один временный проект, project-file workflow. |
| Shared E2E heat fixture | Harness drift | Flat insulation keys заменены на `insulation_layers`; добавлены обязательные TT inputs, явный lifecycle ЭР1/Iдоп/назначение Самрег. |
| Electrical critical E2E | Stale test + harness drift | Старый сценарий ожидал СО1 и марку `ТЛТ-100`. Он переписан на текущий ЭР1 contract и authoritative catalog mark семейства ТТН/ТТВ/ТТХ. |

## Реализованные изменения

### Backend tests

- `backend/app/tests/unit/services/test_project_io_helpers.py`
- `backend/app/tests/integration/api/test_project_io.py`
- `backend/app/tests/integration/api/test_idempotency.py`
- `backend/app/tests/integration/db/test_specification_generation_service.py`

Production backend уже реализовывал нужные E9/F5 semantics; исправления
затронули устаревшие assertions и setup, а не ослабили validation.

### Frontend

- типизация и API object-scoped TT options;
- 230 V contract и wizard dependency layout;
- Specification route/model/write-flow isolation;
- архитектурные ratchets, CSS ownership и repo hygiene;
- desktop Home/Help/Heat states не дали layout-регрессий.

### E2E harness

- canonical pipe/tank insulation payloads;
- обязательные `maintain_temperature`, `number_of_threads`, валидные TT
  температуры и шаг навива;
- явное создание ЭР1, сохранение Iдоп и назначение объекта Самрег;
- проверка текущей authoritative TT mark вместо удалённого legacy `ТЛТ-100`.

## Выполненные проверки

| Gate | Результат |
| --- | --- |
| Backend unit owner pack | **53 passed** за 0.31 s |
| Backend integration owner pack | **45 passed** за 31.23 s; только известные warnings о коротком JWT HMAC key |
| Frontend focused | **6 files / 28 tests passed**, lint и typecheck passed |
| Mandatory static UI wrapper | **PASS**: lint, typecheck, **345/345 files, 1475/1475 tests**, production build; 289.81 s |
| Frontend production build | **PASS**, 3847 modules; только non-blocking chunk-size warning |
| Changed E2E static collection | **19 tests listed**, compile/collection passed |
| Desktop layout Playwright | **2/2 passed** за 11.9 s |
| Final critical desktop E2E | **3/3 passed** за 15.8 s |
| Browser console on reached desktop guest state | **0 warnings / 0 errors** |
| Browser dynamic requests on reached desktop guest state | **2xx**, failed requests не зафиксированы |

Vitest/JSDOM печатал повторяющийся `XMLHttpRequest AggregateError`, но suite
завершился с exit code 0 и 1475/1475; это зафиксировано как шум harness, а не
как browser-console доказательство.

## Финальный desktop E2E pack

1. Электрорасчёт: ЭР1 → Iдоп → назначение Самрег → пересчёт → mark/length/power/current — PASS.
2. Specification controls at desktop width — PASS.
3. CSV v3 export → guest re-import trust path — PASS.

Подробности и visual evidence: [`browser-e2e/report.md`](./browser-e2e/report.md).

## NOT RUN и остаточный риск

- полный backend suite из 595 tests повторно не запускался; повторены точные
  owner packs, закрывающие найденные 6 failures;
- полный Playwright suite не запускался;
- NFR `500 objects × 10 users`, generic migration/coverage/security gates не
  запускались;
- mobile/tablet проверки исключены пользователем и имеют статус `N/A`;
- широкий claim «весь Case 1 release-ready» не делается: остаются отдельные
  P1/NFR пункты из desktop-only reassessment, не входившие в recovery slice.

## Вердикт

В воспроизведённом desktop regression scope оставшихся красных регрессий нет:
backend owner packs, frontend repository gate, desktop layout и три критических
business paths зелёные. Это **GREEN для regression recovery**, но не замена
полной release-приёмке всех NOT RUN пунктов Case 1.
