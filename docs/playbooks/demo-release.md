# Playbook: Выпуск демо-поставки

Цель: собрать `demo/` так, чтобы заказчик поднял стек одной командой
`docker compose up -d` без настройки `.env` и без знания внутренностей.

## Архитектура поставки

```
demo/
├── README.md              ← пошаговая инструкция для неквалифицированного пользователя
├── docker-compose.yml     ← все env-значения захардкожены, без внешних зависимостей
└── images/
    ├── heatcalc-backend-<VER>.tar.gz
    └── heatcalc-frontend-<VER>.tar.gz
```

## Процедура

1. **Пересобрать образы** из корня: `docker compose build backend frontend`.
   - Убедиться, что `VITE_API_BASE_URL=/api/v1` захардкожен в
     `docker-compose.yml` build-args (иначе prod-бандл подхватит
     dev-адрес из `.env`).
2. **Пере-тегировать** в `heatcalc-backend:<VER>` / `heatcalc-frontend:<VER>`.
3. **Сохранить в tar.gz**: `docker save ... | gzip > demo/images/...`.
4. **Прогнать чистый тест**: `docker rmi` → `docker load -i` → `docker compose up -d` → `scripts/smoke.sh`.

**Всё это делает slash-команда** `/build-demo-pack`.

## Ключевые инварианты

- **Нет `.env` в `demo/`** — все настройки прямо в compose.
- `FIRST_ADMIN_EMAIL=admin@heatcalc.io` обязательно должен быть в env,
  иначе дефолт backend'а `admin@heatcalc.local` → сиды несовместимы.
- `RUN_SEEDS=1` — сиды идемпотентны, безопасно гонять при каждом старте.
- `GUEST_MAX_SESSIONS_PER_IP=500` в demo (для тестирования), в проде — 10.

## Учётные данные по умолчанию

| Роль | Email | Пароль |
|---|---|---|
| Admin | `admin@heatcalc.io` | `admin` |
| Employee | `petrov@heatcalc.io` | `Employee1!` |

## Чеклист перед отправкой заказчику

- [ ] `/build-demo-pack` отработал без падений
- [ ] `scripts/smoke.sh http://localhost:8080` — 18+ зелёных
- [ ] Размеры tar: backend ~156 МБ, frontend ~25 МБ
- [ ] `demo/README.md` актуален (версии, порты)
- [ ] Папка `demo/` копируется независимо — без `../` ссылок
