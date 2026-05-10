# TLT HeatCalc — оставшиеся узкие места после DB/N+1 и frontend render фиксов

**Дата:** 2026-05-10

**Контекст замеров:** batch электрорасчёта на 400 объектов: HTTP 200 за 0.094s; SQL по `pg_stat_statements` — миллисекунды; нагрузочный сценарий по объектам: p95=109ms, max=156ms.

**Уже применено в коде, поэтому не входит в список ниже:**

- backend endpoint `GET /calc/electrical/page`;
- `CalculationService.electrical_project_page(...)` с константным числом SQL-запросов;
- `ElecCalcPage` загружает только текущую страницу объектов и расчётов, а сводку берёт из backend summary.
- страницы верхнего уровня загружаются через `React.lazy` + `Suspense`;
- `vite.config.ts` выделяет крупные vendor-группы в `manualChunks`;
- контрольная production-сборка: основной frontend chunk уменьшился с ~1.57 MB minified до 29.12 KB minified. Отдельный `antd-vendor` остаётся крупным vendor chunk (~974.86 KB), но он больше не смешан с кодом всех страниц.
- таблица электрорасчёта монтирует `Select`/`InputNumber` только для активной строки; остальные строки показывают read-only значения;
- `columns` таблицы электрорасчёта вынесены в `useMemo`.

## 5. CPU-bound часть batch-расчётов

**Слой:** backend/runtime

**Текущий статус:** это не подтверждённый bottleneck. Текущий batch электрорасчёта на 400 объектов быстрый: HTTP 200 за 0.094s, SQL в миллисекундах. Вынос в background/job worker сейчас может быть преждевременной сложностью.

**Почему риск всё равно реальный:** расчёты выполняются синхронным Python-кодом внутри request lifecycle. Если 3-5 пользователей одновременно запустят batch на крупных проектах, latency может начать расти не из-за БД, а из-за занятых backend workers и CPU.

**Что проверить сначала:**

- Нагрузочный сценарий на 3-5 параллельных batch-запусков по 400+ объектов.
- Отдельно измерять latency самого batch endpoint: p50, p95, max.
- Параллельно во время batch прогонять лёгкие read endpoints (`/objects/query`, `/calc/electrical/page`) и смотреть, не растёт ли их p95.
- Снимать CPU backend container/process и количество занятых workers.

**Порог для усложнения архитектуры:**

- Если 3-5 параллельных batch держат p95 в пределах рабочих ожиданий и не ухудшают read endpoints, оставляем синхронный request.
- Если batch p95/max растут кратно или read endpoints начинают ждать CPU, тогда выносить крупные batch в background job: `202 Accepted` + `task_id`, отдельный worker/process pool, polling статуса.
- Если проблема будет не в формулах, а в размере response, сначала уменьшить payload batch: возвращать краткий summary, а подробности читать через paginated endpoint.

**Почему не threads:** для чистого Python CPU-bound вычисления threads упираются в GIL. Если понадобится параллелить именно CPU, нужен process pool или отдельные worker processes.

---

## 6. NGINX — Production-кэширование статики

**Слой:** Инфраструктура · **Время:** 15 минут · **Приоритет:** P0

Текущий `frontend/nginx.conf` отдаёт `/assets/` с `Cache-Control: no-store, no-cache` — это dev-конфиг в production. Браузер никогда не кэширует бандлы, хотя Vite генерирует файлы с content hash (`index-abc123.js`).

**Файл:** `frontend/nginx.conf`

**Сейчас:**
```nginx
location /assets/ {
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate";
    try_files $uri =404;
}
```

**Должно быть:**
```nginx
location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
}
```

`immutable` говорит браузеру «никогда не переспрашивай — если файл изменится, у него будет другой URL». Повторный визит: 0 сетевых запросов за статикой.

Также убрать `add_header Clear-Site-Data '"cache"';` из `/` и `/index.html` — это директива для сброса кэша, убивающая весь смысл кэширования на повторных визитах.

**Эффект:** Повторный визит: 0.4–2 сек → < 100 мс.

---

## 7. Dead dependencies в package.json

**Слой:** Фронтенд · **Время:** 15 минут · **Приоритет:** P1

Аудит импортов (`grep -rn "import.*from" frontend/src/`) выявил:

| Пакет | Статус |
|---|---|
| `react-hook-form` + `@hookform/resolvers` | **Не используется** — 0 импортов во всех `.tsx/.ts` файлах |
| `@testing-library/dom` | В `dependencies` вместо `devDependencies` — попадает в production-бандл |

```bash
npm uninstall react-hook-form @hookform/resolvers
# @testing-library/dom перенесётся в devDependencies после npm install
```

Также `zod` используется только в 1 файле (`validators.ts`). Можно заменить на hand-written валидацию (~30 строк), сэкономив 10 KB gzipped. Но не критично — оставить.

**Эффект:** −20 KB из бандла + меньше surface для CVE.

---

## 8. Plotly.js не используется — O-05 не нужен

**Слой:** Фронтенд · **Время:** 0

Аудит подтвердил: Plotly.js **ни разу не импортируется** в исходниках. Рекомендация O-05 («ленивая загрузка Plotly») неактуальна. Графики либо не реализованы, либо используют другую библиотеку (проверить — ECharts/Recharts?).

Если графики есть и используют что-то другое — проверить, не грузится ли эта библиотека синхронно на первом экране.

---

## 9. API-запросы можно распараллелить на фронте

**Слой:** Фронтенд · **Время:** 1 час · **Приоритет:** P2

При открытии проекта делаются последовательные запросы:
```
GET /projects/{id} → GET /objects/query → GET /calculations
```
Они не зависят друг от друга (objects и calculations можно запрашивать параллельно с project).

**Решение:** `Promise.all` в хуке загрузки страницы. Для 3 запросов по ~100 мс: `t1 + t2 + t3` (300 мс) → `max(t1, t2, t3)` (~100 мс).

---

## Порядок выполнения (обновлённый)

С учётом того, что ленивая загрузка страниц, manualChunks и useMemo уже применены:

| # | Что | Время | Эффект |
|---|---|---|---|
| 1 | NGINX — кэширование статики | 15 мин | Повторный визит < 100 мс |
| 2 | Dead dependencies | 15 мин | −20 KB из бандла |
| 3 | API — параллельные запросы | 1 час | Загрузка страницы −50% |
| 4 | PG-01 — PostgreSQL config | 10 мин | +20–40% throughput |
| 5 | CPU-bound batch: нагрузочный тест | 2–4 часа | Диагностика — нужен ли O-01 |
| 6 | Zustand debounce (если ещё нет) | 2 часа | Ввод без зависаний |
| 7 | Batch UPDATE (если ещё нет) | 2–4 часа | −200 мс на batch |

**Первые 3 — сегодня за час.** Остальное — по результатам нагрузочного теста.

---

## 10. Аудит БД: оставшиеся кандидаты (2026-05-10)

Глубокий аудит `calculation_service.py`, `database.py`, `config.py`, моделей
и API-эндпоинтов. Контекст: batch 400 объектов = 94 мс, p95=109 мс.

### ✅ Уже хорошо

| Компонент | Статус |
|---|---|
| `electrical_project_page` — пагинация (OFFSET/LIMIT) | ✅ |
| `_bulk_upsert_electrical_calculations` — batch INSERT ON CONFLICT | ✅ |
| `WHERE object_id IN (...)` для расчётов страницы | ✅ |
| Summary: один `func.sum()` вместо N запросов | ✅ |
| `DB_POOL_SIZE=20`, `pool_pre_ping=True`, `expire_on_commit=False` | ✅ |
| Индексы на всех горячих путях | ✅ |

### 🟡 Кандидаты (ни один не критичен при 94 мс)

**B1. `batch_recalculate` — индивидуальные UPDATE**

Электрический batch уже bulk. Тепловой — всё ещё N отдельных UPDATE.
Приоритет: P2. ~100 мс оверхеда. Унифицировать.

**B2. Старый `GET /electrical` без пагинации**

Возвращает все 1600 строк. Проверить, используется ли фронтендом.
Если нет — deprecate.

**B3. `selectinload(Project.objects)` для списка проектов**

Грузит полные JSONB для всех объектов. Для проводника нужен только `id`, `object_type`.
Приоритет: P2.

**B4. `pg_stat_statements` не прочитан**

5 минут — узнать реальные медленные запросы.
```sql
SELECT LEFT(query, 150), calls, mean_exec_time
FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;
```

**Вывод:** БД не является bottleneck при текущих замерах. Профилактика.
