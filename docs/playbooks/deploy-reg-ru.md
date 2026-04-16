# Деплой на VPS reg.ru с собственным доменом

Пошаговая инструкция: от покупки домена/сервера до работающего
`https://мойдомен.ru`. Ориентир по времени — **~1 час**.

---

## Что нужно купить на reg.ru

| Что | Где | Тариф | Цена |
|---|---|---|---|
| **Домен `.ru`** | `www.reg.ru` → «Домены» | Любой свободный | ~200₽/год |
| **VPS** | `cloud.reg.ru` → «Облачные серверы» | **2 vCPU · 4 ГБ RAM · 40 ГБ SSD · Ubuntu 22.04 LTS** | ~500–700₽/мес |
| ~~SSL-сертификат~~ | — | **НЕ покупайте**: Let's Encrypt бесплатный, Caddy получит сам | 0₽ |

**Минимум 2 vCPU / 4 ГБ RAM** — postgres + backend + frontend + caddy + redis влезают впритык. На 1 ГБ запустится, но будет тормозить и падать по OOM.

---

## Шаг 1 — Купить домен и VPS

1. **Домен:** `reg.ru` → введите имя в поиск → оформите заказ. Реквизиты можно заполнить как физлицо.
2. **VPS:** `cloud.reg.ru` → «Создать сервер» → Ubuntu 22.04 → 2 vCPU / 4 ГБ. После оплаты в личный кабинет придут:
   - **IP-адрес сервера** (например `89.111.222.333`)
   - **Пароль root** (для SSH)
3. **DNS:** в личном кабинете reg.ru → ваш домен → «DNS-серверы и зона» → добавьте две A-записи:

   | Тип | Имя | Значение |
   |---|---|---|
   | A | `@` (или пусто) | IP вашего VPS |
   | A | `www` | IP вашего VPS |

   DNS пропагация занимает 5–30 минут. Проверка: `ping мойдомен.ru` должен показать ваш IP.

---

## Шаг 2 — Подготовить `.env` локально

На своём компе (не на сервере):

```bash
cd /путь/к/репозиторию/TLT
cp .env.production.example .env
```

Откройте `.env` в редакторе и заполните:

1. **`SITE_DOMAIN`** = ваш домен без `https://` (например `myheatcalc.ru`)
2. **`CORS_ORIGINS`** = `https://мойдомен.ru,https://www.мойдомен.ru`
3. **`SECRET_KEY`** — сгенерируйте:
   ```bash
   openssl rand -base64 48
   ```
   Скопируйте весь вывод в значение переменной.
4. **`POSTGRES_PASSWORD`** — сгенерируйте:
   ```bash
   openssl rand -base64 24
   ```
5. **`FIRST_ADMIN_EMAIL`** — ваш реальный email (на него нет рассылки, нужен только для логина).
6. **`FIRST_ADMIN_PASSWORD`** — придумайте сильный пароль (≥12 символов, буквы+цифры+спецсимволы).

Сохраните файл. **Никогда не коммитьте `.env` в git!**

---

## Шаг 3 — Развернуть на VPS

### 3.1. Подключиться по SSH

С локального компа:
```bash
ssh root@89.111.222.333
```
(IP — из письма reg.ru). Введите пароль root.

### 3.2. Поменять пароль root и обновить систему

```bash
passwd
apt-get update && apt-get upgrade -y
```

### 3.3. Установить Docker одной командой

```bash
curl -fsSL https://get.docker.com | sh
docker --version  # должно вывести 24.x или новее
```

### 3.4. Открыть firewall

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (Caddy → редирект на HTTPS + ACME challenge)
ufw allow 443/tcp   # HTTPS
ufw allow 443/udp   # HTTP/3
ufw --force enable
ufw status
```

### 3.5. Скачать репозиторий

```bash
git clone <URL_вашего_приватного_git_репо> /opt/heatcalc
cd /opt/heatcalc
```

> Если репо публичный — просто `git clone`. Если приватный — настройте SSH-ключи или используйте PAT.

### 3.6. Залить `.env` с локального компа

В **новом терминале на своём компе**:
```bash
scp .env root@89.111.222.333:/opt/heatcalc/.env
```

### 3.7. Запустить стек

На сервере:
```bash
cd /opt/heatcalc
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Первый запуск:
- ~5 мин — сборка образов (или быстрее, если используете готовые из registry)
- ~30 сек — старт Postgres + миграции
- ~30–60 сек — Caddy получает Let's Encrypt сертификат при первом обращении

### 3.8. Проверить, что всё поднялось

```bash
docker compose ps
```
Все 5 контейнеров должны быть `Up (healthy)`:
- `heatcalc_db`
- `heatcalc_redis`
- `heatcalc_backend`
- `heatcalc_frontend`
- `heatcalc_caddy`

---

## Шаг 4 — Открыть в браузере

Зайдите на `https://мойдомен.ru` — увидите главную страницу. **В адресной строке должен быть зелёный замочек** (валидный SSL).

- Войти как админ: «Войти как сотрудник» → email/пароль из `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD`
- Войти как гость: «Войти без регистрации» → автоматически создастся проект «Мой проект»

---

## Обновление приложения

Когда выйдет новая версия:

```bash
cd /opt/heatcalc
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Простой ~10 секунд (Caddy + frontend), backend ~30 секунд (миграции).

---

## Управление и мониторинг

| Команда | Что делает |
|---|---|
| `docker compose ps` | Статус всех сервисов |
| `docker compose logs -f backend` | Хвост логов backend (Ctrl+C — выход) |
| `docker compose logs -f caddy` | Логи Caddy (видно ACME-выпуск сертификата) |
| `docker compose restart backend` | Рестарт одного сервиса |
| `docker compose down` | Остановить всё (данные сохранятся) |
| `docker compose down -v` | ⚠️ Остановить + **удалить БД** |
| `docker stats` | Live-нагрузка CPU/RAM по контейнерам |

---

## Проверка работоспособности (verification)

Все эти команды должны выполниться **с локального компа** (не с VPS):

```bash
# 1. HTTPS живой и сертификат валидный
curl -I https://мойдомен.ru
# → HTTP/2 200 + cert valid

# 2. API живой
curl -X POST https://мойдомен.ru/api/v1/auth/guest
# → 201 + JSON {session_id, project}

# 3. SSL-рейтинг
# https://www.ssllabs.com/ssltest/analyze.html?d=мойдомен.ru
# → должно быть A или A+ (Caddy настроен по best-practice)
```

---

## Если что-то пошло не так

### Caddy не выпустил сертификат
```bash
docker compose logs caddy | grep -E "ACME|certificate"
```
Часто причины:
- DNS ещё не пропагировался (подождите 30 мин, проверьте `nslookup мойдомен.ru`)
- Порт 80 закрыт фаерволом (`ufw status` — должен быть allow 80)
- Домен не совпадает с `SITE_DOMAIN` в `.env`

### Backend не стартует / падает
```bash
docker compose logs backend | tail -50
```
Часто причины:
- Дефолтный `SECRET_KEY` или `POSTGRES_PASSWORD` (см. `.env`)
- Postgres ещё не успел запуститься — подождите 30 сек

### Frontend показывает белый экран
```bash
docker compose logs frontend
```
Очистить кэш браузера (Ctrl+Shift+R). Если осталось — проверить `CORS_ORIGINS` в `.env` (должно совпадать с тем, как открываете в браузере).

### Сервер «закончилось место»
```bash
df -h           # сколько места
docker system prune -a -f   # удалить неиспользуемые образы и слои
```

### Полностью пересоздать (ничего не теряя кроме БД)
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## Безопасность — чек-лист после деплоя

- [ ] Пароль root на VPS изменён со значения reg.ru
- [ ] `.env` НЕ закоммичен в git (`git status` должен показать `.env` как ignored)
- [ ] `SECRET_KEY` сгенерирован через `openssl rand`, не из примера
- [ ] `POSTGRES_PASSWORD` сгенерирован через `openssl rand`
- [ ] `FIRST_ADMIN_PASSWORD` ≥ 12 символов, не словарное слово
- [ ] UFW включён (`ufw status` → active), открыты только 22/80/443
- [ ] HTTPS работает, в SSL Labs рейтинг A или A+
- [ ] **(рекомендуется)** SSH-ключи вместо пароля + `PasswordAuthentication no` в `/etc/ssh/sshd_config`

---

## Стоимость владения

При указанных характеристиках:
- VPS: ~600₽/мес = **7 200₽/год**
- Домен: **200₽/год**
- SSL: **0₽**
- **Итого: ~7 400₽/год**

Один сервер тянет 30–50 одновременных пользователей без проблем. Если вырастете — апгрейд до 4 vCPU / 8 ГБ через панель reg.ru за 1 минуту простоя.
