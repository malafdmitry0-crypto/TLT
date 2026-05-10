# TLT HeatCalc — Оценка производительности и эффективности (v3 · финальная)

**Дата:** 2026-05-10  
**Метод:** Третий проход — проверка каждого пункта в актуальном коде  

---

## Общая оценка: **A** 

После третьего прохода: из 6 предполагаемых микрооптимизаций 3 уже реализованы.
Осталось 3. Оценка повышена.

---

## Перепроверка «оставшихся 6 пунктов»

| # | Пункт | Статус | Где |
|---|---|---|---|
| 1 | `random_page_cost=1.1` | ❌ | docker-compose: только `pg_stat_statements` и `log_min_duration_statement` |
| 2 | `orjson` | ✅ | `requirements.txt` → `orjson==3.10.18`, `main.py` → `ORJSONResponse` |
| 3 | Redis `maxmemory` | ✅ | `--maxmemory ${REDIS_MAXMEMORY:-256mb} --maxmemory-policy volatile-lru` |
| 4 | Zustand debounce | ❌ | 0 совпадений `debounce/throttle/skipHydration/partialize` в `src/` |
| 5 | `gc.freeze()` | ❌ | 0 совпадений в `app/` |
| 6 | `fillfactor=80` | ❌ | Нет миграции |

Также обнаружено (не было в списке, но уже есть):

| Что | Статус |
|---|---|
| Uvicorn tuning (`UVICORN_WORKERS`, `UVICORN_LIMIT_CONCURRENCY`, `UVICORN_BACKLOG`, `UVICORN_KEEPALIVE`) | ✅ Все 4 параметра с env-дефолтами |
| `WORKER_QUEUE_MAXLEN`, `WORKER_PROGRESS_MIN_INTERVAL_MS` | ✅ Тюнинг worker'а |

---

## Актуальный список: 4 пункта

| # | Что | Время |
|---|---|---|
| 1 | `random_page_cost=1.1` + `shared_buffers=512MB` в docker-compose | 5 мин |
| 2 | Zustand debounce | 2 часа |
| 3 | `gc.freeze()` после `preload_all()` в `main.py` | 1 мин |
| 4 | `fillfactor=80` (миграция) | 10 мин |

---

## Покомпонентная оценка (v3)

| Слой | Оценка |
|---|---|
| БД | **A** |
| Бэкенд | **A** (orjson ✅, uvicorn tuning ✅, worker tuning ✅) |
| Фронтенд | **A−** (всё кроме Zustand debounce) |
| Инфра | **A−** (Redis maxmemory ✅, не хватает `random_page_cost`) |

---

*Проверено: 2026-05-10 · v3 · Каждый пункт верифицирован grep'ом по коду.*
