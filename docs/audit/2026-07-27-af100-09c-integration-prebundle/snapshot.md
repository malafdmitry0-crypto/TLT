# AF100-09c — пре-бандл для integration и раскладка проектов

**Статус:** execution snapshot (не binding scorecard)
**UTC:** 2026-07-26T22:35–23:00Z
**HEAD на старте:** `995c8e9` · branch `main`
**Host:** darwin 23.6.0 arm64 · Apple M1 Pro (10 cores) · Node v23.5.0 · vitest 4.1.6
**Quiet:** **нет** — load average вырос 3.43 → 9.79 за время приёмки. См. §6.

Закрыт **AF100-09c** — третий под-slice серии AF100-09+. Owner один:
раскладка vitest-проектов. **Бюджет p50 ≤120 s не достигнут** (p50 130.13 s),
серия остаётся открытой.

---

## 1. Почему long pole переехал

09b оптимизировал только `unit`. Замер полной фазы `test:integration` (она
запускает **два** проекта, что в 09b было упущено):

| Проект | файлов | import | на файл | wall |
|---|---:|---:|---:|---:|
| unit (оптимизирован) | 289 | 33.4 s | **0.12 s** | 134.3 s |
| integration | 23 | 29.3 s | **1.28 s** | 39.7 s |
| elec-integration | 18 | 23.3 s | **1.29 s** | 66.8 s |

Оба integration-проекта платили **в 11 раз больше на файл**, чем оптимизированный
unit — тот же antd-налог.

## 2. Правило, по которому пришлось делить

Пре-бандл не может обслужить ровно одну операцию — **`vi.importActual` bare-пакета**:

```
Cannot find module '.../react-router-dom/dist/main.js&v=2902b752'
```

Версия приклеивается как `&v=` вместо `?v=` и становится частью имени файла.
Проверены и **отклонены** три способа это обойти:

| Попытка | Результат |
|---|---|
| `optimizer.exclude: ['react-router-dom', ...]` | не помогает — та же ошибка |
| `server.deps.inline: [/react-router-dom/]` | не помогает |
| параметр фабрики `importOriginal` вместо `vi.importActual` | не помогает |

Обычные `vi.mock`-фабрики не затронуты: 10 unit-файлов, мокающих
`@glideapps/glide-data-grid`, работают пре-бандленными. Ломает только **чтение
настоящего модуля**.

Отсюда единственное правило раскладки: **тест, читающий реальный vendor-модуль,
не может жить в оптимизированном проекте.**

| Проект | Оптимизирован | Причина |
|---|---|---|
| `unit` | да | 289 файлов, bare `importActual` нет |
| `integration` | да | 21 файл |
| `integration-unoptimized` | **нет** | 2 файла читают реальный `react-router-dom` |
| `elec-integration` | **нет** | общий setupFile читает реальный `react` |

**`elec-integration` заблокирован на harness, а не пофайлово.** Один
`vi.importActual('react')` в `elecCalcPageTestEnv.componentMocks.tsx` валит
**все 18** его файлов (проверено). При этом его wall держат сами тесты
(101.9 s против 23.3 s импорта), поэтому разблокировка — отдельный slice с
меньшей отдачей.

## 3. Результат

| | до `995c8e9` | после | Δ |
|---|---:|---:|---:|
| `integration` import | 29.3 s | **10.1 s** | **−66 %** |
| `integration` wall | 39.7 s | **28.0 s** | −11.7 s |
| `integration-unoptimized` | — | 2.6 s (2 файла) | новый |
| **фаза `test:integration` import** | **50.1 s** | **33.3 s** | **−33 %** |
| **фаза `test:integration` wall** | **104.6 s** | **96.2 s** | **−8.4 s** |
| тестов в фазе | **168** | **168** | без изменений |

Счётчик тестов integration идентичен — 41 файл / 168 тестов. Ни один тест не
удалён, не пропущен и не ослаблен; `.only` / `.skip` / retry / timeout /
workers не трогались. `isolate: true` сохранён во всех четырёх проектах.

Unit-проект на момент замера: 290 файлов / 1220 тестов — включает файлы
параллельного WIP пользователя, не относящиеся к этому slice.

## 4. Побочный дефект, найденный гейтами

Включение оптимизатора для `integration` начало материализовать
`frontend/.vite/deps/`. Путь в `.gitignore`, поэтому `git status` чист — но
`eslint .` всё равно обходит его, и vendor-бандлы валят `no-undef`:

```
frontend/.vite/deps/@ant-design_icons.js
  24760:16  error  'document' is not defined  no-undef
```

Lint-гейт покраснел на чужом коде. Исправлено закреплением
`cacheDir: 'node_modules/.vite'` — пре-бандл невидим и для lint, и для
root-hygiene (AF100-14). Guard добавлен.

## 5. Guard

`antdOptimizerContract.architecture.test.ts` — расширен с 8 до **11 тестов**.
Новое в 09c:

| Проверка | Ловит |
|---|---|
| каждый объявленный проект назван в `test:integration` | **проект без скрипта не запускается — suite зелёный, потому что не смотрел** |
| оптимизированы ровно `unit` + `integration` | расползание пре-бандла на проекты с `importActual` |
| список `INTEGRATION_UNOPTIMIZED` соответствует файлам, которым он нужен | устаревший список: файл платит налог зря |
| `cacheDir` внутри `node_modules` | возврат `frontend/.vite/deps` и красный lint |
| `isolate: true` во **всех четырёх** проектах | обмен изоляции на скорость |

**Red-demo, восемь веток суммарно (09b + 09c), каждая → exit 1:**

| Слом | 09b | 09c |
|---|:-:|:-:|
| `vi.mock('antd')` в реальном тесте | ✔ | |
| ключ `client` → `web` | ✔ | |
| `@ant-design/icons` в `include` | ✔ | |
| `isolate: true` → `false` | ✔ | |
| убрать `--project integration-unoptimized` | | ✔ |
| вынести `HomePage` из списка unoptimized | | ✔ |
| включить оптимизатор для `elec-integration` | | ✔ |
| убрать `cacheDir` | | ✔ |

## 6. Честный статус бюджета

`test:agent-dod:dual-safe` — **PASS 3/3**:

| Прогон | gates | unit+integration | build | total |
|---|---:|---:|---:|---:|
| 1 | 7.61 s | 113.16 s | 0.76 s | **121.53 s** |
| 2 | 8.02 s | 121.29 s | 0.82 s | **130.13 s** |
| 3 | 9.20 s | 125.25 s | 0.81 s | **135.25 s** |

**p50 = 130.13 s против цели ≤120 s — бюджет не достигнут.**

Числа монотонно растут вместе с загрузкой хоста: load average 3.43 в начале,
**9.79** в конце. Лучший прогон (121.53 s) пришёлся на минимальную загрузку и
отстоит от цели на 1.5 s. Это делает результат **правдоподобным, но не
доказанным**: серия AF100-09 закрывается только quiet-host замером n≥3.

Динамика полного proof по слайсам (замеры на разных уровнях шума, **не**
сопоставимы напрямую):

| HEAD | p50 | контекст |
|---|---:|---|
| `42329ed` (AF100-08) | 145.68 s | quiet host, n=3 |
| после 09a | 140.00 s | шумный |
| после 09b | 148.69 s | шумный, разброс 50 s |
| после 09c | **130.13 s** | шумный, load 3.4 → 9.8 |

## 7. Что осталось

| Статья | Оценка | Комментарий |
|---|---:|---|
| `elec-integration` import | 23.3 s | заблокирован `importActual('react')` в общем harness |
| `elec-integration` tests | 101.9 s | реальная работа, не налог |
| quiet-host замер | — | обязателен для закрытия серии 09 |

Следующий шаг — **измерение, а не оптимизация**: план §2 запрещает speed-work
до профиля.

## 8. Воспроизведение

```bash
cd frontend
npx vitest run --project unit src/__tests__/unit/architecture/antdOptimizerContract.architecture.test.ts
npm run test:agent-gates
npm run test:integration
for n in 1 2 3; do npm run test:agent-dod:dual-safe; done
```
