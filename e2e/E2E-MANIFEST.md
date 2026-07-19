# E2E-манифест и тест-промпт — TLT

**Назначение.** Этот файл — одновременно (1) **политика** написания и запуска тестов
и (2) **промпт**: его можно целиком отдать агенту/разработчику как инструкцию
«напиши/прогони тест по правилам проекта». Источник истины по фактам —
`e2e/playwright.config.ts`, `e2e/tests/helpers/`, `.github/workflows/ci.yml`,
`scripts/test.sh`, `scripts/codex-functional-audit.sh`, `docker-compose.e2e.yml`.

Дата контура: 2026-06-07. Стек тестов: Playwright (chromium) + axe-core; pytest
(unit + integration + NFR); Vitest (frontend unit). Язык интерфейса и сообщений —
только русский.

**Числа тестовой базы** (автоген `scripts/sync-docs.py` — не править руками; цифры
считаются по `def test_` / `it(` / `test(`, без учёта `parametrize`-размножения):
<!-- AUTO:test-counts -->
**1465 backend** (1013 unit + 452 integration) ✅ · **1052 frontend vitest** ✅ · **110 e2e Playwright** ✅
<!-- /AUTO -->
Самопроверку фактических утверждений манифеста (хелперы/файлы §6/карта спеков)
держит §11.

---

## 0. TL;DR политики

1. **Пирамида.** Бизнес-логику и эффективность бэка проверяй на **pytest**
   (быстро, детерминированно). E2E (Playwright) — для **сквозных пользовательских
   флоу, адаптива, доступности, визуала и рассинхрона UI↔бэк**. Не дублируй в E2E
   то, что дешевле проверить юнитом.
2. **От полного к частичному.** Дефолт при разработке — **частичный** прогон
   (один файл/таргет). Полный прогон — перед коммитом ветки и в CI. Полный визуал —
   отдельно и осознанно (платформенные baseline).
3. **Три класса E2E-дефектов обязательны к покрытию:** **адаптив** (overflow,
   вылет контролов, обрезка текста, перекрытия), **визуальная регрессия**
   (скриншоты ключевых экранов), **рассинхрон** (UI не совпал с состоянием бэка /
   persisted-стора / после reload / после инвалидации кэша).
4. **Эффективный бэк — равноправная цель.** Каждый новый тяжёлый путь (batch,
   экспорт, импорт, выборка списков) сопровождается NFR-порогом и проверкой на
   N+1 / гонки / идемпотентность, а не только «200 OK».
5. **Ноль флака.** `retries: 0`. Тест, который «иногда падает», считается
   сломанным. Жди состояние (`expect.poll`, `toPass`, `waitForLoadState`), а не
   `waitForTimeout` со «спящими» магическими числами.
   **Единственное разрешённое `waitForTimeout`** — короткий визуальный/layout
   settle перед скриншотом или DOM-аудитом (`visual-regression`,
   `layout-regression`, `accessibility`). Любое другое — долг к замене на ассерт.
   Текущий долг (заменить на `expect.poll`/`toPass`):
   `electrical-candidate-glide-default.spec.ts:160,181`,
   `electrical-candidate-selection.spec.ts:276` (ждут пересчёт грида таймером).

---

## 1. Инфраструктура (факты, не менять вслепую)

### 1.1. Playwright config (`e2e/playwright.config.ts`)
- `testDir: ./tests`, `timeout: 60_000`, `retries: 0`, **`workers: 1`**
  (последовательно — параллельные гостевые сессии с одного IP упираются в
  `GUEST_MAX_SESSIONS_PER_IP`).
- `use`: `screenshot: 'only-on-failure'`, `trace: 'retain-on-failure'`,
  `video: 'retain-on-failure'`.
- `baseURL = E2E_BASE_URL ?? 'http://127.0.0.1:3001'`.
- `grepInvert: /@manual/` — ручные спецы исключены по умолчанию, включаются
  `E2E_INCLUDE_MANUAL=1`.
- **Один project:** `chromium` (`Desktop Chrome`), канал из
  `PLAYWRIGHT_CHROMIUM_CHANNEL` (в офлайне — `chrome`). **Mobile/tablet/firefox/
  webkit отдельными projects НЕ заведены** — адаптив проверяется внутри тестов
  через `page.setViewportSize`, а не через projects.
- `webServer` отсутствует: стек должен быть **уже поднят**.

### 1.2. Стенды и порты
| Стенд | Фронт | Бэк | `E2E_BASE_URL` / `E2E_API_BASE` |
|---|---|---|---|
| e2e-стек (`docker-compose.e2e.yml`) | `:3001` | `:8001` | дефолт конфига (`http://127.0.0.1:3001`) |
| dev-стек (`docker-compose.yml`+`dev.yml`) | `:3003` | `:8000` | `E2E_BASE_URL=http://127.0.0.1:3003` |
| demo (`demo/docker-compose.yml`) | `:8080` | внутр. `:8000` | `E2E_BASE_URL=http://localhost:8080 E2E_API_BASE=http://localhost:8080` |

e2e-стек поднять: `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d`
(лимиты ослаблены: `GUEST_MAX_SESSIONS_PER_IP=500`, `GUEST_MAX_OBJECTS_PER_PROJECT=500`).

### 1.3. Хелперы (используй их, не изобретай заново) — `e2e/tests/helpers/`
- `workspace.ts`: `loginAsGuest(page)`, `currentGuestContext(page)` →
  `{projectId, sessionId}`, `fetchProjectObjects(page)`, `createCalculatedPipe(page,
  name, params)`, `createCalculatedTank(...)` (создают объекты через API,
  ожидают 201). `API_BASE` выводится из baseURL (или `E2E_API_BASE`).
- `employee.ts`: `ensureTestEmployee(apiBase)` (идемпотентно создаёт сотрудника
  через админа), `loginAsTestEmployee(page)`; креды `ADMIN_EMAIL/PASSWORD`
  (`admin@heatcalc.io`/`admin`), `TEST_EMPLOYEE_*`.
- `electrical-glide.ts`: работа с **canvas-гридом** (Glide Data Grid) по
  пиксельным координатам (`expectElectricalGlideReady`,
  `editFirstElectricalGridLayoutCell`, `expectElectricalCalcForObject` через
  `expect.poll`). Канвас не имеет DOM-ячеек — селекторами не достать.
- `feature-flags.ts`: `e2eCommercialFeaturesEnabled()` +
  `COMMERCIAL_FEATURE_SKIP_REASON` — коммерческий/advanced UI выключен по
  умолчанию, тесты на него `test.skip(...)` через этот флаг.

### 1.4. Селекторы — приоритет
1. `getByRole` / `getByLabel` (a11y-устойчиво) →
2. `getByTestId` (`data-testid`: `last-updated`, `heatcalc-normal-glide-cell-editor`,
   якоря `.electrical-spreadsheet--glide`, `header.heatcalc-header`) →
3. текст (только устойчивый русский лейбл) →
4. для canvas-гридов — **пиксельные координаты через хелперы**, не CSS.

Не вводи новые `data-testid` без необходимости; если вводишь — kebab-case,
осмысленный, не завязанный на стиль.

---

## 2. Политика ЗАПУСКА — от полного к частичному

> Все команды — из каталога `e2e/` при поднятом стенде. По умолчанию канал
> Chrome: `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome`.

### 2.1. Полный прогон (перед PR / в ветке)
```bash
# весь функционал (кроме @manual) на dev-стеке
E2E_BASE_URL=http://127.0.0.1:3003 PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npx playwright test
# или обёртка на e2e-стеке:
bash scripts/test.sh e2e
```

### 2.2. Частичный — рабочий дефолт
```bash
# один файл
npx playwright test tests/heat-calculation.spec.ts
# один describe/тест по имени
npx playwright test -g "автопересчёт"
# целевые таргеты (обёртка codex-functional-audit.sh):
bash scripts/codex-functional-audit.sh layout         # только layout-regression
bash scripts/codex-functional-audit.sh accessibility  # только a11y-gate
bash scripts/codex-functional-audit.sh user-flows      # auth/projects/heat/elec/cable/phase5
```

### 2.3. Спец-режимы
```bash
npx playwright test --headed          # видеть браузер
npx playwright test --ui              # инспектор Playwright
npx playwright test --debug           # пошагово
npx playwright show-report            # HTML-отчёт после прогона
npx playwright show-trace test-results/<...>/trace.zip   # разбор падения
```

### 2.4. Визуал — отдельно и осознанно (см. §5)
```bash
# прогнать снапшоты (только на платформе, где сняты baseline — macOS/chromium-darwin)
E2E_BASE_URL=http://localhost:3003 PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npx playwright test visual-regression
# обновить baseline (осознанно, после ревью визуальных изменений)
... npx playwright test visual-regression --update-snapshots
```

### 2.5. Что гоняет CI (`.github/workflows/ci.yml`, demo-стек `:8080`)
- **Только `layout` + `accessibility`** e2e (+ smoke, db-invariants).
- **Visual-regression и user-flows в CI НЕ запускаются** (визуал — из-за
  platform-mismatch baseline `chromium-darwin` vs CI-linux; user-flows — вручную).
- Это значит: **адаптив (layout) и a11y — твой обязательный CI-минимум**;
  функциональные флоу и визуал прогоняй локально перед PR.

---

## 3. Политика НАПИСАНИЯ E2E

### 3.1. Анатомия теста
- Группируй по `test.describe('<номер ТЗ / фича>')`. В начале — нужный логин
  (`loginAsGuest` / `loginAsTestEmployee`), затем подготовка данных **через
  API-хелперы** (`createCalculatedPipe/Tank`), затем UI-проверка. Подготовку
  данных делай через API, проверяемое действие — через UI.
- Состояние жди ассертами (`await expect(locator).toBeVisible()`, `expect.poll`,
  `expect(...).toPass()`), не `waitForTimeout`. Единственное допустимое
  «усыпление» — стабилизация визуала (`networkidle` + короткий settle).
- Изоляция: каждый тест самодостаточен (гостевая сессия одноразовая). Не
  полагайся на порядок тестов.
- Коммерческий/advanced UI закрывай `test.skip(!e2eCommercialFeaturesEnabled(),
  COMMERCIAL_FEATURE_SKIP_REASON)`.
- Тяжёлые/нестабильные кликовые прогоны помечай `@manual` в названии и клади в
  `*.manual.spec.ts`.

### 3.2. Что покрывать E2E (а что — нет)
- **Да:** сквозной флоу (гость → проект → SC-03 → расчёт → электрорасчёт →
  спецификация → отчёт), роль-гейтинг (гость не видит экспорт/админку), import/
  export round-trip, **адаптив**, **a11y**, **визуал**, **рассинхрон**.
- **Нет (унести в pytest/vitest):** перебор числовых веток формул, валидация
  схем, граничные значения коэффициентов, эффективность запросов — это backend
  pytest (§6). Чистая логика компонентов/хуков — Vitest.

---

## 4. Адаптив (responsive) — обязательный класс

Проверяется **не отдельными Playwright-проектами, а внутри тестов** через
`page.setViewportSize`. Канонические вьюпорты (как в `layout-regression.spec.ts`
и `accessibility.spec.ts`):

| Вьюпорт | Размер |
|---|---|
| desktop | 1440 × 900 |
| tablet | 820 × 1180 |
| mobile | 390 × 844 |

> Прим.: целевой UI — десктоп (≥1280px), мобайл «не требуется» по ТЗ, **но**
> адаптив-аудит ловит деградации (вылезший скролл, обрезку, перекрытия), которые
> = баги вёрстки и на десктопе тоже.

**Детектор `layout-regression.spec.ts` (DOM-аудит, без скриншотов) — расширяй его
при новых экранах.** Фейлит, если найдено:
- `page-horizontal-overflow` — `scrollWidth > viewport` (толеранс 8px);
- `control-outside-viewport` — кнопка/инпут за границей вьюпорта;
- `text-horizontal-clipping` / `text-vertical-clipping` — обрезка текста без
  `ellipsis`;
- `interactive-overlap` — перекрытие интерактивных элементов > 35% площади.

**Правило:** новый существенный экран → добавь его URL в список и `layout-`, и
`accessibility-` аудита (см. §7 чеклист). Особое внимание — лейблы над контролами
(правило проекта: лейбл не уже контрола, `overflow:visible`, `min-width:max-content`).

---

## 5. Скриншоты и визуальная регрессия

Файл `visual-regression.spec.ts`, метод `expect(page).toHaveScreenshot(...)`.
- **Baseline:** `e2e/tests/visual-regression.spec.ts-snapshots/`, имена
  `<name>-chromium-<platform>.png` (сняты на `chromium-darwin`).
- **Снимки:** `home.png`, `login.png`, `workspace-guest.png` (маска
  `[data-testid="last-updated"]`), `header-employee.png` (только
  `header.heatcalc-header`).
- **Пороги:** `maxDiffPixelRatio` 0.05 (home/login/header) и 0.07 (workspace).
- **Стабилизация:** `waitForLoadState('networkidle')` + короткий settle перед
  снимком.

**Политика скриншотов:**
1. **Маскируй динамику** (даты, «обновлено», случайные id, анимации) через
   `mask`/`stylePath`, иначе тест флакнет.
2. **Снимай узко** — конкретный контейнер (как `header-employee`) лучше, чем
   `fullPage`, если фича локальна.
3. **Платформа.** Baseline `darwin` ≠ CI-linux → визуал в CI не гоняется. Снимай и
   обновляй на той же ОС, что и существующие baseline (macOS), либо заводи
   платформенные варианты осознанно.
4. **Обновление baseline — только после глазного ревью диффа.** `--update-snapshots`
   без проверки диффа запрещён: так протаскивается визуальный баг.
5. Новый ключевой экран (по эскизам Прил. 4 ТЗ) → новый снапшот с маской
   динамики.

---

## 6. Эффективный бэк — равноправная цель (pytest)

Расположение: `backend/app/tests/{unit,integration}`. Запуск (dev-стек,
bind-mount; тесты исключены из prod-образа):
```bash
bash scripts/test.sh unit          # app/tests/unit
bash scripts/test.sh integration   # требует БД heatcalc_test
bash scripts/test.sh all           # unit+integration+frontend
# точечно:
docker exec -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  heatcalc_backend python -m pytest app/tests/integration/api/test_performance_nfr.py -q --no-cov
```

### 6.1. NFR-производительность (`integration/api/test_performance_nfr.py`) — пороги
| Сценарий | Порог (тестовый) | Норматив SRS |
|---|---|---|
| POST/PUT одного объекта | < 1000 мс | NFR-PERF-01 = 500 мс |
| batch-электрорасчёт 50 объектов | < 10 с (`calculated==50`) | NFR-PERF-02 = 5 с |
| экспорт CSV / Excel 50 объектов | < 3 с каждый | — |
| batch 100 объектов | < 15 с (детектор нелинейности) | — |
| GET /objects 100 шт | < 2 с | — |
| GET /objects 1000 шт (детектор N+1) | < 5 с | — |
| batch_calc 1000 объектов | < 90 с (`calculated==1000`) | NFR×18 |
| export-csv 1000 объектов | < 15 с | — |
| импорт 100 объектов из CSV | < 15 с (`created==100`) | — |

### 6.2. Что ещё проверяет «эффективность бэка» (расширяй при новой фиче)
- **N+1 / число запросов:** `integration/db/test_query_counts.py` + стресс выше.
  Любой новый список/агрегат → тест, что число SQL-запросов не растёт с числом
  строк.
- **Гонки/конкурентность:** `integration/db/test_race_conditions.py`
  (оптимистичная блокировка версий, параллельные мутации).
- **Идемпотентность:** `integration/api/test_idempotency.py` (повтор с тем же
  Idempotency-Key не дублирует эффект).
- **Rate limiting:** `unit/core/test_rate_limit.py`, `test_guest_activity.py`.
- **Воркер/очередь:** `unit/test_worker_unit.py`, `services/test_task_*`,
  `integration/api/test_calc_jobs.py`; нагрузка — `scripts/load-worker-batch.py`.
- **Границы безопасности/каскады:** `integration/api/test_security_boundaries.py`,
  `integration/db/test_cascade_integrity.py`.
- **DB-инварианты:** `scripts/db-business-invariants.sql` через
  `codex-functional-audit.sh db-invariants` (гоняется и в CI).

### 6.3. Правило для нового бэкенд-пути
Каждый новый эндпоинт/тяжёлая операция получает: (1) happy-path + роль-гейтинг
integration-тест, (2) **NFR-порог**, если путь масштабируется с числом объектов,
(3) проверку на **N+1** (query-count) для выборок, (4) идемпотентность для
мутаций с ключом, (5) каскад/гонку, если трогает связанные сущности.

### 6.4. Мутационное тестирование формул (mutmut) — мера КАЧЕСТВА тестов

Кол-во тестов ≠ качество. Выживший мутант (mutmut поменял `>` на `>=` или
`1.1` на `2.1`, а тесты всё равно зелёные) = строка кода, которую тесты не
проверяют по существу. Это самый честный детектор слабых проверок формул.

Конфиг — `backend/mutants/pyproject.toml` (`[tool.mutmut]`); запуск —
`scripts/formula-qa.sh mutation`. Сейчас мутируется только `app/formulas/`,
раннер — `pytest app/tests/unit/formulas`.

**Текущий ориентир (контур 2026-06-07):** mutation score ≈ **67%**
(killed/(killed+survived)), 1607 выживших мутантов. Худшие модули по числу
выживших — `electrical/resistive`, `electrical/commercial`, `heat_loss/tank`;
худший по score — `heat_loss/insulation` (≈40%, λ(tm) почти не закреплена).

**Известные дыры, подтверждённые выжившими мутантами** (закрывать golden-value и
boundary-тестами):
- **Физические константы не закреплены:** `safety_factor=1.1` (мутация `1.1→2.1`
  выживает и в `pipe.py`, и в `tank.py`), потолок `α=52.0`, константа внешнего
  цилиндрического сопротивления `2π`, `q_additional` default `0.0`.
- **Границы `<=`/`<` в подборе кабеля** выживают везде: `min_temperature <=
  ambient`, «мощности ровно хватает» (`>=`), предел тока `65 A` (`within_p3`).
- **Множители схем резистива** (линия/петля/звезда `1.0/2.0/3.0`, `U/√3`) не
  защищены ни одним тестом (`_connection_factors`).
- **Слепая зона:** `services/calculation_service.py` (применение
  `location_factor`, деление потерь резервуара на `K` перед электрорасчётом) и
  `schemas/calculation.py` (границы Pydantic) **не мутируются вообще** — флип
  `process_temperature > ambient` → `>=` сейчас никто не поймает.

**Правила:**
1. Новая формула или изменённая константа → мутант обязан умирать. Пинь каждую
   физическую константу **golden-value**-ассертом на полное вычисленное `Q`/`P`
   для эталонного входа (из `qa-agent/examples/tlt-formulas.registry.yaml`).
2. На каждое сравнение в подборе кабеля — **boundary-equality** тест (вход
   ровно на границе: `ambient == min_temperature`, `power == required`,
   `current == 65 A`).
3. Цель — поднять score и не давать ему падать на новых формулах. Прогон mutmut
   тяжёлый → запускать осознанно (перед мержем изменений в `formulas/`), не в
   каждом CI.
4. **Расширить `paths_to_mutate`** на `services/calculation_service.py` и
   `schemas/calculation.py` — там живёт документированный хрупкий контракт.

---

## 7. Рассинхрон (UI ↔ бэк) — обязательный класс

«Рассинхрон» = UI показывает не то, что реально в бэке/сторе. Самые дорогие баги
проекта. Обязательно покрывать:

1. **Persist-стор ↔ сервер.** После reload UI читает `localStorage`
   (`tlt-current-project`, `tlt-active-calculation-variant`) — проверь, что после
   `page.reload()` состояние совпадает с серверным, а несовместимый снимок не
   ломает экран (см. `migrate` в сторах). Тест: создать объект → reload → объект на
   месте и расчёт совпадает.
2. **Оптимистичные апдейты ↔ инвалидация Query.** После мутации (сохранение
   ячейки, batch-расчёт, ручной выбор кабеля) UI должен показать
   **серверный** результат после инвалидации, а не «застрявший» оптимистичный.
   Тест: изменить параметр → дождаться пересчёта → значение в таблице == значение
   из API (`fetchProjectObjects`/`fetchElectricalCalcs` через `expect.poll`).
3. **Stale-метки.** Изменение объекта помечает спецификацию `is_stale` —
   проверь, что бейдж/алерт «устарело» появляется и снимается корректно.
4. **Сохранность после reload** (есть образцы:
   `electrical-candidate-glide-default.spec.ts` — мутации канвас-грида переживают
   reload). Любая мутация в гриде → тест «пережила reload».
5. **Ошибки чтения.** При провале GET UI показывает `QueryError` (Alert +
   «Повторить»), а не пустую область — это новый контракт (см. `QueryError.tsx`).
   Тест на хотя бы один путь: подменить ответ на 500 (route interception) → виден
   алерт + кнопка retry.
6. **Канвас-гриды.** Glide Data Grid рисует на canvas — UI-значение не в DOM;
   сверяй через API-хелперы (`expectElectricalCalcForObject`), а не по пикселям
   текста.

---

## 8. Definition of Done (чеклист для PR с тестами)

- [ ] Новый/изменённый флоу покрыт E2E **или** обоснованно покрыт pytest/vitest
      (не дублируй).
- [ ] Если добавлен экран — он внесён в `layout-regression` **и**
      `accessibility` списки экранов.
- [ ] Адаптив проверен на desktop/tablet/mobile вьюпортах (если экран новый).
- [ ] Динамика в скриншотах замаскирована; baseline обновлён **только** после
      ревью диффа (и на верной платформе).
- [ ] Рассинхрон-кейс есть, если фича пишет в бэк/стор (reload-persistence,
      инвалидация, stale, QueryError).
- [ ] Для нового бэкенд-пути: happy+роль, NFR-порог (если масштабируется),
      N+1/query-count, идемпотентность, каскад/гонка — по применимости (§6.3).
- [ ] Без `waitForTimeout` ради синхронизации; ассерты ждут состояние.
- [ ] Селекторы по приоритету §1.4; новые `data-testid` минимальны и осмысленны.
- [ ] `@manual` для тяжёлых кликовых прогонов; коммерческий UI за фиче-флагом.
- [ ] Локально зелёные: целевой файл → затем полный e2e (dev-стек) + затронутый
      pytest. CI-минимум (layout+a11y) проходит.

---

## 9. Готовый ПРОМПТ (копипаст агенту)

> Используй как инструкцию при генерации нового теста. Подставь `<...>`.

```
Ты пишешь тест для проекта TLT по E2E-манифесту (e2e/E2E-MANIFEST.md). Не меняй
бизнес-код, только тесты. Стенд уже поднят.

ЗАДАЧА: покрыть <фича/баг/флоу> на уровне <E2E | pytest integration | vitest>.

ОБЯЗАТЕЛЬНО:
1. Выбери правильный уровень пирамиды (§0.1): числа/формулы/эффективность → pytest;
   сквозной флоу/адаптив/визуал/рассинхрон → Playwright; логика компонента → vitest.
2. Для E2E: используй хелперы из e2e/tests/helpers (loginAsGuest/loginAsTestEmployee,
   createCalculatedPipe/Tank, fetch*). Подготовку данных — через API, проверку —
   через UI. Жди состояние (expect.poll/toPass), без waitForTimeout. Селекторы по
   приоритету getByRole→getByTestId. Канвас-гриды — через electrical-glide.ts.
3. Если экран новый — добавь его в layout-regression.spec.ts И accessibility.spec.ts
   (вьюпорты desktop 1440×900 / tablet 820×1180 / mobile 390×844).
4. Если фича пишет в бэк/стор — добавь рассинхрон-кейс (§7): reload-persistence,
   инвалидация Query == серверное значение, stale-метка, или QueryError при 500.
5. Если это бэкенд-путь — добавь NFR-порог (§6.1 формат), N+1/query-count для
   выборок, идемпотентность для мутаций с ключом (§6.3).
6. Визуал — только с маской динамики; baseline не обновляй без ревью диффа.
7. Без флака: retries=0, тест самодостаточен, не зависит от порядка.

ПОСЛЕ НАПИСАНИЯ: прогони ЧАСТИЧНО (только свой файл/таргет), покажи результат,
затем при зелёном — укажи команду полного прогона. Сверься с Definition of Done (§8).

КОМАНДЫ:
- частично:  npx playwright test tests/<файл>.spec.ts        (из e2e/)
- таргет:    bash scripts/codex-functional-audit.sh {layout|accessibility|user-flows}
- pytest:    docker exec -e TEST_DATABASE_URL=...heatcalc_test heatcalc_backend \
             python -m pytest app/tests/<путь> -q --no-cov
- полный e2e: E2E_BASE_URL=http://127.0.0.1:3003 PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
             npx playwright test
```

---

## 10. Карта существующих спеков (что уже есть — не дублируй)

`auth` · `projects` · `heat-calculation` · `heat-excel-mode` ·
`heat-normal-glide-selection` · `heat-form-layout-split` ·
`inline-form-dependencies` · `elec-calculation` ·
`electrical-candidate-selection` · `electrical-candidate-glide-default` ·
`cable-business-flows` · `cable-source-labels` ·
`phase5-specification-proof` · `phase5-actionable-close` ·
`project-csv` · `project-interaction` ·
`accessibility` (a11y-gate) · `layout-regression` (адаптив DOM-аудит) ·
`visual-regression` (скриншоты).

Удалены legacy thin/superseded specs (covered by phase5 and remaining flow
specs): specification, reports, admin, admin-formulas-sandbox,
electrical-clickthrough.manual.

Перед новым спеком проверь, нет ли пересечения — расширь существующий, если фича
рядом.

### 10.1. Известные пробелы покрытия (закрыть; не считать «покрытым»)

Манифест объявляет эти классы обязательными (§7), но E2E на них пока нет —
держим список честным, чтобы DoD §8 не отмечался ложно:

- **QueryError при 500 (route interception).** §7.5 требует тест: подменить GET
  на 500 (`page.route` → `route.fulfill({status:500})`) → виден Alert
  «Повторить». В `e2e/tests` сейчас **нет ни одного `page.route`** — пробел.
- **Stale-метка в UI.** §7.3: изменение объекта помечает спецификацию `is_stale`
  → бейдж «устарело» появляется/снимается. Сейчас есть лишь касание в
  `inline-form-dependencies.spec.ts`, явной проверки бейджа нет.

---

## 11. Самопроверка манифеста (drift-guard) — чтобы не гнил

Манифест объявил себя источником истины (шапка) — значит, обязан себя
верифицировать. Проверки встроены в `scripts/sync-docs.py`:

- **Числа** — блок `<!-- AUTO:test-counts -->` в шапке генерируется из реального
  кода (`def test_`/`it(`/`test(`). Не править руками.
- **`scripts/sync-docs.py --check`** дополнительно валидирует фактические
  утверждения манифеста и падает (exit 1) при расхождении:
  1. **Хелперы §1.3** — каждая названная функция реально экспортируется из
     `e2e/tests/helpers/*.ts`.
  2. **Файлы §6** — каждый упомянутый backend-тест/скрипт существует
     (`test_performance_nfr.py`, `test_query_counts.py`, `test_race_conditions.py`,
     `test_idempotency.py`, `test_security_boundaries.py`, `test_cascade_integrity.py`,
     `db-business-invariants.sql`).
  3. **Карта спеков §10** — каждый `e2e/tests/*.spec.ts` упомянут в §10, и
     наоборот (ловит и забытый новый спек, и удалённый старый).

Запуск: `scripts/sync-docs.py` (обновить числа) или `--check` (CI/pre-commit,
без записи). При провале — сообщение, что именно разошлось.

> Прим.: drift-guard проверяет **существование и имена**, а не семантику. Что
> тест реально проверяет правильную вещь — дело ревью и mutmut (§6.4).
