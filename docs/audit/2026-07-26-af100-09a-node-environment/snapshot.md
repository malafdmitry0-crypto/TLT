# AF100-09a — node-окружение для DOM-free unit-тестов

**Статус:** execution snapshot (не binding scorecard)
**UTC:** 2026-07-26T20:10–20:40Z
**HEAD на старте:** `02dc019` · branch `main` · worktree clean
**Host:** darwin 23.6.0 arm64 · Apple M1 Pro (10 cores) · Node v23.5.0 · npm 10.9.2
**Quiet:** **нет** — см. §6. Абсолютный бюджет p50 ≤120 s этим прогоном не сертифицируется.

Закрыт **AF100-09a** — первый под-slice серии AF100-09+. Harness-owner один:
`src/__tests__/setup.ts` + маршрутизация окружения. **AF100-09+ остаётся открытым.**

---

## 1. Characterization — где на самом деле сидит per-file tax

AF100-08 дал фазовый профиль (`setup ~35 s · import ~130 s` на 266 файлов), но не
per-file. Собран новый замер (`unit`-проект, 287 файлов, суммарно по воркерам):

| Фаза | Сумма | Медиана на файл |
|---|---:|---:|
| environment (jsdom) | **66.4 s** | **229 ms** |
| setup (`setup.ts`) | **27.6 s** | **95 ms** |
| collect (импорт графа) | 91.0 s | **20 ms** |
| tests | 153.1 s | 15 ms |
| prepare | 1.6 s | — |

**Ключевой факт: медианный файл импортируется за 20 ms, но платит ~324 ms
фиксированного налога до начала работы.** Плоский налог `env + setup` = **94.0 s**,
то есть **27.7 %** всей работы unit-проекта, и он не зависит от того, трогает
файл DOM или нет.

Изолированный замер рычага (21 файл `unit/architecture`):

| Конфигурация | env | setup | collect | tests |
|---|---:|---:|---:|---:|
| jsdom + `setup.ts` (как было) | 5.5 s | 2.3 s | 1.9 s | 4.4 s |
| jsdom без setup | 5.6 s | 0.0 s | 2.0 s | 4.5 s |
| **node без setup** | **0.0 s** | **0.0 s** | 2.0 s | 4.3 s |

collect и tests не меняются — рычаг снимает ровно налог, не работу.

## 2. Отклонённые рычаги (измерены, не приняты)

| Рычаг | Измерение | Почему отклонён |
|---|---|---|
| `deps.optimizer` | collect **8.9 → 2.0 s (−78 %)** на 5 тяжёлых файлах | **Ломает корректность**: antd рендерится как `Element type is invalid`, 2 из 4 тестов падают. Не принят. |
| `css: false` | tests 33.8 → 27.0 s | Меняет поведение (CSS-зависимые assertions). План §2 запрещает. |
| рост `maxWorkers` | — | План §5 прямо исключает из acceptance. |

Про оптимизатор зафиксировано два факта для следующего слайса:

1. В Vitest 4 ключи — `client`/`ssr`, а не `web`. С устаревшим ключом опция
   **молча игнорируется** (первый замер дал 13.7 → 13.5 s и был ложно-отрицательным).
2. Гипотеза «виноваты глубокие импорты `antd/es/*`» **опровергнута**: все 14 таких
   импортов — `import type`, стираются при компиляции. Причина дублирования
   инстансов antd другая и остаётся неустановленной.

## 3. Анализ безопасности — почему 87, а не 114

Сплошной прогон всех 287 unit-файлов в `node` без setup: **114 проходят**.

Принять все 114 было бы ошибкой. Отсутствие `window` падает громко, а вот
**ветвление по его отсутствию переключается молча**. 27 файлов транзитивно
доходят до `src/api/client.ts`:

```
src/api/client.ts:63   if (typeof document === 'undefined') return null;
src/api/client.ts:212  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
src/api/client.ts:256  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/workspace')) {
```

Под `node` эти тесты продолжали бы проходить, но по другой ветке, чем production.
Они оставлены на jsdom. Принято **87 файлов**.

## 4. Результат

`setup.ts` грузит jest-dom, `tokens.css` и `@testing-library/react` за проверкой
окружения; jsdom-путь остался byte-identical. 87 файлов получили
`// @vitest-environment node` первой строкой.

**unit-проект, суммарно по воркерам:**

| Фаза | До | После | Δ |
|---|---:|---:|---:|
| environment | 66.4 s | **45.5 s** | **−20.9 s** |
| setup | 27.6 s | **19.5 s** | **−8.1 s** |
| collect | 91.0 s | 89.8 s | −1.2 s (шум) |
| tests | 153.1 s | 152.9 s | −0.2 s (шум) |
| **итого работы** | 339.7 s | **310.7 s** | **−29.0 s (−8.5 %)** |

**Парный wall-замер** (unit-проект, тот же хост, прогоны подряд через `git stash`):

| | Test Files | Tests | Wall |
|---|---:|---:|---:|
| до | 287 passed | **1202 passed** | 181.60 s |
| после | 287 passed | **1202 passed** | **167.91 s** |

**Число тестов идентично — 1202/1202.** Ни один тест не удалён, не пропущен и не
ослаблен; `.only` / `.skip` / retry / поднятый timeout / изменённый worker count
не использованы.

**Fast gate** (побочный эффект — `unit/architecture` целиком DOM-free):

| | До | После |
|---|---:|---:|
| `test:agent-gates` wall | 10.13 s | **7.32 s (−27.7 %)** |
| `test:s0-gates` | 80 тестов | **86 тестов** |

## 5. Guard

`src/__tests__/unit/architecture/unitNodeEnvironment.architecture.test.ts` — 6 тестов:

| Проверка | Ловит |
|---|---|
| транзитивный граф импортов без env-ветвления | молчаливую смену ветки под `node` |
| docblock ровно первой строкой | Vitest не прочитает его иначе — файл тихо вернётся на jsdom |
| нет `@testing-library/*` в node-файлах | DOM-библиотека без DOM |
| opt-in используется (≥80 файлов) | тихую отмену всей экономии |
| failure path на синтетическом фикстуре | регрессию самого анализатора |
| success path на чистом графе | ложные срабатывания |

**Red-demo на реальном дереве.** Docblock добавлен к
`elecCalcCableCatalogModel.test.ts` (достаёт `api/client.ts`):

```
AssertionError: These files run under `node` but reach environment-dependent code...
  src/__tests__/unit/pages/electrical/elecCalcCableCatalogModel.test.ts
      src/api/client.ts:63   if (typeof document === 'undefined') return null;
      src/api/client.ts:212  if (typeof window !== 'undefined' && ...
exit=1
```

После отката — 6 passed. Guard показан на обеих ветках.

## 6. Полный proof и честный статус бюджета

```
run 1  gates 7.90 s · unit+integration 130.98 s · build 0.76 s → 139.64 s
run 2  gates 7.87 s · unit+integration 131.39 s · build 0.74 s → 140.00 s
run 3  gates 8.25 s · unit+integration 132.03 s · build 0.74 s → 141.02 s
```

**PASS 3/3 подряд, p50 = 140.00 s**, разброс 1.4 s.

**Хост не был сертифицированно тихим.** В начале сессии
`Virtualization.framework` держал 28 % CPU при load average 3–6; к моменту
приёмочных прогонов VM ушла, но Telegram/WindowServer оставались активны.
Контрольный прогон на шумном хосте до изменений дал **229.34 s** против
записанных в AF100-08 145.68 s — то есть абсолютные числа этого хоста
несопоставимы с baseline напрямую.

Поэтому достоверным считается **парный** замер §4 (−13.7 s на unit-проекте,
прогоны подряд), а не разница 145.68 → 140.00 s.

**Бюджет p50 ≤120 s НЕ достигнут.** `AF100-09+` остаётся открытым.

## 7. Что осталось в long pole

После слайса структура работы unit-проекта:

| Статья | Осталось | Комментарий |
|---|---:|---:|
| tests | 152.9 s | реальная работа, не трогаем |
| collect | 89.8 s | 200 jsdom-файлов; главный оставшийся кандидат |
| environment | 45.5 s | jsdom для 200 файлов, которым он нужен |
| setup | 19.5 s | там же |

Следующий кандидат — collect 89.8 s. `AdminLayout.test.tsx` при графе всего
в 24 первых-сторонних файла платит 1.4 s: цена импорта `antd` за файл, а не
размера проекта. Рабочий рычаг найден (`deps.optimizer`, −78 %), но требует
устранения дублирования инстансов antd — см. §2.

## 8. Воспроизведение

```bash
cd frontend
npx vitest run --project unit src/__tests__/unit/architecture/unitNodeEnvironment.architecture.test.ts
npm run test:agent-gates
for n in 1 2 3; do npm run test:agent-dod:dual-safe; done
```
