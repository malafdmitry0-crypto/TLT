# AF100-09b — antd пре-бандлится один раз вместо импорта на каждый файл

**Статус:** execution snapshot (не binding scorecard)
**UTC:** 2026-07-26T21:00–22:30Z
**HEAD на старте:** `825e4f6` · branch `main` · worktree clean
**Host:** darwin 23.6.0 arm64 · Apple M1 Pro (10 cores) · Node v23.5.0 · npm 10.9.2 · vitest 4.1.6
**Quiet:** **нет** — load average 6.35 / 10.74 во время приёмки. См. §7.

Закрыт **AF100-09b** — второй под-slice серии AF100-09+. Harness-owner один:
`deps.optimizer` проекта `unit`. **Бюджет p50 ≤120 s на этом хосте не
подтверждён**, поэтому серия остаётся открытой (§7).

---

## 1. Исходная позиция

После 09a плоский налог (jsdom + setup) снят. Оставшийся long pole — `import`
**89.7 s** на 287 unit-файлов. Замер 09a показал, что это цена импорта `antd`
на файл, а не размера графа: `AdminLayout.test.tsx` при 24 первых-сторонних
файлах платил 1.4 s.

Штатное лекарство — `deps.optimizer`: собрать зависимость один раз, дальше
все файлы берут готовое. В 09a оно было измерено (−78 % collect) и
**отклонено**: ломало рендер antd с `Element type is invalid`.

## 2. Корневая причина — не `antd`, а `@ant-design/icons`

В 09a причина не была установлена, и обе выдвинутые гипотезы оказались
неверными:

| Гипотеза 09a | Проверка | Итог |
|---|---|---|
| дублирование инстансов React/antd | `Button.$$typeof` === `Symbol.for('react.forward_ref')`, `React.version` и `ReactDOM.version` совпадают, `<Button>` рендерится в корректный HTML | **опровергнута** |
| глубокие импорты `antd/es/*` | все 14 — `import type`, стираются при компиляции | **опровергнута** |

Прямой замер каждого импорта `ErrorBoundary.tsx` под оптимизатором:

```
[probe] Result:         function
[probe] Typography:     object
[probe] ReloadOutlined: UNDEFINED     ← причина
[probe] TltButton:      object
```

**Пре-бандлинг `@ant-design/icons` превращает именованные экспорты иконок в
`undefined`.** Ошибка всплывает далеко от места — как `Element type is invalid`
внутри рендера постороннего компонента, поэтому в 09a была ошибочно
атрибутирована самой `antd`.

`include: ['antd']` без иконок: 92 упавших теста → 6 упавших файлов.

## 3. Второй барьер — тесты обходили границу проекта

Оставшиеся 6 файлов падали на

```
Cannot find module '.../node_modules/.vite/vitest/<hash>/deps/antd.js&v=8f86312e'
```

Пре-бандленный модуль нельзя мокать. Но эти тесты мокали **стороннюю
библиотеку двумя слоями ниже production-кода**:

```ts
// production (все 6 модулей):
import { appMessage as message } from '@/feedback/appFeedback';

// тест:
vi.mock('antd', async () => { ... message: { ...actual.message, warning } });
```

Работало это лишь потому, что `appFeedbackApi` реэкспортирует antd-шный
`message`. То есть тесты пролезали сквозь границу, которую проект специально
завёл. Все 6 переписаны на мок самой границы — это корректнее независимо от
скорости:

```ts
vi.mock('@/feedback/appFeedback', async () => {
  const actual = await vi.importActual<typeof import('@/feedback/appFeedback')>(
    '@/feedback/appFeedback',
  );
  return { ...actual, appMessage: { ...actual.appMessage, warning } };
});
```

Проверено без оптимизатора: 6 файлов / 21 тест зелёные — поведение сохранено.

## 4. Область действия — только проект `unit`

Ломает не пре-бандл сам по себе, а **`vi.importActual` пре-бандленного
пакета**. Обычные `vi.mock`-фабрики работают: 10 unit-файлов, мокающих
`@glideapps/glide-data-grid`, проходят пре-бандленными.

Два integration-файла (`HomePage`, `LoginPage`) делают
`vi.importActual('react-router-dom')`. Измеренные попытки их спасти:

| Попытка | Результат |
|---|---|
| `optimizer.exclude: ['react-router-dom', ...]` | **не помогает** — `Cannot find module .../dist/main.js&v=<hash>` |
| `server.deps.inline: [/react-router-dom/]` | **не помогает** — та же ошибка |

Поэтому оптимизатор включён **только для `unit`**, где и живёт налог: 287
файлов из 328. `integration` (111 тестов) и `elec-integration` идут по обычному
конвейеру.

Отдельно важно для elec-integration: его harness построен на `vi.hoisted()` /
`vi.mock()` в `elecCalcPageTestEnv.apiMocks.ts`, и оптимизатор его не касается.

## 5. Результат — парный замер

Прогоны подряд на одном хосте через `git stash`, проект `unit`:

| | baseline `825e4f6` | с оптимизатором | Δ |
|---|---:|---:|---:|
| import | **87.7 s** | **33.4 s** | **−54.3 s (−62 %)** |
| environment | 44.0 s | 43.4 s | −0.6 s (шум) |
| setup | 18.8 s | 18.5 s | −0.3 s (шум) |
| tests | 144.4 s | 144.4 s | 0 |
| **wall** | **160.9 s** | **134.3 s** | **−26.6 s** |

Тестов: baseline 1208, после — **1215** (+7 — новый guard). Ни один
существующий тест не удалён, не пропущен и не ослаблен.

**Холодный старт отсутствует.** Отдельная проверка с удалённым
`node_modules/.vite`:

| | wall |
|---|---:|
| cold (кэш удалён) | 134.25 s |
| warm (повтор) | 134.63 s |

Разница в пределах шума — пре-бандл строится бесплатно, CI с чистым кэшем не
платит.

**Fast gate:** 7.17 s (без изменений против 09a).

## 6. Guard

`src/__tests__/unit/architecture/antdOptimizerContract.architecture.test.ts` —
7 тестов:

| Проверка | Ловит |
|---|---|
| оптимизатор включён для `antd` | тихий откат ускорения |
| ключ `client`/`ssr`, не `web` | **Vitest 4 молча игнорирует чужой ключ** — опция не работает, ошибки нет |
| `@ant-design/icons` не в `include` | возврат `Element type is invalid` |
| оптимизатор только на `unit` | расползание на integration с их `importActual` |
| нет bare `importActual` в unit-тестах | `Cannot find module .../deps/<pkg>.js&v=<hash>` |
| граница `appMessage` ещё экспортируется | моки указывают в пустоту |
| failure/success path на литералах | регрессию самого анализатора |

**Red-demo, три ветки, каждая → exit 1:**

| Слом | Результат |
|---|---|
| вернуть `vi.mock('antd')` в реальный тест | exit=1 |
| подменить ключ `client` → `web` | exit=1 |
| добавить `@ant-design/icons` в `include` | exit=1 |

Guard сработал и непреднамеренно: при откате конфига для baseline-замера он
сам упал 4 тестами, поймав рассинхрон конфига и контракта.

## 7. Честный статус бюджета

Полный proof — **PASS 3/3**: 179.29 / 148.69 / 129.21 s.

**Эти числа не годятся для приёмки бюджета.** Разброс 50 s при load average
6.35 / 10.74 — хост был занят посторонней работой. Гипотеза «первый прогон
строит пре-бандл» проверена и **опровергнута** (§5, cold ≈ warm), значит
разброс — шум хоста.

Достоверна **парная дельта −26.6 s** на unit-проекте, а не `p50 = 148.7`.

**Бюджет p50 ≤120 s НЕ подтверждён.** Что известно:

- baseline AF100-08 на quiet host: **145.68 s**;
- суммарно 09a + 09b сняли **−29.0 s** (env+setup) и **−54.3 s** (import)
  работы, из них на wall unit-проекта −13.7 s и −26.6 s соответственно;
- значит на quiet host ожидается ~**105–120 s**, но это **расчёт, а не замер**.

Следующий шаг серии — **не оптимизация, а измерение**: повторить профиль
AF100-08 (n≥3, quiet host) и определить, закрыт бюджет или нет. План §2 прямо
запрещает speed-work до измерения.

## 8. Что осталось в структуре работы

Проект `unit`, суммарно по воркерам, после 09b:

| Статья | Было (до 09a) | Стало | Комментарий |
|---|---:|---:|---|
| tests | 153.1 s | 144.4 s | реальная работа |
| import | 91.0 s | **33.4 s** | 09b |
| environment | 66.4 s | **43.4 s** | 09a |
| setup | 27.6 s | **18.5 s** | 09a |

Harness tax сокращён со **185.0 s до 95.3 s (−48 %)**. Дальнейшая экономия
упирается в `tests` — это исполнение самих тестов, а не налог; сокращать его
означало бы трогать assertions, что план §2 запрещает.

## 9. Воспроизведение

```bash
cd frontend
npx vitest run --project unit src/__tests__/unit/architecture/antdOptimizerContract.architecture.test.ts
npm run test:agent-gates
rm -rf node_modules/.vite && npx vitest run --project unit   # cold
npx vitest run --project unit                                # warm
for n in 1 2 3; do npm run test:agent-dod:dual-safe; done
```
