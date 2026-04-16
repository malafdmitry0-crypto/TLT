# Backend — управление зависимостями

## Два файла

| Файл | Назначение |
|---|---|
| `requirements.txt` | Верхнеуровневые зависимости с pin-ами (`==`). Редактируется вручную. |
| `requirements-lock.txt` | Полный срез `pip freeze` — все транзитивные зависимости. **Авто-сгенерирован.** |

Docker-образ собирается из `requirements.txt` (это задано в `Dockerfile`).
`requirements-lock.txt` используется для воспроизводимых пересборок и при отладке
проблем совместимости (как с `weasyprint`/`pydyf`).

## Когда обновлять lock-файл

После любого изменения `requirements.txt` и успешного билда:

```bash
docker compose build backend
docker compose up -d backend
docker exec heatcalc_backend pip freeze > backend/requirements-lock.txt
```

## Когда опираться на lock-файл

Если production-build воспроизводится сложно или приходят странные ошибки
совместимости — собрать из lock'а:

```dockerfile
# В Dockerfile заменить строку:
# RUN pip wheel --no-cache-dir --wheel-dir /build/wheels -r requirements.txt
# на:
# RUN pip wheel --no-cache-dir --wheel-dir /build/wheels -r requirements-lock.txt
```

## Известные пин-ы со значением

| Пакет | Версия | Почему |
|---|---|---|
| `pydyf` | `==0.10.0` | `>=0.11` ломает `weasyprint==62.3` с `AttributeError: 'super' object has no attribute 'transform'` |

---

Для перехода на `pip-tools` (`pip-compile`) — см. TODO в `TO_DO.md`.
